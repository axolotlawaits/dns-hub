import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';

// Проверка роли DEVELOPER
const checkDeveloperRole = async (req: Request, res: Response): Promise<boolean> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
      return false;
    }

    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { role: true }
    });

    if (!user || user.role !== 'DEVELOPER') {
      res.status(403).json({
        success: false,
        error: 'Доступ запрещен. Требуется роль DEVELOPER'
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error checking developer role:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
    return false;
  }
};

// Получить логи аудита
export const getAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const hasAccess = await checkDeveloperRole(req, res);
    if (!hasAccess) return;

    const {
      page = '1',
      limit = '50',
      userId,
      action,
      entityType,
      startDate,
      endDate,
      search
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Формируем фильтры
    const where: any = {};

    if (userId) {
      where.userId = userId as string;
    }

    if (action) {
      where.action = action as string;
    }

    if (entityType) {
      where.entityType = entityType as string;
    }

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.timestamp.lte = new Date(endDate as string);
      }
    }

    if (search) {
      where.OR = [
        { userEmail: { contains: search as string, mode: 'insensitive' } },
        { action: { contains: search as string, mode: 'insensitive' } },
        { entityType: { contains: search as string, mode: 'insensitive' } },
        { entityId: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    // Получаем логи с пагинацией
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: {
          timestamp: 'desc'
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true
            }
          }
        }
      }),
      prisma.auditLog.count({ where })
    ]);

    // Статистика по действиям
    const actionStats = await prisma.auditLog.groupBy({
      by: ['action'],
      where,
      _count: true,
      orderBy: {
        _count: {
          action: 'desc'
        }
      }
    });

    // Статистика по типам сущностей
    const entityStats = await prisma.auditLog.groupBy({
      by: ['entityType'],
      where,
      _count: true,
      orderBy: {
        _count: {
          entityType: 'desc'
        }
      }
    });

    res.json({
      logs: logs.map(log => ({
        id: log.id,
        userId: log.userId,
        userEmail: log.userEmail || log.user.email,
        userRole: log.user.role,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        details: log.details,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        timestamp: log.timestamp
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      stats: {
        actions: actionStats.map(s => ({
          action: s.action,
          count: s._count.action
        })),
        entities: entityStats.map(s => ({
          entityType: s.entityType,
          count: s._count.entityType
        }))
      }
    });
  } catch (error) {
    console.error('❌ Ошибка при получении логов аудита:', error);
    next(error);
  }
};

// Получить статистику аудита
export const getAuditStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const hasAccess = await checkDeveloperRole(req, res);
    if (!hasAccess) return;

    const { period = '7d' } = req.query;

    const now = new Date();
    let startDate: Date;
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Активность по дням
    const dailyActivity = await prisma.auditLog.findMany({
      where: {
        timestamp: {
          gte: startDate
        }
      },
      select: {
        timestamp: true,
        action: true
      }
    });

    // Группируем по дням
    const activityByDay: Record<string, { total: number; byAction: Record<string, number> }> = {};
    dailyActivity.forEach(log => {
      const date = log.timestamp.toISOString().split('T')[0];
      if (!activityByDay[date]) {
        activityByDay[date] = { total: 0, byAction: {} };
      }
      activityByDay[date].total++;
      activityByDay[date].byAction[log.action] = (activityByDay[date].byAction[log.action] || 0) + 1;
    });

    // Топ активных пользователей
    const topUsers = await prisma.auditLog.groupBy({
      by: ['userId'],
      where: {
        timestamp: {
          gte: startDate
        }
      },
      _count: true,
      orderBy: {
        _count: {
          userId: 'desc'
        }
      },
      take: 10
    });

    const usersWithDetails = await Promise.all(
      topUsers.map(async (userLog) => {
        const user = await prisma.user.findUnique({
          where: { id: userLog.userId },
          select: { email: true, role: true }
        });
        return {
          userId: userLog.userId,
          email: user?.email || 'Unknown',
          role: user?.role || 'UNKNOWN',
          actionCount: userLog._count.userId
        };
      })
    );

    res.json({
      period,
      startDate,
      dailyActivity,
      topUsers: usersWithDetails,
      totalActions: dailyActivity.length
    });
  } catch (error) {
    console.error('❌ Ошибка при получении статистики аудита:', error);
    next(error);
  }
};

