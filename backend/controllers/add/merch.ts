import { Request, Response, NextFunction } from 'express';
import { PrismaClient, Merch } from '@prisma/client';
import { uploadMerch } from '../../middleware/uploaderMerch';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Схемы валидации
const MerchCategorySchema = z.object({
  name: z.string().min(1, 'Название категории обязательно'),
  description: z.string().optional(),
  parentId: z.string().optional(),
  sortOrder: z.number().optional()
});

const MerchCardSchema = z.object({
  name: z.string().min(1, 'Название карточки обязательно'),
  description: z.string().optional(),
  categoryId: z.string().min(1, 'ID категории обязателен'),
  isActive: z.boolean().optional().default(true),
});

// --- Категории ---

// Получить иерархию категорий (layer = 1) или карточки (layer = 0)
export const getMerchHierarchy = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { parentId, layer } = req.query;
    
    let whereClause: any = {};
    
    // Логика по принципу старого MerchBot:
    // 1. Если parentId не указан - загружаем корневые категории (parentId = null, layer = 1)
    // 2. Если parentId указан - загружаем детей этого родителя с указанным layer
    if (parentId) {
      whereClause.parentId = parentId as string;
      // Если также указан layer, добавляем его к условию
      if (layer !== undefined) {
        whereClause.layer = parseInt(layer as string);
      }
    } else {
      // По умолчанию загружаем корневые категории (parentId = null, layer = 1)
      whereClause.parentId = null;
      whereClause.layer = 1;
    }

    const categories = await prisma.merch.findMany({
      where: whereClause,
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' }
      ],
      include: {
        children: {
          select: {
            id: true
          }
        },
        attachments: {
          select: {
            id: true,
            source: true,
            type: true
          },
          orderBy: {
            sortOrder: 'asc'
          }
        }
      }
    });

    const formattedData = categories.map((category: any) => {
      return {
        id: category.id,
        name: category.name,
        description: category.description || '',
        child: category.children.map((child: any) => child.id), // Массив ID детей
        layer: category.layer,
        imageUrl: category.imageUrl,
        isActive: category.isActive,
        attachmentsCount: category.attachments.length,
        attachments: category.attachments, // Добавляем сами attachments
        hasChildren: category.children.length > 0, // Флаг наличия детей
      };
    });

    return res.json(formattedData);
  } catch (error) {
    console.error('❌ Ошибка при получении иерархии мерч-категорий:', error);
    next(error);
  }
};

// Создать новую категорию
export const createMerchCategory = [
  uploadMerch.array('images', 10), // Поддержка до 10 изображений
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = MerchCategorySchema.parse(req.body);
      const { name, description, parentId, sortOrder } = validatedData;

      // Категории всегда создаются с layer = 1
      const newLayer = 1;

      // Обрабатываем изображения
      let mainImageUrl = '';
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        const files = req.files as Express.Multer.File[];
        mainImageUrl = files[0].path.replace(/\\/g, '/').replace(process.cwd() + '/public', '');
      }

      // Создаем новую категорию
      const newCategory = await prisma.merch.create({
        data: {
          name,
          description: description || '',
          parentId: parentId || null, // Устанавливаем parentId напрямую
          layer: newLayer,
          imageUrl: mainImageUrl,
          isActive: true,
          sortOrder: sortOrder || 0
        },
        include: {
          children: {
            select: {
              id: true
            }
          },
          attachments: {
            select: {
              id: true,
              source: true,
              type: true
            },
            orderBy: {
              sortOrder: 'asc'
            }
          }
        }
      });

      // Добавляем дополнительные изображения как attachments
      if (req.files && Array.isArray(req.files) && req.files.length > 1) {
        const files = req.files as Express.Multer.File[];
        for (let i = 1; i < files.length; i++) {
          const file = files[i];
          await prisma.merchAttachment.create({
            data: {
              source: file.path.replace(/\\/g, '/').replace(process.cwd() + '/public', ''),
              type: 'image',
              recordId: newCategory.id,
              userAddId: 'system', // TODO: получить ID пользователя из сессии
              sortOrder: i
            }
          });
        }
      }

      res.status(201).json({
        id: newCategory.id,
        name: newCategory.name,
        description: newCategory.description,
        child: newCategory.children.map((child: any) => child.id),
        layer: newCategory.layer,
        imageUrl: newCategory.imageUrl,
        isActive: newCategory.isActive,
        attachmentsCount: newCategory.attachments.length,
        hasChildren: newCategory.children.length > 0
      });
    } catch (error) {
      console.error('❌ Ошибка при создании мерч-категории:', error);
      next(error);
    }
  }
];

// Обновить категорию
export const updateMerchCategory = [
  uploadMerch.single('image'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, description, sortOrder } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Название категории обязательно' });
      }

      const categoryId = id;

      // Получаем текущую категорию
      const existingCategory = await prisma.merch.findUnique({
        where: { id: categoryId }
      });

      if (!existingCategory) {
        return res.status(404).json({ error: 'Категория не найдена' });
      }

      // Если есть новое изображение, удаляем старое
      if (req.file && existingCategory.imageUrl) {
        const oldFilePath = path.join(process.cwd(), 'public', existingCategory.imageUrl);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }

      // Обновляем категорию
      const updatedCategory = await prisma.merch.update({
        where: { id: categoryId },
        data: {
          name,
          description: description || '',
          imageUrl: req.file ? req.file.path.replace(/\\/g, '/').replace(process.cwd() + '/public', '') : existingCategory.imageUrl,
          sortOrder: sortOrder !== undefined ? sortOrder : existingCategory.sortOrder
        },
        include: {
          children: {
            select: {
              id: true
            }
          },
          attachments: {
            select: {
              id: true,
              source: true,
              type: true
            },
            orderBy: {
              sortOrder: 'asc'
            }
          }
        }
      });

      return res.json({
        id: updatedCategory.id,
        name: updatedCategory.name,
        description: updatedCategory.description,
        child: updatedCategory.children.map(child => child.id),
        layer: updatedCategory.layer,
        imageUrl: updatedCategory.imageUrl,
        isActive: updatedCategory.isActive,
        attachmentsCount: updatedCategory.attachments.length,
        hasChildren: updatedCategory.children.length > 0
      });
    } catch (error) {
      console.error('❌ Ошибка при обновлении мерч-категории:', error);
      next(error);
    }
  }
];

// Удалить категорию
export const deleteMerchCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const categoryId = id;

    // Проверяем, есть ли связанные attachments
    const category = await prisma.merch.findUnique({
      where: { id: categoryId },
      include: {
        attachments: true
      }
    });

    if (!category) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }

    if (category.attachments && category.attachments.length > 0) {
      return res.status(400).json({ 
        error: 'Нельзя удалить категорию с привязанными attachments. Сначала удалите или переместите attachments.' 
      });
    }

    // Удаляем изображение категории, если оно есть
    if (category.imageUrl) {
      const filePath = path.join(process.cwd(), 'public', category.imageUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Получаем детей категории для рекурсивного удаления
    const children = await prisma.merch.findMany({
      where: { parentId: categoryId },
      select: { id: true }
    });

    // Рекурсивно удаляем всех детей (если они пустые)
    for (const child of children) {
      await deleteCategoryIfEmpty(child.id);
    }

    // Удаляем саму категорию
    await prisma.merch.delete({
      where: { id: categoryId }
    });

    // При использовании parentId каскадное удаление происходит автоматически

    return res.json({ message: 'Категория успешно удалена' });
  } catch (error) {
    console.error('❌ Ошибка при удалении мерч-категории:', error);
    next(error);
  }
};

// --- Функции для работы с карточками (layer = 0) ---

// Создать карточку (layer = 0)
export const createMerchCard = [
  uploadMerch.array('images', 10), // Поддержка до 10 изображений
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, categoryId, sortOrder } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Название карточки обязательно' });
      }

      if (!categoryId) {
        return res.status(400).json({ error: 'ID категории обязателен' });
      }

      // Проверяем, что категория существует
      const category = await prisma.merch.findUnique({
        where: { id: categoryId }
      });

      if (!category) {
        return res.status(404).json({ error: 'Категория не найдена' });
      }

      // Обрабатываем изображения
      let mainImageUrl = '';
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        const files = req.files as Express.Multer.File[];
        mainImageUrl = files[0].path.replace(/\\/g, '/').replace(process.cwd() + '/public', '');
      }

      // Создаем карточку с layer = 0
      const newCard = await prisma.merch.create({
        data: {
          name,
          description: description || '',
          parentId: categoryId, // Привязываем к категории
          layer: 0, // Карточка
          imageUrl: mainImageUrl,
          isActive: true,
          sortOrder: sortOrder || 0
        },
        include: {
          attachments: {
            select: {
              id: true,
              source: true,
              type: true
            },
            orderBy: {
              sortOrder: 'asc'
            }
          }
        }
      });

      // Добавляем дополнительные изображения как attachments
      if (req.files && Array.isArray(req.files) && req.files.length > 1) {
        const files = req.files as Express.Multer.File[];
        for (let i = 1; i < files.length; i++) {
          const file = files[i];
          await prisma.merchAttachment.create({
            data: {
              source: file.path.replace(/\\/g, '/').replace(process.cwd() + '/public', ''),
              type: 'image',
              recordId: newCard.id,
              userAddId: 'system', // TODO: получить ID пользователя из сессии
              sortOrder: i
            }
          });
        }
      }

      res.status(201).json({
        id: newCard.id,
        name: newCard.name,
        description: newCard.description,
        layer: newCard.layer,
        imageUrl: newCard.imageUrl,
        isActive: newCard.isActive,
        attachmentsCount: newCard.attachments.length,
        sortOrder: newCard.sortOrder
      });
    } catch (error) {
      console.error('❌ Ошибка при создании карточки:', error);
      next(error);
    }
  }
];

// --- Функции для работы с attachments ---

// Добавить attachment к категории
export const addMerchAttachment = [
  uploadMerch.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { recordId } = req.params;
      const { type, sortOrder } = req.body;

      if (!req.file) {
        return res.status(400).json({ error: 'Файл не загружен' });
      }

      const attachment = await prisma.merchAttachment.create({
        data: {
          recordId,
          source: req.file.path.replace(/\\/g, '/').replace(process.cwd() + '/public', ''),
          type: type || 'image',
          userAddId: 'system', // TODO: получить из токена
          sortOrder: sortOrder || 0
        }
      });

      return res.status(201).json(attachment);
    } catch (error) {
      console.error('❌ Ошибка при добавлении attachment:', error);
      next(error);
    }
  }
];

// Удалить attachment
export const deleteMerchAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const attachment = await prisma.merchAttachment.findUnique({
      where: { id }
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment не найден' });
    }

    // Удаляем файл
    const filePath = path.join(process.cwd(), 'public', attachment.source);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.merchAttachment.delete({
      where: { id }
    });

    return res.json({ message: 'Attachment успешно удален' });
  } catch (error) {
    console.error('❌ Ошибка при удалении attachment:', error);
    next(error);
  }
};

// --- Вспомогательные функции ---

// Обновить родительскую категорию
// Функция updateParentCategory больше не нужна, так как мы используем parentId

// Рекурсивная функция для удаления дочерних категорий только если они пустые
const deleteCategoryIfEmpty = async (categoryId: string) => {
  try {
    const category = await prisma.merch.findUnique({
      where: { id: categoryId },
      include: {
        attachments: true
      }
    });

    if (category) {
      // Проверяем, есть ли attachments в этой категории
      if (category.attachments && category.attachments.length > 0) {
        console.log(`⚠️ Категория ${categoryId} содержит attachments, пропускаем удаление`);
        return;
      }

      // Удаляем изображение категории, если оно есть
      if (category.imageUrl) {
        const filePath = path.join(process.cwd(), 'public', category.imageUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

                  // Получаем детей через связи
                  const categoryWithChildren = await prisma.merch.findUnique({
                    where: { id: categoryId },
                    include: {
                      children: {
                        select: { id: true }
                      }
                    }
                  });

                  // Рекурсивно проверяем и удаляем детей
                  if (categoryWithChildren) {
                    for (const child of categoryWithChildren.children) {
                      await deleteCategoryIfEmpty(child.id);
                    }
                  }

      // Проверяем еще раз перед удалением
      const categoryCheck = await prisma.merch.findUnique({
        where: { id: categoryId },
        include: {
          attachments: true
        }
      });

      if (categoryCheck && (!categoryCheck.attachments || categoryCheck.attachments.length === 0)) {
        // Удаляем текущую категорию только если она пустая
        await prisma.merch.delete({
          where: { id: categoryId }
        });
        console.log(`✅ Удалена пустая категория: ${categoryId}`);
      }
    }
  } catch (error) {
    console.error(`❌ Ошибка при удалении категории ${categoryId}:`, error);
  }
};

// Функция removeFromAllParents больше не нужна, так как мы используем parentId