import express from 'express';
import { prisma } from '../../server.js';
import { authenticateToken } from '../../middleware/auth.js';
import uploadFeedback from '../../middleware/uploaderFeedback.js';
import { NotificationChannel } from '@prisma/client';

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
        timestamp: true,
        user: {
          select: {
            userId: true,
            username: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    const reactionCounts: Record<string, number> = {};
    const reactionsByMessage: Record<string, {
      messageId: number;
      chatId: number;
      reactions: Array<{ 
        emoji: string; 
        count: number; 
        lastReaction: Date;
        users: Array<{
          userId: number;
          username: string | null;
          firstName: string | null;
          lastName: string | null;
        }>;
      }>;
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
            
            const userInfo = {
              userId: reaction.user?.userId || parsed.userId || 0,
              username: reaction.user?.username || parsed.username || null,
              firstName: reaction.user?.firstName || parsed.firstName || null,
              lastName: reaction.user?.lastName || parsed.lastName || null
            };
            
            if (existingReaction) {
              existingReaction.count++;
              if (reaction.timestamp > existingReaction.lastReaction) {
                existingReaction.lastReaction = reaction.timestamp;
              }
              // Добавляем пользователя, если его еще нет
              const userExists = existingReaction.users.some(u => u.userId === userInfo.userId);
              if (!userExists) {
                existingReaction.users.push(userInfo);
              }
            } else {
              messageReactions.push({
                emoji,
                count: 1,
                lastReaction: reaction.timestamp,
                users: [userInfo]
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
    const topMessages = Object.keys(reactionsByMessage).length > 0 
      ? await Promise.all(
          Object.values(reactionsByMessage)
            .sort((a, b) => b.totalReactions - a.totalReactions)
            .slice(0, 20)
            .map(async (msg) => {
              // Ищем информацию о карточке для этого сообщения
              // Ищем событие card_sent с этим messageId и chatId
              let cardInfo: { itemId: string; itemName: string; itemType: 'card' | 'category' } | null = null;
              
              let messageText = '';
              
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
                      messageText = parsed.messageText || '';
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
                messageText: messageText,
                cardInfo: cardInfo ? {
                  itemId: cardInfo.itemId,
                  itemName: cardInfo.itemName,
                  itemType: cardInfo.itemType
                } : null
              };
            })
        )
      : [];

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

    // Данные для тепловой карты (день недели × час)
    const heatmapData: Array<{ day: number; hour: number; count: number }> = [];
    dailyStatsRaw.forEach(stat => {
      const day = stat.timestamp.getDay();
      const hour = stat.timestamp.getHours();
      heatmapData.push({ day, hour, count: 1 });
    });
    // Группируем и суммируем
    const heatmapMap = new Map<string, number>();
    heatmapData.forEach(point => {
      const key = `${point.day}_${point.hour}`;
      heatmapMap.set(key, (heatmapMap.get(key) || 0) + point.count);
    });
    const heatmapDataGrouped = Array.from(heatmapMap.entries()).map(([key, count]) => {
      const [day, hour] = key.split('_').map(Number);
      return { day, hour, count };
    });

    // Сегментация пользователей по активности
    const userActionsCount: Record<string, number> = {};
    dailyStatsRaw.forEach(stat => {
      userActionsCount[stat.userId] = (userActionsCount[stat.userId] || 0) + 1;
    });
    const actionsCounts = Object.values(userActionsCount);
    const avgActions = actionsCounts.length > 0 
      ? actionsCounts.reduce((a, b) => a + b, 0) / actionsCounts.length 
      : 0;
    
    const highThreshold = avgActions * 2;
    const mediumThreshold = avgActions;
    
    const userSegments = {
      high: 0,
      medium: 0,
      low: 0,
      inactive: totalUsers - activeUsers.length
    };
    
    Object.values(userActionsCount).forEach(count => {
      if (count >= highThreshold) userSegments.high++;
      else if (count >= mediumThreshold) userSegments.medium++;
      else if (count > 0) userSegments.low++;
    });

    // Когортный анализ (по месяцам регистрации)
    const cohorts = await prisma.merchTgUser.findMany({
      select: {
        id: true,
        createdAt: true
      }
    });
    
    const cohortMap = new Map<string, Set<string>>();
    cohorts.forEach(user => {
      const cohortMonth = user.createdAt.toISOString().substring(0, 7); // YYYY-MM
      if (!cohortMap.has(cohortMonth)) {
        cohortMap.set(cohortMonth, new Set());
      }
      cohortMap.get(cohortMonth)!.add(user.id);
    });

    const cohortAnalysis = await Promise.all(
      Array.from(cohortMap.entries()).map(async ([cohort, userIds]) => {
        const users = Array.from(userIds);
        const cohortStartDate = new Date(cohort + '-01');
        
        // Retention для этой когорты
        const day1Date = new Date(cohortStartDate);
        day1Date.setDate(day1Date.getDate() + 1);
        const day7Date = new Date(cohortStartDate);
        day7Date.setDate(day7Date.getDate() + 7);
        const day30Date = new Date(cohortStartDate);
        day30Date.setDate(day30Date.getDate() + 30);

        const [day1Users, day7Users, day30Users] = await Promise.all([
          prisma.merchTgUserStats.findMany({
            where: {
              userId: { in: users },
              timestamp: { gte: day1Date, lt: new Date(day1Date.getTime() + 24 * 60 * 60 * 1000) }
            },
            select: { userId: true },
            distinct: ['userId']
          }),
          prisma.merchTgUserStats.findMany({
            where: {
              userId: { in: users },
              timestamp: { gte: day7Date, lt: new Date(day7Date.getTime() + 24 * 60 * 60 * 1000) }
            },
            select: { userId: true },
            distinct: ['userId']
          }),
          prisma.merchTgUserStats.findMany({
            where: {
              userId: { in: users },
              timestamp: { gte: day30Date, lt: new Date(day30Date.getTime() + 24 * 60 * 60 * 1000) }
            },
            select: { userId: true },
            distinct: ['userId']
          })
        ]);

        return {
          cohort,
          users: users.length,
          retention: {
            day1: day1Users.length,
            day7: day7Users.length,
            day30: day30Users.length
          }
        };
      })
    );

    // Аналитика контента (конверсия просмотров в реакции)
    const cardViewsMap: Record<string, number> = {};
    const cardReactionsMap: Record<string, number> = {};
    
    // Подсчитываем просмотры карточек
    buttonClicks.forEach(click => {
      if (click.details && !['start', 'search', 'back', 'main_menu', 'more_categories', 'feedback'].includes(click.details)) {
        cardViewsMap[click.details] = (cardViewsMap[click.details] || 0) + 1;
      }
    });
    
    // Подсчитываем реакции на карточки
    reactions.forEach(reaction => {
      if (reaction.details) {
        try {
          const parsed = JSON.parse(reaction.details);
          if (parsed.itemId && parsed.itemName) {
            cardReactionsMap[parsed.itemId] = (cardReactionsMap[parsed.itemId] || 0) + 1;
          }
        } catch (e) {
          // Игнорируем ошибки парсинга
        }
      }
    });

    const conversionRate = Object.keys(cardViewsMap).map(cardId => {
      const views = cardViewsMap[cardId];
      const reactions = cardReactionsMap[cardId] || 0;
      return {
        cardId,
        cardName: cardId,
        views,
        reactions,
        conversionRate: views > 0 ? (reactions / views) * 100 : 0
      };
    }).sort((a, b) => b.conversionRate - a.conversionRate).slice(0, 20);

    const unpopularCards = Object.keys(cardViewsMap)
      .filter(cardId => cardViewsMap[cardId] < 5)
      .map(cardId => ({
        cardId,
        cardName: cardId,
        views: cardViewsMap[cardId]
      }))
      .sort((a, b) => a.views - b.views)
      .slice(0, 10);

    // Поведенческая аналитика
    const avgViewDepth = sessions.length > 0
      ? sessions.reduce((sum, s) => sum + s.actions, 0) / sessions.length
      : 0;

    // Путь от поиска к карточке
    const searchToCardPath: Array<{ searchQuery: string; cardName: string; count: number }> = [];
    // Упрощенная версия - можно расширить позже
    const searchToCardMap = new Map<string, Map<string, number>>();
    
    // Отказы (пользователи, которые запустили бота и ничего не сделали)
    const startActions = await prisma.merchTgUserStats.findMany({
      where: {
        action: 'start',
        timestamp: { gte: startDate }
      },
      select: { userId: true }
    });
    
    const startUserIds = new Set(startActions.map(a => a.userId));
    const usersWithOtherActions = await prisma.merchTgUserStats.findMany({
      where: {
        userId: { in: Array.from(startUserIds) },
        action: { not: 'start' },
        timestamp: { gte: startDate }
      },
      select: { userId: true },
      distinct: ['userId']
    });
    
    const bounceRate = startUserIds.size > 0
      ? ((startUserIds.size - usersWithOtherActions.length) / startUserIds.size) * 100
      : 0;

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
      topUsers,
      // Новые данные
      heatmapData: heatmapDataGrouped,
      userSegments,
      cohortAnalysis: cohortAnalysis.slice(-6), // Последние 6 когорт
      contentAnalytics: {
        conversionRate,
        unpopularCards,
        categoryPerformance: categoryClicks.slice(0, 10).map(cat => ({
          categoryId: cat.name,
          categoryName: cat.name,
          views: cat.count,
          conversions: 0, // Можно расширить позже
          conversionRate: 0
        }))
      },
      behaviorAnalytics: {
        avgViewDepth: Math.round(avgViewDepth * 100) / 100,
        searchToCardPath,
        bounceRate: Math.round(bounceRate * 100) / 100,
        repeatViews: [], // Можно расширить позже
        categoryTransitions: [] // Можно расширить позже
      }
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

    // Отправляем уведомления пользователям с полным доступом и DEVELOPER
    try {
      const { NotificationController } = await import('../../controllers/app/notification.js');
      let senderId = req.user?.id || userId;

      // Если senderId нет, используем системного отправителя или пропускаем уведомления
      if (!senderId) {
        // Пытаемся найти системного отправителя
        const systemSender = await prisma.user.findFirst({
          where: {
            role: 'DEVELOPER'
          },
          select: { id: true }
        });
        senderId = systemSender?.id || null;
      }

      if (!senderId) {
        console.warn('[MerchBot Feedback] No sender ID available, skipping notifications');
      } else {
        console.log(`[MerchBot Feedback] Sender ID: ${senderId}, Tool: ${tool || 'general'}`);
        
        // Определяем, для какого инструмента обратная связь
        const isMerchFeedback = tool && tool !== 'general' && (tool.includes('merch') || tool.includes('ad/merch'));
        const isGeneralFeedback = !tool || tool === 'general';
        
        let allRecipients: Array<{ id: string; name: string }> = [];
        let merchTool = null;

        if (isGeneralFeedback) {
          // Для общего feedback отправляем только DEVELOPER'ам
          console.log('[MerchBot Feedback] General feedback - sending to DEVELOPERs only');
          const developers = await prisma.user.findMany({
            where: {
              role: 'DEVELOPER'
            },
            select: { id: true, name: true }
          });
          allRecipients = developers;
          console.log(`[MerchBot Feedback] Found ${developers.length} DEVELOPERs`);
        } else if (isMerchFeedback) {
          // Для Merch feedback отправляем только тем, у кого ПОЛНЫЙ доступ к Merch
          console.log('[MerchBot Feedback] Merch feedback - sending to users with FULL access only');
          
          // Находим инструмент Merch (по link "ad/merch")
          merchTool = await prisma.tool.findFirst({
            where: {
              link: 'ad/merch'
            }
          });

          if (!merchTool) {
            console.warn('[MerchBot Feedback] Merch tool not found, skipping notifications');
            allRecipients = [];
          } else {
            // Находим всех пользователей с FULL доступом к Merch
            // 1. Прямой доступ пользователя
            const directAccessUsers = await prisma.user.findMany({
              where: {
                userToolAccesses: {
                  some: {
                    toolId: merchTool.id,
                    accessLevel: 'FULL'
                  }
                }
              },
              select: { id: true, name: true, email: true }
            });

            // 2. Доступ через должность
            const positionsWithAccess = await prisma.positionToolAccess.findMany({
              where: {
                toolId: merchTool.id,
                accessLevel: 'FULL'
              },
              select: { positionId: true }
            });

            const positionIds = positionsWithAccess.map(p => p.positionId);
            const usersByPosition = positionIds.length > 0
              ? await prisma.userData.findMany({
                  where: {
                    positionId: { in: positionIds }
                  },
                  select: { email: true }
                }).then(userDataList => {
                  const emails = userDataList.map(ud => ud.email);
                  return prisma.user.findMany({
                    where: {
                      email: { in: emails }
                    },
                    select: { id: true, name: true, email: true }
                  });
                })
              : [];

            // 3. Доступ через группу
            const groupsWithAccess = await prisma.groupToolAccess.findMany({
              where: {
                toolId: merchTool.id,
                accessLevel: 'FULL'
              },
              select: { groupId: true }
            });

            const groupIds = groupsWithAccess.map(g => g.groupId);
            const usersByGroup = groupIds.length > 0
              ? await prisma.position.findMany({
                  where: {
                    groupUuid: { in: groupIds }
                  },
                  select: { uuid: true }
                }).then(positions => {
                  const positionUuids = positions.map(p => p.uuid);
                  return prisma.userData.findMany({
                    where: {
                      positionId: { in: positionUuids }
                    },
                    select: { email: true }
                  }).then(userDataList => {
                    const emails = userDataList.map(ud => ud.email);
                    return prisma.user.findMany({
                      where: {
                        email: { in: emails }
                      },
                      select: { id: true, name: true, email: true }
                    });
                  });
                })
              : [];

            // Объединяем всех пользователей с доступом и убираем дубликаты
            const fullAccessUserIds = new Set<string>();
            const usersWithFullAccess: Array<{ id: string; name: string }> = [];
            
            [...directAccessUsers, ...usersByPosition, ...usersByGroup].forEach(user => {
              if (!fullAccessUserIds.has(user.id)) {
                fullAccessUserIds.add(user.id);
                usersWithFullAccess.push({ id: user.id, name: user.name });
              }
            });

            allRecipients = usersWithFullAccess;
            console.log(`[MerchBot Feedback] Found ${usersWithFullAccess.length} users with FULL access to Merch`);
          }
        } else {
          // Для других инструментов отправляем только DEVELOPER'ам
          console.log('[MerchBot Feedback] Other tool feedback - sending to DEVELOPERs only');
          const developers = await prisma.user.findMany({
            where: {
              role: 'DEVELOPER'
            },
            select: { id: true, name: true }
          });
          allRecipients = developers;
          console.log(`[MerchBot Feedback] Found ${developers.length} DEVELOPERs`);
        }

        // Отправляем уведомления каждому получателю
        const toolName = isGeneralFeedback 
          ? 'Общая обратная связь'
          : (isMerchFeedback ? 'Merch бот' : (tool.split(':').pop() || tool));
        const notificationTitle = `Новая обратная связь: ${toolName}`;
        const notificationMessage = text.length > 100 ? text.substring(0, 100) + '...' : text;

        console.log(`[MerchBot Feedback] Found ${allRecipients.length} recipients`);
        console.log(`[MerchBot Feedback] Recipients list:`, allRecipients.map(r => ({ id: r.id, name: r.name })));

        if (allRecipients.length === 0) {
          console.warn('[MerchBot Feedback] ⚠️ No recipients found for notifications');
          console.log(`[MerchBot Feedback] Debug: isGeneralFeedback: ${isGeneralFeedback}, isMerchFeedback: ${isMerchFeedback}, merchTool found: ${!!merchTool}, toolId: ${merchTool?.id}`);
        } else {
          let notificationsSent = 0;
          let notificationsFailed = 0;
          let skippedSelf = 0;

          for (const recipient of allRecipients) {
            console.log(`[MerchBot Feedback] Processing recipient: ${recipient.id}, senderId: ${senderId}`);
            
            if (recipient.id === senderId) {
              skippedSelf++;
              console.log(`[MerchBot Feedback] ⏭️ Skipping self notification for ${recipient.id}`);
              continue;
            }

            try {
              // Получаем полную информацию о получателе
              const recipientUser = await prisma.user.findUnique({
                where: { id: recipient.id },
                select: { 
                  telegramChatId: true,
                  email: true
                }
              });

              console.log(`[MerchBot Feedback] Recipient user data:`, { 
                id: recipient.id, 
                email: recipientUser?.email, 
                telegramChatId: recipientUser?.telegramChatId 
              });

              // Проверяем настройки email уведомлений
              const emailSettings = await prisma.userSettings.findUnique({
                where: {
                  userId_parameter: {
                    userId: recipient.id,
                    parameter: 'notifications.email',
                  },
                },
              });

              const wantsEmail = emailSettings ? emailSettings.value === 'true' : true; // По умолчанию включено
              console.log(`[MerchBot Feedback] Email settings for ${recipient.id}:`, { 
                found: !!emailSettings, 
                value: emailSettings?.value, 
                wantsEmail 
              });

              // Формируем каналы: всегда IN_APP, TELEGRAM если есть привязка, EMAIL если включен
              const channels: NotificationChannel[] = ['IN_APP'];
              
              if (recipientUser?.telegramChatId) {
                channels.push('TELEGRAM');
              }
              
              if (wantsEmail && recipientUser?.email) {
                channels.push('EMAIL');
              }

              console.log(`[MerchBot Feedback] 📤 Sending notification to ${recipient.id} (${recipientUser?.email || 'no email'}) via channels: ${channels.join(', ')}`);
              console.log(`[MerchBot Feedback] Notification data:`, {
                type: 'INFO',
                channels,
                title: notificationTitle,
                message: notificationMessage.substring(0, 50) + '...',
                senderId,
                receiverId: recipient.id
              });

              const notification = await NotificationController.create({
                type: 'INFO',
                channels: channels,
                title: notificationTitle,
                message: notificationMessage,
                senderId: senderId,
                receiverId: recipient.id,
                toolId: merchTool?.id || undefined,
                priority: 'MEDIUM'
              });

              console.log(`[MerchBot Feedback] ✅ Notification created with ID: ${notification.id}`);

              notificationsSent++;
            } catch (notifError) {
              notificationsFailed++;
              console.error(`[MerchBot Feedback] ❌ Failed to send notification to user ${recipient.id}:`, notifError);
              if (notifError instanceof Error) {
                console.error(`[MerchBot Feedback] Error details: ${notifError.message}`);
                console.error(`[MerchBot Feedback] Error stack: ${notifError.stack}`);
              }
            }
          }

          console.log(`[MerchBot Feedback] 📊 Summary: sent=${notificationsSent}, failed=${notificationsFailed}, skipped_self=${skippedSelf}, total_recipients=${allRecipients.length}`);
        }
      }
    } catch (notifError) {
      console.error('Error sending notifications for feedback:', notifError);
      // Не прерываем выполнение, если уведомления не отправились
    }

    res.status(201).json(feedback);
  } catch (error) {
    console.error('Error creating feedback:', error);
    res.status(500).json({ error: 'Failed to create feedback' });
  }
});

// Получение списка обратной связи (с фильтрацией по инструменту)
router.get('/feedback', authenticateToken, async (req: any, res: any) => {
  try {
    const { 
      page = '1', 
      limit = '50', 
      isRead, 
      tool,
      status,
      priority,
      tags,
      search,
      dateFrom,
      dateTo,
      assignedTo,
      pinned
    } = req.query;
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
    if (status) {
      where.status = status;
    }
    if (priority) {
      where.priority = priority;
    }
    if (tags) {
      const tagsArray = Array.isArray(tags) ? tags : [tags];
      where.tags = { hasSome: tagsArray };
    }
    if (assignedTo) {
      where.assignedTo = assignedTo;
    }
    if (pinned !== undefined) {
      where.pinned = pinned === 'true';
    }
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo);
      }
    }

    const [feedbacks, total] = await Promise.all([
      (prisma as any).feedback.findMany({
        where,
        include: {
          responses: {
            include: {
              user: {
                select: {
                  name: true,
                  email: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          }
        },
        orderBy: [
          { pinned: 'desc' },
          { createdAt: 'desc' }
        ],
        skip,
        take: limitNum
      }),
      (prisma as any).feedback.count({ where })
    ]);

    // Фильтрация по поисковому запросу (если указан)
    let filteredFeedbacks = feedbacks;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredFeedbacks = feedbacks.filter((fb: any) => 
        fb.text.toLowerCase().includes(searchLower) ||
        fb.email.toLowerCase().includes(searchLower) ||
        (fb.metadata && JSON.stringify(fb.metadata).toLowerCase().includes(searchLower))
      );
    }

    // Форматируем ответ для совместимости с фронтендом
    // Получаем данные пользователей из базы по email
    const emails = filteredFeedbacks.map((fb: any) => fb.email?.toLowerCase().trim()).filter(Boolean);
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

    const formattedFeedbacks = await Promise.all(
      filteredFeedbacks.map((fb: any) => formatFeedbackResponse(fb))
    );

    res.json({
      feedbacks: formattedFeedbacks,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: search ? filteredFeedbacks.length : total,
        totalPages: Math.ceil((search ? filteredFeedbacks.length : total) / limitNum)
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

// Обновление статуса обратной связи
router.patch('/feedback/:id/status', authenticateToken, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['NEW', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const feedback = await (prisma as any).feedback.update({
      where: { id },
      data: { status },
      include: {
        responses: {
          include: {
            user: {
              select: {
                name: true,
                email: true
              }
            }
          }
        },
      }
    });

    // Форматируем ответ
    const formattedFeedback = await formatFeedbackResponse(feedback);
    res.json(formattedFeedback);
  } catch (error) {
    console.error('Error updating feedback status:', error);
    res.status(500).json({ error: 'Failed to update feedback status' });
  }
});

// Обновление приоритета обратной связи
router.patch('/feedback/:id/priority', authenticateToken, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;

    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority' });
    }

    const feedback = await (prisma as any).feedback.update({
      where: { id },
      data: { priority },
      include: {
        responses: {
          include: {
            user: {
              select: {
                name: true,
                email: true
              }
            }
          }
        },
      }
    });

    const formattedFeedback = await formatFeedbackResponse(feedback);
    res.json(formattedFeedback);
  } catch (error) {
    console.error('Error updating feedback priority:', error);
    res.status(500).json({ error: 'Failed to update feedback priority' });
  }
});

// Обновление тегов обратной связи
router.patch('/feedback/:id/tags', authenticateToken, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { tags } = req.body;

    if (!Array.isArray(tags)) {
      return res.status(400).json({ error: 'Tags must be an array' });
    }

    const feedback = await (prisma as any).feedback.update({
      where: { id },
      data: { tags },
      include: {
        responses: {
          include: {
            user: {
              select: {
                name: true,
                email: true
              }
            }
          }
        },
      }
    });

    const formattedFeedback = await formatFeedbackResponse(feedback);
    res.json(formattedFeedback);
  } catch (error) {
    console.error('Error updating feedback tags:', error);
    res.status(500).json({ error: 'Failed to update feedback tags' });
  }
});

// Назначение ответственного
router.patch('/feedback/:id/assign', authenticateToken, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { assignedTo } = req.body;

    const feedback = await (prisma as any).feedback.update({
      where: { id },
      data: { assignedTo: assignedTo || null },
      include: {
        responses: {
          include: {
            user: {
              select: {
                name: true,
                email: true
              }
            }
          }
        },
      }
    });

    const formattedFeedback = await formatFeedbackResponse(feedback);
    res.json(formattedFeedback);
  } catch (error) {
    console.error('Error assigning feedback:', error);
    res.status(500).json({ error: 'Failed to assign feedback' });
  }
});

// Закрепление/открепление обратной связи
router.patch('/feedback/:id/pin', authenticateToken, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { pinned } = req.body;

    const feedback = await (prisma as any).feedback.update({
      where: { id },
      data: { pinned: pinned === true },
      include: {
        responses: {
          include: {
            user: {
              select: {
                name: true,
                email: true
              }
            }
          }
        },
      }
    });

    const formattedFeedback = await formatFeedbackResponse(feedback);
    res.json(formattedFeedback);
  } catch (error) {
    console.error('Error pinning feedback:', error);
    res.status(500).json({ error: 'Failed to pin feedback' });
  }
});

// Добавление ответа на обратную связь
router.post('/feedback/:id/response', authenticateToken, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { text, sendEmail } = req.body;
    const userId = req.user?.id;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Response text is required' });
    }

    const response = await (prisma as any).feedbackResponse.create({
      data: {
        feedbackId: id,
        userId,
        text: text.trim(),
        sentEmail: sendEmail === true,
        sentAt: sendEmail === true ? new Date() : null
      },
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    res.json({
      id: response.id,
      feedbackId: response.feedbackId,
      userId: response.userId,
      user: {
        name: response.user.name,
        email: response.user.email
      },
      text: response.text,
      createdAt: response.createdAt.toISOString(),
      sentAt: response.sentAt?.toISOString() || null,
      sentEmail: response.sentEmail
    });
  } catch (error) {
    console.error('Error adding feedback response:', error);
    res.status(500).json({ error: 'Failed to add feedback response' });
  }
});

// Получение истории переписки с пользователем
router.get('/feedback/history', authenticateToken, async (req: any, res: any) => {
  try {
    const { email, tool } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const where: any = {
      email: email.toLowerCase().trim()
    };
    if (tool) {
      where.tool = tool;
    }

    const feedbacks = await (prisma as any).feedback.findMany({
      where,
      include: {
        responses: {
          include: {
            user: {
              select: {
                name: true,
                email: true
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
          }
        },
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const formattedFeedbacks = await Promise.all(
      feedbacks.map((fb: any) => formatFeedbackResponse(fb))
    );

    res.json({ feedbacks: formattedFeedbacks });
  } catch (error) {
    console.error('Error fetching feedback history:', error);
    res.status(500).json({ error: 'Failed to fetch feedback history' });
  }
});

// Вспомогательная функция для форматирования ответа обратной связи
async function formatFeedbackResponse(fb: any) {
  const emailLower = fb.email?.toLowerCase();
  
  // Получаем данные пользователя из базы
  let dbName = null;
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

  // Получаем данные назначенного пользователя
  let assignedToUser = null;
  if (fb.assignedTo) {
    const assignedUser = await prisma.user.findUnique({
      where: { id: fb.assignedTo },
      select: { name: true, email: true }
    });
    if (assignedUser) {
      assignedToUser = {
        name: assignedUser.name,
        email: assignedUser.email
      };
    }
  }

  const tgMetadata = fb.metadata as any;
  const tgFirstName = tgMetadata?.firstName || null;
  const tgLastName = tgMetadata?.lastName || null;
  const tgName = (tgFirstName || tgLastName) 
    ? `${tgFirstName || ''} ${tgLastName || ''}`.trim() 
    : null;

  return {
    ...fb,
    createdAt: fb.createdAt.toISOString(),
    readAt: fb.readAt?.toISOString() || null,
    assignedToUser: assignedToUser,
    responses: fb.responses?.map((r: any) => ({
      id: r.id,
      feedbackId: r.feedbackId,
      userId: r.userId,
      user: r.user ? {
        name: r.user.name,
        email: r.user.email
      } : undefined,
      text: r.text,
      createdAt: r.createdAt.toISOString(),
      sentAt: r.sentAt?.toISOString() || null,
      sentEmail: r.sentEmail
    })) || [],
    user: {
      userId: tgMetadata?.telegramUserId || 0,
      username: tgMetadata?.username || null,
      firstName: tgMetadata?.firstName || null,
      lastName: tgMetadata?.lastName || null,
      dbName: dbName,
      tgName: tgName
    }
  };
}

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

    // Получаем все уникальные tool (link) из обратной связи
    const feedbackTools = await (prisma as any).feedback.findMany({
      select: {
        tool: true
      },
      distinct: ['tool']
    });

    const feedbackToolLinks = new Set(feedbackTools.map((fb: any) => fb.tool));

    // Получаем все инструменты, которые используются в обратной связи (даже если не включены)
    const allFeedbackTools = await prisma.tool.findMany({
      where: {
        link: {
          in: Array.from(feedbackToolLinks)
        }
      },
      select: {
        id: true,
        name: true,
        link: true,
        description: true,
        parent_id: true
      }
    });

    // Создаем маппинг link -> name для всех инструментов из обратной связи
    const allToolsMap: Record<string, string> = {};
    allFeedbackTools.forEach(tool => {
      allToolsMap[tool.link] = tool.name;
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
      parentToolsWithChildren: parentToolsWithChildren,
      // Добавляем маппинг всех инструментов из обратной связи
      allToolsMap: allToolsMap
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

// Маршрут для отправки сообщения пользователям (с поддержкой фото)
router.post('/send-message', authenticateToken, uploadFeedback.array('photos', 10), async (req: any, res: any) => {
  try {
    let { message, userIds, parseMode = 'HTML' } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!userIds) {
      return res.status(400).json({ error: 'User IDs array is required' });
    }

    // userIds может прийти как массив или как несколько полей формы
    if (!Array.isArray(userIds)) {
      userIds = Array.isArray(req.body.userIds)
        ? req.body.userIds
        : [req.body.userIds];
    }

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs array is required' });
    }

    // Преобразуем в числа
    userIds = (userIds as Array<string | number>)
      .map((rawId: string | number) => parseInt(String(rawId), 10))
      .filter((numericId: number) => !Number.isNaN(numericId));

    // Безопасное форматирование для Telegram
    if (parseMode === 'HTML') {
      // Убираем теги <p> (Telegram не поддерживает их)
      message = message.replace(/<\/p>/gi, '<br>');
      message = message.replace(/<p[^>]*>/gi, '');
      // Убираем другие не поддерживаемые теги
      message = message.replace(/<\/?div[^>]*>/gi, '');
      message = message.replace(/<\/?span[^>]*>/gi, '');
      // Нормализуем <br>
      message = message.replace(/<br\s*\/?>/gi, '<br>');
      // Убираем множественные <br> подряд (максимум 2 подряд)
      message = message.replace(/(<br>\s*){3,}/gi, '<br><br>');
    } else {
      // Для Markdown/MarkdownV2 и других режимов Telegram не понимает HTML-теги
      // Превращаем <br> в перенос строки и убираем остальные теги
      message = message.replace(/<br\s*\/?>/gi, '\n');
      message = message.replace(/<\/p>/gi, '\n');
      message = message.replace(/<p[^>]*>/gi, '');
      // Удаляем все прочие HTML-теги
      message = message.replace(/<\/?[^>]+>/gi, '');
    }

    // Получаем путь к первому загруженному фото (если есть)
    let photoPath: string | null = null;
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const file = req.files[0] as Express.Multer.File;
      photoPath = file.path;
    }

    const { merchBotService } = await import('../../controllers/app/merchBot.js');
    
    const result = await merchBotService.broadcastMessage(userIds, message, parseMode, photoPath);

    // Отправляем in_app уведомления для всех пользователей
    try {
      const { NotificationController } = await import('../../controllers/app/notification.js');
      let senderId = req.user?.id; // ID отправителя из токена
      
      // Если senderId нет, пытаемся найти системного отправителя
      if (!senderId) {
        const systemSender = await prisma.user.findFirst({
          where: {
            role: 'DEVELOPER'
          },
          select: { id: true }
        });
        senderId = systemSender?.id || null;
      }
      
      if (!senderId) {
        console.warn('[MerchBot Send Message] Sender ID not found, skipping in_app notifications');
      } else {
        // Ищем пользователей по их Telegram userId через User.telegramChatId
        // userIds - это массив Telegram user IDs (числа)
        const users = await prisma.user.findMany({
          where: {
            telegramChatId: {
              in: (userIds as number[]).map((id: number) => id.toString())
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
