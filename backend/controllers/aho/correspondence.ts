import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { NotificationController } from '../app/notification.js';
import { trackParcel, getLastStatus } from '../../services/pochta-tracking.js';
import {
  getHierarchyItems,
  buildTree,
  HierarchyConfig
} from '../../utils/hierarchy.js';
import { getToolByLinkOrThrow } from '../../utils/toolUtils.js';

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
  trackNumber: z.string().optional(),
  comments: z.string().optional(),
  responsibleId: z.string().uuid('Ответственный должен быть выбран'),
  attachments: z.array(AttachmentSchema).optional(),
});

// Helper functions

const validateUserExists = async (userId: string) => {
  return prisma.user.findUnique({ where: { id: userId } });
};

const deleteFileSafely = async (filePath: string) => {
  try {
    await fs.unlink(filePath);
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

// Helper function to generate auto-increment document number
// Removed generateDocumentNumber function

// Controller methods
export const getCorrespondences = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { search, senderType, documentType, responsibleId, startDate, endDate } = req.query;
    
    const where: any = {};
    
    // Поиск по тексту (в комментариях, наименовании отправителя, номере документа и трек-номере)
    if (search && typeof search === 'string') {
      where.OR = [
        { comments: { contains: search, mode: 'insensitive' } },
        { senderName: { contains: search, mode: 'insensitive' } },
        { documentNumber: { contains: search, mode: 'insensitive' } },
        { trackNumber: { contains: search, mode: 'insensitive' } },
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

    // Generate auto-increment document number - now handled by database default
    const newCorrespondence = await prisma.correspondence.create({
      data: {
        ReceiptDate: new Date(validatedData.ReceiptDate),
        userAdd,
        senderTypeId: validatedData.senderTypeId,
        senderSubTypeId: validatedData.senderSubTypeId || null,
        senderSubSubTypeId: validatedData.senderSubSubTypeId || null,
        senderName: validatedData.senderName,
        documentTypeId: validatedData.documentTypeId,
        // documentNumber will be auto-generated by database default
        trackNumber: validatedData.trackNumber || null,
        comments: validatedData.comments || null,
        responsibleId: validatedData.responsibleId,
      },
    });

    await processAttachments(files, newCorrespondence.id, userAdd);

    const result = await prisma.correspondence.findUnique({
      where: { id: newCorrespondence.id },
      include: { 
        attachments: true,
        user: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
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
            email: true,
            image: true
          }
        }
      },
    });

    // Отправляем уведомление ответственному
    if (result && result.responsibleId && result.responsibleId !== userAdd) {
      await notifyResponsible(result, 'create', userAdd);
    }

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
      const fullPath = path.join(process.cwd(), 'public', 'aho', 'correspondence', attachment.source);
      await deleteFileSafely(fullPath);
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
      trackNumber: validatedUpdateData.trackNumber !== undefined ? validatedUpdateData.trackNumber : undefined,
      comments: validatedUpdateData.comments !== undefined ? validatedUpdateData.comments : undefined,
      responsibleId: validatedUpdateData.responsibleId,
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
        user: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
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
            email: true,
            image: true
          }
        }
      },
    });

    // Отправляем уведомление ответственному (если он изменился или это обновление)
    const senderId = validatedUpdateData.userAdd || body.userAdd;
    if (updatedCorrespondence && updatedCorrespondence.responsibleId && senderId) {
      // Отправляем уведомление только если ответственный отличается от автора изменений
      if (updatedCorrespondence.responsibleId !== senderId) {
        await notifyResponsible(updatedCorrespondence, 'update', senderId);
      }
    }

    res.status(200).json(updatedCorrespondence);
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    next(error);
  }
};

const correspondenceTypeConfig: HierarchyConfig = {
  modelName: 'type',
  parentField: 'parent_type',
  sortField: 'sortOrder',
  nameField: 'name',
  childrenRelation: 'children'
};

// Получить Tool для корреспонденции
const getCorrespondenceTool = async () => {
  return await getToolByLinkOrThrow('aho/correspondence', 'Tool для корреспонденции не найден в базе данных');
};

// Функция для отправки уведомления ответственному
const notifyResponsible = async (
  correspondence: any,
  mode: 'create' | 'update',
  senderId: string
) => {
  try {
    // Получаем tool для корреспонденции
    const tool = await getCorrespondenceTool();
    
    // Формируем сообщение в зависимости от режима
    const title = mode === 'create' 
      ? 'Новая корреспонденция назначена вам'
      : 'Корреспонденция обновлена';
    
    // Формируем текст сообщения
    const senderTypeLabel = correspondence.senderType?.name || 'Не указан';
    const documentTypeLabel = correspondence.documentType?.name || 'Не указан';
    const senderName = correspondence.senderName || 'Не указано';
    
    const message = mode === 'create'
      ? `Вам назначена новая корреспонденция:\n\n` +
        `Отправитель: ${senderTypeLabel}${senderName ? ` - ${senderName}` : ''}\n` +
        `Тип документа: ${documentTypeLabel}\n` +
        `Дата получения: ${new Date(correspondence.ReceiptDate).toLocaleDateString('ru-RU')}\n` +
        (correspondence.comments ? `Комментарии: ${correspondence.comments}` : '')
      : `Корреспонденция была обновлена:\n\n` +
        `Отправитель: ${senderTypeLabel}${senderName ? ` - ${senderName}` : ''}\n` +
        `Тип документа: ${documentTypeLabel}\n` +
        `Дата получения: ${new Date(correspondence.ReceiptDate).toLocaleDateString('ru-RU')}`;
    
    // Отправляем уведомление ответственному
    // Проверяем настройки email уведомлений
    const emailSettings = await prisma.userSettings.findUnique({
      where: {
        userId_parameter: {
          userId: correspondence.responsibleId,
          parameter: 'notifications.email',
        },
      },
    });

    const wantsEmail = emailSettings ? emailSettings.value === 'true' : true; // По умолчанию включено

    // Получаем информацию о получателе для проверки telegramChatId и email
    const responsibleUser = await prisma.user.findUnique({
      where: { id: correspondence.responsibleId },
      select: {
        telegramChatId: true,
        email: true
      }
    });

    // Формируем каналы: всегда IN_APP, TELEGRAM если есть привязка, EMAIL если включен
    const channels: Array<'IN_APP' | 'TELEGRAM' | 'EMAIL'> = ['IN_APP'];
    
    if (responsibleUser?.telegramChatId) {
      channels.push('TELEGRAM');
    }
    
    if (wantsEmail && responsibleUser?.email) {
      channels.push('EMAIL');
    }

    await NotificationController.create({
      type: 'INFO',
      channels: channels,
      title,
      message,
      senderId: senderId,
      receiverId: correspondence.responsibleId,
      toolId: tool.id,
      priority: 'MEDIUM',
      action: {
        type: 'NAVIGATE',
        path: `/aho/correspondence`,
        params: { id: correspondence.id }
      }
    });
    
  } catch (error) {
    console.error(`[Correspondence] Failed to send notification to responsible user:`, error);
    // Не прерываем выполнение, если уведомление не отправилось
  }
};

// Получить типы отправителей
export const getSenderTypes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const tool = await getCorrespondenceTool();
    
    // Получаем ВСЕ типы для данного chapter и model_uuid (без фильтра по parent_type)
    // чтобы построить полное дерево с иерархией
    const allTypes = await getHierarchyItems(prisma.type, correspondenceTypeConfig, {
      additionalWhere: {
        model_uuid: tool.id,
        chapter: 'Отправитель'
      },
      select: {
        id: true,
        chapter: true,
        name: true,
        colorHex: true,
        parent_type: true,
        sortOrder: true
      }
    });

    // Строим дерево из всех типов с правильной сортировкой
    const tree = buildTree(
      allTypes,
      correspondenceTypeConfig.parentField,
      correspondenceTypeConfig.childrenRelation,
      null,
      correspondenceTypeConfig.sortField,
      correspondenceTypeConfig.nameField
    );

    // Фильтруем только корневые типы (parent_type = null)
    const rootTypes = tree.filter(item => !item.parent_type);
    
    res.status(200).json(rootTypes);
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
    const types = await getHierarchyItems(prisma.type, correspondenceTypeConfig, {
      additionalWhere: {
        model_uuid: tool.id,
        chapter: 'Тип документа'
      },
      select: {
        id: true,
        name: true,
        colorHex: true,
        sortOrder: true
      }
    });
    res.status(200).json(types);
  } catch (error) {
    next(error);
  }
};

// Получить уникальные значения senderName для autocomplete
export const getSenderNames = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { search } = req.query;
    
    const where: any = {};
    
    // Если есть поисковый запрос, фильтруем по нему
    if (search && typeof search === 'string' && search.trim() !== '') {
      where.senderName = {
        contains: search,
        mode: 'insensitive' as const
      };
    }
    
    // Получаем уникальные значения senderName
    const correspondences = await prisma.correspondence.findMany({
      where,
      select: {
        senderName: true,
      },
      distinct: ['senderName'],
      orderBy: {
        senderName: 'asc',
      },
      take: 50, // Ограничиваем количество результатов
    });
    
    const senderNames = correspondences
      .map(c => c.senderName)
      .filter((name): name is string => name !== null && name.trim() !== '')
      .filter((name, index, self) => self.indexOf(name) === index); // Убираем дубликаты
    
    res.status(200).json(senderNames);
  } catch (error) {
    next(error);
  }
};

// Отслеживание посылки по трек-номеру
export const trackMail = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { trackNumber, correspondenceId } = req.query;
    
    if (!trackNumber || typeof trackNumber !== 'string') {
      return res.status(400).json({ error: 'Track number is required' });
    }
    
    const trackingData = await trackParcel(trackNumber);
    
    if (!trackingData) {
      return res.status(404).json({ error: 'Tracking information not found' });
    }
    
    if (trackingData.error) {
      return res.status(200).json({
        trackNumber: trackingData.trackNumber,
        error: trackingData.error,
      });
    }
    
    const lastStatus = await getLastStatus(trackNumber);
    
    // Отправляем уведомления, если указан correspondenceId
    if (correspondenceId && typeof correspondenceId === 'string') {
      try {
        await sendTrackingNotification(correspondenceId, trackNumber, lastStatus, trackingData.trackingEvents || []);
      } catch (notifError) {
        console.error('[Correspondence] Failed to send tracking notification:', notifError);
        // Не прерываем выполнение, если уведомление не отправилось
      }
    }
    
    res.status(200).json({
      trackNumber: trackingData.trackNumber,
      events: trackingData.trackingEvents || [],
      lastStatus,
    });
  } catch (error) {
    next(error);
  }
};

// Отправка уведомлений об изменении статуса отслеживания
const sendTrackingNotification = async (
  correspondenceId: string,
  trackNumber: string,
  lastStatus: { status: string; date: string; location?: string } | null,
  events: any[]
) => {
  try {
    // Получаем информацию о корреспонденции
    const correspondence = await prisma.correspondence.findUnique({
      where: { id: correspondenceId },
      include: {
        responsible: {
          select: {
            id: true,
            name: true,
            email: true,
            telegramChatId: true,
          }
        },
        documentType: {
          select: {
            name: true,
          }
        },
        senderType: {
          select: {
            name: true,
          }
        }
      }
    });

    if (!correspondence) {
      return;
    }

    // Получаем tool ID для корреспонденции
    const tool = await getCorrespondenceTool();
    
    if (!tool) {
      return;
    }

    // Проверяем настройки email уведомлений
    const emailSettings = await prisma.userSettings.findUnique({
      where: {
        userId_parameter: {
          userId: correspondence.responsibleId,
          parameter: 'notifications.email',
        },
      },
    });

    const wantsEmail = emailSettings ? emailSettings.value === 'true' : true;

    // Формируем каналы: всегда IN_APP, TELEGRAM если есть привязка, EMAIL если включен
    const channels: Array<'IN_APP' | 'TELEGRAM' | 'EMAIL'> = ['IN_APP'];
    
    if (correspondence.responsible.telegramChatId) {
      channels.push('TELEGRAM');
    }
    
    if (wantsEmail && correspondence.responsible.email) {
      channels.push('EMAIL');
    }

    const systemSenderId = process.env.SYSTEM_SENDER_ID || null;
    if (!systemSenderId) {
      return;
    }

    // Формируем сообщение
    const statusText = lastStatus ? lastStatus.status : 'Статус неизвестен';
    const locationText = lastStatus?.location ? `\nМесто: ${lastStatus.location}` : '';
    const dateText = lastStatus?.date ? `\nДата: ${new Date(lastStatus.date).toLocaleString('ru-RU')}` : '';
    const eventsCount = events.length > 0 ? `\nСобытий в истории: ${events.length}` : '';

    const title = `Обновление статуса отслеживания: ${trackNumber}`;
    const message = 
      `Тип документа: ${correspondence.documentType.name}\n` +
      `Отправитель: ${correspondence.senderType.name}\n` +
      `Статус: ${statusText}${locationText}${dateText}${eventsCount}`;

    // Отправляем уведомление
    await NotificationController.create({
      type: 'INFO',
      channels: channels,
      title,
      message,
      senderId: systemSenderId,
      receiverId: correspondence.responsibleId,
      toolId: tool.id,
      priority: 'MEDIUM',
      action: {
        type: 'NAVIGATE',
        path: `/aho/correspondence`,
        params: { id: correspondence.id }
      }
    });

  } catch (error) {
    console.error(`[Correspondence] Failed to send tracking notification:`, error);
    throw error;
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
      attachments.map(attachment => {
        const fullPath = path.join(process.cwd(), 'public', 'aho', 'correspondence', attachment.source);
        return deleteFileSafely(fullPath);
      })
    );

    // Delete attachments and correspondence in a transaction
    // Note: Cascade deletion will handle attachments automatically, but we delete files first
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

// Delete individual attachment
export const deleteAttachment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const attachmentId = req.params.attachmentId;

    const attachment = await prisma.correspondenceAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Delete file from disk
    const fullPath = path.join(process.cwd(), 'public', 'aho', 'correspondence', attachment.source);
    await deleteFileSafely(fullPath);

    // Delete attachment record
    await prisma.correspondenceAttachment.delete({
      where: { id: attachmentId },
    });

    res.status(204).end();
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    next(error);
  }
};