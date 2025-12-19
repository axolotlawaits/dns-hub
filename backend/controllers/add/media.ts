import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { Prisma } from '@prisma/client';

// Types
type MulterFiles = Express.Multer.File[] | undefined;

// Validation schemas
const MediaAttachmentSchema = z.object({
  userAdd: z.string(),
  source: z.string(),
  type: z.string(),
});

const MediaSchema = z.object({
  userAdd: z.string(),
  userUpdated: z.string().optional(),
  name: z.string().optional(),
  information: z.string().optional(),
  urlMedia2: z.string().optional(),
  typeContent: z.string().optional(),
  attachments: z.array(MediaAttachmentSchema).optional(),
});

// Helper functions remain similar but adjusted for media
const logRequest = (req: Request) => {
  console.log('[Media] Request Body:', req.body);
  console.log('[Media] Request Files:', req.files);
};

const validateUserExists = async (userId: string) => {
  return prisma.user.findUnique({ where: { id: userId } });
};

const deleteFileSafely = async (filePath: string) => {
  try {
    await fs.unlink(filePath);
    console.log(`[Media] File deleted successfully: ${filePath}`);
  } catch (error) {
    console.error(`[Media] Error deleting file at ${filePath}:`, error);
  }
};

const processMediaAttachments = async (
  files: MulterFiles,
  mediaId: string,
  userAddId: string
) => {
  if (!files || files.length === 0) return;

  // Сначала проверяем, существует ли медиа запись
  const mediaExists = await prisma.media.findUnique({
    where: { id: mediaId }
  });

  if (!mediaExists) {
    throw new Error(`Media record with id ${mediaId} not found`);
  }

  // Проверяем существование пользователя
  const userExists = await prisma.user.findUnique({
    where: { id: userAddId }
  });

  if (!userExists) {
    throw new Error(`User with id ${userAddId} not found`);
  }

  // Создаем вложения в транзакции
  await prisma.$transaction(async (tx) => {
    for (const file of files) {
      await tx.mediaAttachment.create({
        data: {
          userAddId,
          source: file.filename, // Сохраняем название файла как оно сохранено на диске
          type: file.mimetype,
          recordId: mediaId,
        }
      });
    }
  });
};

const deleteMediaAttachments = async (attachmentIds: string[], mediaId: string) => {
  if (!attachmentIds.length) return;

  const attachments = await prisma.mediaAttachment.findMany({
    where: { 
      id: { in: attachmentIds },
      recordId: mediaId 
    }
  });

  await Promise.all(
    attachments.map(async (attachment) => {
      await deleteFileSafely(path.join(attachment.source));
      await prisma.mediaAttachment.delete({
        where: { id: attachment.id }
      });
    })
  );
};

// Controller methods
export const getAllMedia = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const media = await prisma.media.findMany({
      include: {
        MediaAttachment: true,
        typeContent: true,
        userAdd: true,
        userUpdated: true
      },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(media);
    
  } catch (error) {
    next(error);
  }
};

export const getMediaById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<any> => {
    try {
      const media = await prisma.media.findUnique({
        where: { id: req.params.id },
        include: {
          MediaAttachment: true,
          typeContent: true,
          userAdd: true,
          userUpdated: true  
        },
      });
      
      if (!media) {
        return res.status(404).json({ error: 'Media not found' });
      }
      
      res.status(200).json(media);
    } catch (error) {
      next(error);
    }
  };

export const createMedia = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    logRequest(req);
    const validatedData = MediaSchema.parse(req.body);
    const files = req.files as MulterFiles;

    // Validate required user
    const userExists = await validateUserExists(validatedData.userAdd);
    if (!userExists) {
      return res.status(400).json({ error: 'User does not exist' });
    }

    // Validate type if provided
    if (validatedData.typeContent) {
      const typeExists = await prisma.type.findUnique({
        where: { id: validatedData.typeContent }
      });
      if (!typeExists) {
        return res.status(400).json({ error: 'Type does not exist' });
      }
    }

    const newMedia = await prisma.media.create({
      data: {
        name: validatedData.name,
        information: validatedData.information,
        urlMedia2: validatedData.urlMedia2,
        typeContentId: validatedData.typeContent,
        userAddId: validatedData.userAdd,
      },
    });

    await processMediaAttachments(files, newMedia.id, validatedData.userAdd);

    const result = await prisma.media.findUnique({
      where: { id: newMedia.id },
      include: {
        MediaAttachment: true,
        typeContent: true
      },
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.issues });
    }
    next(error);
  }
};

export const updateMedia = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { body, params, files } = req;
    const mediaId = params.id;

    // Сначала проверяем существование медиа записи
    const mediaExists = await prisma.media.findUnique({
      where: { id: mediaId }
    });

    if (!mediaExists) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Parse attachments to delete
    let attachmentsToDelete: string[] = [];
    try {
      attachmentsToDelete = body.removedAttachments
        ? JSON.parse(body.removedAttachments)
        : [];
    } catch (e) {
      console.error('[Media] Error parsing removedAttachments:', e);
    }

    // Delete specified attachments
    await deleteMediaAttachments(attachmentsToDelete, mediaId);

    // Process new attachments
    if (files && Array.isArray(files)) {
      await processMediaAttachments(
        files,
        mediaId,
        body.userUpdated || body.userAdd || mediaExists.userAddId
      );
    }

    // Update media main data
    const updateData: Prisma.MediaUpdateInput = {
      name: body.name,
      information: body.information,
      urlMedia2: body.urlMedia2,
      updatedAt: new Date(),
    };

    if (body.typeContent) {
      const typeExists = await prisma.type.findUnique({
        where: { id: body.typeContent }
      });
      if (!typeExists) {
        return res.status(400).json({ error: 'Type does not exist' });
      }
      updateData.typeContent = { connect: { id: body.typeContent } };
    }

    if (body.userUpdated) {
      const userExists = await prisma.user.findUnique({
        where: { id: body.userUpdated }
      });
      if (!userExists) {
        return res.status(400).json({ error: 'Updating user does not exist' });
      }
      updateData.userUpdated = { connect: { id: body.userUpdated } };
    }

    const updatedMedia = await prisma.media.update({
      where: { id: mediaId },
      data: updateData,
      include: {
        MediaAttachment: true,
        typeContent: true,
        userAdd: true,
        userUpdated: true
      },
    });

    res.status(200).json(updatedMedia);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Record not found' });
      }
      return res.status(400).json({ 
        error: 'Database error',
        details: error.meta 
      });
    }
    next(error);
  }
};

export const deleteMedia = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const mediaId = req.params.id;

    // Get all related attachments
    const attachments = await prisma.mediaAttachment.findMany({
      where: { recordId: mediaId },
    });

    // Delete all files
    await Promise.all(
      attachments.map(attachment => deleteFileSafely(attachment.source))
    );

    // Delete records in transaction
    await prisma.$transaction([
      prisma.mediaAttachment.deleteMany({
        where: { recordId: mediaId },
      }),
      prisma.media.delete({
        where: { id: mediaId },
      }),
    ]);

    res.status(204).end();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Media not found' });
    }
    next(error);
  }
};