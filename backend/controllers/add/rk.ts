import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';
import { emailService } from '../../services/email.js';
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

// Целевые должности для уведомлений и отображения ФИО
const RK_MANAGER_POSITIONS = [
  'Управляющий магазином 4 категории',
  'Управляющий магазином 3 категории',
  'Управляющий магазином 2 категории',
  'Управляющий магазином 1 категории',
  'Управляющий маг. средней категории',
  'Управляющий маг. высшей категории',
  'Старший продавец',
  'Заместитель управляющего магазином 2 категории',
  'Заместитель управляющего магазином 1 категории',
];

// Схемы валидации
const RKAttachmentSchema = z.object({
  userAddId: z.string(),
  source: z.string(),
  type: z.string(),
  // Новый признак типа вложения: CONSTRUCTION | DOCUMENT
  typeAttachment: z.enum(['CONSTRUCTION', 'DOCUMENT']),
  // Остальные поля теперь опциональны: используются только для CONSTRUCTION
  sizeXY: z.string().optional(),
  clarification: z.string().optional(),
  typeStructureId: z.string().optional(),
  approvalStatusId: z.string().optional(),
  agreedTo: z.date().optional(),
  parentAttachmentId: z.string().optional(),
});

const validateBranchExists = async (branchId: string) => {
  return prisma.branch.findUnique({ where: { uuid: branchId } });
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
  attachmentsMeta: Array<{ typeAttachment?: 'CONSTRUCTION' | 'DOCUMENT'; sizeXY?: string; clarification?: string; typeStructureId?: string; approvalStatusId?: string; agreedTo?: string; parentAttachmentId?: string }>,
  defaults: { typeStructureId?: string; approvalStatusId?: string } = {}
) => {
  if (!files || !Array.isArray(files)) return;
  
  // Сначала создаем конструкции
  const constructions: any[] = [];
  const documents: any[] = [];
  
  files.forEach((file, index) => {
    const agreedToStr = attachmentsMeta[index]?.agreedTo;
    const agreedToDate = agreedToStr ? new Date(agreedToStr.split('T')[0]) : undefined;
    const incomingType = attachmentsMeta[index]?.typeAttachment;
    const typeAttachment = incomingType
      ? incomingType
      : agreedToDate
        ? 'CONSTRUCTION'
        : 'DOCUMENT';
    
    const attachment = {
      userAddId,
      source: file.path,
      type: file.mimetype,
      typeAttachment,
      sizeXY: typeAttachment === 'CONSTRUCTION' ? (attachmentsMeta[index]?.sizeXY || '') : '',
      clarification: typeAttachment === 'CONSTRUCTION' ? (attachmentsMeta[index]?.clarification || '') : '',
      recordId: rkId,
      typeStructureId: typeAttachment === 'CONSTRUCTION'
        ? (attachmentsMeta[index]?.typeStructureId || defaults.typeStructureId || undefined)
        : undefined,
      approvalStatusId: typeAttachment === 'CONSTRUCTION'
        ? (attachmentsMeta[index]?.approvalStatusId || defaults.approvalStatusId || undefined)
        : undefined,
      agreedTo: agreedToDate,
      parentAttachmentId: attachmentsMeta[index]?.parentAttachmentId || undefined,
    };
    
    RKAttachmentSchema.parse(attachment);
    
    if (typeAttachment === 'CONSTRUCTION') {
      constructions.push(attachment);
    } else {
      documents.push(attachment);
    }
  });

  // Создаем конструкции первыми
  const createdConstructions = [];
  if (constructions.length > 0) {
    for (const construction of constructions) {
      const created = await prisma.rKAttachment.create({ data: construction });
      createdConstructions.push(created);
    }
  }
  
  // Создаем документы после конструкций, связывая их с родительскими конструкциями
  if (documents.length > 0) {
    for (const document of documents) {
      // Если указан parentAttachmentId, используем его
      // Иначе связываем с последней созданной конструкцией
      if (!document.parentAttachmentId && createdConstructions.length > 0) {
        document.parentAttachmentId = createdConstructions[createdConstructions.length - 1].id;
      }
      
      await prisma.rKAttachment.create({ data: document });
    }
  }
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
        branch: {
          include: {
            userData: {
              where: {
                position: { is: { name: { in: RK_MANAGER_POSITIONS } } },
              },
              select: {
                fio: true,
                email: true,
                position: { select: { name: true } },
              },
            },
          },
        },
        rkAttachment: {
          include: {
            typeStructure: { select: { id: true, name: true, colorHex: true } },
            approvalStatus: { select: { id: true, name: true, colorHex: true } },
            parentAttachment: {
              include: {
                typeStructure: { select: { id: true, name: true, colorHex: true } },
                approvalStatus: { select: { id: true, name: true, colorHex: true } },
              }
            },
            childAttachments: {
              include: {
                typeStructure: { select: { id: true, name: true, colorHex: true } },
                approvalStatus: { select: { id: true, name: true, colorHex: true } },
              }
            },
          } as any,
        },
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
        branch: {
          include: {
            userData: {
              where: {
                position: { is: { name: { in: RK_MANAGER_POSITIONS } } },
              },
              select: {
                fio: true,
                email: true,
                position: { select: { name: true } },
              },
            },
          },
        },
        rkAttachment: {
          include: {
            typeStructure: { select: { id: true, name: true, colorHex: true } },
            approvalStatus: { select: { id: true, name: true, colorHex: true } },
            parentAttachment: {
              include: {
                typeStructure: { select: { id: true, name: true, colorHex: true } },
                approvalStatus: { select: { id: true, name: true, colorHex: true } },
              }
            },
            childAttachments: {
              include: {
                typeStructure: { select: { id: true, name: true, colorHex: true } },
                approvalStatus: { select: { id: true, name: true, colorHex: true } },
              }
            },
          } as any,
        },
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
    if (!req.body.userAddId || !req.body.branchId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['userAddId', 'branchId']
      });
    }

    // Парсинг метаданных вложений (включая поля, перенесенные в RKAttachment)
    let attachmentsMeta: Array<{ sizeXY: string; clarification: string; typeStructureId?: string; approvalStatusId?: string; agreedTo?: string } > = [];
    let documentsMeta: Array<{ parentConstructionIndex: number }> = [];
    
    try {
      attachmentsMeta = req.body.attachmentsMeta 
        ? JSON.parse(req.body.attachmentsMeta)
        : [];
      
      documentsMeta = req.body.documentsMeta
        ? JSON.parse(req.body.documentsMeta)
        : [];
      
      console.log('Parsed attachments meta:', attachmentsMeta);
      console.log('Parsed documents meta:', documentsMeta);
      
      // Проверяем, что количество файлов с метаданными совпадает с количеством метаданных
      // Файлы без метаданных (документы) будут обработаны отдельно
      const filesWithMeta = req.files ? Math.min((req.files as Express.Multer.File[]).length, attachmentsMeta.length) : 0;
      if (req.files && filesWithMeta !== attachmentsMeta.length) {
        return res.status(400).json({
          error: 'Mismatch between files with metadata and metadata count',
          filesCount: req.files.length,
          filesWithMetaCount: filesWithMeta,
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

    // Проверка существования связанных сущностей (тип/статус теперь в attachments meta, поэтому не валидируем их тут)
    const [userExists, branchExists] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.body.userAddId } }),
      prisma.branch.findUnique({ where: { uuid: req.body.branchId } }),
    ]);

    if (!userExists) return res.status(400).json({ error: 'User not found' });
    if (!branchExists) return res.status(400).json({ error: 'Branch not found' });
    // Валидация typeStructureId/approvalStatusId перенесена на уровень добавления вложений при необходимости

    // Создание основной записи
    const newRK = await prisma.rK.create({
      data: {
        userAddId: req.body.userAddId,
        userUpdatedId: req.body.userUpdatedId || req.body.userAddId,
        branchId: req.body.branchId,
      }
    });

    // Обработка вложений
    if (Array.isArray(req.files) && req.files.length > 0) {
      console.log('Creating attachments with meta:', attachmentsMeta);
      
      // Разделяем файлы на те, что имеют метаданные (конструкции) и те, что не имеют (документы)
      const filesWithMeta = req.files.slice(0, attachmentsMeta.length);
      const filesWithoutMeta = req.files.slice(attachmentsMeta.length);
      
      // Создаем конструкции с метаданными
      if (filesWithMeta.length > 0) {
        await processRKAttachments(
          filesWithMeta as Express.Multer.File[],
          newRK.id,
          req.body.userAddId,
          attachmentsMeta,
          {}
        );
      }
      
      // Создаем документы с привязкой к конструкциям
      if (filesWithoutMeta.length > 0) {
        // Получаем все созданные конструкции в порядке создания
        const constructions = await prisma.rKAttachment.findMany({
          where: { 
            recordId: newRK.id,
            typeAttachment: 'CONSTRUCTION'
          },
          orderBy: { createdAt: 'asc' }
        });
        
        // Создаем документы с привязкой к конкретным конструкциям
        for (let i = 0; i < filesWithoutMeta.length; i++) {
          const file = filesWithoutMeta[i];
          const docMeta = documentsMeta[i];
          
          let parentConstructionId = null;
          if (docMeta && constructions[docMeta.parentConstructionIndex]) {
            parentConstructionId = constructions[docMeta.parentConstructionIndex].id;
          } else if (constructions.length > 0) {
            // Fallback: привязываем к последней конструкции
            parentConstructionId = constructions[constructions.length - 1].id;
          }
          
          await prisma.rKAttachment.create({
            data: {
              userAddId: req.body.userAddId,
              source: file.path,
              type: file.mimetype,
              typeAttachment: 'DOCUMENT',
              sizeXY: '',
              clarification: '',
              recordId: newRK.id,
              typeStructureId: undefined,
              approvalStatusId: undefined,
              agreedTo: undefined,
              parentAttachmentId: parentConstructionId,
            } as any
          });
        }
      }
    }
    // Если файлов нет, но есть метаданные с agreedTo — ничего не пишем, т.к. дата хранится на уровне файла

    // Получение полной записи для ответа
    const result = await prisma.rK.findUnique({
      where: { id: newRK.id },
      include: {
        userAdd: { select: { id: true, name: true, email: true } },
        userUpdated: { select: { id: true, name: true, email: true } },
        branch: true,
        rkAttachment: {
          include: {
            typeStructure: { select: { id: true, name: true, colorHex: true } },
            approvalStatus: { select: { id: true, name: true, colorHex: true } },
            parentAttachment: {
              include: {
                typeStructure: { select: { id: true, name: true, colorHex: true } },
                approvalStatus: { select: { id: true, name: true, colorHex: true } },
              }
            },
            childAttachments: {
              include: {
                typeStructure: { select: { id: true, name: true, colorHex: true } },
                approvalStatus: { select: { id: true, name: true, colorHex: true } },
              }
            },
          } as any,
        },
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

    // Обработка удаленных документов
    let documentsToDelete: string[] = [];
    try {
      documentsToDelete = body.removedDocuments
        ? JSON.parse(body.removedDocuments)
        : [];
    } catch (e) {
      console.error('Error parsing removedDocuments:', e);
    }

    let newAttachmentsMeta: Array<{ typeAttachment?: 'CONSTRUCTION' | 'DOCUMENT'; sizeXY?: string; clarification?: string; typeStructureId?: string; approvalStatusId?: string; agreedTo?: string }> = [];
    let newDocumentsMeta: Array<{ parentConstructionIndex: number }> = [];
    
    try {
      newAttachmentsMeta = body.newAttachmentsMeta
        ? JSON.parse(body.newAttachmentsMeta)
        : [];
    } catch (e) {
      console.error('Error parsing newAttachmentsMeta:', e);
    }
    
    try {
      newDocumentsMeta = body.newDocumentsMeta
        ? JSON.parse(body.newDocumentsMeta)
        : [];
    } catch (e) {
      console.error('Error parsing newDocumentsMeta:', e);
    }

    await deleteRKAttachments(attachmentsToDelete, rkId);
    
    // Удаляем документы
    if (documentsToDelete.length > 0) {
      await deleteRKAttachments(documentsToDelete, rkId);
    }

    if (Array.isArray(files) && files.length > 0) {
      const userAddId = body.userAddId || body.userUpdatedId || 'unknown';
      
      // Разделяем файлы на конструкции и документы
      const filesWithMeta = files.slice(0, newAttachmentsMeta.length);
      const filesWithoutMeta = files.slice(newAttachmentsMeta.length);
      
      // Создаем конструкции с метаданными
      if (filesWithMeta.length > 0) {
        await processRKAttachments(
          filesWithMeta as Express.Multer.File[],
          rkId,
          userAddId,
          newAttachmentsMeta
        );
      }
      
      // Создаем документы с привязкой к конструкциям
      if (filesWithoutMeta.length > 0) {
        // Получаем все конструкции для данной записи в порядке создания
        const constructions = await prisma.rKAttachment.findMany({
          where: { 
            recordId: rkId,
            typeAttachment: 'CONSTRUCTION'
          },
          orderBy: { createdAt: 'asc' }
        });
        
        // Создаем документы с привязкой к конкретным конструкциям
        for (let i = 0; i < filesWithoutMeta.length; i++) {
          const file = filesWithoutMeta[i];
          const docMeta = newDocumentsMeta[i];
          
          let parentConstructionId = null;
          if (docMeta && constructions[docMeta.parentConstructionIndex]) {
            parentConstructionId = constructions[docMeta.parentConstructionIndex].id;
          } else if (constructions.length > 0) {
            // Fallback: привязываем к последней конструкции
            parentConstructionId = constructions[constructions.length - 1].id;
          }
          
          await prisma.rKAttachment.create({
            data: {
              userAddId,
              source: file.path,
              type: file.mimetype,
              typeAttachment: 'DOCUMENT',
              sizeXY: '',
              clarification: '',
              recordId: rkId,
              typeStructureId: undefined,
              approvalStatusId: undefined,
              agreedTo: undefined,
              parentAttachmentId: parentConstructionId,
            } as any
          });
        }
      }
    }

    // Обновление метаданных существующих вложений (без новых файлов)
    if (body.existingAttachmentsMeta) {
      try {
        const updates: Array<{ id: string; typeAttachment?: 'CONSTRUCTION' | 'DOCUMENT'; sizeXY?: string; clarification?: string; typeStructureId?: string; approvalStatusId?: string; agreedTo?: string }> = JSON.parse(body.existingAttachmentsMeta);
        for (const u of updates) {
          const typeAttachment = u.typeAttachment || (u.agreedTo ? 'CONSTRUCTION' : 'DOCUMENT');
          await prisma.rKAttachment.update({
            where: { id: u.id },
            data: {
              typeAttachment,
              sizeXY: typeAttachment === 'CONSTRUCTION' ? (u.sizeXY ?? undefined) : '',
              clarification: typeAttachment === 'CONSTRUCTION' ? (u.clarification ?? undefined) : '',
              typeStructureId: typeAttachment === 'CONSTRUCTION' ? (u.typeStructureId ?? undefined) : '',
              approvalStatusId: typeAttachment === 'CONSTRUCTION' ? (u.approvalStatusId ?? undefined) : '',
              agreedTo: u.agreedTo ? new Date(u.agreedTo.split('T')[0]) : undefined,
            },
          });
        }
      } catch (e) {
        console.error('Error parsing existingAttachmentsMeta', e);
      }
    }

    const updateData: any = { updatedAt: new Date() };

    if (body.userUpdatedId) {
      updateData.userUpdated = { connect: { id: body.userUpdatedId } };
    }
    if (body.branchId) {
      updateData.branch = { connect: { uuid: body.branchId } };
    }

    if (body.branchId) {
      const branchExists = await validateBranchExists(body.branchId);
      if (!branchExists) return res.status(400).json({ error: 'Branch does not exist' });
    }

    // Тип/статус теперь живут в RKAttachment; их не валидируем на уровне RK

    const updatedRK = await prisma.rK.update({
      where: { id: rkId },
      data: updateData,
      include: {
        userAdd: { select: { id: true, name: true, email: true } },
        userUpdated: { select: { id: true, name: true, email: true } },
        branch: true,
        rkAttachment: {
          include: {
            typeStructure: { select: { id: true, name: true, colorHex: true } },
            approvalStatus: { select: { id: true, name: true, colorHex: true } },
            parentAttachment: {
              include: {
                typeStructure: { select: { id: true, name: true, colorHex: true } },
                approvalStatus: { select: { id: true, name: true, colorHex: true } },
              }
            },
            childAttachments: {
              include: {
                typeStructure: { select: { id: true, name: true, colorHex: true } },
                approvalStatus: { select: { id: true, name: true, colorHex: true } },
              }
            },
          } as any,
        },
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
        rkAttachment: true,
      },
    });

    if (!rk) {
      return res.status(404).json({ error: 'RK not found' });
    }

    const systemSenderId = process.env.SYSTEM_SENDER_ID || null;
    const hubUrl = process.env.HUB_API_URL || 'http://localhost:2000/hub-api/notifications';

    const computedTitle = title || `Напоминание по конструкции: ${rk.id}`;

    // Fallback message if not provided
    const daysSince = 0;
    const defaultMessage =
      message ||
      `Филиал: ${rk.branch?.name || '-'}\n` +
      `Вложений: ${rk.rkAttachment?.length || 0}`;

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
  const thresholds = new Set([180, 90, 30]);

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysDiff = (future: Date, base: Date) => Math.floor((startOfDay(future).getTime() - startOfDay(base).getTime()) / (24 * 3600 * 1000));

  const rks = await prisma.rK.findMany({
    include: {
      userAdd: { select: { id: true, name: true, email: true } },
      branch: true,
      rkAttachment: true,
    },
  });

  const today = new Date();

  for (const rk of rks) {
    for (const att of rk.rkAttachment) {
      if (!att.agreedTo) continue; // нет даты — не уведомляем

      const remaining = daysDiff(new Date(att.agreedTo), today);
      if (!thresholds.has(remaining)) continue; // уведомляем только на 180/90/30

      const title = `Срок действия скоро истекает: ${remaining} дней`;
      const message = [
        `Филиал: ${rk.branch?.name || '-'}`,
        `ID записи: ${rk.id}`,
        `Вложение: ${att.source.split('/').pop()}`,
        `До даты: ${startOfDay(new Date(att.agreedTo)).toLocaleDateString('ru-RU')}`,
        `Осталось дней: ${remaining}`,
      ].join('\n');

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
      }).catch(() => {});

      // Дополнительно отправляем e-mail сотрудникам с целевыми должностями в филиале
      try {
        const managers = await prisma.userData.findMany({
          where: {
            branch_uuid: rk.branchId,
            position: { is: { name: { in: RK_MANAGER_POSITIONS } } },
          },
          select: { fio: true, email: true },
        });
        await Promise.all(
          managers
            .filter((m) => !!m.email)
            .map((m) => emailService.sendRaw(m.email as string, title, `${message}\n\n${m.fio}`))
        );
      } catch (e) {
        console.error('Failed to send emails to managers:', e);
      }
    }
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