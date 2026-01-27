import { Request, Response } from 'express';
import { prisma } from '../../../server.js';
import { z } from 'zod';
import {
  getHierarchyItems,
  buildTree,
  HierarchyConfig
} from '../../../utils/hierarchy.js';

const trainingProgramConfig: HierarchyConfig = {
  modelName: 'trainingProgram',
  parentField: 'parentId',
  sortField: 'order',
  nameField: 'name',
  childrenRelation: 'children'
};

// Схемы валидации
const TrainingProgramSchema = z.object({
  name: z.string().min(1, 'Название программы обязательно'),
  typeId: z.string().uuid('ID типа программы обязателен'),
  parentId: z.string().uuid().optional().nullable(),
  isRequired: z.boolean().optional().default(false)
});

// Получить список программ (дерево)
export const getPrograms = async (req: Request, res: Response) => {
  try {
    const { type, parentId } = req.query;

    const additionalWhere: any = {};
    if (type) {
      additionalWhere.typeId = type;
    }

    const programs = await getHierarchyItems(prisma.trainingProgram, trainingProgramConfig, {
      parentId: parentId as string | null | undefined,
      additionalWhere,
      include: {
        type: true,
        children: {
          orderBy: {
            order: 'asc'
          }
        },
        parent: {
          include: {
            type: true
          }
        },
        _count: {
          select: {
            progress: true,
            homework: true
          }
        }
      }
    });

    // Формируем дерево программ с правильной сортировкой
    const tree = buildTree(
      programs, 
      trainingProgramConfig.parentField, 
      trainingProgramConfig.childrenRelation,
      null,
      trainingProgramConfig.sortField,
      trainingProgramConfig.nameField
    );

    return res.json(tree);
  } catch (error) {
    console.error('❌ Ошибка при получении программ:', error);
    res.status(500).json({
      error: 'Ошибка при получении программ',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

// Получить программу по ID
export const getProgramById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const program = await prisma.trainingProgram.findUnique({
      where: { id },
      include: {
        type: true,
        parent: {
          include: {
            type: true
          }
        },
        children: {
          include: {
            type: true
          },
          orderBy: {
            order: 'asc'
          }
        },
        progress: {
          include: {
            manager: {
              include: {
                user: true
              }
            },
            status: true
          }
        }
      }
    });

    if (!program) {
      return res.status(404).json({ error: 'Программа не найдена' });
    }

    return res.json(program);
  } catch (error) {
    console.error('❌ Ошибка при получении программы:', error);
    res.status(500).json({
      error: 'Ошибка при получении программы',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

// Создать программу
export const createProgram = async (req: Request, res: Response) => {
  try {
    const validated = TrainingProgramSchema.parse(req.body);

    // Порядок сортировки автоматически вычисляется триггером в БД
    // Если нужно явно указать order, можно добавить его в схему валидации
    const program = await prisma.trainingProgram.create({
      data: {
        name: validated.name,
        typeId: validated.typeId,
        parentId: validated.parentId || null,
        order: 0, // Триггер автоматически установит правильное значение
        isRequired: validated.isRequired
      },
      include: {
        parent: true,
        children: true
      }
    });

    return res.status(201).json(program);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Неверные данные', details: error.issues });
    }
    console.error('❌ Ошибка при создании программы:', error);
    res.status(500).json({
      error: 'Ошибка при создании программы',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

// Обновить программу
export const updateProgram = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validated = TrainingProgramSchema.partial().parse(req.body);

    // Порядок сортировки автоматически пересчитывается триггером в БД при изменении parentId
    const program = await prisma.trainingProgram.update({
      where: { id },
      data: validated,
      include: {
        type: true,
        parent: {
          include: {
            type: true
          }
        },
        children: {
          include: {
            type: true
          }
        }
      }
    });

    return res.json(program);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Неверные данные', details: error.issues });
    }
    console.error('❌ Ошибка при обновлении программы:', error);
    res.status(500).json({
      error: 'Ошибка при обновлении программы',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

// Удалить программу
export const deleteProgram = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Проверяем, есть ли связанные данные
    const progressCount = await prisma.trainingProgress.count({
      where: { trainingProgramId: id }
    });

    if (progressCount > 0) {
      return res.status(400).json({
        error: 'Невозможно удалить программу, так как есть связанные записи прогресса'
      });
    }

    await prisma.trainingProgram.delete({
      where: { id }
    });

    return res.json({ message: 'Программа удалена' });
  } catch (error) {
    console.error('❌ Ошибка при удалении программы:', error);
    res.status(500).json({
      error: 'Ошибка при удалении программы',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
