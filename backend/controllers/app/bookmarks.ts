import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';

// Получение закладок пользователя с дополнительными полями
export const getUserBookmarks = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.params.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const Bookmarks = await prisma.bookmarks.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        url: true,
        order: true
      },
      orderBy: {
        order: 'asc'
      },
    });

    // Добавляем поле secure для фронтенда
    const BookmarksWithSecurity = Bookmarks.map(Bookmarks => ({
      ...Bookmarks,
      secure: Bookmarks.url.startsWith('https://')
    }));

    res.status(200).json(BookmarksWithSecurity);
  } catch (error) {
    next(error);
  }
};

// Создание закладки с автоматическим порядком
export const createBookmark = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, url, userId } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Нормализация URL
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;

    // Проверка существования закладки
    const existingBookmarks = await prisma.bookmarks.findFirst({
      where: {
        url: normalizedUrl,
        userId,
      },
    });

    if (existingBookmarks) {
      res.status(400).json({ message: 'Bookmarks already exists' });
      return;
    }

    // Получение максимального порядка
    const lastBookmarks = await prisma.bookmarks.findFirst({
      where: { userId },
      orderBy: { order: 'desc' },
    });

    const newOrder = lastBookmarks ? lastBookmarks.order + 1 : 0;

    // Создание закладки
    const newBookmarks = await prisma.bookmarks.create({
      data: {
        name,
        url: normalizedUrl,
        userId,
        order: newOrder
      },
    });

    res.status(201).json({
      ...newBookmarks,
      secure: normalizedUrl.startsWith('https://')
    });
  } catch (error) {
    next(error);
  }
};

// Удаление закладки
export const deleteBookmark = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const Bookmarks = await prisma.bookmarks.findUnique({
      where: { id },
    });

    if (!Bookmarks) {
      res.status(404).json({ message: 'Bookmarks not found' });
      return;
    }

    await prisma.bookmarks.delete({
      where: { id },
    });

    // Перенумеровываем оставшиеся закладки
    const remainingBookmarkss = await prisma.bookmarks.findMany({
      where: { userId: Bookmarks.userId },
      orderBy: { order: 'asc' },
    });

    await prisma.$transaction(
      remainingBookmarkss.map((Bookmarks, index) =>
        prisma.bookmarks.update({
          where: { id: Bookmarks.id },
          data: { order: index }
        })
    ));

    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

// Обновление закладки
export const updateBookmark = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, url } = req.body;

    const Bookmarks = await prisma.bookmarks.findUnique({
      where: { id },
    });

    if (!Bookmarks) {
      res.status(404).json({ message: 'Bookmarks not found' });
      return;
    }

    // Нормализация URL
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;

    // Проверка уникальности URL
    if (normalizedUrl !== Bookmarks.url) {
      const existingBookmarks = await prisma.bookmarks.findFirst({
        where: {
          url: normalizedUrl,
          userId: Bookmarks.userId,
          NOT: { id }
        },
      });

      if (existingBookmarks) {
        res.status(400).json({ message: 'Bookmarks with this URL already exists' });
        return;
      }
    }

    const updatedBookmarks = await prisma.bookmarks.update({
      where: { id },
      data: {
        name,
        url: normalizedUrl,
      },
    });

    res.status(200).json({
      ...updatedBookmarks,
      secure: normalizedUrl.startsWith('https://')
    });
  } catch (error) {
    next(error);
  }
};

// Ручная сортировка с подтверждением
export const reorderBookmarks = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { bookmarks: newOrder, userId } = req.body;

    // Validate input
    if (!newOrder || !Array.isArray(newOrder) || !userId) {
      res.status(400).json({ message: 'Invalid request data' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Get all user's bookmarks
    const userBookmarks = await prisma.bookmarks.findMany({
      where: { userId },
      select: { id: true }
    });

    const userBookmarkIds = userBookmarks.map(b => b.id);
    
    // Validate all bookmarks belong to user
    const isValid = newOrder.every((b: {id: string}) => 
      userBookmarkIds.includes(b.id)
    );

    if (!isValid || newOrder.length !== userBookmarkIds.length) {
      res.status(400).json({ message: 'Invalid bookmarks data' });
      return;
    }

    // Update order in transaction
    await prisma.$transaction(
      newOrder.map((bookmark: {id: string, order: number}, index: number) => 
        prisma.bookmarks.update({
          where: { id: bookmark.id },
          data: { order: index }
        })
      )
    );

    res.status(200).json({ success: true, message: 'Bookmarks reordered successfully' });
  } catch (error) {
    console.error('Reorder error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};