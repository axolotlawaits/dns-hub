// controllers/app/news.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

const createNewsSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  userId: z.string().uuid(),
});

const updateNewsSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(2000).optional(),
});

// Получение всех новостей
export const getNews = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const news = await prisma.news.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(news);
  } catch (error) {
    next(error);
  }
};

// Получение одной новости
export const getNewsById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const newsItem = await prisma.news.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });

    if (!newsItem) {
      res.status(404).json({ error: 'News not found' });
      return;
    }

    res.status(200).json(newsItem);
  } catch (error) {
    next(error);
  }
};

// Создание новости
export const createNews = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validatedData = createNewsSchema.parse(req.body);
    const newNews = await prisma.news.create({
      data: validatedData,
      include: { user: true },
    });

    // Отправляем уведомления всем пользователям
    try {
      const { NotificationController } = await import('./notification.js');
      
      // Получаем всех пользователей
      const allUsers = await prisma.user.findMany({
        select: { id: true },
      });

      // Отправляем уведомление каждому пользователю
      const notificationPromises = allUsers.map(user => 
        NotificationController.create({
          type: 'INFO',
          channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
          title: 'Новая новость',
          message: newNews.name.length > 50 ? `${newNews.name.substring(0, 50)}...` : newNews.name,
          senderId: validatedData.userId,
          receiverId: user.id,
          priority: 'MEDIUM',
          action: {
            type: 'NAVIGATE',
            url: '/news',
          },
        }).catch(error => {
          console.error(`[News] Error sending notification to user ${user.id}:`, error);
          return null;
        })
      );

      // Ждем отправки всех уведомлений (не блокируем ответ)
      Promise.all(notificationPromises).catch(error => {
        console.error('[News] Error sending notifications:', error);
      });
    } catch (notifError) {
      console.error('[News] Error sending notifications:', notifError);
      // Не прерываем выполнение, если уведомления не отправились
    }

    res.status(201).json(newNews);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.issues });
      return;
    }
    next(error);
  }
};

// Обновление новости
export const updateNews = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validatedData = updateNewsSchema.parse(req.body);
    const updatedNews = await prisma.news.update({
      where: { id: req.params.id },
      data: validatedData,
      include: { user: true },
    });

    res.status(200).json(updatedNews);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.issues });
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ error: 'News not found' });
      return;
    }
    
    next(error);
  }
};

// Удаление новости
export const deleteNews = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await prisma.news.delete({
      where: { id: req.params.id },
    });

    res.status(204).end();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ error: 'News not found' });
      return;
    }
    
    next(error);
  }
};