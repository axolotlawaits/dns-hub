// controllers/docs/comments.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';

// Схема валидации для создания комментария
const createCommentSchema = z.object({
  content: z.string().min(1, 'Комментарий не может быть пустым'),
  parentId: z.string().uuid().nullable().optional(),
});

// Получить комментарии к статье
export const getArticleComments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      prisma.knowledgeComment.findMany({
        where: {
          articleId: id,
          parentId: null, // Только корневые комментарии
        },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          replies: {
            include: {
              user: {
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
        orderBy: { createdAt: 'asc' },
      }),
      prisma.knowledgeComment.count({
        where: {
          articleId: id,
          parentId: null,
        },
      }),
    ]);

    res.status(200).json({
      comments,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
};

// Создать комментарий
export const createComment = async (
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
    const validatedData = createCommentSchema.parse(req.body);

    // Проверяем существование статьи и получаем автора
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id },
      select: { id: true, authorId: true, title: true },
    });

    if (!article) {
      res.status(404).json({ error: 'Статья не найдена' });
      return;
    }

    // Если указан parentId, проверяем существование родительского комментария и получаем его автора
    let parentComment = null;
    if (validatedData.parentId) {
      parentComment = await prisma.knowledgeComment.findUnique({
        where: { id: validatedData.parentId },
        select: { id: true, articleId: true, userId: true },
      });

      if (!parentComment || parentComment.articleId !== id) {
        res.status(400).json({ error: 'Родительский комментарий не найден' });
        return;
      }
    }

    const comment = await prisma.knowledgeComment.create({
      data: {
        articleId: id,
        userId: token.userId,
        content: validatedData.content,
        parentId: validatedData.parentId || null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    // Отправляем уведомления
    try {
      const { NotificationController } = await import('../app/notification.js');
      
      // Находим инструмент Docs по link
      const docsTool = await prisma.tool.findFirst({
        where: {
          OR: [
            { link: '/docs' },
            { name: { contains: 'Docs', mode: 'insensitive' } },
            { name: { contains: 'База знаний', mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });

      const senderId = token.userId;
      const sender = await prisma.user.findUnique({
        where: { id: senderId },
        select: { name: true },
      });
      const senderName = sender?.name || 'Пользователь';

      // Определяем получателя уведомления
      let receiverId: string | null = null;
      let notificationTitle = '';
      let notificationMessage = '';

      if (validatedData.parentId && parentComment) {
        // Это ответ на комментарий - уведомляем автора родительского комментария
        // НЕ отправляем, если пользователь отвечает сам себе
        if (parentComment.userId !== senderId) {
          receiverId = parentComment.userId;
          notificationTitle = 'Ответ на ваш комментарий';
          const commentPreview = validatedData.content.length > 100 
            ? validatedData.content.substring(0, 100) + '...' 
            : validatedData.content;
          notificationMessage = `${senderName} ответил на ваш комментарий к статье "${article.title}":\n${commentPreview}`;
        }
      } else {
        // Это обычный комментарий - уведомляем автора статьи
        // НЕ отправляем, если пользователь комментирует свою статью
        if (article.authorId && article.authorId !== senderId) {
          receiverId = article.authorId;
          notificationTitle = 'Новый комментарий к статье';
          const commentPreview = validatedData.content.length > 100 
            ? validatedData.content.substring(0, 100) + '...' 
            : validatedData.content;
          notificationMessage = `${senderName} оставил комментарий к вашей статье "${article.title}":\n${commentPreview}`;
        }
      }

      // Отправляем уведомление, если получатель определен
      if (receiverId) {
        await NotificationController.create({
          type: 'INFO',
          channels: ['IN_APP'],
          title: notificationTitle,
          message: notificationMessage,
          senderId: senderId,
          receiverId: receiverId,
          toolId: docsTool?.id,
          priority: 'MEDIUM',
        });
      }
    } catch (notifError) {
      // Не прерываем выполнение, если уведомления не отправились
      console.error('[Docs Comments] Failed to send notification:', notifError);
    }

    res.status(201).json(comment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.issues });
      return;
    }
    next(error);
  }
};

// Обновить комментарий
export const updateComment = async (
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
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({ error: 'Комментарий не может быть пустым' });
      return;
    }

    // Проверяем существование комментария и права
    const comment = await prisma.knowledgeComment.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!comment) {
      res.status(404).json({ error: 'Комментарий не найден' });
      return;
    }

    // Только автор может редактировать
    const userRole = token.userRole || token.role;
    if (comment.userId !== token.userId && userRole !== 'ADMIN' && userRole !== 'DEVELOPER') {
      res.status(403).json({ error: 'Нет прав на редактирование' });
      return;
    }

    const updated = await prisma.knowledgeComment.update({
      where: { id },
      data: { content: content.trim() },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

// Удалить комментарий
export const deleteComment = async (
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

    // Проверяем существование комментария и права
    const comment = await prisma.knowledgeComment.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!comment) {
      res.status(404).json({ error: 'Комментарий не найден' });
      return;
    }

    // Только автор или админ может удалять
    const userRole = token.userRole || token.role;
    if (comment.userId !== token.userId && userRole !== 'ADMIN' && userRole !== 'DEVELOPER') {
      res.status(403).json({ error: 'Нет прав на удаление' });
      return;
    }

    await prisma.knowledgeComment.delete({
      where: { id },
    });

    res.status(200).json({ message: 'Комментарий удален' });
  } catch (error) {
    next(error);
  }
};

