import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';
import { authenticateToken } from '../../middleware/auth.js';
import { NotificationController } from '../app/notification.js';
import { getCleaningTool } from './cleaningUtils.js';

// Validation schemas
const CleaningDocumentSchema = z.object({
  branchId: z.string().uuid(),
  fileName: z.string(),
  fileUrl: z.string(),
  fileSize: z.number(),
  mimeType: z.string(),
  uploadedById: z.string(),
});

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

// Функция для определения статуса по филиалу и документам (период с 15 по 15)
function calculateCleaningStatus(branch: { status: number }, documents: Array<{ uploadedAt: Date }>): {
  status: string;
  needsDocuments: boolean;
  nextDocumentDate: Date | null;
  daysUntilNext: number | null;
} {
  const now = new Date();
  const isActive = branch?.status === ACTIVE_BRANCH_STATUS;

  if (!isActive) {
    return {
      status: 'Неактивен',
      needsDocuments: false,
      nextDocumentDate: null,
      daysUntilNext: null,
    };
  }

  const currentPeriod = getCurrentPeriod();
  const documentsInCurrentPeriod = documents?.filter((doc) => {
    const docDate = new Date(doc.uploadedAt);
    return docDate >= currentPeriod.start && docDate < currentPeriod.end;
  }) || [];

  if (documentsInCurrentPeriod.length > 0) {
    const daysUntilPeriodEnd = Math.ceil((currentPeriod.end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return {
      status: 'В порядке',
      needsDocuments: false,
      nextDocumentDate: currentPeriod.end,
      daysUntilNext: daysUntilPeriodEnd,
    };
  }

  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (nowDate >= currentPeriod.end) {
    const daysOverdue = Math.floor((nowDate.getTime() - currentPeriod.end.getTime()) / (1000 * 60 * 60 * 24));
    return {
      status: 'Просрочено',
      needsDocuments: true,
      nextDocumentDate: null,
      daysUntilNext: -daysOverdue,
    };
  }

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

// Получить список филиалов с документами клининга (из Branch + CleaningDocument)
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

    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const branchId = req.query.branchId as string | undefined;

    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { email: true, role: true },
    });

    let userBranchUuid: string | null = null;
    if (user?.email) {
      const userData = await prisma.userData.findUnique({
        where: { email: user.email },
        select: { branch_uuid: true },
      });
      userBranchUuid = userData?.branch_uuid || null;
    }

    const accessCheck = await checkBranchAccess(token.userId, userBranchUuid || '', true);
    const isChecker = accessCheck.isChecker;

    const where: any = {};
    if (!isChecker && userBranchUuid) {
      where.uuid = userBranchUuid;
    } else if (branchId) {
      where.uuid = branchId;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    const total = await prisma.branch.count({ where });

    const branches = await prisma.branch.findMany({
      where,
      include: {
        cleaningDocuments: {
          include: {
            uploadedBy: { select: { id: true, name: true } },
          },
          orderBy: { uploadedAt: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
      skip,
      take: limit,
    });

    const formatted = branches.map((b) => {
      const statusInfo = calculateCleaningStatus(b, b.cleaningDocuments);
      return {
        id: b.uuid,
        branchId: b.uuid,
        branch: {
          id: b.uuid,
          name: b.name,
          code: b.code,
          address: `${b.city}, ${b.address}`,
          division: b.division,
          status: b.status,
        },
        status: statusInfo.status,
        needsDocuments: statusInfo.needsDocuments,
        nextDocumentDate: statusInfo.nextDocumentDate,
        daysUntilNext: statusInfo.daysUntilNext,
        documentsCount: b.cleaningDocuments.length,
      };
    });

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

// Получить филиал по ID (uuid филиала) с документами клининга
export const getCleaningBranchById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const branch = await prisma.branch.findUnique({
      where: { uuid: id },
      include: {
        cleaningDocuments: {
          include: {
            uploadedBy: { select: { id: true, name: true } },
          },
          orderBy: { uploadedAt: 'desc' },
        },
      },
    });

    if (!branch) {
      res.status(404).json({ error: 'Branch not found' });
      return;
    }

    const statusInfo = calculateCleaningStatus(branch, branch.cleaningDocuments);

    res.json({
      success: true,
      data: {
        id: branch.uuid,
        branchId: branch.uuid,
        branch: {
          id: branch.uuid,
          name: branch.name,
          code: branch.code,
          address: `${branch.city}, ${branch.address}`,
          division: branch.division,
          status: branch.status,
        },
        documents: branch.cleaningDocuments,
        status: statusInfo.status,
        needsDocuments: statusInfo.needsDocuments,
        nextDocumentDate: statusInfo.nextDocumentDate,
        daysUntilNext: statusInfo.daysUntilNext,
        documentsCount: branch.cleaningDocuments.length,
      },
    });
  } catch (error) {
    console.error('[Cleaning] Error getting branch by ID:', error);
    next(error);
  }
};

// Получить филиал текущего пользователя с документами клининга
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

    const userData = await prisma.userData.findUnique({
      where: { email: user.email },
      select: { branch_uuid: true, branch: { select: { uuid: true, name: true, code: true, city: true, address: true } } },
    });

    if (!userData || !userData.branch_uuid) {
      res.status(404).json({ error: 'User branch not found in UserData' });
      return;
    }

    const branch = await prisma.branch.findUnique({
      where: { uuid: userData.branch_uuid },
      include: {
        cleaningDocuments: {
          include: { uploadedBy: { select: { id: true, name: true } } },
          orderBy: { uploadedAt: 'desc' },
        },
      },
    });

    if (!branch) {
      res.status(404).json({ error: 'Branch not found' });
      return;
    }

    const statusInfo = calculateCleaningStatus(branch, branch.cleaningDocuments);

    res.json({
      success: true,
      data: {
        id: branch.uuid,
        branchId: branch.uuid,
        branch: {
          id: branch.uuid,
          name: branch.name,
          code: branch.code,
          address: `${branch.city}, ${branch.address}`,
        },
        status: statusInfo.status,
        needsDocuments: statusInfo.needsDocuments,
        documentsCount: branch.cleaningDocuments.length,
      },
    });
  } catch (error) {
    console.error('[Cleaning] Error getting user cleaning branch:', error);
    next(error);
  }
};

// Получить документы филиала с группировкой по месяцам (id = branchId)
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

    const branch = await prisma.branch.findUnique({
      where: { uuid: id },
      include: {
        cleaningDocuments: {
          include: { uploadedBy: { select: { id: true, name: true } } },
          orderBy: { uploadedAt: 'desc' },
        },
      },
    });

    if (!branch) {
      res.status(404).json({ error: 'Branch not found' });
      return;
    }

    const access = await checkBranchAccess(token.userId, branch.uuid, false);
    if (!access.hasAccess) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const documentsByMonth: Record<string, Array<{
      id: string;
      fileName: string;
      fileUrl: string;
      fileSize: number;
      mimeType: string;
      uploadedAt: Date;
      uploadedBy: { id: string; name: string };
    }>> = {};

    branch.cleaningDocuments.forEach((doc) => {
      const date = new Date(doc.uploadedAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

// Загрузить документы для филиала (id = branchId)
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

    const branch = await prisma.branch.findUnique({
      where: { uuid: id },
    });

    if (!branch) {
      res.status(404).json({ error: 'Branch not found' });
      return;
    }

    const access = await checkBranchAccess(token.userId, branch.uuid, false);
    if (!access.hasAccess) {
      res.status(403).json({ error: 'Access denied. You can only upload documents for your branch' });
      return;
    }

    const uploadedDocuments = [];
    for (const file of files) {
      const document = await prisma.cleaningDocument.create({
        data: {
          branchId: branch.uuid,
          fileName: file.originalname,
          fileUrl: `/public/accounting/cleaning/${file.filename}`,
          fileSize: file.size,
          mimeType: file.mimetype,
          uploadedById: token.userId,
        },
        include: {
          uploadedBy: { select: { id: true, name: true } },
        },
      });
      uploadedDocuments.push(document);
    }

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

// Отправить уведомление о необходимости загрузки документов (пользователям филиала)
async function sendCleaningNotification(
  branchId: string,
  branch: { name: string; code: string },
  senderId: string
): Promise<void> {
  try {
    const tool = await getCleaningTool();
    if (!tool) {
      console.warn('[Cleaning] Tool not found, skipping notification');
      return;
    }

    const systemSenderId = process.env.SYSTEM_SENDER_ID || senderId;

    const userDataList = await prisma.userData.findMany({
      where: { branch_uuid: branchId },
      select: { email: true },
      take: 20,
    });

    const emails = userDataList.map((u) => u.email).filter((e): e is string => !!e);
    if (emails.length === 0) {
      console.warn(`[Cleaning] No users found for branch ${branchId}`);
      return;
    }

    const branchUsers = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true, telegramChatId: true },
    });

    const hubUrl = process.env.HUB_FRONTEND_URL || process.env.HUB_API_URL?.replace('/hub-api', '') || 'http://localhost:5173';
    const actionUrl = `${hubUrl}/accounting/cleaning?branchId=${branchId}`;

    for (const user of branchUsers) {
      if (!user) continue;

      const emailSettings = await prisma.userSettings.findUnique({
        where: {
          userId_parameter: {
            userId: user.id,
            parameter: 'notifications.email',
          },
        },
      });

      const wantsEmail = emailSettings ? emailSettings.value === 'true' : true;
      const channels: Array<'IN_APP' | 'TELEGRAM' | 'EMAIL'> = ['IN_APP'];
      if (user.telegramChatId) channels.push('TELEGRAM');
      if (wantsEmail && user.email) channels.push('EMAIL');

      await NotificationController.create({
        type: 'WARNING',
        channels,
        title: 'Требуется загрузка документов по клинингу',
        message: `Филиал "${branch.name}" (${branch.code}): требуется загрузка документов по клинингу.`,
        senderId: systemSenderId,
        receiverId: user.id,
        toolId: tool.id,
        priority: 'MEDIUM',
        action: {
          type: 'NAVIGATE',
          path: '/accounting/cleaning',
          params: { branchId },
          url: actionUrl,
          text: 'Открыть филиал',
        },
      });
    }
  } catch (error) {
    console.error('[Cleaning] Error sending notification:', error);
  }
}
