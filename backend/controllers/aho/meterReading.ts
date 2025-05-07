// controllers/app/meterReading.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server';
import { z } from 'zod';

const createMeterReadingSchema = z.object({
  date: z.string().datetime(),
  counter: z.number().positive(),
  userId: z.string().uuid(),
});

const updateMeterReadingSchema = z.object({
  date: z.string().datetime().optional(),
  counter: z.number().positive().optional(),
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
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(meterReadings);
  } catch (error) {
    next(error);
  }
};

// Получение одного показания счетчика
export const getMeterReadingById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const meterReading = await prisma.meterReading.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });

    if (!meterReading) {
      res.status(404).json({ error: 'Meter reading not found' });
      return;
    }

    res.status(200).json(meterReading);
  } catch (error) {
    next(error);
  }
};

// Создание показания счетчика
export const createMeterReading = async (
  req: Request<{}, any, z.infer<typeof createMeterReadingSchema>>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validatedData = createMeterReadingSchema.parse(req.body);
    const newMeterReading = await prisma.meterReading.create({
      data: {
        date: new Date(validatedData.date),
        counter: validatedData.counter,
        userId: validatedData.userId,
      },
      include: { user: true },
    });

    res.status(201).json(newMeterReading);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
      return;
    }
    next(error);
  }
};

// Обновление показания счетчика
export const updateMeterReading = async (
  req: Request<{ id: string }, any, z.infer<typeof updateMeterReadingSchema>>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validatedData = updateMeterReadingSchema.parse(req.body);
    const updateData: any = { ...validatedData };
    
    if (validatedData.date) {
      updateData.date = new Date(validatedData.date);
    }

    const updatedMeterReading = await prisma.meterReading.update({
      where: { id: req.params.id },
      data: updateData,
      include: { user: true },
    });

    res.status(200).json(updatedMeterReading);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
      return;
    }

    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Meter reading not found' });
      return;
    }
    
    next(error);
  }
};

// Удаление показания счетчика
export const deleteMeterReading = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await prisma.meterReading.delete({
      where: { id: req.params.id },
    });

    res.status(204).end();
  } catch (error) {
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Meter reading not found' });
      return;
    }
    
    next(error);
  }
};