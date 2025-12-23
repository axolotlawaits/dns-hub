// controllers/app/type.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';

// Схема валидации для создания типа
const createTypeSchema = z.object({
  model_uuid: z.string().uuid(),
  chapter: z.string().min(1),
  name: z.string().min(1),
  colorHex: z.string().optional(),
  parent_type: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().default(0),
});

// Схема валидации для обновления типа
const updateTypeSchema = z.object({
  model_uuid: z.string().uuid().optional(),
  chapter: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  colorHex: z.string().optional(),
  parent_type: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

// Получение списка всех типов
export const getTypes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const types = await prisma.type.findMany({
      select: {
        id: true,
        model_uuid: true,
        chapter: true,
        name: true,
        colorHex: true,
        parent_type: true,
        sortOrder: true,
        Tool: {
          select: {
            id: true,
            name: true
          }
        },
        parent: {
          select: {
            id: true,
            name: true
          }
        },
        children: {
          select: {
            id: true,
            name: true,
            sortOrder: true
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
        }
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    res.status(200).json(types);
  } catch (error) {
    next(error);
  }
};

// Получение типа по ID
export const getTypeById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const type = await prisma.type.findUnique({
      where: { id },
      include: {
        Tool: {
          select: {
            id: true,
            name: true
          }
        },
        parent: {
          select: {
            id: true,
            name: true,
            colorHex: true
          }
        },
        children: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
        }
      }
    });

    if (!type) {
      res.status(404).json({ error: 'Type not found' });
      return;
    }

    res.status(200).json(type);
  } catch (error) {
    next(error);
  }
};

// Получение типов по model_uuid
export const getTypesByModelUuid = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { model_uuid, chapter, parent_type } = req.query;
    
    if (!model_uuid && !chapter) {
      res.status(400).json({ error: 'model_uuid is required' });
      return;
    }

    const where: any = {};
    if (model_uuid) where.model_uuid = model_uuid as string;
    if (chapter) where.chapter = chapter as string;
    if (parent_type !== undefined) {
      where.parent_type = parent_type === 'null' || parent_type === '' ? null : parent_type as string;
    }

    const types = await prisma.type.findMany({
      where,
      select: {
        id: true,
        chapter: true,
        name: true,
        colorHex: true,
        parent_type: true,
        sortOrder: true,
        Tool: {
          select: {
            id: true,
            name: true
          }
        },
        parent: {
          select: {
            id: true,
            name: true
          }
        },
        children: {
          select: {
            id: true,
            name: true,
            sortOrder: true
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
        }
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    res.status(200).json(types);
  } catch (error) {
    next(error);
  }
};

// Создание нового типа
export const createType = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validatedData = createTypeSchema.parse(req.body);
    
    // Проверяем существование Tool
    const tool = await prisma.tool.findUnique({
      where: { id: validatedData.model_uuid }
    });

    if (!tool) {
      res.status(400).json({ error: 'Tool not found' });
      return;
    }

    // Если указан parent_type, проверяем его существование
    if (validatedData.parent_type) {
      const parentType = await prisma.type.findUnique({
        where: { id: validatedData.parent_type }
      });

      if (!parentType) {
        res.status(400).json({ error: 'Parent type not found' });
        return;
      }

      // Проверяем, что parent_type принадлежит тому же model_uuid
      if (parentType.model_uuid !== validatedData.model_uuid) {
        res.status(400).json({ error: 'Parent type must belong to the same tool' });
        return;
      }
    }

    const type = await prisma.type.create({
      data: validatedData,
      include: {
        Tool: {
          select: {
            id: true,
            name: true
          }
        },
        parent: {
          select: {
            id: true,
            name: true,
            colorHex: true
          }
        },
        children: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
        }
      }
    });

    res.status(201).json(type);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.issues });
      return;
    }
    next(error);
  }
};

// Обновление типа
export const updateType = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const validatedData = updateTypeSchema.parse(req.body);

    // Получаем текущий тип для проверок
    const currentType = await prisma.type.findUnique({
      where: { id },
      select: {
        model_uuid: true,
        parent_type: true
      }
    });

    if (!currentType) {
      res.status(404).json({ error: 'Type not found' });
      return;
    }

    // Если обновляется model_uuid, проверяем существование Tool
    if (validatedData.model_uuid) {
      const tool = await prisma.tool.findUnique({
        where: { id: validatedData.model_uuid }
      });

      if (!tool) {
        res.status(400).json({ error: 'Tool not found' });
        return;
      }
    }

    // Если обновляется parent_type, проверяем его существование
    if (validatedData.parent_type !== undefined) {
      if (validatedData.parent_type) {
        const parentType = await prisma.type.findUnique({
          where: { id: validatedData.parent_type }
        });

        if (!parentType) {
          res.status(400).json({ error: 'Parent type not found' });
          return;
        }

        // Проверяем, что parent_type принадлежит тому же model_uuid
        const targetModelUuid = validatedData.model_uuid || currentType.model_uuid;
        if (parentType.model_uuid !== targetModelUuid) {
          res.status(400).json({ error: 'Parent type must belong to the same tool' });
          return;
        }

        // Проверяем, что не создается циклическая зависимость
        if (validatedData.parent_type === id) {
          res.status(400).json({ error: 'Type cannot be its own parent' });
          return;
        }

        // Проверяем, что новый parent не является потомком текущего типа
        const isDescendant = await checkIfDescendant(validatedData.parent_type, id);
        if (isDescendant) {
          res.status(400).json({ error: 'Cannot set parent: would create circular dependency' });
          return;
        }
      }
    }

    const type = await prisma.type.update({
      where: { id },
      data: validatedData,
      include: {
        Tool: {
          select: {
            id: true,
            name: true
          }
        },
        parent: {
          select: {
            id: true,
            name: true,
            colorHex: true
          }
        },
        children: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
        }
      }
    });

    res.status(200).json(type);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.issues });
      return;
    }
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      res.status(404).json({ error: 'Type not found' });
      return;
    }
    next(error);
  }
};

// Вспомогательная функция для проверки, является ли один тип потомком другого
async function checkIfDescendant(ancestorId: string, descendantId: string): Promise<boolean> {
  const type = await prisma.type.findUnique({
    where: { id: descendantId },
    select: { parent_type: true }
  });

  if (!type || !type.parent_type) {
    return false;
  }

  if (type.parent_type === ancestorId) {
    return true;
  }

  return checkIfDescendant(ancestorId, type.parent_type);
}

// Удаление типа
export const deleteType = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    // Проверяем, есть ли дочерние типы
    const childrenCount = await prisma.type.count({
      where: { parent_type: id }
    });

    if (childrenCount > 0) {
      res.status(400).json({ 
        error: 'Cannot delete type with children. Delete or reassign children first.',
        childrenCount 
      });
      return;
    }

    await prisma.type.delete({
      where: { id }
    });

    res.status(200).json({ message: 'Type deleted successfully' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      res.status(404).json({ error: 'Type not found' });
      return;
    }
    next(error);
  }
};

// Загрузка типов корреспонденции
export const loadCorrespondenceTypes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Структура типов отправителей
    const senderTypesStructure = [
      {
        name: 'Суд',
        children: [
          {
            name: 'Федеральные суды',
            children: [
              { name: 'Суды общей юрисдикции' },
              { name: 'Арбитражный суд' },
              { name: 'Специализированные суды' },
            ],
          },
          { name: 'Мировые судьи' },
        ],
      },
      { name: 'ФССП' },
      { name: 'МВД' },
      { name: 'ФНС' },
      { name: 'СК' },
      { name: 'Прокуратура' },
      { name: 'ФСБ' },
      { name: 'Роспотребнадзор' },
      { name: 'Роскомнадзор' },
      { name: 'Физическое лицо' },
      { name: 'Юридическое лицо' },
      { name: 'Иное' },
    ];

    // Типы документов
    const documentTypes = [
      'Исковое заявление',
      'Повестка',
      'Решение',
      'Определение',
      'Постановление',
      'Запрос',
      'Представление',
      'Заявление',
      'Претензия',
      'Жалоба',
      'Исполнительный лист',
      'Иное',
    ];

    // Получаем или создаем Tool для корреспонденции
    let tool = await prisma.tool.findFirst({
      where: { link: 'aho/correspondence' },
    });

    if (!tool) {
      tool = await prisma.tool.create({
        data: {
          name: 'Корреспонденция',
          icon: '📮',
          link: 'aho/correspondence',
          description: 'Управление входящей и исходящей корреспонденцией',
          order: 100,
          included: true,
        },
      });
    }

    // Функция для создания или обновления типа
    const createOrUpdateType = async (
      toolId: string,
      chapter: string,
      name: string,
      parentId: string | null = null,
      sortOrder: number = 0
    ) => {
      const existingType = await prisma.type.findFirst({
        where: {
          model_uuid: toolId,
          chapter: chapter,
          name: name,
          parent_type: parentId,
        },
      });

      if (existingType) {
        if (existingType.sortOrder !== sortOrder) {
          await prisma.type.update({
            where: { id: existingType.id },
            data: { sortOrder },
          });
        }
        return existingType;
      }

      return await prisma.type.create({
        data: {
          model_uuid: toolId,
          chapter: chapter,
          name: name,
          parent_type: parentId,
          sortOrder: sortOrder,
        },
      });
    };

    // Рекурсивно создаем типы отправителей
    const createSenderTypes = async (
      toolId: string,
      items: any[],
      parentId: string | null = null,
      sortOrder: number = 0
    ) => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const currentSortOrder = sortOrder + i;

        const type = await createOrUpdateType(
          toolId,
          'Отправитель',
          item.name,
          parentId,
          currentSortOrder
        );

        if (item.children && item.children.length > 0) {
          await createSenderTypes(toolId, item.children, type.id, 0);
        }
      }
    };

    // Создаем типы документов
    const createDocumentTypes = async (toolId: string) => {
      for (let i = 0; i < documentTypes.length; i++) {
        await createOrUpdateType(
          toolId,
          'Тип документа',
          documentTypes[i],
          null,
          i
        );
      }
    };

    // Выполняем загрузку
    await createSenderTypes(tool.id, senderTypesStructure);
    await createDocumentTypes(tool.id);

    res.status(200).json({ 
      message: 'Типы корреспонденции успешно загружены',
      toolId: tool.id
    });
  } catch (error) {
    console.error('[Type Controller] Error loading correspondence types:', error);
    next(error);
  }
};