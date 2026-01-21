// controllers/docs/articles.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';
import { authenticateToken } from '../../middleware/auth.js';

// Утилита для генерации slug из заголовка
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Удаляем спецсимволы
    .replace(/[\s_-]+/g, '-') // Заменяем пробелы и подчеркивания на дефисы
    .replace(/^-+|-+$/g, ''); // Удаляем дефисы в начале и конце
}

// Утилита для проверки уникальности slug
async function ensureUniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
  let slug = baseSlug;
  let counter = 1;
  
  while (true) {
    const existing = await prisma.knowledgeArticle.findUnique({
      where: { slug },
      select: { id: true }
    });
    
    if (!existing || existing.id === excludeId) {
      return slug;
    }
    
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

// Схема валидации для создания статьи
const createArticleSchema = z.object({
  title: z.string().min(1, 'Заголовок обязателен'),
  content: z.string().min(1, 'Содержимое обязательно'),
  excerpt: z.string().optional(),
  icon: z.string().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).default([]),
  isPublished: z.boolean().default(true),
});

// Схема валидации для обновления статьи
const updateArticleSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  excerpt: z.string().optional(),
  icon: z.string().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
  isPublished: z.boolean().optional(),
  changeNote: z.string().optional(),
});

// Получить список статей
export const getArticles = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = (req as any).token;
    const {
      categoryId,
      tag,
      search,
      authorId,
      isPublished,
      isPinned,
      limit = '50',
      offset = '0',
    } = req.query;

    const where: any = {};

    if (categoryId) {
      where.categoryId = categoryId as string;
    }

    if (tag) {
      where.tags = { has: tag as string };
    }

    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { content: { contains: search as string, mode: 'insensitive' } },
        { excerpt: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (authorId) {
      where.authorId = authorId as string;
    }

    // DEVELOPER видит все статьи, включая неопубликованные
    const userRole = token?.userRole || token?.role;
    if (userRole === 'DEVELOPER') {
      // DEVELOPER видит все статьи, фильтрация по isPublished применяется только если явно указана
      if (isPublished !== undefined) {
        where.isPublished = isPublished === 'true';
      }
    } else {
      // Обычные пользователи видят только опубликованные статьи
      if (isPublished !== undefined) {
        where.isPublished = isPublished === 'true';
      } else {
        where.isPublished = true;
      }
    }

    if (isPinned !== undefined) {
      where.isPinned = isPinned === 'true';
    }

    const articles = await prisma.knowledgeArticle.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
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
      orderBy: [
        { isPinned: 'desc' },
        { createdAt: 'desc' },
      ],
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    const total = await prisma.knowledgeArticle.count({ where });

    res.status(200).json({
      articles,
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    next(error);
  }
};

// Получить статью по ID
export const getArticleById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const article = await prisma.knowledgeArticle.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
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
        attachments: {
          orderBy: { createdAt: 'asc' },
        },
        comments: {
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
            },
          },
          where: { parentId: null },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: {
            favorites: true,
          },
        },
      },
    });

    if (!article) {
      res.status(404).json({ error: 'Статья не найдена' });
      return;
    }

    // Увеличиваем счетчик просмотров
    await prisma.knowledgeArticle.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    res.status(200).json(article);
  } catch (error) {
    next(error);
  }
};

// Получить статью по slug
export const getArticleBySlug = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = (req as any).token;
    const { slug } = req.params;

    // DEVELOPER может видеть все статьи, включая неопубликованные
    const userRole = token?.userRole || token?.role;
    const where: any = { slug };
    if (userRole !== 'DEVELOPER') {
      where.isPublished = true;
    }

    const article = await prisma.knowledgeArticle.findFirst({
      where,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
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
        attachments: {
          orderBy: { createdAt: 'asc' },
        },
        comments: {
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
            },
          },
          where: { parentId: null },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: {
            favorites: true,
          },
        },
      },
    });

    if (!article) {
      res.status(404).json({ error: 'Статья не найдена' });
      return;
    }

    // Увеличиваем счетчик просмотров
    await prisma.knowledgeArticle.update({
      where: { slug },
      data: { viewCount: { increment: 1 } },
    });

    res.status(200).json(article);
  } catch (error) {
    next(error);
  }
};

// Создать статью
export const createArticle = async (
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

    const validatedData = createArticleSchema.parse(req.body);
    const baseSlug = generateSlug(validatedData.title);
    const slug = await ensureUniqueSlug(baseSlug);

    const article = await prisma.knowledgeArticle.create({
      data: {
        ...validatedData,
        slug,
        authorId: token.userId,
        publishedAt: validatedData.isPublished ? new Date() : null,
      },
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
      },
    });

    res.status(201).json(article);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.issues });
      return;
    }
    next(error);
  }
};

// Обновить статью
export const updateArticle = async (
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
    const validatedData = updateArticleSchema.parse(req.body);

    // Проверяем существование статьи
    const existingArticle = await prisma.knowledgeArticle.findUnique({
      where: { id },
      select: { authorId: true, publishedAt: true },
    });

    if (!existingArticle) {
      res.status(404).json({ error: 'Статья не найдена' });
      return;
    }

    // Проверяем права (только автор или админ может редактировать)
    const userRole = token.userRole || token.role;
    if (existingArticle.authorId !== token.userId && userRole !== 'ADMIN' && userRole !== 'DEVELOPER') {
      res.status(403).json({ error: 'Нет прав на редактирование' });
      return;
    }

    // Получаем текущую версию
    const currentVersion = await prisma.knowledgeArticleVersion.findFirst({
      where: { articleId: id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const nextVersion = (currentVersion?.version || 0) + 1;

    // Создаем новую версию перед обновлением
    const currentArticle = await prisma.knowledgeArticle.findUnique({
      where: { id },
      select: { title: true, content: true, excerpt: true },
    });

    if (currentArticle) {
      await prisma.knowledgeArticleVersion.create({
        data: {
          articleId: id,
          version: nextVersion,
          title: currentArticle.title,
          content: currentArticle.content,
          excerpt: currentArticle.excerpt || null,
          createdById: token.userId,
          changeNote: validatedData.changeNote || null,
        },
      });
    }

    // Генерируем новый slug, если изменился заголовок
    let slug = undefined;
    if (validatedData.title) {
      const baseSlug = generateSlug(validatedData.title);
      slug = await ensureUniqueSlug(baseSlug, id);
    }

    // Удаляем changeNote из updateData, так как он используется только для версии
    const { changeNote, ...dataForUpdate } = validatedData;
    
    const updateData: any = {
      updatedBy: {
        connect: { id: token.userId }
      },
      updatedAt: new Date(),
    };

    // Добавляем только те поля, которые были переданы
    if (validatedData.title !== undefined) {
      updateData.title = validatedData.title;
    }
    if (validatedData.content !== undefined) {
      updateData.content = validatedData.content;
    }
    if (validatedData.excerpt !== undefined) {
      updateData.excerpt = validatedData.excerpt || null;
    }
    if (validatedData.icon !== undefined) {
      updateData.icon = validatedData.icon || null;
    }
    if (validatedData.tags !== undefined) {
      updateData.tags = validatedData.tags;
    }
    if (validatedData.isPublished !== undefined) {
      updateData.isPublished = validatedData.isPublished;
    }
    
    // Обрабатываем categoryId: если null или undefined, используем disconnect для удаления связи
    if ('categoryId' in validatedData) {
      if (validatedData.categoryId === null || validatedData.categoryId === undefined || validatedData.categoryId === '') {
        updateData.category = { disconnect: true };
      } else {
        updateData.category = { connect: { id: validatedData.categoryId } };
      }
    }

    if (slug) {
      updateData.slug = slug;
    }

    if (validatedData.isPublished !== undefined && validatedData.isPublished && !existingArticle.publishedAt) {
      updateData.publishedAt = new Date();
    }

    const article = await prisma.knowledgeArticle.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
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
      },
    });

    res.status(200).json(article);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.issues });
      return;
    }
    next(error);
  }
};

// Удалить статью
export const deleteArticle = async (
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

    const article = await prisma.knowledgeArticle.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!article) {
      res.status(404).json({ error: 'Статья не найдена' });
      return;
    }

    // Проверяем права (только автор или админ может удалять)
    const userRole = token.userRole || token.role;
    if (article.authorId !== token.userId && userRole !== 'ADMIN' && userRole !== 'DEVELOPER') {
      res.status(403).json({ error: 'Нет прав на удаление' });
      return;
    }

    await prisma.knowledgeArticle.delete({
      where: { id },
    });

    res.status(200).json({ message: 'Статья удалена' });
  } catch (error) {
    next(error);
  }
};

// Закрепить/открепить статью
export const togglePinArticle = async (
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

    // Только админы могут закреплять
    const userRole = token.userRole || token.role;
    if (userRole !== 'ADMIN' && userRole !== 'DEVELOPER') {
      res.status(403).json({ error: 'Нет прав на закрепление' });
      return;
    }

    const { id } = req.params;

    const article = await prisma.knowledgeArticle.findUnique({
      where: { id },
      select: { isPinned: true },
    });

    if (!article) {
      res.status(404).json({ error: 'Статья не найдена' });
      return;
    }

    const updated = await prisma.knowledgeArticle.update({
      where: { id },
      data: { isPinned: !article.isPinned },
    });

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

