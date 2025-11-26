import { Request, Response, NextFunction } from 'express';
import { PrismaClient, Merch } from '@prisma/client';
import { uploadMerch } from '../../middleware/uploaderMerch.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { prisma, API } from '../../server.js';

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
      // Формируем imageUrls из attachments
      const imageUrls = category.attachments
        .filter((att: any) => att.type === 'image')
        .map((att: any) => `${API}/public/add/merch/${att.source}`);
      
      return {
        id: category.id,
        name: category.name,
        description: category.description || '',
        child: category.children.map((child: any) => child.id), // Массив ID детей
        layer: category.layer,
        isActive: category.isActive,
        attachmentsCount: category.attachments.length,
        attachments: category.attachments, // Добавляем сами attachments
        imageUrls: imageUrls, // Добавляем imageUrls для удобства
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

      // Создаем новую категорию
      const newCategory = await prisma.merch.create({
        data: {
          name,
          description: description || '',
          parentId: parentId || null, // Устанавливаем parentId напрямую
          layer: newLayer,
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

      // Получаем userId из токена (должен быть после authenticateToken middleware)
      const userId = (req as any).token?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'User ID не найден в токене' });
      }

      // Добавляем все изображения как attachments
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        const files = req.files as Express.Multer.File[];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          await prisma.merchAttachment.create({
            data: {
              source: file.filename, // Сохраняем название файла как оно сохранено на диске
              type: 'image',
              recordId: newCategory.id,
              userAddId: userId,
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
  uploadMerch.array('images', 10), // Поддержка до 10 изображений
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

      // Получаем userId из токена (должен быть после authenticateToken middleware)
      const userId = (req as any).token?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'User ID не найден в токене' });
      }

      // Обновляем категорию
      const updatedCategory = await prisma.merch.update({
        where: { id: categoryId },
        data: {
          name,
          description: description || '',
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

      // Добавляем новые изображения как attachments, если они были загружены
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        const files = req.files as Express.Multer.File[];
        
        // Получаем текущий максимальный sortOrder для attachments этой категории
        const lastAttachment = await prisma.merchAttachment.findFirst({
          where: { recordId: categoryId },
          orderBy: { sortOrder: 'desc' }
        });
        
        let nextSortOrder = lastAttachment ? lastAttachment.sortOrder + 1 : 0;
        
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          // Определяем тип файла по mimetype
          const attachmentType = file.mimetype === 'application/pdf' ? 'pdf' : 'image';
          await prisma.merchAttachment.create({
            data: {
              source: file.filename, // Сохраняем название файла как оно сохранено на диске
              type: attachmentType,
              recordId: categoryId,
              userAddId: userId,
              sortOrder: nextSortOrder + i
            }
          });
        }
        
        // Обновляем категорию с новыми attachments
        const categoryWithNewAttachments = await prisma.merch.findUnique({
          where: { id: categoryId },
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
        
        // Формируем imageUrls из attachments
        const imageUrls = categoryWithNewAttachments!.attachments
          .filter(att => att.type === 'image')
          .map(att => `${API}/public/add/merch/${att.source}`);
        
        return res.json({
          id: categoryWithNewAttachments!.id,
          name: categoryWithNewAttachments!.name,
          description: categoryWithNewAttachments!.description,
          child: categoryWithNewAttachments!.children.map(child => child.id),
          layer: categoryWithNewAttachments!.layer,
          isActive: categoryWithNewAttachments!.isActive,
          attachmentsCount: categoryWithNewAttachments!.attachments.length,
          hasChildren: categoryWithNewAttachments!.children.length > 0,
          attachments: categoryWithNewAttachments!.attachments.map(att => ({
            id: att.id,
            source: att.source,
            type: att.type
          })),
          imageUrls: imageUrls
        });
      }

      // Формируем imageUrls из attachments
      const imageUrls = updatedCategory.attachments
        .filter(att => att.type === 'image')
        .map(att => `${API}/public/add/merch/${att.source}`);

      return res.json({
        id: updatedCategory.id,
        name: updatedCategory.name,
        description: updatedCategory.description,
        child: updatedCategory.children.map(child => child.id),
        layer: updatedCategory.layer,
        isActive: updatedCategory.isActive,
        attachmentsCount: updatedCategory.attachments.length,
        hasChildren: updatedCategory.children.length > 0,
        attachments: updatedCategory.attachments.map(att => ({
          id: att.id,
          source: att.source,
          type: att.type
        })),
        imageUrls: imageUrls
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

    // Получаем категорию с attachments и детьми
    const category = await prisma.merch.findUnique({
      where: { id: categoryId },
      include: {
        attachments: true,
        children: {
          select: { id: true }
        }
      }
    });

    if (!category) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }

    // Рекурсивная функция для удаления всех дочерних элементов
    const deleteChildrenRecursively = async (parentId: string) => {
      const children = await prisma.merch.findMany({
        where: { parentId },
        include: {
          attachments: true,
          children: {
            select: { id: true }
          }
        }
      });

      for (const child of children) {
        // Рекурсивно удаляем детей этой категории
        if (child.layer === 1 && child.children && child.children.length > 0) {
          await deleteChildrenRecursively(child.id);
        }

        // Удаляем attachments дочернего элемента
        if (child.attachments && child.attachments.length > 0) {
          for (const attachment of child.attachments) {
            try {
              const filePath = path.join(process.cwd(), 'public', 'add', 'merch', attachment.source);
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`✅ [deleteMerchCategory] Удален файл дочернего элемента: ${attachment.source}`);
              }
            } catch (fileError) {
              console.error(`⚠️ Ошибка при удалении файла ${attachment.source}:`, fileError);
            }
          }
          await prisma.merchAttachment.deleteMany({
            where: { recordId: child.id }
          });
        }

        // Удаляем дочерний элемент
        await prisma.merch.delete({
          where: { id: child.id }
        });
        console.log(`✅ [deleteMerchCategory] Удален дочерний элемент: ${child.id} (${child.name}, layer: ${child.layer})`);
      }
    };

    // Удаляем все дочерние элементы рекурсивно
    if (category.children && category.children.length > 0) {
      console.log(`🗑️ [deleteMerchCategory] Удаляем ${category.children.length} дочерних элементов рекурсивно`);
      await deleteChildrenRecursively(categoryId);
    }

    console.log(`🗑️ [deleteMerchCategory] Удаляем категорию ${categoryId}, attachments: ${category.attachments?.length || 0}`);

    // Удаляем все attachments категории перед удалением самой категории
    if (category.attachments && category.attachments.length > 0) {
      console.log(`🗑️ [deleteMerchCategory] Удаляем ${category.attachments.length} attachments`);
      
      for (const attachment of category.attachments) {
        try {
          const filePath = path.join(process.cwd(), 'public', 'add', 'merch', attachment.source);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`✅ [deleteMerchCategory] Файл удален: ${attachment.source}`);
          } else {
            console.log(`⚠️ [deleteMerchCategory] Файл не найден: ${filePath}`);
          }
        } catch (fileError) {
          console.error(`⚠️ [deleteMerchCategory] Ошибка при удалении файла ${attachment.source}:`, fileError);
        }
      }
      
      // Удаляем attachments из базы данных
      const deletedCount = await prisma.merchAttachment.deleteMany({
        where: { recordId: categoryId }
      });
      
      console.log(`✅ [deleteMerchCategory] Удалено ${deletedCount.count} attachments из БД`);
    }

    // Изображения теперь хранятся в attachments, удаление происходит автоматически через каскад

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

      // Определяем следующий sortOrder для карточки в этой категории
      const lastCard = await prisma.merch.findFirst({
        where: {
          parentId: categoryId,
          layer: 0
        },
        orderBy: {
          sortOrder: 'desc'
        }
      });

      const nextSortOrder = lastCard ? lastCard.sortOrder + 1 : 0;

      // Создаем карточку с layer = 0
      const newCard = await prisma.merch.create({
        data: {
          name,
          description: description || '',
          parentId: categoryId, // Привязываем к категории
          layer: 0, // Карточка
          isActive: true,
          sortOrder: nextSortOrder
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

      // Получаем userId из токена (должен быть после authenticateToken middleware)
      const userId = (req as any).token?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'User ID не найден в токене' });
      }

      // Добавляем все файлы (изображения и PDF) как attachments
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        const files = req.files as Express.Multer.File[];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          // Определяем тип файла по mimetype
          const attachmentType = file.mimetype === 'application/pdf' ? 'pdf' : 'image';
          await prisma.merchAttachment.create({
            data: {
              source: file.filename, // Сохраняем название файла как оно сохранено на диске
              type: attachmentType,
              recordId: newCard.id,
              userAddId: userId,
              sortOrder: i
            }
          });
        }
      }

      // Формируем imageUrls из attachments
      const imageUrls = newCard.attachments
        .map(att => `${API}/public/add/merch/${att.source}`);

      res.status(201).json({
        id: newCard.id,
        name: newCard.name,
        description: newCard.description,
        layer: newCard.layer,
        isActive: newCard.isActive,
        attachmentsCount: newCard.attachments.length,
        hasChildren: newCard.children.length > 0,
        sortOrder: newCard.sortOrder,
        attachments: newCard.attachments.map(att => ({
          id: att.id,
          source: att.source,
          type: att.type
        })),
        imageUrls: imageUrls
      });
    } catch (error) {
      console.error('❌ Ошибка при создании карточки:', error);
      next(error);
    }
  }
];

// Обновить карточку (layer = 0)
export const updateMerchCard = [
  uploadMerch.single('image'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, description, isActive } = req.body;

      console.log(`🔍 [updateMerchCard] Обновляем карточку с ID: ${id}`);
      console.log(`📝 [updateMerchCard] Данные: name="${name}", description="${description}", isActive="${isActive}"`);

      const cardId = id;

      // Получаем текущую карточку
      const existingCard = await prisma.merch.findUnique({
        where: { id: cardId }
      });

      if (!existingCard) {
        console.log(`❌ [updateMerchCard] Карточка с ID ${cardId} не найдена`);
        return res.status(404).json({ error: 'Карточка не найдена' });
      }

      console.log(`✅ [updateMerchCard] Карточка найдена: ${existingCard.name} (layer: ${existingCard.layer})`);

      // Формируем данные для обновления
      const updateData: any = {};
      
      // Обновляем name только если он передан
      if (name !== undefined) {
        if (!name || name.trim() === '') {
          console.log(`❌ [updateMerchCard] Название карточки не может быть пустым`);
          return res.status(400).json({ error: 'Название карточки не может быть пустым' });
        }
        updateData.name = name;
      }
      
      // Обновляем description только если он передан
      if (description !== undefined) {
        updateData.description = description || '';
      }
      
      // Обновляем isActive только если он передан
      if (isActive !== undefined) {
        updateData.isActive = isActive === 'true' || isActive === true || isActive === '1';
      }

      // Если нет данных для обновления, возвращаем текущую карточку
      if (Object.keys(updateData).length === 0) {
        console.log(`⚠️ [updateMerchCard] Нет данных для обновления`);
        // Возвращаем текущую карточку
        const currentCard = await prisma.merch.findUnique({
          where: { id: cardId },
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
        
        if (!currentCard) {
          return res.status(404).json({ error: 'Карточка не найдена' });
        }
        
        const imageUrls = currentCard.attachments
          .filter(att => att.type === 'image')
          .map(att => `${API}/public/add/merch/${att.source}`);
        
        return res.json({
          id: currentCard.id,
          name: currentCard.name,
          description: currentCard.description,
          layer: currentCard.layer,
          isActive: currentCard.isActive,
          attachmentsCount: currentCard.attachments.length,
          hasChildren: false,
          sortOrder: currentCard.sortOrder,
          attachments: currentCard.attachments.map(att => ({
            id: att.id,
            source: att.source,
            type: att.type
          })),
          imageUrls: imageUrls
        });
      }

      // Обновляем карточку
      const updatedCard = await prisma.merch.update({
        where: { id: cardId },
        data: updateData,
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

      // Формируем imageUrls из attachments
      const imageUrls = updatedCard.attachments
        .filter(att => att.type === 'image')
        .map(att => `${API}/public/add/merch/${att.source}`);

      return res.json({
        id: updatedCard.id,
        name: updatedCard.name,
        description: updatedCard.description,
        layer: updatedCard.layer,
        isActive: updatedCard.isActive,
        attachmentsCount: updatedCard.attachments.length,
        hasChildren: updatedCard.children.length > 0,
        sortOrder: updatedCard.sortOrder,
        attachments: updatedCard.attachments.map(att => ({
          id: att.id,
          source: att.source,
          type: att.type
        })),
        imageUrls: imageUrls
      });
    } catch (error) {
      console.error('❌ Ошибка при обновлении карточки:', error);
      next(error);
    }
  }
];

// Добавить изображения к карточке
export const addCardImages = [
  uploadMerch.array('images', 10),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const cardId = id;

      console.log(`🔍 [addCardImages] Ищем карточку с ID: ${cardId}`);

      // Проверяем, что карточка существует
      const existingCard = await prisma.merch.findUnique({
        where: { id: cardId }
      });

      if (!existingCard) {
        console.log(`❌ [addCardImages] Карточка с ID ${cardId} не найдена`);
        return res.status(404).json({ error: 'Карточка не найдена' });
      }

      console.log(`✅ [addCardImages] Карточка найдена: ${existingCard.name} (layer: ${existingCard.layer})`);
      
      // Получаем userId из токена (должен быть после authenticateToken middleware)
      const userId = (req as any).token?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'User ID не найден в токене' });
      }
      console.log(`👤 [addCardImages] Используем userAddId: ${userId}`);

      // Получаем текущий максимальный sortOrder для attachments этой карточки
      const lastAttachment = await prisma.merchAttachment.findFirst({
        where: { recordId: cardId },
        orderBy: { sortOrder: 'desc' }
      });

      let nextSortOrder = lastAttachment ? lastAttachment.sortOrder + 1 : 0;

      // Добавляем новые изображения
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        const files = req.files as Express.Multer.File[];
        console.log(`📁 [addCardImages] Получено ${files.length} файлов для добавления`);
        
        for (const file of files) {
          console.log(`📄 [addCardImages] Добавляем файл: ${file.originalname} -> ${file.filename} с sortOrder: ${nextSortOrder}`);
          console.log(`📁 [addCardImages] Путь к файлу: ${file.path}`);
          
          try {
            await prisma.merchAttachment.create({
              data: {
                source: file.filename, // Сохраняем название файла как оно сохранено на диске
                type: 'image',
                recordId: cardId,
                userAddId: userId,
                sortOrder: nextSortOrder++
              }
            });
            console.log(`✅ [addCardImages] Файл ${file.originalname} успешно добавлен`);
          } catch (error) {
            console.error(`❌ [addCardImages] Ошибка при добавлении файла ${file.originalname}:`, error);
            throw error;
          }
        }
      } else {
        console.log(`⚠️ [addCardImages] Файлы не получены или пустой массив`);
      }

      // Получаем обновленную карточку с attachments
      const updatedCard = await prisma.merch.findUnique({
        where: { id: cardId },
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

      return res.json({
        id: updatedCard?.id,
        attachmentsCount: updatedCard?.attachments.length || 0,
        attachments: updatedCard?.attachments || []
      });
    } catch (error) {
      console.error('❌ Ошибка при добавлении изображений к карточке:', error);
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

      // Получаем userId из токена (должен быть после authenticateToken middleware)
      const userId = (req as any).token?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'User ID не найден в токене' });
      }

      const attachment = await prisma.merchAttachment.create({
        data: {
          recordId,
          source: req.file.originalname, // Сохраняем только название файла
          type: type || 'image',
          userAddId: userId,
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
      where: { id },
      include: {
        merch: {
          select: {
            id: true,
            name: true,
            layer: true
          }
        }
      }
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment не найден' });
    }

    // Удаляем файл
    const filePath = path.join(process.cwd(), 'public', 'add', 'merch', attachment.source);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.merchAttachment.delete({
      where: { id }
    });

    // Если это была категория (layer = 1), возвращаем обновленную категорию с imageUrl = null
    if (attachment.merch && attachment.merch.layer === 1) {
      const updatedCategory = await prisma.merch.findUnique({
        where: { id: attachment.merch.id },
        include: {
          children: {
            select: { id: true }
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

      if (updatedCategory) {
        const imageAttachment = updatedCategory.attachments.find(att => att.type === 'image');
        const imageUrl = imageAttachment ? `${API}/public/add/merch/${imageAttachment.source}` : null;

        return res.json({
          message: 'Attachment успешно удален',
          category: {
            id: updatedCategory.id,
            name: updatedCategory.name,
            description: updatedCategory.description,
            child: updatedCategory.children.map(child => child.id),
            layer: updatedCategory.layer,
            isActive: updatedCategory.isActive,
            attachmentsCount: updatedCategory.attachments.length,
            hasChildren: updatedCategory.children.length > 0,
            imageUrl: imageUrl
          }
        });
      }
    }

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

      // Изображения теперь хранятся в attachments, удаление происходит автоматически через каскад

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

// Удалить карточку (layer = 0)
export const deleteMerchCard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const cardId = id;

    console.log(`🔍 [deleteMerchCard] Удаляем карточку с ID: ${cardId}`);

    // Проверяем, что карточка существует
    const existingCard = await prisma.merch.findUnique({
      where: { id: cardId },
      include: {
        attachments: true
      }
    });

    if (!existingCard) {
      console.log(`❌ [deleteMerchCard] Карточка с ID ${cardId} не найдена`);
      return res.status(404).json({ error: 'Карточка не найдена' });
    }

    if (existingCard.layer !== 0) {
      console.log(`❌ [deleteMerchCard] Элемент с ID ${cardId} не является карточкой (layer: ${existingCard.layer})`);
      return res.status(400).json({ error: 'Указанный элемент не является карточкой' });
    }

    console.log(`✅ [deleteMerchCard] Карточка найдена: ${existingCard.name} (layer: ${existingCard.layer})`);

    // Удаляем файлы attachments (если есть)
    if (existingCard.attachments && existingCard.attachments.length > 0) {
      console.log(`🗑️ [deleteMerchCard] Удаляем ${existingCard.attachments.length} attachments`);
      
      for (const attachment of existingCard.attachments) {
        try {
          const filePath = path.join(process.cwd(), 'public', 'add', 'merch', attachment.source);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ [deleteMerchCard] Удален файл: ${attachment.source}`);
          }
        } catch (fileError) {
          console.error(`⚠️ [deleteMerchCard] Ошибка при удалении файла ${attachment.source}:`, fileError);
        }
      }

      // Удаляем attachments из базы данных
      await prisma.merchAttachment.deleteMany({
        where: { recordId: cardId }
      });
      console.log(`🗑️ [deleteMerchCard] Удалены attachments из базы данных`);
    }

    // Удаляем карточку
    await prisma.merch.delete({
      where: { id: cardId }
    });

    console.log(`✅ [deleteMerchCard] Карточка ${existingCard.name} успешно удалена`);

    return res.json({ 
      message: 'Карточка успешно удалена',
      deletedCard: {
        id: existingCard.id,
        name: existingCard.name
      }
    });

  } catch (error) {
    console.error('❌ Ошибка при удалении карточки:', error);
    next(error);
  }
};