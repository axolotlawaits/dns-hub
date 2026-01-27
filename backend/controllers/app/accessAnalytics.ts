import { Request, Response } from 'express';
import { prisma } from '../../server.js';

// Получить аналитику доступа
export const getAccessAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = (req as any).token;
    const userId = token?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Статистика по уровням доступа
    const accessLevelStats = await prisma.userToolAccess.groupBy({
      by: ['accessLevel'],
      _count: true
    });

    // Топ пользователей с наибольшим количеством доступов
    const topUsers = await prisma.userToolAccess.groupBy({
      by: ['userId'],
      _count: true,
      orderBy: {
        _count: {
          userId: 'desc'
        }
      },
      take: 10
    });

    const usersWithDetails = await Promise.all(
      topUsers.map(async (userAccess) => {
        const user = await prisma.user.findUnique({
          where: { id: userAccess.userId },
          select: { id: true, name: true, email: true, role: true }
        });
        return {
          userId: userAccess.userId,
          userName: user?.name || 'Unknown',
          userEmail: user?.email || 'Unknown',
          userRole: user?.role || 'UNKNOWN',
          accessCount: userAccess._count
        };
      })
    );

    // Топ инструментов с наибольшим количеством пользователей
    const topTools = await prisma.userToolAccess.groupBy({
      by: ['toolId'],
      _count: true,
      orderBy: {
        _count: {
          toolId: 'desc'
        }
      },
      take: 10
    });

    const toolsWithDetails = await Promise.all(
      topTools.map(async (toolAccess) => {
        const tool = await prisma.tool.findUnique({
          where: { id: toolAccess.toolId },
          select: { id: true, name: true, link: true }
        });
        return {
          toolId: toolAccess.toolId,
          toolName: tool?.name || 'Unknown',
          toolLink: tool?.link || '',
          userCount: toolAccess._count
        };
      })
    );

    // Распределение по типам сущностей
    const totalUserAccesses = await prisma.userToolAccess.count();
    const totalGroupAccesses = await prisma.groupToolAccess.count();
    const totalPositionAccesses = await prisma.positionToolAccess.count();

    // Временные доступы (пока не доступны до миграции Prisma)
    let temporaryAccesses = 0;
    let expiredTemporaryAccesses = 0;
    let activeTemporaryAccesses = 0;
    
    try {
      // Пытаемся получить временные доступы, если поля существуют
      // Используем прямой SQL запрос или проверяем наличие полей
      const allUserAccesses = await prisma.userToolAccess.findMany({
        select: { id: true }
      });
      
      // Если запрос прошел успешно, пытаемся получить временные доступы
      // Но пока используем значения по умолчанию, так как поля могут быть еще не в БД
      temporaryAccesses = 0;
      expiredTemporaryAccesses = 0;
      activeTemporaryAccesses = 0;
    } catch (error: any) {
      // Если произошла ошибка, используем значения по умолчанию
      console.warn('[getAccessAnalytics] Could not fetch temporary access stats:', error?.message || error);
    }

    res.status(200).json({
      accessLevelDistribution: accessLevelStats.map(stat => ({
        level: stat.accessLevel,
        count: stat._count
      })),
      topUsers: usersWithDetails,
      topTools: toolsWithDetails,
      entityDistribution: {
        user: totalUserAccesses,
        group: totalGroupAccesses,
        position: totalPositionAccesses,
        total: totalUserAccesses + totalGroupAccesses + totalPositionAccesses
      },
      temporaryAccesses: {
        total: temporaryAccesses,
        active: activeTemporaryAccesses,
        expired: expiredTemporaryAccesses
      }
    });
  } catch (error) {
    console.error('Error fetching access analytics:', error);
    res.status(500).json({ error: 'Failed to fetch access analytics' });
  }
};
