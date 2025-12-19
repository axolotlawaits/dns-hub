import { Request, Response } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';

// Схемы валидации для совместимости с DNS Radio v2.4.7
const createBugReportSchema = z.object({
  // Основные поля (обязательные)
  deviceId: z.string().min(1),
  errorType: z.enum([
    'CRASH', 'NETWORK_ERROR', 'AUTHENTICATION_ERROR', 'MEDIA_ERROR',
    'DOWNLOAD_ERROR', 'PERMISSION_ERROR', 'STORAGE_ERROR', 'SOCKET_ERROR',
    'PERFORMANCE_ISSUE', 'UNKNOWN_ERROR'
  ]),
  errorMessage: z.string().min(1),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  appVersion: z.string().min(1),
  
  // Поля пользователя и филиала
  userId: z.string().optional(),
  userEmail: z.string().optional(),
  branchType: z.string().optional(),
  branchName: z.string().optional(),
  
  // Информация об устройстве
  androidVersion: z.string().optional(),
  deviceModel: z.string().optional(),
  deviceManufacturer: z.string().optional(),
  
  // Системная информация
  memoryUsage: z.number().optional(),
  storageFree: z.number().optional(),
  networkType: z.enum(['WiFi', 'Mobile', 'Ethernet']).optional(),
  isOnline: z.boolean().optional(),
  
  // Контекст
  userAction: z.string().optional(),
  sessionId: z.string().optional(),
  stackTrace: z.string().optional(),
  
  // Временные метки
  timestamp: z.string().datetime().optional(),
  
  // Дополнительные данные (JSON) - расширенная схема для DNS Radio v2.4.7
  additionalData: z.object({
    // MAC адрес и метод получения
    macAddress: z.string().optional(),
    macMethod: z.enum([
      'NetworkInterface',
      'NetworkInterface_All', 
      'WifiManager_Legacy',
      'WifiManager_Modern',
      'WifiManager_ConnectionInfo',
      'BluetoothAdapter',
      'PseudoMac',
      'StaticFallback'
    ]).optional(),
    isRealMac: z.string().optional(), // "true" или "false" как строка
    isPseudoMac: z.string().optional(), // "true" или "false" как строка
    
    // Дополнительная информация об устройстве
    apiLevel: z.string().optional(),
    device: z.string().optional(),
    product: z.string().optional(),
    
    // Другие возможные поля
    buildVersion: z.string().optional(),
    kernelVersion: z.string().optional(),
    cpuArchitecture: z.string().optional(),
    totalMemory: z.number().optional(),
    availableMemory: z.number().optional(),

    // Дополнительные поля для совместимости
    extra: z.record(z.string(), z.any()).optional()
  }).optional(),

  // Статус
  isAutoReport: z.boolean().default(true),
  isResolved: z.boolean().default(false),
  
  // Поля для совместимости с приложением (могут быть переданы, но не сохраняются)
  id: z.string().optional(), // Приложение может передавать ID, но мы генерируем свой
  createdAt: z.string().datetime().optional() // Приложение может передавать, но мы используем текущее время
});

const resolveBugReportSchema = z.object({
  reportId: z.string().uuid(),
  resolvedBy: z.string().optional(),
  resolutionNotes: z.string().optional()
});

// Создание отчета об ошибке (совместимость с DNS Radio v2.4.7)
export const createBugReport = async (req: Request, res: Response): Promise<any> => {
  try {
    const validatedData = createBugReportSchema.parse(req.body);
    
    // Парсим timestamp если он передан как строка
    const timestamp = validatedData.timestamp 
      ? new Date(validatedData.timestamp)
      : new Date();

    // Извлекаем только нужные поля для сохранения в БД
    const { id, createdAt, ...dataToSave } = validatedData;

    const bugReport = await prisma.bugReport.create({
      data: {
        ...dataToSave,
        timestamp,
        additionalData: validatedData.additionalData || {}
      }
    });

    // Логируем детальную информацию о MAC адресе и устройстве
    const macInfo = validatedData.additionalData;
    if (macInfo?.macAddress) {
      const macType = macInfo.isRealMac === 'true' ? 'REAL' : 'PSEUDO';
      const deviceInfo = macInfo.device ? ` (${macInfo.device})` : '';
      const apiInfo = macInfo.apiLevel ? ` API:${macInfo.apiLevel}` : '';
      
      console.log(`✅ [BugReport] Created report ${bugReport.id} for device ${bugReport.deviceId}${deviceInfo}${apiInfo}`);
      console.log(`   📱 MAC: ${macInfo.macAddress} (${macType}, Method: ${macInfo.macMethod || 'Unknown'})`);
      
      // Логируем предупреждение если используется псевдо-MAC
      if (macInfo.isPseudoMac === 'true') {
        console.warn(`⚠️  [BugReport] Device ${bugReport.deviceId} using PSEUDO-MAC - all real methods failed`);
      }
    } else {
      console.log(`✅ [BugReport] Created report ${bugReport.id} for device ${bugReport.deviceId} (no MAC info)`);
    }

    return res.status(201).json({
      success: true,
      data: bugReport,
      message: 'Bug report created successfully'
    });
  } catch (error) {
    console.error('❌ [BugReport] Error creating report:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.issues
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Получение списка отчетов с фильтрацией
export const getBugReports = async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      deviceId,
      severity,
      resolved,
      errorType,
      branchType,
      userEmail,
      page = '1',
      limit = '50',
      days
    } = req.query;

    // Построение фильтров
    const where: any = {};

    if (deviceId) where.deviceId = deviceId as string;
    if (severity) where.severity = severity as string;
    if (resolved !== undefined) where.isResolved = resolved === 'true';
    if (errorType) where.errorType = errorType as string;
    if (branchType) where.branchType = branchType as string;
    if (userEmail) where.userEmail = userEmail as string;

    // Фильтр по дням
    if (days) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(days as string));
      where.createdAt = { gte: daysAgo };
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Получаем отчеты с пагинацией
    const [bugReports, total] = await Promise.all([
      prisma.bugReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.bugReport.count({ where })
    ]);

    return res.json({
      success: true,
      data: bugReports,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('❌ [BugReport] Error getting reports:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Получение статистики ошибок
export const getBugReportStatistics = async (req: Request, res: Response): Promise<any> => {
  try {
    const { deviceId, days = '7' } = req.query;
    
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days as string));

    const where: any = {
      createdAt: { gte: daysAgo }
    };

    if (deviceId) where.deviceId = deviceId as string;

    // Общее количество ошибок
    const totalErrors = await prisma.bugReport.count({ where });

    // Ошибки по типам
    const errorsByType = await prisma.bugReport.groupBy({
      by: ['errorType'],
      where,
      _count: { errorType: true }
    });

    // Ошибки по серьезности
    const errorsBySeverity = await prisma.bugReport.groupBy({
      by: ['severity'],
      where,
      _count: { severity: true }
    });

    // Ошибки по дням
    const errorsByDay = await prisma.bugReport.groupBy({
      by: ['createdAt'],
      where,
      _count: { createdAt: true }
    });

    // Самые частые ошибки
    const mostCommonErrors = await prisma.bugReport.groupBy({
      by: ['errorMessage'],
      where,
      _count: { errorMessage: true },
      orderBy: { _count: { errorMessage: 'desc' } },
      take: 10
    });

    // Статистика по решению
    const resolvedCount = await prisma.bugReport.count({
      where: { ...where, isResolved: true }
    });

    const resolutionRate = totalErrors > 0 ? resolvedCount / totalErrors : 0;

    // Среднее время решения (в часах)
    const resolvedReports = await prisma.bugReport.findMany({
      where: { ...where, isResolved: true, resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true }
    });

    const averageResolutionTime = resolvedReports.length > 0
      ? resolvedReports.reduce((sum, report) => {
          const resolutionTime = report.resolvedAt!.getTime() - report.createdAt.getTime();
          return sum + (resolutionTime / (1000 * 60 * 60)); // в часах
        }, 0) / resolvedReports.length
      : 0;

    // Форматируем данные по дням
    const errorsByDayFormatted: Record<string, number> = {};
    errorsByDay.forEach(item => {
      const date = item.createdAt.toISOString().split('T')[0];
      errorsByDayFormatted[date] = item._count.createdAt;
    });

    // Статистика по MAC адресам (только для отчетов с MAC информацией)
    const reportsWithMac = await prisma.bugReport.findMany({
      where: {
        ...where,
        additionalData: {
          path: ['macAddress'],
          not: null
        }
      },
      select: {
        additionalData: true,
        deviceId: true,
        deviceModel: true,
        deviceManufacturer: true
      }
    });

    // Анализируем MAC методы
    const macMethods: Record<string, number> = {};
    const realMacCount = { real: 0, pseudo: 0 };
    const deviceMacStats: Record<string, { real: number, pseudo: number, methods: Record<string, number> }> = {};

    reportsWithMac.forEach(report => {
      const macInfo = report.additionalData as any;
      if (macInfo?.macMethod) {
        macMethods[macInfo.macMethod] = (macMethods[macInfo.macMethod] || 0) + 1;
        
        if (macInfo.isRealMac === 'true') {
          realMacCount.real++;
        } else if (macInfo.isPseudoMac === 'true') {
          realMacCount.pseudo++;
        }

        // Статистика по устройствам
        const deviceKey = `${report.deviceManufacturer || 'Unknown'} ${report.deviceModel || 'Unknown'}`;
        if (!deviceMacStats[deviceKey]) {
          deviceMacStats[deviceKey] = { real: 0, pseudo: 0, methods: {} };
        }
        
        if (macInfo.isRealMac === 'true') {
          deviceMacStats[deviceKey].real++;
        } else if (macInfo.isPseudoMac === 'true') {
          deviceMacStats[deviceKey].pseudo++;
        }
        
        deviceMacStats[deviceKey].methods[macInfo.macMethod] = 
          (deviceMacStats[deviceKey].methods[macInfo.macMethod] || 0) + 1;
      }
    });

    const statistics = {
      totalErrors,
      errorsByType: errorsByType.reduce((acc, item) => {
        acc[item.errorType] = item._count.errorType;
        return acc;
      }, {} as Record<string, number>),
      errorsBySeverity: errorsBySeverity.reduce((acc, item) => {
        acc[item.severity] = item._count.severity;
        return acc;
      }, {} as Record<string, number>),
      errorsByDay: errorsByDayFormatted,
      mostCommonErrors: mostCommonErrors.map(item => ({
        message: item.errorMessage,
        count: item._count.errorMessage
      })),
      averageResolutionTime: Math.round(averageResolutionTime * 100) / 100,
      resolutionRate: Math.round(resolutionRate * 100) / 100,
      
      // Новая статистика по MAC адресам
      macStatistics: {
        totalReportsWithMac: reportsWithMac.length,
        realMacCount: realMacCount.real,
        pseudoMacCount: realMacCount.pseudo,
        macMethods: macMethods,
        deviceMacStats: deviceMacStats,
        pseudoMacRate: reportsWithMac.length > 0 
          ? Math.round((realMacCount.pseudo / reportsWithMac.length) * 100) / 100 
          : 0
      }
    };

    return res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('❌ [BugReport] Error getting statistics:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Отметка отчета как решенного
export const resolveBugReport = async (req: Request, res: Response): Promise<any> => {
  try {
    const validatedData = resolveBugReportSchema.parse(req.body);
    
    const bugReport = await prisma.bugReport.update({
      where: { id: validatedData.reportId },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: validatedData.resolvedBy,
        resolutionNotes: validatedData.resolutionNotes
      }
    });

    console.log(`✅ [BugReport] Resolved report ${bugReport.id}`);

    return res.json({
      success: true,
      data: bugReport,
      message: 'Bug report resolved successfully'
    });
  } catch (error) {
    console.error('❌ [BugReport] Error resolving report:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.issues
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Получение отчета по ID
export const getBugReportById = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    const bugReport = await prisma.bugReport.findUnique({
      where: { id }
    });

    if (!bugReport) {
      return res.status(404).json({
        success: false,
        error: 'Bug report not found'
      });
    }

    return res.json({
      success: true,
      data: bugReport
    });
  } catch (error) {
    console.error('❌ [BugReport] Error getting report by ID:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Получение отчетов по устройству
export const getBugReportsByDevice = async (req: Request, res: Response): Promise<any> => {
  try {
    const { deviceId } = req.params;
    const { limit = '20' } = req.query;

    const bugReports = await prisma.bugReport.findMany({
      where: { deviceId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string)
    });

    return res.json({
      success: true,
      data: bugReports
    });
  } catch (error) {
    console.error('❌ [BugReport] Error getting reports by device:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};
