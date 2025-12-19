import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { trassirService } from '../../controllers/app/trassirService.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = Router();

// Middleware для проверки роли ADMIN или DEVELOPER
const requireAdminOrDeveloper = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { role: true }
    });

    if (!user || !['ADMIN', 'DEVELOPER'].includes(user.role || '')) {
      return res.status(403).json({ error: 'Доступ запрещен. Требуется роль ADMIN или DEVELOPER' });
    }
    
    (req as any).user = user;
    next();
  } catch (error) {
    console.error('[Trassir] Error checking role:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Применяем middleware ко всем роутам: сначала аутентификация, потом проверка роли
router.use(authenticateToken);
router.use(requireAdminOrDeveloper);

// Получить список дверей для веб-интерфейса (все нужные)
router.get('/doors', async (req, res) => {
  try {
    const allPoints = await trassirService.getAllAccessPoints();
    // Фильтруем только нужные двери (ID 13-28)
    const webDoorIds = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28];
    const doors = allPoints
      .filter((p: any) => webDoorIds.includes(p.id))
      .map((p: any) => ({ id: p.id, name: p.name }));
    res.json(doors);
  } catch (error) {
    console.error('[Trassir Routes] Error getting doors:', error);
    res.status(500).json({ error: 'Failed to get doors' });
  }
});

// Получить ВСЕ точки доступа (без фильтрации)
router.get('/all-access-points', async (req, res) => {
  try {
    const points = await trassirService.getAllAccessPoints();
    res.json(points);
  } catch (error) {
    console.error('[Trassir Routes] Error getting all access points:', error);
    res.status(500).json({ error: 'Failed to get access points' });
  }
});

// Открыть дверь
router.post('/doors/:doorId/open', async (req, res) => {
  try {
    const doorId = parseInt(req.params.doorId);
    // Получаем имя пользователя из JWT токена (req.user устанавливается middleware auth)
    const user = (req as any).user;
    const personName = user?.name || 'Web UI';
    const opened = await trassirService.openDoor(doorId, personName);
    res.json({ opened });
  } catch (error) {
    console.error('[Trassir Routes] Error opening door:', error);
    res.status(500).json({ error: 'Failed to open door' });
  }
});

// Получить статистику открытий с фильтрами
router.get('/stats', async (req, res) => {
  try {
    const { period, door, user } = req.query;
    
    let dateFilter = {};
    if (period) {
      const now = new Date();
      let startDate: Date;
      switch (period) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          startDate = new Date(0);
      }
      dateFilter = { openedAt: { gte: startDate } };
    }

    const logs = await prisma.trassirDoorLog.findMany({
      where: {
        ...dateFilter,
        ...(door ? { doorName: String(door) } : {}),
        ...(user ? { personName: { contains: String(user) } } : {})
      },
      orderBy: { openedAt: 'desc' },
      take: 500
    });
    res.json(logs);
  } catch (error) {
    console.error('[Trassir Routes] Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Агрегированная статистика для графиков
router.get('/stats/aggregated', async (req, res) => {
  try {
    const { period } = req.query;
    
    let startDate = new Date(0);
    const now = new Date();
    
    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    const logs = await prisma.trassirDoorLog.findMany({
      where: { openedAt: { gte: startDate } },
      orderBy: { openedAt: 'desc' }
    });

    // Группировка по дверям
    const byDoor: Record<string, number> = {};
    // Группировка по пользователям
    const byUser: Record<string, number> = {};
    // Группировка по часам (для графика)
    const byHour: Record<string, number> = {};
    // Группировка по дням
    const byDay: Record<string, number> = {};

    logs.forEach(log => {
      const doorName = log.doorName || 'Неизвестно';
      const userName = log.personName || 'Неизвестно';
      const date = new Date(log.openedAt);
      const hour = date.getHours();
      const day = date.toISOString().split('T')[0];

      byDoor[doorName] = (byDoor[doorName] || 0) + 1;
      byUser[userName] = (byUser[userName] || 0) + 1;
      byHour[hour] = (byHour[hour] || 0) + 1;
      byDay[day] = (byDay[day] || 0) + 1;
    });

    // Топ-5 дверей
    const topDoors = Object.entries(byDoor)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Топ-5 пользователей
    const topUsers = Object.entries(byUser)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Данные по часам (0-23)
    const hourlyData = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: byHour[i] || 0
    }));

    // Данные по дням
    const dailyData = Object.entries(byDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));

    res.json({
      total: logs.length,
      topDoors,
      topUsers,
      hourlyData,
      dailyData
    });
  } catch (error) {
    console.error('[Trassir Routes] Error getting aggregated stats:', error);
    res.status(500).json({ error: 'Failed to get aggregated stats' });
  }
});

// Получить список подключенных пользователей (с привязанным Telegram)
router.get('/connected-users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        telegramChatId: { not: null }
      },
      select: {
        id: true,
        name: true,
        email: true,
        telegramUsername: true,
        role: true,
        position: true,
        branch: true
      },
      orderBy: { name: 'asc' }
    });
    
    res.json(users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      telegramUsername: u.telegramUsername,
      role: u.role,
      position: u.position,
      group: u.branch
    })));
  } catch (error) {
    console.error('[Trassir Routes] Error getting connected users:', error);
    res.status(500).json({ error: 'Failed to get connected users' });
  }
});

export default router;

