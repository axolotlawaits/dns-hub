import { Request, Response } from 'express';
import { prisma } from '../../../server.js';
import { z } from 'zod';
import { ensureManager } from './managers.js';

// Константы для типов обучения
export const MANAGER_STATUS_CHAPTER = 'Статус управляющего';
export const TRAINING_STATUS_CHAPTER = 'Статус обучения';
export const TRAINING_TYPE_CHAPTER = 'Тип программы';
export const EMPLOYMENT_CHANGE_TYPE_CHAPTER = 'Тип кадрового изменения';
export const HOMEWORK_STATUS_CHAPTER = 'Статус домашнего задания';

import { getToolByLinkOrThrow } from '../../../utils/toolUtils.js';

// Получить Tool для модуля обучения
export const getTrainingTool = async () => {
  return await getToolByLinkOrThrow('education/training', 'Tool для модуля обучения не найден в базе данных');
};

// Получить UUID модели Tool для training
export const getTrainingModelUuid = async (): Promise<string> => {
  const tool = await getTrainingTool();
  return tool.id;
};

// Получить тип по имени (для поиска дефолтных значений)
export const getTypeByName = async (chapter: string, name: string) => {
  const tool = await getTrainingTool();
  return await prisma.type.findFirst({
    where: {
      model_uuid: tool.id,
      chapter,
      name,
    }
  });
};

// Схемы валидации
const TrainingProgressSchema = z.object({
  managerId: z.string(),
  trainingProgramId: z.string(),
  statusId: z.string().uuid(),
  completionDate: z.string().datetime().optional().nullable()
});

// Получить прогресс обучения управляющего
export const getProgress = async (req: Request, res: Response) => {
  try {
    const { managerId } = req.params;

    const progress = await prisma.trainingProgress.findMany({
      where: { managerId },
      include: {
        trainingProgram: {
          include: {
            type: true,
            parent: true,
            children: true
          }
        },
        status: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return res.json(progress);
  } catch (error) {
    console.error('❌ Ошибка при получении прогресса:', error);
    res.status(500).json({
      error: 'Ошибка при получении прогресса',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

// Создать или обновить прогресс обучения
export const upsertProgress = async (req: Request, res: Response) => {
  try {
    const validated = TrainingProgressSchema.parse(req.body);

    // Убеждаемся, что Manager существует
    await ensureManager(validated.managerId);

    // Проверяем, что статус завершен для установки даты
    const statusType = await prisma.type.findUnique({
      where: { id: validated.statusId }
    });

    const completionDate = validated.completionDate
      ? new Date(validated.completionDate)
      : statusType?.name === 'ЗАВЕРШЕНО'
      ? new Date()
      : null;

    const progress = await prisma.trainingProgress.upsert({
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
        completionDate
      },
      update: {
        statusId: validated.statusId,
        completionDate
      },
      include: {
        trainingProgram: {
          include: {
            type: true
          }
        },
        status: true,
        manager: {
          include: {
            user: true
          }
        }
      }
    });

    return res.json(progress);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Неверные данные', details: error.issues });
    }
    console.error('❌ Ошибка при сохранении прогресса:', error);
    res.status(500).json({
      error: 'Ошибка при сохранении прогресса',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

// Обновить прогресс обучения
export const updateProgress = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validated = TrainingProgressSchema.partial().parse(req.body);

    const updateData: any = {};
    if (validated.statusId) {
      updateData.statusId = validated.statusId;
      
      // Проверяем статус для установки даты завершения
      const statusType = await prisma.type.findUnique({
        where: { id: validated.statusId }
      });
      
      if (statusType?.name === 'ЗАВЕРШЕНО' && !validated.completionDate) {
        updateData.completionDate = new Date();
      }
    }
    if (validated.completionDate !== undefined) {
      updateData.completionDate = validated.completionDate
        ? new Date(validated.completionDate)
        : null;
    }

    const progress = await prisma.trainingProgress.update({
      where: { id },
      data: updateData,
      include: {
        trainingProgram: {
          include: {
            type: true
          }
        },
        status: true,
        manager: {
          include: {
            user: true
          }
        }
      }
    });

    return res.json(progress);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Неверные данные', details: error.issues });
    }
    console.error('❌ Ошибка при обновлении прогресса:', error);
    res.status(500).json({
      error: 'Ошибка при обновлении прогресса',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
