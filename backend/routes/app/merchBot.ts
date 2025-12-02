import express from 'express';
import { prisma } from '../../server.js';
import { authenticateToken } from '../../middleware/auth.js';
import uploadFeedback from '../../middleware/uploaderFeedback.js';

const router = express.Router();

// Маршрут для проверки статуса Merch бота
router.get('/bot-status', async (req: any, res: any) => {
  try {
    console.log('🔍 [Routes] Проверяем статус Merch бота...');
    const { merchBotService } = await import('../../controllers/app/merchBot.js');
    console.log('✅ [Routes] Импорт успешен');
    const service = merchBotService;
    console.log('✅ [Routes] Получен экземпляр сервиса');
    const status = service.status;
    console.log('✅ [Routes] Получен статус:', status);
    
    res.json({
      bot_status: status,
      environment: {
        hasToken: !!process.env.MERCH_BOT_TOKEN,
        hasBotName: !!process.env.MERCH_BOT_NAME,
        tokenPreview: process.env.MERCH_BOT_TOKEN ? 
          `${process.env.MERCH_BOT_TOKEN.substring(0, 10)}...` : 'Not set',
        botName: process.env.MERCH_BOT_NAME || 'Not set'
      }
    });
  } catch (error) {
    console.error('MerchBot status check error:', error);
    res.status(500).json({ error: 'Failed to check MerchBot status' });
  }
});

// Маршрут для запуска Merch бота
router.post('/bot-start', async (req: any, res: any) => {
  try {
    const { merchBotService } = await import('../../controllers/app/merchBot.js');
    
    const success = await merchBotService.launch();
    
    if (success) {
      res.json({ success: true, message: 'MerchBot started successfully' });
    } else {
      res.status(500).json({ success: false, message: 'MerchBot start failed' });
    }
  } catch (error) {
    console.error('MerchBot start error:', error);
    res.status(500).json({ error: 'Failed to start MerchBot' });
  }
});

// Маршрут для остановки Merch бота
router.post('/bot-stop', async (req: any, res: any) => {
  try {
    const { merchBotService } = await import('../../controllers/app/merchBot.js');
    
    await merchBotService.stop();
    
    res.json({ success: true, message: 'MerchBot stopped successfully' });
  } catch (error) {
    console.error('MerchBot stop error:', error);
    res.status(500).json({ error: 'Failed to stop MerchBot' });
  }
});

// Маршрут для перезапуска Merch бота
router.post('/bot-restart', async (req: any, res: any) => {
  try {
    const { merchBotService } = await import('../../controllers/app/merchBot.js');
    
    const success = await merchBotService.restart();
    
    if (success) {
      res.json({ success: true, message: 'MerchBot restarted successfully' });
    } else {
      res.status(500).json({ success: false, message: 'MerchBot restart failed' });
    }
  } catch (error) {
    console.error('MerchBot restart error:', error);
    res.status(500).json({ error: 'Failed to restart MerchBot' });
  }
});

// Маршрут для принудительного обновления кэша
router.post('/cache-refresh', async (req: any, res: any) => {
  try {
    const { merchBotService } = await import('../../controllers/app/merchBot.js');
    
    const success = await merchBotService.refreshCache();
    
    if (success) {
      res.json({ success: true, message: 'Cache refreshed successfully' });
    } else {
      res.status(500).json({ success: false, message: 'Cache refresh failed' });
    }
  } catch (error) {
    console.error('MerchBot cache refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh cache' });
  }
});

// Маршрут для получения статистики Merch бота
router.get('/stats', async (req: any, res: any) => {
  try {
    console.log('📊 [MerchBot Stats] Запрос статистики');
    const { period = '30' } = req.query; // По умолчанию 30 дней
    const days = parseInt(period as string, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Общее количество пользователей
    const totalUsers = await prisma.merchTgUser.count();

    // Активные пользователи за период
    const activeUsers = await prisma.merchTgUserStats.findMany({
      where: {
        timestamp: { gte: startDate }
      },
      select: {
        userId: true
      },
      distinct: ['userId']
    });

    // Активные пользователи сегодня
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const activeUsersToday = await prisma.merchTgUserStats.findMany({
      where: {
        timestamp: { gte: todayStart }
      },
      select: {
        userId: true
      },
      distinct: ['userId']
    });

    // Активные пользователи за неделю
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const activeUsersWeek = await prisma.merchTgUserStats.findMany({
      where: {
        timestamp: { gte: weekStart }
      },
      select: {
        userId: true
      },
      distinct: ['userId']
    });

    // Активные пользователи за месяц
    const monthStart = new Date();
    monthStart.setDate(monthStart.getDate() - 30);
    const activeUsersMonth = await prisma.merchTgUserStats.findMany({
      where: {
        timestamp: { gte: monthStart }
      },
      select: {
        userId: true
      },
      distinct: ['userId']
    });

    // Статистика по действиям
    const actionStats = await prisma.merchTgUserStats.groupBy({
      by: ['action'],
      where: {
        timestamp: { gte: startDate }
      },
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      }
    });

    // Популярные кнопки (button_click с деталями)
    const buttonClicks = await prisma.merchTgUserStats.findMany({
      where: {
        action: 'button_click',
        timestamp: { gte: startDate },
        details: { not: null }
      },
      select: {
        details: true
      }
    });

    const buttonCounts: Record<string, number> = {};
    buttonClicks.forEach(click => {
      if (click.details) {
        buttonCounts[click.details] = (buttonCounts[click.details] || 0) + 1;
      }
    });

    const popularButtons = Object.entries(buttonCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Статистика по реакциям на сообщения
    const reactions = await prisma.merchTgUserStats.findMany({
      where: {
        action: 'message_reaction',
        timestamp: { gte: startDate },
        details: { not: null }
      },
      select: {
        details: true,
        timestamp: true
      }
    });

    const reactionCounts: Record<string, number> = {};
    const reactionsByMessage: Record<string, {
      messageId: number;
      chatId: number;
      reactions: Array<{ emoji: string; count: number; lastReaction: Date }>;
      totalReactions: number;
    }> = {};

    reactions.forEach(reaction => {
      if (reaction.details) {
        try {
          const parsed = JSON.parse(reaction.details);
          const emoji = parsed.emoji || 'unknown';
          const messageId = parsed.messageId;
          const chatId = parsed.chatId;
          
          // Подсчет по эмодзи
          reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
          
          // Подсчет по сообщениям
          if (messageId && chatId) {
            const messageKey = `${chatId}_${messageId}`;
            if (!reactionsByMessage[messageKey]) {
              reactionsByMessage[messageKey] = {
                messageId,
                chatId,
                reactions: [],
                totalReactions: 0
              };
            }
            
            const messageReactions = reactionsByMessage[messageKey].reactions;
            const existingReaction = messageReactions.find(r => r.emoji === emoji);
            if (existingReaction) {
              existingReaction.count++;
              if (reaction.timestamp > existingReaction.lastReaction) {
                existingReaction.lastReaction = reaction.timestamp;
              }
            } else {
              messageReactions.push({
                emoji,
                count: 1,
                lastReaction: reaction.timestamp
              });
            }
            reactionsByMessage[messageKey].totalReactions++;
          }
        } catch (e) {
          // Игнорируем ошибки парсинга
        }
      }
    });

    const popularReactions = Object.entries(reactionCounts)
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Статистика по карточкам (какие карточки получили больше всего реакций)
    const reactionsByCard: Record<string, {
      itemId: string;
      itemName: string;
      itemType: 'card' | 'category';
      totalReactions: number;
      reactions: Record<string, number>;
    }> = {};

    reactions.forEach(reaction => {
      if (reaction.details) {
        try {
          const parsed = JSON.parse(reaction.details);
          if (parsed.itemId && parsed.itemName) {
            const itemKey = parsed.itemId;
            if (!reactionsByCard[itemKey]) {
              reactionsByCard[itemKey] = {
                itemId: parsed.itemId,
                itemName: parsed.itemName,
                itemType: parsed.itemType || 'card',
                totalReactions: 0,
                reactions: {}
              };
            }
            reactionsByCard[itemKey].totalReactions++;
            const emoji = parsed.emoji || 'unknown';
            reactionsByCard[itemKey].reactions[emoji] = (reactionsByCard[itemKey].reactions[emoji] || 0) + 1;
          }
        } catch (e) {
          // Игнорируем ошибки парсинга
        }
      }
    });

    const topCardsByReactions = Object.values(reactionsByCard)
      .sort((a, b) => b.totalReactions - a.totalReactions)
      .slice(0, 20)
      .map(card => ({
        itemId: card.itemId,
        itemName: card.itemName,
        itemType: card.itemType,
        totalReactions: card.totalReactions,
        topReactions: Object.entries(card.reactions)
          .map(([emoji, count]) => ({ emoji, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
      }));

    // Топ сообщений по количеству реакций с информацией о карточках
    const topMessages = await Promise.all(
      Object.values(reactionsByMessage)
        .sort((a, b) => b.totalReactions - a.totalReactions)
        .slice(0, 20)
        .map(async (msg) => {
          // Ищем информацию о карточке для этого сообщения
          // Ищем событие card_sent с этим messageId и chatId
          let cardInfo: { itemId: string; itemName: string; itemType: 'card' | 'category' } | null = null;
          
          try {
            const cardSentEvent = await prisma.merchTgUserStats.findFirst({
              where: {
                action: 'card_sent',
                details: {
                  contains: `"messageId":${msg.messageId}`
                }
              },
              orderBy: {
                timestamp: 'desc'
              }
            });

            if (cardSentEvent && cardSentEvent.details) {
              try {
                const parsed = JSON.parse(cardSentEvent.details);
                if (parsed.chatId === msg.chatId && parsed.messageId === msg.messageId) {
                  cardInfo = {
                    itemId: parsed.itemId,
                    itemName: parsed.itemName,
                    itemType: parsed.itemType
                  };
                }
              } catch (parseError) {
                // Игнорируем ошибки парсинга
              }
            }
          } catch (dbError) {
            // Игнорируем ошибки БД
          }

          return {
            messageId: msg.messageId,
            chatId: msg.chatId,
            totalReactions: msg.totalReactions,
            reactions: msg.reactions.sort((a, b) => b.count - a.count),
            cardInfo: cardInfo ? {
              itemId: cardInfo.itemId,
              itemName: cardInfo.itemName,
              itemType: cardInfo.itemType
            } : null
          };
        })
    );

    // Популярные поисковые запросы
    const searches = await prisma.merchTgUserStats.findMany({
      where: {
        action: 'search',
        timestamp: { gte: startDate },
        details: { not: null }
      },
      select: {
        details: true
      }
    });

    const searchCounts: Record<string, number> = {};
    searches.forEach(search => {
      if (search.details) {
        searchCounts[search.details] = (searchCounts[search.details] || 0) + 1;
      }
    });

    const popularSearches = Object.entries(searchCounts)
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Статистика по обратной связи
    const feedbackStats = await prisma.merchTgUserStats.count({
      where: {
        action: 'feedback',
        timestamp: { gte: startDate }
      }
    });

    // Статистика по дням
    const dailyStatsRaw = await prisma.merchTgUserStats.findMany({
      where: {
        timestamp: { gte: startDate }
      },
      select: {
        timestamp: true,
        action: true,
        userId: true
      }
    });

    const dailyStats: Record<string, {
      date: string;
      totalActions: number;
      uniqueUsers: number;
      actions: Record<string, number>;
    }> = {};

    dailyStatsRaw.forEach(stat => {
      const date = stat.timestamp.toISOString().split('T')[0];
      if (!dailyStats[date]) {
        dailyStats[date] = {
          date,
          totalActions: 0,
          uniqueUsers: new Set<string>().size,
          actions: {}
        };
      }
      dailyStats[date].totalActions++;
      if (!dailyStats[date].actions[stat.action]) {
        dailyStats[date].actions[stat.action] = 0;
      }
      dailyStats[date].actions[stat.action]++;
    });

    // Добавляем уникальных пользователей по дням
    const dailyUsers: Record<string, Set<string>> = {};
    dailyStatsRaw.forEach(stat => {
      const date = stat.timestamp.toISOString().split('T')[0];
      if (!dailyUsers[date]) {
        dailyUsers[date] = new Set();
      }
      dailyUsers[date].add(stat.userId);
    });

    Object.keys(dailyStats).forEach(date => {
      dailyStats[date].uniqueUsers = dailyUsers[date]?.size || 0;
    });

    // Статистика по часам
    const hourlyStats: Record<number, number> = {};
    dailyStatsRaw.forEach(stat => {
      const hour = stat.timestamp.getHours();
      hourlyStats[hour] = (hourlyStats[hour] || 0) + 1;
    });

    // Топ активных пользователей
    const topUsersRaw = await prisma.merchTgUserStats.groupBy({
      by: ['userId'],
      where: {
        timestamp: { gte: startDate }
      },
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: 20
    });

    const topUsers = await Promise.all(
      topUsersRaw.map(async (userStat) => {
        const user = await prisma.merchTgUser.findUnique({
          where: { id: userStat.userId },
          select: {
            userId: true,
            username: true,
            firstName: true,
            lastName: true,
            createdAt: true
          }
        });
        return {
          userId: user?.userId || 0,
          username: user?.username || 'Unknown',
          firstName: user?.firstName || '',
          lastName: user?.lastName || '',
          actionsCount: userStat._count.id,
          registeredAt: user?.createdAt || null
        };
      })
    );

    // Статистика по категориям (кнопки с названиями категорий)
    const categoryClicks = popularButtons.filter(btn => 
      !['start', 'search', 'back', 'main_menu', 'more_categories', 'feedback'].includes(btn.name)
    );

    // Новые пользователи за период
    const newUsers = await prisma.merchTgUser.count({
      where: {
        createdAt: { gte: startDate }
      }
    });

    // Общее количество действий за период
    const totalActions = await prisma.merchTgUserStats.count({
      where: {
        timestamp: { gte: startDate }
      }
    });

    // Среднее количество действий на пользователя
    const avgActionsPerUser = activeUsers.length > 0 ? (totalActions / activeUsers.length) : 0;

    // Статистика по дням недели
    const weekdayStats: Record<number, number> = {};
    dailyStatsRaw.forEach(stat => {
      const weekday = stat.timestamp.getDay(); // 0 = воскресенье, 1 = понедельник, и т.д.
      weekdayStats[weekday] = (weekdayStats[weekday] || 0) + 1;
    });

    // Статистика по времени суток (утро 6-12, день 12-18, вечер 18-24, ночь 0-6)
    const timeOfDayStats = {
      morning: 0,   // 6-12
      afternoon: 0, // 12-18
      evening: 0,  // 18-24
      night: 0     // 0-6
    };
    dailyStatsRaw.forEach(stat => {
      const hour = stat.timestamp.getHours();
      if (hour >= 6 && hour < 12) timeOfDayStats.morning++;
      else if (hour >= 12 && hour < 18) timeOfDayStats.afternoon++;
      else if (hour >= 18 && hour < 24) timeOfDayStats.evening++;
      else timeOfDayStats.night++;
    });

    // Статистика по длине поисковых запросов
    const searchLengthStats = {
      short: 0,    // 1-5 символов
      medium: 0,  // 6-15 символов
      long: 0     // 16+ символов
    };
    searches.forEach(search => {
      if (search.details) {
        const length = search.details.length;
        if (length <= 5) searchLengthStats.short++;
        else if (length <= 15) searchLengthStats.medium++;
        else searchLengthStats.long++;
      }
    });

    // Статистика по сессиям (группировка действий по пользователям и времени)
    // Сессия = действия пользователя в течение 30 минут
    const sessionStats: Record<string, { userId: string; startTime: Date; endTime: Date; actions: number }> = {};
    const userActions = await prisma.merchTgUserStats.findMany({
      where: {
        timestamp: { gte: startDate }
      },
      select: {
        userId: true,
        timestamp: true,
        action: true
      },
      orderBy: {
        timestamp: 'asc'
      }
    });

    // Группируем действия по сессиям (30 минут между действиями = новая сессия)
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 минут в миллисекундах
    const sessions: Array<{ userId: string; startTime: Date; endTime: Date; actions: number; actionsList: string[] }> = [];
    
    userActions.forEach(action => {
      const lastSession = sessions[sessions.length - 1];
      if (lastSession && 
          lastSession.userId === action.userId && 
          (action.timestamp.getTime() - lastSession.endTime.getTime()) < SESSION_TIMEOUT) {
        // Продолжаем текущую сессию
        lastSession.endTime = action.timestamp;
        lastSession.actions++;
        lastSession.actionsList.push(action.action);
      } else {
        // Начинаем новую сессию
        sessions.push({
          userId: action.userId,
          startTime: action.timestamp,
          endTime: action.timestamp,
          actions: 1,
          actionsList: [action.action]
        });
      }
    });

    const avgSessionDuration = sessions.length > 0
      ? sessions.reduce((sum, s) => sum + (s.endTime.getTime() - s.startTime.getTime()), 0) / sessions.length / 1000 / 60 // в минутах
      : 0;

    const avgActionsPerSession = sessions.length > 0
      ? sessions.reduce((sum, s) => sum + s.actions, 0) / sessions.length
      : 0;

    // Статистика по возвратам (пользователи, которые вернулись после первого использования)
    const returningUsers = await prisma.merchTgUser.findMany({
      where: {
        createdAt: { lt: startDate } // Зарегистрированы до начала периода
      },
      select: {
        id: true
      }
    });

    const returningUsersCount = await prisma.merchTgUserStats.findMany({
      where: {
        userId: { in: returningUsers.map(u => u.id) },
        timestamp: { gte: startDate }
      },
      select: {
        userId: true
      },
      distinct: ['userId']
    });

    // Воронка действий (start -> button_click -> search/feedback)
    const funnelStats = {
      started: await prisma.merchTgUserStats.count({
        where: {
          action: 'start',
          timestamp: { gte: startDate }
        }
      }),
      clickedButton: await prisma.merchTgUserStats.count({
        where: {
          action: 'button_click',
          timestamp: { gte: startDate }
        }
      }),
      searched: await prisma.merchTgUserStats.count({
        where: {
          action: 'search',
          timestamp: { gte: startDate }
        }
      }),
      gaveFeedback: await prisma.merchTgUserStats.count({
        where: {
          action: 'feedback',
          timestamp: { gte: startDate }
        }
      })
    };

    // Статистика по карточкам (какие карточки просматриваются чаще всего)
    // Карточки - это button_click с деталями, которые не являются системными кнопками
    const cardViews = popularButtons
      .filter(btn => !['start', 'search', 'back', 'main_menu', 'more_categories', 'feedback'].includes(btn.name))
      .slice(0, 15);

    // Статистика по retention (сколько пользователей вернулись через разные периоды)
    const retentionStats = {
      day1: 0,   // Вернулись на следующий день
      day7: 0,   // Вернулись через неделю
      day30: 0  // Вернулись через месяц
    };

    // Для каждого пользователя проверяем, когда он вернулся
    const userFirstAction = await prisma.merchTgUserStats.findMany({
      where: {
        timestamp: { gte: startDate }
      },
      select: {
        userId: true,
        timestamp: true
      },
      orderBy: {
        timestamp: 'asc'
      }
    });

    const userFirstActions: Record<string, Date> = {};
    userFirstAction.forEach(action => {
      if (!userFirstActions[action.userId]) {
        userFirstActions[action.userId] = action.timestamp;
      }
    });

    const userLastActions: Record<string, Date> = {};
    userFirstAction.forEach(action => {
      if (!userLastActions[action.userId] || action.timestamp > userLastActions[action.userId]) {
        userLastActions[action.userId] = action.timestamp;
      }
    });

    Object.keys(userFirstActions).forEach(userId => {
      const firstAction = userFirstActions[userId];
      const lastAction = userLastActions[userId];
      const daysDiff = (lastAction.getTime() - firstAction.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysDiff >= 1 && daysDiff < 2) retentionStats.day1++;
      else if (daysDiff >= 7 && daysDiff < 8) retentionStats.day7++;
      else if (daysDiff >= 30 && daysDiff < 31) retentionStats.day30++;
    });

    // Статистика по популярным карточкам (топ просматриваемых карточек)
    const popularCards = cardViews;

    res.json({
      period: days,
      summary: {
        totalUsers,
        activeUsers: activeUsers.length,
        activeUsersToday: activeUsersToday.length,
        activeUsersWeek: activeUsersWeek.length,
        activeUsersMonth: activeUsersMonth.length,
        newUsers,
        totalActions,
        avgActionsPerUser: Math.round(avgActionsPerUser * 100) / 100,
        feedbackRequests: feedbackStats,
        returningUsers: returningUsersCount.length,
        totalSessions: sessions.length,
        avgSessionDuration: Math.round(avgSessionDuration * 100) / 100, // в минутах
        avgActionsPerSession: Math.round(avgActionsPerSession * 100) / 100
      },
      actions: actionStats.map(stat => ({
        action: stat.action,
        count: stat._count.id
      })),
      popularButtons,
      popularSearches,
      popularReactions,
      reactionStats: {
        total: reactions.length,
        uniqueEmojis: Object.keys(reactionCounts).length,
        topReactions: popularReactions,
        topMessages: topMessages,
        messagesWithReactions: Object.keys(reactionsByMessage).length,
        topCardsByReactions: topCardsByReactions
      },
      popularCards,
      categoryClicks: categoryClicks.slice(0, 10),
      dailyStats: Object.values(dailyStats).sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      ),
      hourlyStats: Object.entries(hourlyStats)
        .map(([hour, count]) => ({ hour: parseInt(hour, 10), count }))
        .sort((a, b) => a.hour - b.hour),
      weekdayStats: Object.entries(weekdayStats)
        .map(([day, count]) => ({ 
          day: parseInt(day, 10), 
          dayName: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'][parseInt(day, 10)],
          count 
        }))
        .sort((a, b) => a.day - b.day),
      timeOfDayStats,
      searchLengthStats,
      funnelStats,
      retentionStats,
      topUsers
    });
  } catch (error) {
    console.error('MerchBot stats error:', error);
    res.status(500).json({ error: 'Failed to get MerchBot stats' });
  }
});

// Маршрут для получения иерархии кнопок
router.get('/hierarchy', async (req: any, res: any) => {
  try {
    const categories = await prisma.merch.findMany({
      where: { isActive: true },
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' }
      ],
      include: {
        attachments: {
          where: { type: 'image' },
          orderBy: { sortOrder: 'asc' }
        }
      }
    });
    
    const hierarchy: Record<string, Array<{id: string, name: string, text: string, hasChildren: boolean}>> = {};
    
    for (const category of categories) {
      const parentId = category.parentId || '0';
      if (!hierarchy[parentId]) {
        hierarchy[parentId] = [];
      }
      
      // Проверяем, есть ли дочерние элементы
      const hasChildren = categories.some(cat => cat.parentId === category.id);
      
      hierarchy[parentId].push({
        id: category.id,
        name: category.name,
        text: category.description || '',
        hasChildren
      });
    }
    
    res.json(hierarchy);
  } catch (error) {
    console.error('MerchBot hierarchy error:', error);
    res.status(500).json({ error: 'Failed to get hierarchy' });
  }
});

// Маршрут для поиска элементов
router.get('/search', async (req: any, res: any) => {
  try {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    
    const items = await prisma.merch.findMany({
      where: {
        isActive: true,
        name: {
          contains: q,
          mode: 'insensitive'
        }
      },
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' }
      ],
      include: {
        attachments: {
          where: { type: 'image' },
          orderBy: { sortOrder: 'asc' }
        }
      }
    });
    
    const results = items.map(item => ({
      id: item.id,
      name: item.name,
      description: item.description || '',
      attachments: item.attachments.map(att => att.source),
      hasChildren: false // Можно добавить проверку
    }));
    
    res.json(results);
  } catch (error) {
    console.error('MerchBot search error:', error);
    res.status(500).json({ error: 'Failed to search items' });
  }
});

// Маршрут для получения детальной информации об элементе
router.get('/item/:id', async (req: any, res: any) => {
  try {
    const { id } = req.params;
    
    const item = await prisma.merch.findUnique({
      where: { id },
      include: {
        attachments: {
          where: { type: 'image' },
          orderBy: { sortOrder: 'asc' }
        },
        children: {
          where: { isActive: true },
          orderBy: [
            { sortOrder: 'asc' },
            { name: 'asc' }
          ]
        }
      }
    });
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const result = {
      id: item.id,
      name: item.name,
      description: item.description || '',
      attachments: item.attachments.map(att => att.source),
      children: item.children.map(child => ({
        id: child.id,
        name: child.name,
        description: child.description || ''
      }))
    };
    
    res.json(result);
  } catch (error) {
    console.error('MerchBot item error:', error);
    res.status(500).json({ error: 'Failed to get item' });
  }
});

// Создание обратной связи (универсальный endpoint)
router.post('/feedback', authenticateToken, uploadFeedback.array('photos', 10), async (req: any, res: any) => {
  try {
    const { tool, text, email } = req.body;
    const userId = req.user?.id;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Текст обратной связи обязателен' });
    }

    // Получаем пути к загруженным файлам
    const photos: string[] = [];
    if (req.files && Array.isArray(req.files)) {
      photos.push(...req.files.map((file: Express.Multer.File) => file.filename));
    }

    const feedback = await (prisma as any).feedback.create({
      data: {
        tool: tool || 'general',
        userId: userId || null,
        email: email || null,
        text: text.trim(),
        photos: photos,
        metadata: {
          userAgent: req.headers['user-agent'],
          ip: req.ip || req.connection.remoteAddress,
          userName: req.user?.name || null,
          userEmail: req.user?.email || null
        }
      }
    });

    res.status(201).json(feedback);
  } catch (error) {
    console.error('Error creating feedback:', error);
    res.status(500).json({ error: 'Failed to create feedback' });
  }
});

// Получение списка обратной связи (с фильтрацией по инструменту)
router.get('/feedback', authenticateToken, async (req: any, res: any) => {
  try {
    const { page = '1', limit = '50', isRead, tool } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (isRead !== undefined) {
      where.isRead = isRead === 'true';
    }
    if (tool) {
      where.tool = tool;
    }

    const [feedbacks, total] = await Promise.all([
      (prisma as any).feedback.findMany({
        where,
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: limitNum
      }),
      (prisma as any).feedback.count({ where })
    ]);

    // Форматируем ответ для совместимости с фронтендом
    // Получаем данные пользователей из базы по email
    const emails = feedbacks.map((fb: any) => fb.email?.toLowerCase().trim()).filter(Boolean);
    const usersByEmail = new Map();
    const userDataByEmail = new Map();

    if (emails.length > 0) {
      // Получаем пользователей из User
      const users = await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { email: true, name: true }
      });
      users.forEach((user: any) => {
        usersByEmail.set(user.email.toLowerCase(), user.name);
      });

      // Получаем пользователей из UserData
      const userDataList = await prisma.userData.findMany({
        where: { email: { in: emails } },
        select: { email: true, fio: true }
      });
      userDataList.forEach((userData: any) => {
        userDataByEmail.set(userData.email.toLowerCase(), userData.fio);
      });
    }

    const formattedFeedbacks = feedbacks.map((fb: any) => {
      const emailLower = fb.email?.toLowerCase();
      const dbName = usersByEmail.get(emailLower) || userDataByEmail.get(emailLower) || null;
      const tgMetadata = fb.metadata as any;
      const tgFirstName = tgMetadata?.firstName || null;
      const tgLastName = tgMetadata?.lastName || null;
      const tgName = (tgFirstName || tgLastName) 
        ? `${tgFirstName || ''} ${tgLastName || ''}`.trim() 
        : null;

      return {
        ...fb,
        user: {
          userId: tgMetadata?.telegramUserId || 0,
          username: tgMetadata?.username || null,
          firstName: tgMetadata?.firstName || null,
          lastName: tgMetadata?.lastName || null,
          dbName: dbName, // ФИО из базы данных
          tgName: tgName // ФИО из Telegram
        }
      };
    });

    res.json({
      feedbacks: formattedFeedbacks,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// Отметка обратной связи как прочитанной
router.patch('/feedback/:id/read', authenticateToken, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const feedback = await (prisma as any).feedback.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
        readBy: userId
      }
    });

    // Получаем данные пользователя из базы по email
    let dbName = null;
    if (feedback.email) {
      const emailLower = feedback.email.toLowerCase().trim();
      const user = await prisma.user.findUnique({
        where: { email: emailLower },
        select: { name: true }
      });
      if (user?.name) {
        dbName = user.name;
      } else {
        const userData = await prisma.userData.findUnique({
          where: { email: emailLower },
          select: { fio: true }
        });
        if (userData?.fio) {
          dbName = userData.fio;
        }
      }
    }

    const tgMetadata = feedback.metadata as any;
    const tgFirstName = tgMetadata?.firstName || null;
    const tgLastName = tgMetadata?.lastName || null;
    const tgName = (tgFirstName || tgLastName) 
      ? `${tgFirstName || ''} ${tgLastName || ''}`.trim() 
      : null;

    // Форматируем ответ для совместимости с фронтендом
    const formattedFeedback = {
      ...feedback,
      user: {
        userId: tgMetadata?.telegramUserId || 0,
        username: tgMetadata?.username || null,
        firstName: tgMetadata?.firstName || null,
        lastName: tgMetadata?.lastName || null,
        dbName: dbName,
        tgName: tgName
      }
    };

    res.json(formattedFeedback);
  } catch (error) {
    console.error('Error marking feedback as read:', error);
    res.status(500).json({ error: 'Failed to mark feedback as read' });
  }
});

// Получение статистики по обратной связи (с фильтрацией по инструменту)
router.get('/feedback/stats', authenticateToken, async (req: any, res: any) => {
  try {
    const { tool } = req.query;
    const where: any = {};
    if (tool) {
      where.tool = tool;
    }

    const total = await (prisma as any).feedback.count({ where });
    const unread = await (prisma as any).feedback.count({ where: { ...where, isRead: false } });
    const read = await (prisma as any).feedback.count({ where: { ...where, isRead: true } });

    // Статистика по инструментам
    const allFeedbacks = await (prisma as any).feedback.findMany({
      select: { tool: true, isRead: true }
    });

    const byTool: Record<string, { total: number; unread: number; read: number }> = {};
    allFeedbacks.forEach((fb: { tool: string; isRead: boolean }) => {
      if (!byTool[fb.tool]) {
        byTool[fb.tool] = { total: 0, unread: 0, read: 0 };
      }
      byTool[fb.tool].total++;
      if (fb.isRead) {
        byTool[fb.tool].read++;
      } else {
        byTool[fb.tool].unread++;
      }
    });

    res.json({
      total,
      unread,
      read,
      byTool
    });
  } catch (error) {
    console.error('Error fetching feedback stats:', error);
    res.status(500).json({ error: 'Failed to fetch feedback stats' });
  }
});

// Получение списка инструментов для обратной связи с иерархией
router.get('/feedback/tools', authenticateToken, async (req: any, res: any) => {
  try {
    // Получаем родительские инструменты (без parent_id)
    const parentTools = await prisma.tool.findMany({
      where: {
        included: true,
        parent_id: null
      },
      select: {
        id: true,
        name: true,
        link: true,
        description: true
      },
      orderBy: {
        order: 'asc'
      }
    });

    // Получаем дочерние инструменты (с parent_id)
    const childTools = await prisma.tool.findMany({
      where: {
        included: true,
        parent_id: { not: null }
      },
      select: {
        id: true,
        name: true,
        link: true,
        description: true,
        parent_id: true
      },
      orderBy: {
        order: 'asc'
      }
    });

    // Формируем список родительских инструментов
    const parentToolsList = parentTools.map(tool => ({
      value: tool.link,
      label: tool.name
    }));

    // Группируем дочерние инструменты по parent_id
    const childToolsByParent: Record<string, Array<{ value: string; label: string }>> = {};
    childTools.forEach(tool => {
      if (tool.parent_id) {
        if (!childToolsByParent[tool.parent_id]) {
          childToolsByParent[tool.parent_id] = [];
        }
        childToolsByParent[tool.parent_id].push({
          value: tool.link,
          label: tool.name
        });
      }
    });

    // Создаем маппинг link -> id для родительских инструментов
    const linkToIdMap: Record<string, string> = {};
    parentTools.forEach(parent => {
      linkToIdMap[parent.link] = parent.id;
    });

    // Находим parent_id по link для каждого родительского инструмента
    const parentToolsWithChildren = parentTools.map(parent => {
      const children = childToolsByParent[parent.id] || [];
      return {
        value: parent.link,
        label: parent.name,
        id: parent.id,
        children: children
      };
    });

    res.json({
      parentTools: [
        { value: 'general', label: 'Общая обратная связь' },
        ...parentToolsList,
        { value: 'other', label: 'Другое' }
      ],
      linkToIdMap: linkToIdMap,
      parentToolsWithChildren: parentToolsWithChildren
    });
  } catch (error) {
    console.error('Error fetching feedback tools:', error);
    res.status(500).json({ error: 'Failed to fetch feedback tools' });
  }
});

// Маршрут для получения списка пользователей бота
router.get('/users', authenticateToken, async (req: any, res: any) => {
  try {
    const users = await prisma.merchTgUser.findMany({
      select: {
        userId: true,
        username: true,
        firstName: true,
        lastName: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(users);
  } catch (error) {
    console.error('Error fetching bot users:', error);
    res.status(500).json({ error: 'Failed to fetch bot users' });
  }
});

// Маршрут для отправки сообщения пользователям
router.post('/send-message', authenticateToken, async (req: any, res: any) => {
  try {
    const { message, userIds, parseMode = 'HTML' } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs array is required' });
    }

    const { merchBotService } = await import('../../controllers/app/merchBot.js');
    
    const result = await merchBotService.broadcastMessage(userIds, message, parseMode);

    // Отправляем in_app уведомления для всех пользователей
    try {
      const { NotificationController } = await import('../../controllers/app/notification.js');
      const senderId = req.user?.id; // ID отправителя из токена
      
      if (!senderId) {
        console.warn('Sender ID not found, skipping in_app notifications');
      } else {
        // Ищем пользователей по их Telegram userId через User.telegramChatId
        // userIds - это массив Telegram user IDs (числа)
        const users = await prisma.user.findMany({
          where: {
            telegramChatId: {
              in: userIds.map(id => id.toString())
            }
          },
          select: { id: true, telegramChatId: true }
        });

        // Отправляем уведомления каждому пользователю
        for (const user of users) {
          if (user.id && senderId) {
            try {
              await NotificationController.create({
                type: 'INFO',
                channels: ['IN_APP'],
                title: 'Сообщение от Merch бота',
                message: message.replace(/<[^>]*>/g, ''), // Убираем HTML теги для уведомления
                senderId: senderId,
                receiverId: user.id,
                priority: 'MEDIUM'
              });
            } catch (notifError) {
              console.error(`Failed to send in_app notification to user ${user.id}:`, notifError);
            }
          }
        }
      }
    } catch (notifError) {
      console.error('Error sending in_app notifications:', notifError);
      // Не прерываем выполнение, если уведомления не отправились
    }

    res.json({
      success: true,
      result: {
        total: userIds.length,
        success: result.success,
        failed: result.failed,
        errors: result.errors
      }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
