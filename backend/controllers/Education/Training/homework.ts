import { Request, Response } from 'express';
import { prisma } from '../../../server.js';
import { z } from 'zod';
import { ensureManager } from './managers.js';

// Схемы валидации
const HomeworkStatusSchema = z.object({
  managerId: z.string(),
  trainingProgramId: z.string(),
  statusId: z.string().uuid(),
  checkerId: z.string().optional().nullable(),
  submissionDate: z.string().datetime().optional().nullable(),
  checkDate: z.string().datetime().optional().nullable()
});

// Получить статусы сдачи работ управляющего
export const getHomeworkStatuses = async (req: Request, res: Response) => {
  try {
    const { managerId } = req.params;
    const { trainingProgramId } = req.query;

    const where: any = { managerId };
    if (trainingProgramId) {
      where.trainingProgramId = trainingProgramId as string;
    }

    const homeworkStatuses = await prisma.homeworkStatus.findMany({
      where,
      include: {
        trainingProgram: {
          include: {
            type: true
          }
        },
        status: true,
        checker: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return res.json(homeworkStatuses);
  } catch (error) {
    console.error('❌ Ошибка при получении статусов сдачи работ:', error);
    res.status(500).json({
      error: 'Ошибка при получении статусов сдачи работ',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

// Создать или обновить статус сдачи работы
export const upsertHomeworkStatus = async (req: Request, res: Response) => {
  try {
    const validated = HomeworkStatusSchema.parse(req.body);

    // Убеждаемся, что Manager существует
    await ensureManager(validated.managerId);

    // Получаем тип статуса для проверки названия
    const statusType = await prisma.type.findUnique({
      where: { id: validated.statusId }
    });

    const submissionDate = validated.submissionDate
      ? new Date(validated.submissionDate)
      : statusType && ['СДАНО', 'ПРОВЕРЕНО', 'ОС_ОТПРАВЛЕНА'].includes(statusType.name)
      ? new Date()
      : null;

    const checkDate = validated.checkDate
      ? new Date(validated.checkDate)
      : statusType && ['ПРОВЕРЕНО', 'ОС_ОТПРАВЛЕНА'].includes(statusType.name)
      ? new Date()
      : null;

    const homeworkStatus = await prisma.homeworkStatus.upsert({
      where: {
        managerId_trainingProgramId: {
          managerId: validated.managerId,
          trainingProgramId: validated.trainingProgramId
        }
      },
      create: {
        managerId: validated.managerId,
        trainingProgramId: validated.trainingProgramId,
        statusId: validated.statusId,
        checkerId: validated.checkerId || null,
        submissionDate,
        checkDate
      },
      update: {
        statusId: validated.statusId,
        checkerId: validated.checkerId || null,
        submissionDate,
        checkDate
      },
      include: {
        trainingProgram: {
          include: {
            type: true
          }
        },
        status: true,
        checker: true,
        manager: {
          include: {
            user: true
          }
        }
      }
    });

    return res.json(homeworkStatus);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Неверные данные', details: error.issues });
    }
    console.error('❌ Ошибка при сохранении статуса сдачи работы:', error);
    res.status(500).json({
      error: 'Ошибка при сохранении статуса сдачи работы',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

// Обновить статус сдачи работы
export const updateHomeworkStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validated = HomeworkStatusSchema.partial().parse(req.body);

    const updateData: any = {};
    if (validated.statusId) {
      updateData.statusId = validated.statusId;
      
      // Проверяем статус для установки дат
      const statusType = await prisma.type.findUnique({
        where: { id: validated.statusId }
      });
      
      if (statusType && ['СДАНО', 'ПРОВЕРЕНО', 'ОС_ОТПРАВЛЕНА'].includes(statusType.name) && !validated.submissionDate) {
        updateData.submissionDate = new Date();
      }
      
      if (statusType && ['ПРОВЕРЕНО', 'ОС_ОТПРАВЛЕНА'].includes(statusType.name) && !validated.checkDate) {
        updateData.checkDate = new Date();
      }
    }
    if (validated.checkerId !== undefined) {
      updateData.checkerId = validated.checkerId || null;
    }
    if (validated.submissionDate !== undefined) {
      updateData.submissionDate = validated.submissionDate
        ? new Date(validated.submissionDate)
        : null;
    }
    if (validated.checkDate !== undefined) {
      updateData.checkDate = validated.checkDate
        ? new Date(validated.checkDate)
        : null;
    }

    const homeworkStatus = await prisma.homeworkStatus.update({
      where: { id },
      data: updateData,
      include: {
        trainingProgram: {
          include: {
            type: true
          }
        },
        status: true,
        checker: true,
        manager: {
          include: {
            user: true
          }
        }
      }
    });

    return res.json(homeworkStatus);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Неверные данные', details: error.issues });
    }
    console.error('❌ Ошибка при обновлении статуса сдачи работы:', error);
    res.status(500).json({
      error: 'Ошибка при обновлении статуса сдачи работы',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
