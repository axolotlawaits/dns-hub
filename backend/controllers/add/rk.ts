import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';

// Конфигурация Multer для загрузки файлов
const upload = multer({ dest: 'uploads/' });

// Константы для типов и статусов
const TYPE_MODEL_UUID = "944287fa-7599-4ff6-aa48-1dd81406f38c";
const TYPE_CHAPTER = "Тип вывески";
const STATUS_MODEL_UUID = "944287fa-7599-4ff6-aa48-1dd81406f38c";
const STATUS_CHAPTER = "Статус согласования";

// Схемы валидации
const RKAttachmentSchema = z.object({
  userAddId: z.string(),
  source: z.string(),
  type: z.string(),
  sizeXY: z.string(),
  clarification: z.string(),
});

const validateBranchExists = async (branchId: string) => {
  return prisma.branch.findUnique({ where: { uuid: branchId } });
};

const validateTypeStructureExists = async (typeStructureId: string) => {
  return prisma.type.findFirst({
    where: {
      id: typeStructureId,
      model_uuid: TYPE_MODEL_UUID,
      chapter: TYPE_CHAPTER,
    },
  });
};

const validateApprovalStatusExists = async (approvalStatusId: string) => {
  return prisma.type.findFirst({
    where: {
      id: approvalStatusId,
      model_uuid: STATUS_MODEL_UUID,
      chapter: STATUS_CHAPTER,
    },
  });
};

const deleteFileSafely = async (filePath: string) => {
  try {
    await fs.unlink(filePath);
    console.log(`File deleted successfully: ${filePath}`);
  } catch (error) {
    console.error(`Error deleting file at ${filePath}:`, error);
  }
};

const handlePrismaError = (error: any, res: Response) => {
  if (error.code === 'P2025') {
    res.status(404).json({ error: 'Record not found' });
    return true;
  }
  return false;
};

const processRKAttachments = async (
  files: Express.Multer.File[],
  rkId: string,
  userAddId: string,
  attachmentsMeta: Array<{ sizeXY: string; clarification: string }>
) => {
  if (!files || !Array.isArray(files)) return;
  
  const attachmentsData = files.map((file, index) => {
    const attachment = {
      userAddId,
      source: file.path,
      type: file.mimetype,
      sizeXY: attachmentsMeta[index]?.sizeXY || '',
      clarification: attachmentsMeta[index]?.clarification || '',
      recordId: rkId,
    };
    RKAttachmentSchema.parse(attachment);
    return attachment;
  });

  await prisma.rKAttachment.createMany({ data: attachmentsData });
};

const deleteRKAttachments = async (attachmentIds: string[], rkId: string) => {
  if (!attachmentIds.length) return;
  
  const attachments = await prisma.rKAttachment.findMany({
    where: { id: { in: attachmentIds }, recordId: rkId }
  });

  await Promise.all(
    attachments.map(async (attachment: { source: string; id: any; }) => {
      await deleteFileSafely(path.join(attachment.source));
      await prisma.rKAttachment.delete({ where: { id: attachment.id } });
    })
  );
};

// Основные методы контроллера
export const getRKList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rkList = await prisma.rK.findMany({
      include: {
        userAdd: { select: { id: true, name: true, email: true } },
        userUpdated: { select: { id: true, name: true, email: true } },
        branch: true,
        typeStructure: {
          select: {
            id: true,
            name: true,
            colorHex: true
          }
        },
        approvalStatus: {
          select: {
            id: true,
            name: true,
            colorHex: true
          }
        },
        rkAttachment: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(rkList);
  } catch (error) {
    next(error);
  }
};

export const getRKById = async (req: Request, res: Response, next: NextFunction): Promise <any> => {
  try {
    const rk = await prisma.rK.findUnique({
      where: { id: req.params.id },
      include: {
        userAdd: { select: { id: true, name: true, email: true } },
        userUpdated: { select: { id: true, name: true, email: true } },
        branch: true,
        typeStructure: {
          select: {
            id: true,
            name: true,
            colorHex: true
          }
        },
        approvalStatus: {
          select: {
            id: true,
            name: true,
            colorHex: true
          }
        },
        rkAttachment: true,
      },
    });
    if (!rk) {
      return res.status(404).json({ error: 'RK record not found' });
    }
    res.status(200).json(rk);
  } catch (error) {
    next(error);
  }
};

export const createRK = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('Create RK request received:', {
      body: req.body,
      files: req.files ? (req.files as Express.Multer.File[]).map(f => ({
        originalname: f.originalname,
        size: f.size,
        mimetype: f.mimetype,
        path: f.path
      })) : 'No files'
    });

    // Проверка обязательных полей
    if (!req.body.userAddId || !req.body.branchId || !req.body.agreedTo || 
        !req.body.typeStructureId || !req.body.approvalStatusId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['userAddId', 'branchId', 'agreedTo', 'typeStructureId', 'approvalStatusId']
      });
    }

    // Парсинг метаданных вложений
    let attachmentsMeta: Array<{sizeXY: string, clarification: string}> = [];
    try {
      attachmentsMeta = req.body.attachmentsMeta 
        ? JSON.parse(req.body.attachmentsMeta)
        : [];
      
      console.log('Parsed attachments meta:', attachmentsMeta);
      
      if (req.files && req.files.length !== attachmentsMeta.length) {
        return res.status(400).json({
          error: 'Mismatch between files and metadata count',
          filesCount: req.files.length,
          metaCount: attachmentsMeta.length
        });
      }
    } catch (e: unknown) {
      console.error('Error parsing attachmentsMeta:', e);
      return res.status(400).json({
        error: 'Invalid attachmentsMeta format',
        details: e instanceof Error ? e.message : String(e)
      });
    }

    // Проверка существования связанных сущностей
    const [userExists, branchExists, typeExists, statusExists] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.body.userAddId } }),
      prisma.branch.findUnique({ where: { uuid: req.body.branchId } }),
      prisma.type.findUnique({ where: { id: req.body.typeStructureId } }),
      prisma.type.findUnique({ where: { id: req.body.approvalStatusId } })
    ]);

    if (!userExists) return res.status(400).json({ error: 'User not found' });
    if (!branchExists) return res.status(400).json({ error: 'Branch not found' });
    if (!typeExists) return res.status(400).json({ error: 'Type structure not found' });
    if (!statusExists) return res.status(400).json({ error: 'Approval status not found' });

    // Создание основной записи
    const newRK = await prisma.rK.create({
      data: {
        userAddId: req.body.userAddId,
        userUpdatedId: req.body.userUpdatedId || req.body.userAddId,
        branchId: req.body.branchId,
        agreedTo: new Date(req.body.agreedTo),
        typeStructureId: req.body.typeStructureId,
        approvalStatusId: req.body.approvalStatusId,
      }
    });

    // Обработка вложений
    if (Array.isArray(req.files) && req.files.length > 0) {
      console.log('Creating attachments with meta:', attachmentsMeta);
      
      await prisma.rKAttachment.createMany({
        data: (req.files as Express.Multer.File[]).map((file, index) => ({
          userAddId: req.body.userAddId,
          source: file.path,
          type: file.mimetype,
          sizeXY: attachmentsMeta[index]?.sizeXY || '',
          clarification: attachmentsMeta[index]?.clarification || '',
          recordId: newRK.id
        }))
      });
    }

    // Получение полной записи для ответа
    const result = await prisma.rK.findUnique({
      where: { id: newRK.id },
      include: {
        userAdd: { select: { id: true, name: true } },
        branch: { select: { uuid: true, name: true } },
        typeStructure: { select: { id: true, name: true } },
        approvalStatus: { select: { id: true, name: true } },
        rkAttachment: true
      }
    });

    console.log('RK created successfully:', result);
    return res.status(201).json(result);

  } catch (error) {
    console.error('Error in createRK:', error);
    
    // Удаление созданной записи если возникла ошибка после создания
    if (req.body.userAddId && req.body.branchId) {
      await prisma.rK.deleteMany({
        where: {
          userAddId: req.body.userAddId,
          branchId: req.body.branchId,
          agreedTo: new Date(req.body.agreedTo)
        }
      }).catch(e => console.error('Error cleaning up:', e));
    }

    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

export const updateRK = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { body, params, files } = req;
    const rkId = params.id;

    let attachmentsToDelete: string[] = [];
    try {
      attachmentsToDelete = body.removedAttachments
        ? JSON.parse(body.removedAttachments)
        : [];
    } catch (e) {
      console.error('Error parsing removedAttachments:', e);
    }

    let newAttachmentsMeta: Array<{ sizeXY: string; clarification: string }> = [];
    try {
      newAttachmentsMeta = body.newAttachmentsMeta
        ? JSON.parse(body.newAttachmentsMeta)
        : [];
    } catch (e) {
      console.error('Error parsing newAttachmentsMeta:', e);
    }

    await deleteRKAttachments(attachmentsToDelete, rkId);

    if (Array.isArray(files) && files.length > 0) {
      const userAddId = body.userAddId || body.userUpdatedId || 'unknown';
      await processRKAttachments(
        files as Express.Multer.File[],
        rkId,
        userAddId,
        newAttachmentsMeta
      );
    }

    const updateData: {
      userUpdatedId?: string;
      branchId?: string;
      agreedTo?: Date;
      typeStructureId?: string;
      approvalStatusId?: string;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (body.userUpdatedId) updateData.userUpdatedId = body.userUpdatedId;
    if (body.branchId) updateData.branchId = body.branchId;
    if (body.agreedTo) updateData.agreedTo = new Date(body.agreedTo);
    if (body.typeStructureId) updateData.typeStructureId = body.typeStructureId;
    if (body.approvalStatusId) updateData.approvalStatusId = body.approvalStatusId;

    if (body.branchId) {
      const branchExists = await validateBranchExists(body.branchId);
      if (!branchExists) return res.status(400).json({ error: 'Branch does not exist' });
    }

    if (body.typeStructureId) {
      const typeStructureExists = await validateTypeStructureExists(body.typeStructureId);
      if (!typeStructureExists) return res.status(400).json({ error: 'Type Structure does not exist' });
    }

    if (body.approvalStatusId) {
      const approvalStatusExists = await validateApprovalStatusExists(body.approvalStatusId);
      if (!approvalStatusExists) return res.status(400).json({ error: 'Approval Status does not exist' });
    }

    const updatedRK = await prisma.rK.update({
      where: { id: rkId },
      data: updateData,
      include: {
        userAdd: { select: { id: true, name: true, email: true } },
        userUpdated: { select: { id: true, name: true, email: true } },
        branch: true,
        typeStructure: {
          select: {
            id: true,
            name: true,
            colorHex: true
          }
        },
        approvalStatus: {
          select: {
            id: true,
            name: true,
            colorHex: true
          }
        },
        rkAttachment: true,
      },
    });

    res.status(200).json(updatedRK);
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    next(error);
  }
};

// --- Notifications ---
export const notifyRK = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { id } = req.params as { id: string };
    const {
      channels: rawChannels = ['IN_APP'],
      type: rawType = 'WARNING',
      title,
      message,
      receiverId,
    } = req.body || {};

    const rk = await prisma.rK.findUnique({
      where: { id },
      include: {
        userAdd: { select: { id: true, name: true } },
        branch: true,
        typeStructure: true,
        approvalStatus: true,
      },
    });

    if (!rk) {
      return res.status(404).json({ error: 'RK not found' });
    }

    const systemSenderId = process.env.SYSTEM_SENDER_ID || null;
    const hubUrl = process.env.HUB_API_URL || 'http://localhost:2000/hub-api/notifications';

    const computedTitle =
      title || `Напоминание по конструкции: ${rk.branch?.rrs || ''} ${rk.branch?.name || ''}`.trim();

    // Fallback message if not provided
    const daysSince = Math.max(
      0,
      Math.floor((Date.now() - new Date(rk.agreedTo).getTime()) / (1000 * 60 * 60 * 24))
    );
    const defaultMessage =
      message ||
      `РРС: ${rk.branch?.rrs || '-'}; Филиал: ${rk.branch?.name || '-'}${rk.branch?.code ? ` (${rk.branch.code})` : ''}${rk.branch?.city ? ` - ${rk.branch.city}` : ''}.\n` +
        `Тип: ${rk.typeStructure?.name || '-'}; Статус: ${rk.approvalStatus?.name || '-'}.\n` +
        `Дней с согласования: ${daysSince}.`;

    const toArray = (value: unknown): string[] => {
      if (Array.isArray(value)) return value as string[];
      if (typeof value === 'string') return value.split(',').map(s => s.trim());
      return [];
    };

    const normalizeChannel = (c: string) => {
      const v = c.replace(/\s+/g, '').toUpperCase();
      if (v === 'IN_APP' || v === 'INAPP' || v === 'IN-APP') return 'IN_APP';
      if (v === 'TELEGRAM') return 'TELEGRAM';
      if (v === 'EMAIL') return 'EMAIL';
      return 'IN_APP';
    };

    const channels = toArray(rawChannels).map(normalizeChannel).filter(Boolean);
    const type = String(rawType || 'WARNING').toUpperCase();

    const payload = {
      type,
      channels: channels.length ? channels : ['IN_APP'],
      title: computedTitle,
      message: defaultMessage,
      senderId: systemSenderId,
      receiverId: receiverId || rk.userAddId,
    };

    const response = await fetch(hubUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: 'Failed to dispatch notification', details: text });
    }

    const result = await response.json().catch(() => ({}));
    res.status(200).json({ ok: true, result });
  } catch (error) {
    next(error);
  }
};

export const dailyRKJob = async () => {
  const hubUrl = process.env.HUB_API_URL || 'http://localhost:2000/hub-api/notifications';
  const systemSenderId = process.env.SYSTEM_SENDER_ID || null;
  const rks = await prisma.rK.findMany({
    include: { userAdd: true, branch: true, typeStructure: true, approvalStatus: true },
  });
  for (const rk of rks) {
    const title = `Автонапоминание: ${rk.branch?.rrs || ''} ${rk.branch?.name || ''}`.trim();
    const message = `Дата согласования: ${new Date(rk.agreedTo).toLocaleString('ru-RU')}`;
    await fetch(hubUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'WARNING',
        channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
        title,
        message,
        senderId: systemSenderId,
        receiverId: rk.userAddId,
      }),
    });
  }
};

export const deleteRK = async (req: Request, res: Response, next: NextFunction): Promise <any> => {
  try {
    const rkId = req.params.id;
    const rk = await prisma.rK.findUnique({
      where: { id: rkId },
    });

    if (!rk) {
      return res.status(404).json({ error: 'RK record not found' });
    }

    const attachments = await prisma.rKAttachment.findMany({
      where: { recordId: rkId },
    });

    await Promise.all(
      attachments.map((attachment: { source: string; }) => deleteFileSafely(attachment.source))
    );

    await prisma.$transaction([
      prisma.rKAttachment.deleteMany({ where: { recordId: rkId } }),
      prisma.rK.delete({ where: { id: rkId } }),
    ]);

    res.status(204).end();
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    next(error);
  }
};

// Методы для получения справочников
export const getRKTypes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const types = await prisma.type.findMany({
      where: {
        model_uuid: TYPE_MODEL_UUID,
        chapter: TYPE_CHAPTER,
      },
      select: {
        id: true,
        name: true,
        colorHex: true
      },
      orderBy: { name: 'asc' }
    });
    res.status(200).json(types);
  } catch (error) {
    next(error);
  }
};

export const getRKStatuses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const statuses = await prisma.type.findMany({
      where: {
        model_uuid: STATUS_MODEL_UUID,
        chapter: STATUS_CHAPTER,
      },
      select: {
        id: true,
        name: true,
        colorHex: true
      },
      orderBy: { name: 'asc' }
    });
    res.status(200).json(statuses);
  } catch (error) {
    next(error);
  }
};

export const getBranchesList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branches = await prisma.branch.findMany({
      select: {
        uuid: true,
        name: true,
        code: true,
        city: true,
        rrs: true
      },
      orderBy: { name: 'asc' }
    });
    res.status(200).json(branches);
  } catch (error) {
    next(error);
  }
};

// Настройка роутов
export const setupRKRoutes = (router: any) => {
  // RK routes
  router.get('/rk', getRKList);
  router.get('/rk/:id', getRKById);
  router.post('/rk', upload.array('files'), createRK);
  router.put('/rk/:id', upload.array('files'), updateRK);
  router.delete('/rk/:id', deleteRK);

  // Справочники
  router.get('/rk/types', getRKTypes);
  router.get('/rk/statuses', getRKStatuses);
  router.get('/branches', getBranchesList);
};