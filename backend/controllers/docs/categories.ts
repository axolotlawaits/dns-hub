// controllers/docs/categories.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';

// Схема валидации для создания категории
const createCategorySchema = z.object({
  name: z.string().min(1, 'Название обязательно'),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  parentId: z.string().uuid().nullable().optional(),
  order: z.number().int().default(0),
});

// Схема валидации для обновления категории
const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  parentId: z.string().uuid().nullable().optional(),
  order: z.number().int().optional(),
});

// Получить список категорий
export const getCategories = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = (req as any).token;
    const { includeArticles } = req.query;

    // DEVELOPER видит все статьи, включая неопубликованные
    const userRole = token?.userRole || token?.role;
    const articlesWhere: any = userRole === 'DEVELOPER' ? {} : { isPublished: true };

    const categories = await prisma.knowledgeCategory.findMany({
      where: { parentId: null }, // Только корневые категории
      include: {
        children: {
          orderBy: { order: 'asc' },
          include: includeArticles === 'true' ? {
            articles: {
              where: articlesWhere,
              select: {
                id: true,
                title: true,
                slug: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          } : undefined,
        },
        _count: {
          select: {
            articles: true,
          },
        },
      },
      orderBy: { order: 'asc' },
    });

    res.status(200).json(categories);
  } catch (error) {
    next(error);
  }
};

// Получить категорию по ID
export const getCategoryById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = (req as any).token;
    const { id } = req.params;

    const category = await prisma.knowledgeCategory.findUnique({
      where: { id },
      include: {
        parent: true,
        children: {
          orderBy: { order: 'asc' },
        },
        articles: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
          orderBy: [
            { isPinned: 'desc' },
            { createdAt: 'desc' },
          ],
          // DEVELOPER видит все статьи, включая неопубликованные
          ...((token?.userRole || token?.role) !== 'DEVELOPER' ? { where: { isPublished: true } } : {}),
        },
        _count: {
          select: {
            articles: true,
            children: true,
          },
        },
      },
    });

    if (!category) {
      res.status(404).json({ error: 'Категория не найдена' });
      return;
    }

    res.status(200).json(category);
  } catch (error) {
    next(error);
  }
};

// Создать категорию
export const createCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Не авторизован' });
      return;
    }

    // Получаем роль пользователя из токена (userRole) или из базы данных
    let userRole = token.userRole || token.role;
    if (!userRole) {
      const user = await prisma.user.findUnique({
        where: { id: token.userId },
        select: { role: true }
      });
      userRole = user?.role;
    }

    // Только админы и разработчики могут создавать категории
    if (userRole !== 'ADMIN' && userRole !== 'DEVELOPER') {
      res.status(403).json({ error: 'Нет прав на создание категорий' });
      return;
    }

    const validatedData = createCategorySchema.parse(req.body);

    // Проверяем существование родительской категории, если указана
    if (validatedData.parentId) {
      const parent = await prisma.knowledgeCategory.findUnique({
        where: { id: validatedData.parentId },
      });

      if (!parent) {
        res.status(400).json({ error: 'Родительская категория не найдена' });
        return;
      }
    }

    const category = await prisma.knowledgeCategory.create({
      data: validatedData,
      include: {
        parent: true,
        children: true,
      },
    });

    res.status(201).json(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.issues });
      return;
    }
    next(error);
  }
};

// Обновить категорию
export const updateCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Не авторизован' });
      return;
    }

    // Получаем роль пользователя из токена (userRole) или из базы данных
    let userRole = token.userRole || token.role;
    if (!userRole) {
      const user = await prisma.user.findUnique({
        where: { id: token.userId },
        select: { role: true }
      });
      userRole = user?.role;
    }

    // Только админы и разработчики могут обновлять категории
    if (userRole !== 'ADMIN' && userRole !== 'DEVELOPER') {
      res.status(403).json({ error: 'Нет прав на обновление категорий' });
      return;
    }

    const { id } = req.params;
    const validatedData = updateCategorySchema.parse(req.body);

    // Проверяем существование категории
    const existing = await prisma.knowledgeCategory.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({ error: 'Категория не найдена' });
      return;
    }

    // Проверяем, что категория не становится родителем самой себя
    if (validatedData.parentId === id) {
      res.status(400).json({ error: 'Категория не может быть родителем самой себя' });
      return;
    }

    // Проверяем существование родительской категории, если указана
    if (validatedData.parentId) {
      const parent = await prisma.knowledgeCategory.findUnique({
        where: { id: validatedData.parentId },
      });

      if (!parent) {
        res.status(400).json({ error: 'Родительская категория не найдена' });
        return;
      }
    }

    const category = await prisma.knowledgeCategory.update({
      where: { id },
      data: validatedData,
      include: {
        parent: true,
        children: true,
      },
    });

    res.status(200).json(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.issues });
      return;
    }
    next(error);
  }
};

// Удалить категорию
export const deleteCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Не авторизован' });
      return;
    }

    // Получаем роль пользователя из токена (userRole) или из базы данных
    let userRole = token.userRole || token.role;
    if (!userRole) {
      const user = await prisma.user.findUnique({
        where: { id: token.userId },
        select: { role: true }
      });
      userRole = user?.role;
    }

    // Только админы и разработчики могут удалять категории
    if (userRole !== 'ADMIN' && userRole !== 'DEVELOPER') {
      res.status(403).json({ error: 'Нет прав на удаление категорий' });
      return;
    }

    const { id } = req.params;

    // Проверяем наличие дочерних категорий
    const children = await prisma.knowledgeCategory.findMany({
      where: { parentId: id },
    });

    if (children.length > 0) {
      res.status(400).json({ 
        error: 'Нельзя удалить категорию с дочерними категориями. Сначала удалите или переместите дочерние категории.' 
      });
      return;
    }

    // Проверяем наличие статей в категории
    const articlesCount = await prisma.knowledgeArticle.count({
      where: { categoryId: id },
    });

    if (articlesCount > 0) {
      res.status(400).json({ 
        error: 'Нельзя удалить категорию со статьями. Сначала переместите или удалите статьи.' 
      });
      return;
    }

    await prisma.knowledgeCategory.delete({
      where: { id },
    });

    res.status(200).json({ message: 'Категория удалена' });
  } catch (error) {
    next(error);
  }
};

