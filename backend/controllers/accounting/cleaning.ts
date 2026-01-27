import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';
import { authenticateToken } from '../../middleware/auth.js';
import { NotificationController } from '../app/notification.js';
import { getCleaningTool } from './cleaningUtils.js';

// Временные типы до генерации Prisma Client
// После запуска `npx prisma generate` эти типы будут доступны из @prisma/client
type PrismaCleaningBranch = any;
type PrismaCleaningDocument = any;

// Validation schemas
const CleaningBranchSchema = z.object({
  branchId: z.string().uuid(),
  folder: z.enum(['Архив', 'Рабочий']).default('Рабочий'),
  organizationName: z.string().optional(),
  wetCleaningTime: z.string().optional(),
  wetCleaningCost: z.string().optional(),
  territoryCleaningTime: z.string().optional(),
  territoryCleaningCost: z.string().optional(),
  documentsReceived: z.boolean().default(false),
  documentsReceivedAt: z.string().datetime().optional().nullable(),
});

const CleaningDocumentSchema = z.object({
  cleaningBranchId: z.string().uuid(),
  fileName: z.string(),
  fileUrl: z.string(),
  fileSize: z.number(),
  mimeType: z.string(),
  uploadedById: z.string(),
});

// Интерфейсы
interface CleaningBranchWithBranch {
  id: string;
  branchId: string;
  folder: 'Архив' | 'Рабочий';
  organizationName: string | null;
  wetCleaningTime: string | null;
  wetCleaningCost: string | null;
  territoryCleaningTime: string | null;
  territoryCleaningCost: string | null;
  documentsReceived: boolean;
  documentsReceivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  branch: {
    uuid: string;
    name: string;
    code: string;
    address: string;
    city: string;
    division: string;
    status: number;
  };
  documents: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
    uploadedAt: Date;
    uploadedBy: {
      id: string;
      name: string;
    };
  }>;
}

// Константы для расчета статуса
const ACTIVE_BRANCH_STATUS = 1; // Статус активного филиала
const PERIOD_DAY = 15; // Период загрузки документов: с 15 по 15 число каждого месяца

// Функция для определения текущего периода (с 15 по 15)
function getCurrentPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();
  
  let periodStart: Date;
  let periodEnd: Date;
  
  if (currentDay >= PERIOD_DAY) {
    // Если сегодня >= 15 числа, период: с 15 текущего месяца по 15 следующего
    periodStart = new Date(currentYear, currentMonth, PERIOD_DAY);
    periodEnd = new Date(currentYear, currentMonth + 1, PERIOD_DAY);
  } else {
    // Если сегодня < 15 числа, период: с 15 прошлого месяца по 15 текущего
    periodStart = new Date(currentYear, currentMonth - 1, PERIOD_DAY);
    periodEnd = new Date(currentYear, currentMonth, PERIOD_DAY);
  }
  
  // Устанавливаем время на начало дня
  periodStart.setHours(0, 0, 0, 0);
  periodEnd.setHours(0, 0, 0, 0);
  
  return { start: periodStart, end: periodEnd };
}

// Функция для определения статуса и необходимости загрузки документов
// Логика основана на периодах с 15 по 15 число каждого месяца
function calculateCleaningStatus(cleaningBranch: any): {
  status: string;
  needsDocuments: boolean;
  nextDocumentDate: Date | null;
  daysUntilNext: number | null;
} {
  const now = new Date();
  const folder = cleaningBranch.folder || 'Рабочий';
  const isActive = cleaningBranch.branch?.status === ACTIVE_BRANCH_STATUS;
  
  // Если в архиве, статус "Архив"
  if (folder === 'Архив') {
    return {
      status: 'Архив',
      needsDocuments: false,
      nextDocumentDate: null,
      daysUntilNext: null,
    };
  }
  
  // Если филиал неактивен
  if (!isActive) {
    return {
      status: 'Неактивен',
      needsDocuments: false,
      nextDocumentDate: null,
      daysUntilNext: null,
    };
  }
  
  // Получаем текущий период (с 15 по 15)
  const currentPeriod = getCurrentPeriod();
  
  // Проверяем, есть ли документы за текущий период
  const documentsInCurrentPeriod = cleaningBranch.documents?.filter((doc: any) => {
    const docDate = new Date(doc.uploadedAt);
    return docDate >= currentPeriod.start && docDate < currentPeriod.end;
  }) || [];
  
  // Если есть документы за текущий период
  if (documentsInCurrentPeriod.length > 0) {
    const daysUntilPeriodEnd = Math.ceil((currentPeriod.end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      status: 'В порядке',
      needsDocuments: false,
      nextDocumentDate: currentPeriod.end,
      daysUntilNext: daysUntilPeriodEnd,
    };
  }
  
  // Если документов за текущий период нет, проверяем, просрочен ли период
  // ИСПРАВЛЕНО: Нормализуем now для корректного сравнения (убираем время, оставляем только дату)
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (nowDate >= currentPeriod.end) {
    // Период уже закончился, документы просрочены
    const daysOverdue = Math.floor((nowDate.getTime() - currentPeriod.end.getTime()) / (1000 * 60 * 60 * 24));
    return {
      status: 'Просрочено',
      needsDocuments: true,
      nextDocumentDate: null,
      daysUntilNext: -daysOverdue,
    };
  }
  
  // Период еще не закончился, но документов нет
  const daysUntilPeriodEnd = Math.ceil((currentPeriod.end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return {
    status: 'Требуется загрузка',
    needsDocuments: true,
    nextDocumentDate: currentPeriod.end,
    daysUntilNext: daysUntilPeriodEnd,
  };
}

// Проверка доступа пользователя к филиалу
async function checkBranchAccess(
  userId: string,
  branchId: string,
  requireFullAccess: boolean = false
): Promise<{ hasAccess: boolean; isChecker: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  });
  
  if (!user) {
    return { hasAccess: false, isChecker: false };
  }
  
  // SUPERVISOR и DEVELOPER имеют полный доступ
  if (user.role === 'SUPERVISOR' || user.role === 'DEVELOPER') {
    return { hasAccess: true, isChecker: true };
  }
  
  // Если требуется FULL доступ, проверяем через UserToolAccess
  if (requireFullAccess) {
    const tool = await getCleaningTool();
    if (tool) {
      const access = await prisma.userToolAccess.findFirst({
        where: {
          userId,
          toolId: tool.id,
          accessLevel: 'FULL',
        },
      });
      
      if (access) {
        return { hasAccess: true, isChecker: true };
      }
    }
  }
  
  // Обычные пользователи могут работать только со своим филиалом
  // Получаем UUID филиала из UserData
  let userBranchUuid: string | null = null;
  if (user.email) {
    const userData = await prisma.userData.findUnique({
      where: { email: user.email },
      select: { branch_uuid: true },
    });
    userBranchUuid = userData?.branch_uuid || null;
  }
  
  return {
    hasAccess: userBranchUuid === branchId,
    isChecker: false,
  };
}

// Получить список филиалов с данными клининга
export const getCleaningBranches = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    
    // Фильтры
    const folder = req.query.folder as string | undefined;
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const branchId = req.query.branchId as string | undefined;
    
    // Проверяем, является ли пользователь проверяющим
    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { email: true, role: true },
    });
    
    // Получаем UUID филиала пользователя из UserData
    let userBranchUuid: string | null = null;
    if (user?.email) {
      const userData = await prisma.userData.findUnique({
        where: { email: user.email },
        select: { branch_uuid: true },
      });
      userBranchUuid = userData?.branch_uuid || null;
    }
    
    // Проверяем доступ через централизованную функцию
    const accessCheck = await checkBranchAccess(token.userId, userBranchUuid || '', true);
    const isChecker = accessCheck.isChecker;
    
    // Строим условия фильтрации
    const where: any = {};
    
    // Если не проверяющий, показываем только свой филиал
    if (!isChecker && userBranchUuid) {
      where.branchId = userBranchUuid;
    } else if (branchId) {
      // Проверяющие могут фильтровать по branchId
      where.branchId = branchId;
    }
    
    if (folder) {
      where.folder = folder;
    }
    if (search) {
      where.OR = [
        { branch: { name: { contains: search, mode: 'insensitive' } } },
        { branch: { code: { contains: search, mode: 'insensitive' } } },
        { branch: { address: { contains: search, mode: 'insensitive' } } },
        { organizationName: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    // Получаем общее количество
    const total = await (prisma as any).cleaningBranch.count({ where });
    
    // Получаем данные с пагинацией
    const cleaningBranches = await (prisma as any).cleaningBranch.findMany({
      where,
      include: {
        branch: {
          select: {
            uuid: true,
            name: true,
            code: true,
            address: true,
            city: true,
            division: true,
            status: true,
          },
        },
        documents: {
          include: {
            uploadedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            uploadedAt: 'desc',
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      skip,
      take: limit,
    });
    
    // Форматируем данные и добавляем вычисляемые статусы
    const formatted = cleaningBranches.map((cb: any) => {
      const statusInfo = calculateCleaningStatus(cb);
      return {
        id: cb.id,
        branchId: cb.branchId,
        branch: {
          id: cb.branch.uuid,
          name: cb.branch.name,
          code: cb.branch.code,
          address: `${cb.branch.city}, ${cb.branch.address}`,
          division: cb.branch.division,
          status: cb.branch.status,
        },
        folder: cb.folder,
        organizationName: cb.organizationName,
        wetCleaningTime: cb.wetCleaningTime,
        wetCleaningCost: cb.wetCleaningCost,
        territoryCleaningTime: cb.territoryCleaningTime,
        territoryCleaningCost: cb.territoryCleaningCost,
        documentsReceived: cb.documentsReceived,
        documentsReceivedAt: cb.documentsReceivedAt,
        status: statusInfo.status,
        needsDocuments: statusInfo.needsDocuments,
        nextDocumentDate: statusInfo.nextDocumentDate,
        daysUntilNext: statusInfo.daysUntilNext,
        documentsCount: cb.documents.length,
        createdAt: cb.createdAt,
        updatedAt: cb.updatedAt,
      };
    });
    
    // Фильтрация по вычисляемому статусу (если указан)
    let filtered = formatted;
    if (status) {
      filtered = formatted.filter((item: any) => item.status === status);
    }
    
    res.json({
      success: true,
      data: filtered,
      pagination: {
        page,
        limit,
        total: status ? filtered.length : total,
        totalPages: Math.ceil((status ? filtered.length : total) / limit),
      },
    });
  } catch (error) {
    console.error('[Cleaning] Error getting branches:', error);
    next(error);
  }
};

// Получить филиал по ID
export const getCleaningBranchById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    
    const cleaningBranch = await (prisma as any).cleaningBranch.findUnique({
      where: { id },
      include: {
        branch: {
          select: {
            uuid: true,
            name: true,
            code: true,
            address: true,
            city: true,
            division: true,
            status: true,
          },
        },
        documents: {
          include: {
            uploadedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            uploadedAt: 'desc',
          },
        },
      },
    });
    
    if (!cleaningBranch) {
      res.status(404).json({ error: 'Cleaning branch not found' });
      return;
    }
    
    const statusInfo = calculateCleaningStatus(cleaningBranch);
    
    res.json({
      success: true,
      data: {
        ...cleaningBranch,
        status: statusInfo.status,
        needsDocuments: statusInfo.needsDocuments,
        nextDocumentDate: statusInfo.nextDocumentDate,
        daysUntilNext: statusInfo.daysUntilNext,
      },
    });
  } catch (error) {
    console.error('[Cleaning] Error getting branch by ID:', error);
    next(error);
  }
};

// Создать или обновить запись клининга для филиала
export const upsertCleaningBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const validatedData = CleaningBranchSchema.parse(req.body);
    
    // Проверяем существование филиала
    const branch = await prisma.branch.findUnique({
      where: { uuid: validatedData.branchId },
    });
    
    if (!branch) {
      res.status(404).json({ error: 'Branch not found' });
      return;
    }
    
    // Ищем существующую запись
    const existing = await (prisma as any).cleaningBranch.findFirst({
      where: { branchId: validatedData.branchId },
    });
    
    let cleaningBranch;
    if (existing) {
      // Обновляем существующую
      cleaningBranch = await (prisma as any).cleaningBranch.update({
        where: { id: existing.id },
        data: {
          folder: validatedData.folder,
          organizationName: validatedData.organizationName,
          wetCleaningTime: validatedData.wetCleaningTime,
          wetCleaningCost: validatedData.wetCleaningCost,
          territoryCleaningTime: validatedData.territoryCleaningTime,
          territoryCleaningCost: validatedData.territoryCleaningCost,
          documentsReceived: validatedData.documentsReceived,
          documentsReceivedAt: validatedData.documentsReceivedAt 
            ? new Date(validatedData.documentsReceivedAt) 
            : validatedData.documentsReceived 
              ? new Date() 
              : null,
        },
        include: {
          branch: true,
          documents: true,
        },
      });
    } else {
      // Создаем новую
      cleaningBranch = await (prisma as any).cleaningBranch.create({
        data: {
          branchId: validatedData.branchId,
          folder: validatedData.folder,
          organizationName: validatedData.organizationName,
          wetCleaningTime: validatedData.wetCleaningTime,
          wetCleaningCost: validatedData.wetCleaningCost,
          territoryCleaningTime: validatedData.territoryCleaningTime,
          territoryCleaningCost: validatedData.territoryCleaningCost,
          documentsReceived: validatedData.documentsReceived,
          documentsReceivedAt: validatedData.documentsReceivedAt 
            ? new Date(validatedData.documentsReceivedAt) 
            : validatedData.documentsReceived 
              ? new Date() 
              : null,
        },
        include: {
          branch: true,
          documents: true,
        },
      });
    }
    
    // Проверяем, нужно ли отправить уведомление
    const statusInfo = calculateCleaningStatus(cleaningBranch);
    if (statusInfo.needsDocuments) {
      await sendCleaningNotification(cleaningBranch, token.userId);
    }
    
    res.json({
      success: true,
      data: cleaningBranch,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.issues });
      return;
    }
    console.error('[Cleaning] Error upserting branch:', error);
    next(error);
  }
};

// Отметить документы как полученные
export const markDocumentsReceived = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const { id } = req.params;
    
    const cleaningBranch = await (prisma as any).cleaningBranch.update({
      where: { id },
      data: {
        documentsReceived: true,
        documentsReceivedAt: new Date(),
      },
      include: {
        branch: true,
        documents: true,
      },
    });
    
    res.json({
      success: true,
      data: cleaningBranch,
    });
  } catch (error) {
    console.error('[Cleaning] Error marking documents received:', error);
    next(error);
  }
};

// Получить или создать cleaning branch для текущего пользователя
export const getOrCreateUserCleaningBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { email: true },
    });
    
    if (!user || !user.email) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    // Получаем UUID филиала из UserData
    const userData = await prisma.userData.findUnique({
      where: { email: user.email },
      select: { branch_uuid: true, branch: { select: { uuid: true, name: true, code: true } } },
    });
    
    if (!userData || !userData.branch_uuid) {
      res.status(404).json({ error: 'User branch not found in UserData' });
      return;
    }
    
    const branchUuid = userData.branch_uuid;
    
    // Ищем существующую запись или создаем новую
    let cleaningBranch = await (prisma as any).cleaningBranch.findFirst({
      where: { branchId: branchUuid },
      include: {
        branch: {
          select: {
            uuid: true,
            name: true,
            code: true,
            address: true,
            city: true,
            division: true,
            status: true,
          },
        },
        documents: {
          include: {
            uploadedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            uploadedAt: 'desc',
          },
        },
      },
    });
    
    // Если записи нет, создаем новую
    if (!cleaningBranch) {
      cleaningBranch = await (prisma as any).cleaningBranch.create({
        data: {
          branchId: branchUuid,
          folder: 'Рабочий',
          documentsReceived: false,
        },
        include: {
          branch: {
            select: {
              uuid: true,
              name: true,
              code: true,
              address: true,
              city: true,
              division: true,
              status: true,
            },
          },
          documents: {
            include: {
              uploadedBy: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: {
              uploadedAt: 'desc',
            },
          },
        },
      });
    }
    
    const statusInfo = calculateCleaningStatus(cleaningBranch);
    
    res.json({
      success: true,
      data: {
        id: cleaningBranch.id,
        branchId: cleaningBranch.branchId,
        branch: {
          id: cleaningBranch.branch.uuid,
          name: cleaningBranch.branch.name,
          code: cleaningBranch.branch.code,
          address: `${cleaningBranch.branch.city}, ${cleaningBranch.branch.address}`,
        },
        folder: cleaningBranch.folder,
        documentsReceived: cleaningBranch.documentsReceived,
        documentsReceivedAt: cleaningBranch.documentsReceivedAt,
        status: statusInfo.status,
        needsDocuments: statusInfo.needsDocuments,
        documentsCount: cleaningBranch.documents.length,
      },
    });
  } catch (error) {
    console.error('[Cleaning] Error getting user cleaning branch:', error);
    next(error);
  }
};

// Получить документы с группировкой по месяцам
export const getDocumentsByMonths = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const { id } = req.params;
    
    // Проверяем существование cleaning branch
    const cleaningBranch = await (prisma as any).cleaningBranch.findUnique({
      where: { id },
      include: {
        branch: true,
        documents: {
          include: {
            uploadedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            uploadedAt: 'desc',
          },
        },
      },
    });
    
    if (!cleaningBranch) {
      res.status(404).json({ error: 'Cleaning branch not found' });
      return;
    }
    
    // Проверяем доступ
    const access = await checkBranchAccess(token.userId, cleaningBranch.branchId, false);
    if (!access.hasAccess) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    // Группируем документы по месяцам
    const documentsByMonth: Record<string, Array<{
      id: string;
      fileName: string;
      fileUrl: string;
      fileSize: number;
      mimeType: string;
      uploadedAt: Date;
      uploadedBy: {
        id: string;
        name: string;
      };
    }>> = {};
    
    cleaningBranch.documents.forEach((doc: any) => {
      const date = new Date(doc.uploadedAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' });
      
      if (!documentsByMonth[monthKey]) {
        documentsByMonth[monthKey] = [];
      }
      
      documentsByMonth[monthKey].push({
        id: doc.id,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        uploadedAt: doc.uploadedAt,
        uploadedBy: doc.uploadedBy,
      });
    });
    
    // Преобразуем в массив и сортируем по дате (новые месяцы первыми)
    const grouped = Object.entries(documentsByMonth)
      .map(([key, docs]) => ({
        monthKey: key,
        monthName: new Date(key + '-01').toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' }),
        documents: docs,
        count: docs.length,
      }))
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    
    res.json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    console.error('[Cleaning] Error getting documents by months:', error);
    next(error);
  }
};

// Загрузить документы для филиала
export const uploadDocuments = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const { id } = req.params;
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files provided' });
      return;
    }
    
    // Проверяем существование cleaning branch
    let cleaningBranch = await (prisma as any).cleaningBranch.findUnique({
      where: { id },
      include: { branch: true },
    });
    
    // Если не найден по ID, возможно это branchId - используем upsert
    if (!cleaningBranch) {
      const branch = await prisma.branch.findUnique({
        where: { uuid: id },
      });
      
      if (!branch) {
        res.status(404).json({ error: `Branch with uuid "${id}" not found` });
        return;
      }
      
      // Используем upsert для автоматического создания если нужно
      cleaningBranch = await (prisma as any).cleaningBranch.upsert({
        where: { branchId: branch.uuid },
        update: {},
        create: {
          branchId: branch.uuid,
          folder: 'Рабочий',
          documentsReceived: false,
        },
        include: { branch: true },
      });
    }
    
    // Проверяем доступ
    const access = await checkBranchAccess(token.userId, cleaningBranch.branchId, false);
    if (!access.hasAccess) {
      res.status(403).json({ error: 'Access denied. You can only upload documents for your branch' });
      return;
    }
    
    // Создаем записи о документах
    const uploadedDocuments = [];
    for (const file of files) {
      const document = await (prisma as any).cleaningDocument.create({
        data: {
          cleaningBranchId: cleaningBranch.id,
          fileName: file.originalname,
          fileUrl: `/public/accounting/cleaning/${file.filename}`,
          fileSize: file.size,
          mimeType: file.mimetype,
          uploadedById: token.userId,
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
      uploadedDocuments.push(document);
    }
    
    // Обновляем статус получения документов
    await (prisma as any).cleaningBranch.update({
      where: { id: cleaningBranch.id },
      data: {
        documentsReceived: true,
        documentsReceivedAt: new Date(),
      },
    });
    
    res.json({
      success: true,
      data: {
        documents: uploadedDocuments,
        message: `Successfully uploaded ${uploadedDocuments.length} file(s)`,
      },
    });
  } catch (error) {
    console.error('[Cleaning] Error uploading documents:', error);
    next(error);
  }
};

// Отправить уведомление о необходимости загрузки документов
async function sendCleaningNotification(
  cleaningBranch: any,
  senderId: string
): Promise<void> {
  try {
    const tool = await getCleaningTool();
    if (!tool) {
      console.warn('[Cleaning] Tool not found, skipping notification');
      return;
    }
    
    // Получаем ответственных за филиал (можно расширить логику)
    // Пока отправляем системное уведомление
    const systemSenderId = process.env.SYSTEM_SENDER_ID || senderId;
    
    // Получаем пользователей, связанных с филиалом
    const branchUsers = await prisma.user.findMany({
      where: { branch: cleaningBranch.branchId },
      select: {
        id: true,
        email: true,
        telegramChatId: true,
      },
      take: 10, // Ограничиваем количество получателей
    });
    
    if (branchUsers.length === 0) {
      console.warn(`[Cleaning] No users found for branch ${cleaningBranch.branchId}`);
      return;
    }
    
    // Отправляем уведомления каждому пользователю
    for (const user of branchUsers) {
      if (!user) continue;
      
      // Проверяем настройки email
      const emailSettings = await prisma.userSettings.findUnique({
        where: {
          userId_parameter: {
            userId: user.id,
            parameter: 'notifications.email',
          },
        },
      });
      
      const wantsEmail = emailSettings ? emailSettings.value === 'true' : true;
      
      // Формируем каналы
      const channels: Array<'IN_APP' | 'TELEGRAM' | 'EMAIL'> = ['IN_APP'];
      
      if (user.telegramChatId) {
        channels.push('TELEGRAM');
      }
      
      if (wantsEmail && user.email) {
        channels.push('EMAIL');
      }
      
      const hubUrl = process.env.HUB_FRONTEND_URL || process.env.HUB_API_URL?.replace('/hub-api', '') || 'http://localhost:5173';
      const actionUrl = `${hubUrl}/accounting/cleaning?branchId=${cleaningBranch.branchId}`;
      
      await NotificationController.create({
        type: 'WARNING',
        channels,
        title: 'Требуется загрузка документов по клинингу',
        message: `Филиал "${cleaningBranch.branch.name}" (${cleaningBranch.branch.code}): требуется загрузка документов по клинингу.`,
        senderId: systemSenderId,
        receiverId: user.id,
        toolId: tool.id,
        priority: 'MEDIUM',
        action: {
          type: 'NAVIGATE',
          path: '/accounting/cleaning',
          params: { branchId: cleaningBranch.branchId },
          url: actionUrl,
          text: 'Открыть филиал',
        },
      });
    }
  } catch (error) {
    console.error('[Cleaning] Error sending notification:', error);
    // Не прерываем выполнение при ошибке уведомления
  }
}
