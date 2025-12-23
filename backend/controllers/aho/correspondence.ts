import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

// Types
type MulterFiles = Express.Multer.File[] | undefined;

// Validation schemas
const AttachmentSchema = z.object({
  userAdd: z.string(),
  source: z.string(),
});

const CorrespondenceSchema = z.object({
  ReceiptDate: z.string().datetime(),
  userAdd: z.string().optional(),
  senderTypeId: z.string().uuid('Тип отправителя должен быть выбран'),
  senderSubTypeId: z.string().uuid().optional(),
  senderSubSubTypeId: z.string().uuid().optional(),
  senderName: z.string().min(1, 'Наименование отправителя обязательно'),
  documentTypeId: z.string().uuid('Тип документа должен быть выбран'),
  comments: z.string().optional(),
  responsibleId: z.string().uuid('Ответственный должен быть выбран'),
  // Старые поля для обратной совместимости
  from: z.string().optional(),
  to: z.string().optional(),
  content: z.string().optional(),
  typeMail: z.string().optional(),
  numberMail: z.string().optional(),
  attachments: z.array(AttachmentSchema).optional(),
});

// Helper functions
const logRequest = (req: Request) => {
  console.log('[Correspondence] Request Body:', req.body);
  console.log('[Correspondence] Request Files:', req.files);
};

const validateUserExists = async (userId: string) => {
  return prisma.user.findUnique({ where: { id: userId } });
};

const deleteFileSafely = async (filePath: string) => {
  try {
    await fs.unlink(filePath);
    console.log(`[Correspondence] File deleted successfully: ${filePath}`);
  } catch (error) {
    console.error(`[Correspondence] Error deleting file at ${filePath}:`, error);
  }
};

const handlePrismaError = (error: any, res: Response) => {
  if (error.code === 'P2025') {
    res.status(404).json({ error: 'Correspondence not found' });
    return true;
  }
  return false;
};

// Controller methods
export const getCorrespondences = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { search, senderType, documentType, responsibleId, startDate, endDate } = req.query;
    
    const where: any = {};
    
    // Поиск по тексту (в комментариях и наименовании отправителя)
    if (search && typeof search === 'string') {
      where.OR = [
        { comments: { contains: search, mode: 'insensitive' } },
        { senderName: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    // Фильтр по типу отправителя
    if (senderType && typeof senderType === 'string') {
      where.senderTypeId = senderType;
    }
    
    // Фильтр по типу документа
    if (documentType && typeof documentType === 'string') {
      where.documentTypeId = documentType;
    }
    
    // Фильтр по ответственному
    if (responsibleId && typeof responsibleId === 'string') {
      where.responsibleId = responsibleId;
    }
    
    // Фильтр по дате получения
    if (startDate || endDate) {
      where.ReceiptDate = {};
      if (startDate) {
        where.ReceiptDate.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.ReceiptDate.lte = new Date(endDate as string);
      }
    }
    
    const correspondences = await prisma.correspondence.findMany({
      where,
      include: { 
        attachments: true, 
        user: true,
        senderType: {
          select: {
            id: true,
            name: true,
            chapter: true
          }
        },
        senderSubType: {
          select: {
            id: true,
            name: true,
            chapter: true
          }
        },
        senderSubSubType: {
          select: {
            id: true,
            name: true,
            chapter: true
          }
        },
        documentType: {
          select: {
            id: true,
            name: true,
            chapter: true
          }
        },
        responsible: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { ReceiptDate: 'desc' },
    });
    res.status(200).json(correspondences);
  } catch (error) {
    next(error);
  }
};

export const getCorrespondenceById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const correspondence = await prisma.correspondence.findUnique({
      where: { id: req.params.id },
      include: { 
        attachments: true,
        senderType: {
          select: {
            id: true,
            name: true,
            chapter: true
          }
        },
        senderSubType: {
          select: {
            id: true,
            name: true,
            chapter: true
          }
        },
        senderSubSubType: {
          select: {
            id: true,
            name: true,
            chapter: true
          }
        },
        documentType: {
          select: {
            id: true,
            name: true,
            chapter: true
          }
        },
        responsible: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
    });

    if (!correspondence) {
      return res.status(404).json({ error: 'Correspondence not found' });
    }

    res.status(200).json(correspondence);
  } catch (error) {
    next(error);
  }
};

const processAttachments = async (
  files: MulterFiles,
  correspondenceId: string,
  userAdd: string
): Promise<any> => {
  if (!files || files.length === 0) return;

  const attachmentsData = files.map(file => ({
    userAdd,
    source: file.filename, // Сохраняем название файла как оно сохранено на диске
    record_id: correspondenceId,
  }));

  await prisma.correspondenceAttachment.createMany({ data: attachmentsData });
};

export const createCorrespondence = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    logRequest(req);
    const validatedData = CorrespondenceSchema.parse(req.body);
    const files = req.files as MulterFiles;

    const userAdd = validatedData.userAdd || 
                   validatedData.attachments?.[0]?.userAdd;

    if (!userAdd) {
      return res.status(400).json({ error: 'userAdd is required' });
    }

    const userExists = await validateUserExists(userAdd);
    if (!userExists) {
      return res.status(400).json({ error: 'User does not exist' });
    }

    // Проверяем существование ответственного
    const responsibleExists = await validateUserExists(validatedData.responsibleId);
    if (!responsibleExists) {
      return res.status(400).json({ error: 'Responsible user does not exist' });
    }

    const newCorrespondence = await prisma.correspondence.create({
      data: {
        ReceiptDate: new Date(validatedData.ReceiptDate),
        userAdd,
        senderTypeId: validatedData.senderTypeId,
        senderSubTypeId: validatedData.senderSubTypeId || null,
        senderSubSubTypeId: validatedData.senderSubSubTypeId || null,
        senderName: validatedData.senderName,
        documentTypeId: validatedData.documentTypeId,
        comments: validatedData.comments || null,
        responsibleId: validatedData.responsibleId,
        // Старые поля для обратной совместимости
        from: validatedData.from || '',
        to: validatedData.to || '',
        content: validatedData.content || '',
        typeMail: validatedData.typeMail || '',
        numberMail: validatedData.numberMail || '',
      },
    });

    await processAttachments(files, newCorrespondence.id, userAdd);

    const result = await prisma.correspondence.findUnique({
      where: { id: newCorrespondence.id },
      include: { 
        attachments: true,
        responsible: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
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

const deleteAttachments = async (attachmentIds: string[], correspondenceId: string) => {
  if (!attachmentIds.length) return;

  const attachments = await prisma.correspondenceAttachment.findMany({
    where: { 
      id: { in: attachmentIds },
      record_id: correspondenceId 
    }
  });

  await Promise.all(
    attachments.map(async (attachment) => {
      await deleteFileSafely(path.join(attachment.source));
      await prisma.correspondenceAttachment.delete({
        where: { id: attachment.id }
      });
    })
  );
};

export const updateCorrespondence = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { body, params, files } = req;
    const correspondenceId = params.id;

    // Parse attachments to delete
    let attachmentsToDelete: string[] = [];
    try {
      attachmentsToDelete = body.removedAttachments
        ? JSON.parse(body.removedAttachments)
        : [];
    } catch (e) {
      console.error('[Correspondence] Error parsing removedAttachments:', e);
    }

    // Delete specified attachments
    await deleteAttachments(attachmentsToDelete, correspondenceId);

    // Process new attachments
    await processAttachments(files as MulterFiles, correspondenceId, body.userAdd || 'unknown');

    // Валидация данных обновления
    const updateSchema = CorrespondenceSchema.partial();
    let validatedUpdateData: any = {};
    try {
      validatedUpdateData = updateSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.issues });
      }
    }
    
    // Проверяем ответственного, если он указан
    if (validatedUpdateData.responsibleId) {
      const responsibleExists = await validateUserExists(validatedUpdateData.responsibleId);
      if (!responsibleExists) {
        return res.status(400).json({ error: 'Responsible user does not exist' });
      }
    }

    // Update correspondence
    const updateData: any = {
      ReceiptDate: validatedUpdateData.ReceiptDate ? new Date(validatedUpdateData.ReceiptDate) : undefined,
      userAdd: validatedUpdateData.userAdd,
      senderTypeId: validatedUpdateData.senderTypeId,
      senderSubTypeId: validatedUpdateData.senderSubTypeId !== undefined ? validatedUpdateData.senderSubTypeId : undefined,
      senderSubSubTypeId: validatedUpdateData.senderSubSubTypeId !== undefined ? validatedUpdateData.senderSubSubTypeId : undefined,
      senderName: validatedUpdateData.senderName,
      documentTypeId: validatedUpdateData.documentTypeId,
      comments: validatedUpdateData.comments !== undefined ? validatedUpdateData.comments : undefined,
      responsibleId: validatedUpdateData.responsibleId,
      // Старые поля для обратной совместимости
      from: validatedUpdateData.from,
      to: validatedUpdateData.to,
      content: validatedUpdateData.content,
      typeMail: validatedUpdateData.typeMail,
      numberMail: validatedUpdateData.numberMail,
    };
    
    // Удаляем undefined значения
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const updatedCorrespondence = await prisma.correspondence.update({
      where: { id: correspondenceId },
      data: updateData,
      include: { 
        attachments: true,
        responsible: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
    });

    res.status(200).json(updatedCorrespondence);
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    next(error);
  }
};

// Получить Tool для корреспонденции (создать если не существует)
const getCorrespondenceTool = async () => {
  let tool = await prisma.tool.findFirst({
    where: { link: 'aho/correspondence' },
  });

  if (!tool) {
    // Создаем Tool для корреспонденции
    tool = await prisma.tool.create({
      data: {
        name: 'Корреспонденция',
        icon: '📮',
        link: 'aho/correspondence',
        description: 'Управление входящей и исходящей корреспонденцией',
        order: 100,
        included: true,
      },
    });
  }

  return tool;
};

// Получить типы отправителей
export const getSenderTypes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const tool = await getCorrespondenceTool();
    const types = await prisma.type.findMany({
      where: {
        model_uuid: tool.id,
        chapter: 'Отправитель',
        parent_type: null, // Только корневые типы
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        children: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            children: {
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            },
          },
        },
      },
    });
    res.status(200).json(types);
  } catch (error) {
    next(error);
  }
};

// Получить типы документов
export const getDocumentTypes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const tool = await getCorrespondenceTool();
    const types = await prisma.type.findMany({
      where: {
        model_uuid: tool.id,
        chapter: 'Тип документа',
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        colorHex: true,
        sortOrder: true,
      },
    });
    res.status(200).json(types);
  } catch (error) {
    next(error);
  }
};

export const deleteCorrespondence = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const correspondenceId = req.params.id;

    // Delete all attachments
    const attachments = await prisma.correspondenceAttachment.findMany({
      where: { record_id: correspondenceId },
    });

    await Promise.all(
      attachments.map(attachment => deleteFileSafely(attachment.source))
    );

    // Delete attachments and correspondence in a transaction
    await prisma.$transaction([
      prisma.correspondenceAttachment.deleteMany({
        where: { record_id: correspondenceId },
      }),
      prisma.correspondence.delete({
        where: { id: correspondenceId },
      }),
    ]);

    res.status(204).end();
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    next(error);
  }
};