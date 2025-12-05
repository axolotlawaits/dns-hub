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

// Получить общую статистику
export const getAnalytics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const hasAccess = await checkDeveloperRole(req, res);
    if (!hasAccess) return;

    const { period = '7d' } = req.query; // 7d, 30d, 90d, 1y, all
    
    // Вычисляем дату начала периода
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
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0); // Все время
    }

    // Статистика пользователей
    const totalUsers = await prisma.user.count();
    const activeUsers = await prisma.user.count({
      where: {
        updatedAt: {
          gte: startDate
        }
      }
    });
    const usersByRole = await prisma.user.groupBy({
      by: ['role'],
      _count: true
    });

    // Статистика уведомлений
    const totalNotifications = await prisma.notifications.count({
      where: {
        createdAt: {
          gte: startDate
        }
      }
    });
    const unreadNotifications = await prisma.notifications.count({
      where: {
        read: false,
        createdAt: {
          gte: startDate
        }
      }
    });
    const notificationsByType = await prisma.notifications.groupBy({
      by: ['type'],
      where: {
        createdAt: {
          gte: startDate
        }
      },
      _count: true
    });

    // Статистика обратной связи
    const totalFeedback = await prisma.feedback.count({
      where: {
        createdAt: {
          gte: startDate
        }
      }
    });
    const feedbackByStatus = await prisma.feedback.groupBy({
      by: ['status'],
      where: {
        createdAt: {
          gte: startDate
        }
      },
      _count: true
    });

    // Статистика отчетов об ошибках
    const totalBugReports = await prisma.bugReport.count({
      where: {
        createdAt: {
          gte: startDate
        }
      }
    });
    const bugReportsBySeverity = await prisma.bugReport.groupBy({
      by: ['severity'],
      where: {
        createdAt: {
          gte: startDate
        }
      },
      _count: true
    });
    const resolvedBugReports = await prisma.bugReport.count({
      where: {
        isResolved: true,
        createdAt: {
          gte: startDate
        }
      }
    });

    // Статистика активности по дням (последние 30 дней)
    const dailyActivity = await prisma.user.findMany({
      where: {
        updatedAt: {
          gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        }
      },
      select: {
        updatedAt: true
      }
    });

    // Группируем по дням
    const activityByDay: Record<string, number> = {};
    dailyActivity.forEach(user => {
      const date = user.updatedAt.toISOString().split('T')[0];
      activityByDay[date] = (activityByDay[date] || 0) + 1;
    });

    // Статистика по инструментам (популярные инструменты)
    const toolAccessCounts = await prisma.userToolAccess.groupBy({
      by: ['toolId'],
      _count: {
        toolId: true
      },
      orderBy: {
        _count: {
          toolId: 'desc'
        }
      },
      take: 10
    });

    const toolsWithNames = await Promise.all(
      toolAccessCounts.map(async (access) => {
        const tool = await prisma.tool.findUnique({
          where: { id: access.toolId },
          select: { name: true, link: true }
        });
        return {
          toolId: access.toolId,
          toolName: tool?.name || 'Unknown',
          toolLink: tool?.link || '',
          accessCount: access._count.toolId
        };
      })
    );

    // Статистика по филиалам
    const totalBranches = await prisma.branch.count();
    const usersByBranch = await prisma.userData.groupBy({
      by: ['branch_uuid'],
      _count: {
        branch_uuid: true
      },
      orderBy: {
        _count: {
          branch_uuid: 'desc'
        }
      },
      take: 10
    });

    const branchesWithNames = await Promise.all(
      usersByBranch.map(async (branchData) => {
        const branch = await prisma.branch.findUnique({
          where: { uuid: branchData.branch_uuid },
          select: { name: true, city: true }
        });
        return {
          branchId: branchData.branch_uuid,
          branchName: branch?.name || 'Unknown',
          city: branch?.city || '',
          userCount: branchData._count.branch_uuid
        };
      })
    );

    res.json({
      period,
      startDate,
      users: {
        total: totalUsers,
        active: activeUsers,
        byRole: usersByRole.map(r => ({
          role: r.role,
          count: r._count
        }))
      },
      notifications: {
        total: totalNotifications,
        unread: unreadNotifications,
        byType: notificationsByType.map(n => ({
          type: n.type,
          count: n._count
        }))
      },
      feedback: {
        total: totalFeedback,
        byStatus: feedbackByStatus.map(f => ({
          status: f.status,
          count: f._count
        }))
      },
      bugReports: {
        total: totalBugReports,
        resolved: resolvedBugReports,
        unresolved: totalBugReports - resolvedBugReports,
        bySeverity: bugReportsBySeverity.map(b => ({
          severity: b.severity,
          count: b._count
        }))
      },
      activity: {
        daily: activityByDay
      },
      popularTools: toolsWithNames,
      branches: {
        total: totalBranches,
        topByUsers: branchesWithNames
      }
    });
  } catch (error) {
    console.error('❌ Ошибка при получении аналитики:', error);
    next(error);
  }
};

// Получить детальную статистику по инструментам
export const getToolAnalytics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const hasAccess = await checkDeveloperRole(req, res);
    if (!hasAccess) return;

    const { toolId } = req.params;
    const { period = '30d' } = req.query;

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
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const tool = await prisma.tool.findUnique({
      where: { id: toolId },
      include: {
        userToolAccesses: true,
        groupToolAccesses: true,
        positionToolAccesses: true
      }
    });

    if (!tool) {
      res.status(404).json({ error: 'Инструмент не найден' });
      return;
    }

    res.json({
      tool: {
        id: tool.id,
        name: tool.name,
        link: tool.link
      },
      access: {
        users: tool.userToolAccesses.length,
        groups: tool.groupToolAccesses.length,
        positions: tool.positionToolAccesses.length
      },
      period,
      startDate
    });
  } catch (error) {
    console.error('❌ Ошибка при получении аналитики инструмента:', error);
    next(error);
  }
};

