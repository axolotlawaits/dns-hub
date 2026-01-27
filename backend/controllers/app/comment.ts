import { Request, Response } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';

// Схемы валидации
const createCommentSchema = z.object({
  entityType: z.string().min(1), // SHOP, POST, etc.
  entityId: z.string().uuid(),
  message: z.string().min(1),
  parentId: z.string().uuid().optional().nullable(),
});

const getCommentsSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
});

// Создать комментарий
export const createComment = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const data = createCommentSchema.parse(req.body);
    
    const comment = await (prisma as any).comment.create({
      data: {
        entityType: data.entityType,
        entityId: data.entityId,
        senderId: token.userId,
        message: data.message,
        parentId: data.parentId || null,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        parent: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        replies: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // Отправляем уведомление владельцу сущности (если это не он сам)
    try {
      // Получаем владельца сущности в зависимости от типа
      let ownerId: string | null = null;
      
      if (data.entityType === 'SHOP') {
        const shop = await prisma.shop.findUnique({
          where: { id: data.entityId },
          select: { userId: true },
        });
        ownerId = shop?.userId || null;
      } else if (data.entityType === 'TRAINING_MANAGER') {
        const manager = await prisma.manager.findUnique({
          where: { id: data.entityId },
          select: { userId: true },
        });
        ownerId = manager?.userId || null;
      } else if (data.entityType === 'TRAINING_PROGRAM') {
        // Для программ обучения владелец - это создатель программы или администратор
        // Можно добавить поле creatorId в TrainingProgram если нужно
        ownerId = null; // Пока нет владельца программы
      }

      if (ownerId && ownerId !== token.userId) {
        const { NotificationController } = await import('./notification.js');
        await NotificationController.create({
          type: 'INFO',
          channels: ['IN_APP', 'TELEGRAM'],
          title: 'Новый комментарий',
          message: `${comment.sender.name} оставил комментарий`,
          senderId: token.userId,
          receiverId: ownerId,
          priority: 'MEDIUM',
          action: {
            type: 'NAVIGATE',
            url: data.entityType === 'TRAINING_MANAGER' || data.entityType === 'TRAINING_PROGRAM'
              ? `/training`
              : `/${data.entityType.toLowerCase()}/${data.entityId}`,
          },
        });
      }
    } catch (notifError) {
      console.error('[Comment] Error sending notification:', notifError);
      // Не прерываем выполнение, если уведомление не отправилось
    }

    res.status(201).json(comment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    console.error('[Comment] Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
};

// Получить комментарии
export const getComments = async (req: Request, res: Response) => {
  try {
    const { entityType, entityId, page = '1', limit = '20' } = req.query;
    
    const data = getCommentsSchema.parse({ entityType, entityId, page, limit });
    
    const pageNum = parseInt(data.page);
    const limitNum = parseInt(data.limit);
    const skip = (pageNum - 1) * limitNum;

    const [comments, total] = await Promise.all([
      (prisma as any).comment.findMany({
        where: {
          entityType: data.entityType,
          entityId: data.entityId,
          parentId: null, // Только корневые комментарии
        },
        skip,
        take: limitNum,
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          replies: {
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      (prisma as any).comment.count({
        where: {
          entityType: data.entityType,
          entityId: data.entityId,
          parentId: null,
        },
      }),
    ]);

    res.json({
      comments,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    console.error('[Comment] Error getting comments:', error);
    res.status(500).json({ error: 'Failed to get comments' });
  }
};

// Обновить комментарий
export const updateComment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Проверяем, что пользователь - автор комментария
    const comment = await (prisma as any).comment.findUnique({
      where: { id },
      select: { senderId: true },
    });

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comment.senderId !== token.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await (prisma as any).comment.update({
      where: { id },
      data: { message: message.trim() },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('[Comment] Error updating comment:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
};

// Удалить комментарий
export const deleteComment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Проверяем, что пользователь - автор комментария или админ
    const comment = await (prisma as any).comment.findUnique({
      where: { id },
      select: { senderId: true },
    });

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { role: true },
    });

    if (comment.senderId !== token.userId && user?.role !== 'ADMIN' && user?.role !== 'DEVELOPER') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await (prisma as any).comment.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Comment] Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
};

// Отметить комментарии как прочитанные
export const markCommentsAsRead = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { entityType, entityId } = req.body;
    if (!entityType || !entityId) {
      return res.status(400).json({ error: 'entityType and entityId are required' });
    }

    // Получаем владельца сущности
    let ownerId: string | null = null;
    
    if (entityType === 'SHOP') {
      const shop = await prisma.shop.findUnique({
        where: { id: entityId },
        select: { userId: true },
      });
      ownerId = shop?.userId || null;
    } else if (entityType === 'TRAINING_MANAGER') {
      const manager = await prisma.manager.findUnique({
        where: { id: entityId },
        select: { userId: true },
      });
      ownerId = manager?.userId || null;
    } else if (entityType === 'TRAINING_PROGRAM') {
      ownerId = null; // Пока нет владельца программы
    }

    if (!ownerId || ownerId !== token.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await (prisma as any).comment.updateMany({
      where: {
        entityType,
        entityId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Comment] Error marking comments as read:', error);
    res.status(500).json({ error: 'Failed to mark comments as read' });
  }
};

