import { Request, Response } from 'express';
import { prisma } from '../../../server.js';
import { z } from 'zod';
import { getTrainingTool, MANAGER_STATUS_CHAPTER } from './training.js';

// Проверка, проходил ли управляющий обучение
const hasTrainingHistory = async (managerId: string): Promise<boolean> => {
  const trainingCount = await prisma.trainingProgress.count({
    where: { managerId }
  });
  return trainingCount > 0;
};

// Схемы валидации
const ManagerStatusSchema = z.object({
  statusId: z.string().uuid()
});

// Получить список управляющих с фильтрами
export const getManagers = async (req: Request, res: Response) => {
  try {
    const {
      status,
      rrs,
      branchId,
      search,
      trainingStatus,
      trainingProgramId,
      homeworkStatus,
      page = '1',
      limit = '50'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Базовые условия фильтрации
    const where: any = {};

    if (status) {
      const statusIds = Array.isArray(status) ? status : [status];
      where.statusId = { in: statusIds };
    }

    // Фильтрация по данным пользователя через UserData
    const userDataWhere: any = {};
    if (rrs) {
      const rrses = Array.isArray(rrs) ? rrs : [rrs];
      userDataWhere.branch = {
        rrs: { in: rrses }
      };
    }
    if (branchId) {
      const branchIds = Array.isArray(branchId) ? branchId : [branchId];
      userDataWhere.branch_uuid = { in: branchIds };
    }

    // Поиск по ФИО
    if (search) {
      userDataWhere.OR = [
        { fio: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    // Получаем управляющих с данными пользователя
    const managers = await prisma.manager.findMany({
      where,
      skip,
      take: limitNum,
      include: {
        user: true,
        status: true,
        trainingProgress: {
          include: {
            trainingProgram: {
              include: {
                type: true
              }
            },
            status: true
          }
        },
        homeworkStatuses: {
          include: {
            trainingProgram: {
              include: {
                type: true
              }
            },
            status: true
          }
        },
        employmentHistory: {
          include: {
            changeType: true
          },
          orderBy: {
            changeDate: 'desc'
          },
          take: 10 // Последние 10 изменений
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Фильтрация по статусу обучения
    let filteredManagers = managers;
    if (trainingStatus || trainingProgramId) {
      filteredManagers = managers.filter(manager => {
        if (trainingProgramId) {
          const progress = manager.trainingProgress.find(
            tp => tp.trainingProgramId === trainingProgramId
          );
          if (!progress) return false;
          if (trainingStatus) {
            const statusIds = Array.isArray(trainingStatus) ? trainingStatus : [trainingStatus];
            return statusIds.includes(progress.statusId);
          }
          return true;
        }
        if (trainingStatus) {
          const statusIds = Array.isArray(trainingStatus) ? trainingStatus : [trainingStatus];
          return manager.trainingProgress.some(tp => statusIds.includes(tp.statusId));
        }
        return true;
      });
    }

    // Фильтрация по статусу домашних заданий
    if (homeworkStatus) {
      const statusIds = Array.isArray(homeworkStatus) ? homeworkStatus : [homeworkStatus];
      filteredManagers = filteredManagers.filter(manager =>
        manager.homeworkStatuses.some(hw => statusIds.includes(hw.statusId))
      );
    }

    // Получаем общее количество для пагинации
    const total = await prisma.manager.count({ where });

    // Форматируем данные для ответа
    const formattedManagers = await Promise.all(
      filteredManagers.map(async (manager) => {
        // Получаем UserData для дополнительной информации
        const userData = await prisma.userData.findFirst({
          where: { email: manager.user.email },
          include: {
            branch: true,
            position: {
              include: {
                group: true
              }
            }
          }
        });

        return {
          id: manager.id,
          userId: manager.userId,
          name: manager.user.name,
          email: manager.user.email,
          position: userData?.position?.name || manager.user.position,
          category: userData?.position?.group?.name || null,
          branch: userData?.branch?.name || manager.user.branch,
          branchCode: userData?.branch?.code || null,
          rrs: userData?.branch?.rrs || null,
          city: userData?.branch?.city || null,
          status: manager.status.name,
          statusId: manager.statusId,
          branchCount: manager.branchCount,
          employeeCount: manager.employeeCount,
          trainingProgress: manager.trainingProgress.map(tp => ({
            ...tp,
            status: tp.status.name,
            trainingProgram: {
              ...tp.trainingProgram,
              type: tp.trainingProgram.type.name
            }
          })),
          homeworkStatuses: manager.homeworkStatuses.map(hw => ({
            ...hw,
            status: hw.status.name,
            trainingProgram: {
              ...hw.trainingProgram,
              type: hw.trainingProgram.type.name
            }
          })),
          employmentHistory: manager.employmentHistory.map(eh => ({
            ...eh,
            changeType: eh.changeType.name
          }))
        };
      })
    );

    return res.json({
      data: formattedManagers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('❌ Ошибка при получении списка управляющих:', error);
    res.status(500).json({
      error: 'Ошибка при получении списка управляющих',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

// Получить детали управляющего
export const getManagerById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const manager = await prisma.manager.findUnique({
      where: { id },
      include: {
        user: true,
        status: true,
        trainingProgress: {
          include: {
            trainingProgram: {
              include: {
                type: true
              }
            },
            status: true
          }
        },
        // Комментарии получаются через универсальный API /hub-api/comments с entityType='TRAINING_MANAGER'
        homeworkStatuses: {
          include: {
            trainingProgram: {
              include: {
                type: true
              }
            },
            status: true,
            checker: true
          }
        },
        employmentHistory: {
          include: {
            changeType: true
          },
          orderBy: {
            changeDate: 'desc'
          }
        }
      }
    });

    if (!manager) {
      return res.status(404).json({ error: 'Управляющий не найден' });
    }

    // Получаем UserData
    const userData = await prisma.userData.findFirst({
      where: { email: manager.user.email },
      include: {
        branch: true,
        position: {
          include: {
            group: true
          }
        }
      }
    });

    return res.json({
      ...manager,
      userData
    });
  } catch (error) {
    console.error('❌ Ошибка при получении управляющего:', error);
    res.status(500).json({
      error: 'Ошибка при получении управляющего',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

// Обновить статус управляющего
export const updateManagerStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validated = ManagerStatusSchema.parse(req.body);

    // Получаем новый статус
    const newStatus = await prisma.type.findUnique({
      where: { id: validated.statusId }
    });

    // Если устанавливаем статус FIRED или DEMOTED, проверяем наличие обучения
    if (newStatus && (newStatus.name === 'FIRED' || newStatus.name === 'DEMOTED')) {
      const hasTraining = await hasTrainingHistory(id);

      // Если управляющий не проходил обучение, удаляем его из системы
      if (!hasTraining) {
        await prisma.manager.delete({
          where: { id }
        });

        return res.status(200).json({
          message: 'Управляющий удален из системы, так как не проходил обучение',
          deleted: true
        });
      }
    }

    const manager = await prisma.manager.update({
      where: { id },
      data: {
        statusId: validated.statusId
      },
      include: {
        user: true,
        status: true
      }
    });

    return res.json(manager);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Неверные данные', details: error.issues });
    }
    console.error('❌ Ошибка при обновлении статуса управляющего:', error);
    res.status(500).json({
      error: 'Ошибка при обновлении статуса',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

// Создать или получить Manager для пользователя
export const ensureManager = async (userId: string) => {
  let manager = await prisma.manager.findUnique({
    where: { userId }
  });

  if (!manager) {
    // Получаем дефолтный статус "ACTIVE" из Type
    const tool = await getTrainingTool();
    const defaultStatus = await prisma.type.findFirst({
      where: {
        model_uuid: tool.id,
        chapter: MANAGER_STATUS_CHAPTER,
        name: 'ACTIVE'
      }
    });

    if (!defaultStatus) {
      throw new Error('Не найден дефолтный статус управляющего. Создайте типы в таблице Type.');
    }

    manager = await prisma.manager.create({
      data: {
        userId,
        statusId: defaultStatus.id
      }
    });
  }

  return manager;
};
