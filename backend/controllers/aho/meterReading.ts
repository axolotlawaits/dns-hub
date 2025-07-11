import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import dayjs from 'dayjs';

// Определение схем Zod для валидации
const meterIndicationsSchema = z.object({
  'Офис - Холодная вода': z.number().min(0).optional(),
  'ProДвери - Электричество': z.number().min(0).optional(),
  'КакДома - Электричество': z.number().min(0).optional(),
  'КакДома - Холодная вода': z.number().min(0).optional(),
  'КакДома - Горячая вода': z.number().min(0).optional(),
}).strict();

const createMeterReadingSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Invalid date format, expected YYYY-MM-DD",
  }),
  indications: meterIndicationsSchema,
  userId: z.string().uuid(),
});

const updateMeterReadingSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Invalid date format, expected YYYY-MM-DD",
  }).optional(),
  indications: meterIndicationsSchema.optional(),
});

// Получение всех показаний счетчиков
export const getMeterReadings = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const meterReadings = await prisma.meterReading.findMany({
      include: { user: true },
      orderBy: { date: 'desc' },
    });
    res.status(200).json(meterReadings);
  } catch (error) {
    next(error);
  }
};

// Получение одного показания счетчика
export const getMeterReadingById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const meterReading = await prisma.meterReading.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!meterReading) {
      res.status(404).json({ error: 'Показание счетчика не найдено' });
      return;
    }
    res.status(200).json(meterReading);
  } catch (error) {
    next(error);
  }
};

// Создание показания счетчика
export const createMeterReading = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validatedData = createMeterReadingSchema.parse(req.body);
    // Проверка на существование записи за этот месяц
    const startOfMonth = dayjs(validatedData.date).startOf('month').toDate();
    const endOfMonth = dayjs(validatedData.date).endOf('month').toDate();
    const existingReading = await prisma.meterReading.findFirst({
      where: {
        date: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      }
    });
    if (existingReading) {
      res.status(400).json({
        error: 'Показания за этот месяц уже существуют'
      });
      return;
    }
    // Создание новой записи
    const newMeterReading = await prisma.meterReading.create({
      data: {
        date: new Date(validatedData.date),
        indications: validatedData.indications,
        userId: validatedData.userId,
      },
      include: { user: true },
    });
    res.status(201).json(newMeterReading);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Ошибка валидации',
        details: error.errors,
      });
      return;
    }
    next(error);
  }
};

// Обновление показания счетчика
export const updateMeterReading = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validatedData = updateMeterReadingSchema.parse(req.body);
    const updateData: Prisma.MeterReadingUpdateInput = {};
    if (validatedData.date) {
      updateData.date = new Date(validatedData.date);
    }
    if (validatedData.indications) {
      // Получаем текущие показания для слияния
      const currentReading = await prisma.meterReading.findUnique({
        where: { id: req.params.id },
      });
      if (!currentReading) {
        res.status(404).json({ error: 'Показание счетчика не найдено' });
        return;
      }
      // Объединяем существующие показания с новыми
      updateData.indications = {
        ...(currentReading.indications as Prisma.JsonObject),
        ...validatedData.indications,
      };
    }
    const updatedMeterReading = await prisma.meterReading.update({
      where: { id: req.params.id },
      data: updateData,
      include: { user: true },
    });
    res.status(200).json(updatedMeterReading);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Ошибка валидации',
        details: error.errors,
      });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        res.status(404).json({ error: 'Показание счетчика не найдено' });
        return;
      }
    }
    next(error);
  }
};

// Удаление показания счетчика
export const deleteMeterReading = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await prisma.meterReading.delete({
      where: { id: req.params.id },
    });
    res.status(204).end();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        res.status(404).json({ error: 'Показание счетчика не найдено' });
        return;
      }
    }
    next(error);
  }
};