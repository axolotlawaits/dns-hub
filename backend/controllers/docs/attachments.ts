import { Request, Response } from 'express';
import { prisma } from '../../server.js';
import { authenticateToken } from '../../middleware/auth.js';
import path from 'path';
import fs from 'fs';
import { decodeRussianFileName } from '../../utils/format.js';

// Загрузить файл к статье
export const uploadAttachment = async (req: Request, res: Response): Promise<any> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const { articleId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Файл не предоставлен' });
    }

    if (!articleId) {
      return res.status(400).json({ error: 'ID статьи обязателен' });
    }

    // Проверяем, существует ли статья
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id: articleId },
      select: { id: true, authorId: true },
    });

    if (!article) {
      return res.status(404).json({ error: 'Статья не найдена' });
    }

    // Проверяем права доступа (автор или ADMIN/DEVELOPER)
    const userRole = token.userRole || token.role;
    if (article.authorId !== token.userId && userRole !== 'ADMIN' && userRole !== 'DEVELOPER') {
      return res.status(403).json({ error: 'Нет прав на добавление файлов к этой статье' });
    }

    // Формируем URL файла (путь должен начинаться с /public для статического сервера)
    const fileUrl = `/public/docs/attachments/${file.filename}`;
    const filePath = path.join(process.cwd(), 'public', 'docs', 'attachments', file.filename);

    // Декодируем русские символы в оригинальном имени файла для сохранения в БД
    const decodedFileName = decodeRussianFileName(file.originalname);

    // Создаем запись о вложении в БД
    const attachment = await prisma.knowledgeAttachment.create({
      data: {
        articleId,
        fileName: decodedFileName, // Используем декодированное имя файла
        fileUrl,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedById: token.userId,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.status(201).json({
      id: attachment.id,
      fileName: attachment.fileName,
      fileUrl: attachment.fileUrl,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
      uploadedAt: attachment.createdAt,
    });
  } catch (error) {
    console.error('[Docs] Error uploading attachment:', error);
    res.status(500).json({ error: 'Ошибка при загрузке файла' });
  }
};

// Удалить файл
export const deleteAttachment = async (req: Request, res: Response): Promise<any> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const { id } = req.params;

    // Получаем информацию о вложении
    const attachment = await prisma.knowledgeAttachment.findUnique({
      where: { id },
      include: {
        article: {
          select: {
            id: true,
            authorId: true,
          },
        },
      },
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Вложение не найдено' });
    }

    // Проверяем права доступа
    const userRole = token.userRole || token.role;
    if (
      attachment.article.authorId !== token.userId &&
      attachment.uploadedById !== token.userId &&
      userRole !== 'ADMIN' &&
      userRole !== 'DEVELOPER'
    ) {
      return res.status(403).json({ error: 'Нет прав на удаление этого файла' });
    }

    // Удаляем файл с диска
    const filePath = path.join(process.cwd(), 'public', attachment.fileUrl.replace(/^\//, ''));
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (fileError) {
        console.error('[Docs] Error deleting file from disk:', fileError);
        // Продолжаем удаление записи из БД даже если файл не найден
      }
    }

    // Удаляем запись из БД
    await prisma.knowledgeAttachment.delete({
      where: { id },
    });

    res.status(200).json({ success: true, message: 'Файл удален' });
  } catch (error) {
    console.error('[Docs] Error deleting attachment:', error);
    res.status(500).json({ error: 'Ошибка при удалении файла' });
  }
};

// Получить список файлов статьи
export const getArticleAttachments = async (req: Request, res: Response): Promise<any> => {
  try {
    const { articleId } = req.params;

    const attachments = await prisma.knowledgeAttachment.findMany({
      where: { articleId },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.status(200).json(attachments);
  } catch (error) {
    console.error('[Docs] Error getting attachments:', error);
    res.status(500).json({ error: 'Ошибка при получении файлов' });
  }
};
