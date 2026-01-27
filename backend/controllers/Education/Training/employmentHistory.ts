import { Request, Response } from 'express';
import { prisma } from '../../../server.js';
import { z } from 'zod';
import { ensureManager } from './managers.js';
import { getTrainingTool, MANAGER_STATUS_CHAPTER } from './training.js';

// Схемы валидации
const EmploymentHistorySchema = z.object({
  managerId: z.string(),
  changeTypeId: z.string().uuid(),
  fromBranchId: z.string().optional().nullable(),
  toBranchId: z.string().optional().nullable(),
  fromPosition: z.string().optional().nullable(),
  toPosition: z.string().optional().nullable(),
  changeDate: z.string().datetime(),
  notes: z.string().optional().nullable()
});

// Получить историю кадровых изменений управляющего
export const getEmploymentHistory = async (req: Request, res: Response) => {
  try {
    const { managerId } = req.params;

    const history = await prisma.employmentHistory.findMany({
      where: { managerId },
      orderBy: {
        changeDate: 'desc'
      }
    });

    return res.json(history);
  } catch (error) {
    console.error('❌ Ошибка при получении истории кадровых изменений:', error);
    res.status(500).json({
      error: 'Ошибка при получении истории кадровых изменений',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

// Проверка, проходил ли управляющий обучение
const hasTrainingHistory = async (managerId: string): Promise<boolean> => {
  const trainingCount = await prisma.trainingProgress.count({
    where: { managerId }
  });
  return trainingCount > 0;
};

// Создать запись истории кадровых изменений
export const createEmploymentHistory = async (req: Request, res: Response) => {
  try {
    const validated = EmploymentHistorySchema.parse(req.body);

    // Убеждаемся, что Manager существует
    const manager = await ensureManager(validated.managerId);

    // Получаем тип изменения для проверки названия
    const changeType = await prisma.type.findUnique({
      where: { id: validated.changeTypeId }
    });

    // Проверяем, является ли это увольнением или понижением
    const isTerminationOrDemotion = changeType?.name === 'TERMINATION' || changeType?.name === 'DEMOTION';

    // Если это увольнение или понижение, проверяем наличие обучения
    if (isTerminationOrDemotion) {
      const hasTraining = await hasTrainingHistory(validated.managerId);

      // Если управляющий не проходил обучение, удаляем его из системы
      if (!hasTraining) {
        await prisma.manager.delete({
          where: { id: validated.managerId }
        });

        return res.status(200).json({
          message: 'Управляющий удален из системы, так как не проходил обучение',
          deleted: true
        });
      }
      // Если проходил обучение, сохраняем историю и обновляем статус
    }

    // Создаем запись истории (только если управляющий проходил обучение или это не увольнение/понижение)
    const history = await prisma.employmentHistory.create({
      data: {
        managerId: validated.managerId,
        changeTypeId: validated.changeTypeId,
        fromBranchId: validated.fromBranchId || null,
        toBranchId: validated.toBranchId || null,
        fromPosition: validated.fromPosition || null,
        toPosition: validated.toPosition || null,
        changeDate: new Date(validated.changeDate),
        notes: validated.notes || null
      },
      include: {
        manager: {
          include: {
            user: true
          }
        },
        changeType: true
      }
    });

    // Обновляем статус управляющего, если это увольнение или понижение
    const tool = await getTrainingTool();
    if (changeType?.name === 'TERMINATION') {
      const firedStatus = await prisma.type.findFirst({
        where: {
          model_uuid: tool.id,
          chapter: MANAGER_STATUS_CHAPTER,
          name: 'FIRED'
        }
      });
      if (firedStatus) {
        await prisma.manager.update({
          where: { id: validated.managerId },
          data: { statusId: firedStatus.id }
        });
      }
    } else if (changeType?.name === 'DEMOTION') {
      const demotedStatus = await prisma.type.findFirst({
        where: {
          model_uuid: tool.id,
          chapter: MANAGER_STATUS_CHAPTER,
          name: 'DEMOTED'
        }
      });
      if (demotedStatus) {
        await prisma.manager.update({
          where: { id: validated.managerId },
          data: { statusId: demotedStatus.id }
        });
      }
    }

    return res.status(201).json(history);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Неверные данные', details: error.issues });
    }
    console.error('❌ Ошибка при создании записи истории:', error);
    res.status(500).json({
      error: 'Ошибка при создании записи истории',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
