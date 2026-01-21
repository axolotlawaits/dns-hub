// controllers/docs/favorites.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';

// Получить избранные статьи пользователя
export const getFavorites = async (
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

    const favorites = await prisma.knowledgeFavorite.findMany({
      where: { userId: token.userId },
      include: {
        article: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
            category: {
              select: {
                id: true,
                name: true,
                icon: true,
                color: true,
              },
            },
            _count: {
              select: {
                comments: true,
                attachments: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const articles = favorites.map(fav => fav.article);

    res.status(200).json(articles);
  } catch (error) {
    next(error);
  }
};

// Добавить в избранное
export const addToFavorites = async (
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

    const { id } = req.params;

    // Проверяем существование статьи
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!article) {
      res.status(404).json({ error: 'Статья не найдена' });
      return;
    }

    // Проверяем, не добавлена ли уже в избранное
    const existing = await prisma.knowledgeFavorite.findUnique({
      where: {
        articleId_userId: {
          articleId: id,
          userId: token.userId,
        },
      },
    });

    if (existing) {
      res.status(200).json({ message: 'Уже в избранном' });
      return;
    }

    await prisma.knowledgeFavorite.create({
      data: {
        articleId: id,
        userId: token.userId,
      },
    });

    res.status(201).json({ message: 'Добавлено в избранное' });
  } catch (error) {
    next(error);
  }
};

// Удалить из избранного
export const removeFromFavorites = async (
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

    const { id } = req.params;

    await prisma.knowledgeFavorite.deleteMany({
      where: {
        articleId: id,
        userId: token.userId,
      },
    });

    res.status(200).json({ message: 'Удалено из избранного' });
  } catch (error) {
    next(error);
  }
};


