import schedule from 'node-schedule'
import { scheduleRouteDay } from '../controllers/supply/routeDay.js'
import { dailyRKJob } from '../controllers/add/rk.js';
import { weeklyRocDocSync } from '../controllers/accounting/roc.js';
import { cleanupOldMusicFolders, preloadNextMonthMusic } from '../controllers/app/radio.js';
import { SocketIOService } from '../socketio.js';
import { exchangeService } from '../services/exchange.js';
import { prisma } from '../server.js';

export const initToolsCron = () => {
  schedule.scheduleJob('0 0 * * *', async () => {
    try {
      console.log('running scheduled tools tasks...')
      await scheduleRouteDay();
      await dailyRKJob();
    } catch (e) {
      console.error('Daily cron error', e);
    }
  })
  
  schedule.scheduleJob('0 3 * * 0', async () => {
    try {
      await weeklyRocDocSync();
    } catch (e) {
      console.error('Weekly ROC->Doc sync error', e);
    }
  });

  // Очистка старых папок с музыкой каждый 1 числа в 02:00
  schedule.scheduleJob('0 2 1 * *', async () => {
    try {
      console.log('running music cleanup task...');
      await cleanupOldMusicFolders();
    } catch (e) {
      console.error('Music cleanup error', e);
    }
  });

  // Предзагрузка папки музыки следующего месяца: ежедневно в 02:15
  // Условие: осталось 5 дней или меньше до 1-го числа следующего месяца
  schedule.scheduleJob('15 2 * * *', async () => {
    try {
      const now = new Date();
      const firstNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysLeft = Math.ceil((firstNext.getTime() - now.getTime()) / msPerDay);
      if (daysLeft <= 5) {
        console.log(`[Radio] Running monthly preload (daysLeft=${daysLeft})...`);
        await preloadNextMonthMusic();
      }
    } catch (e) {
      console.error('Monthly music preload error', e);
    }
  });

  // Проверка новых писем для активных пользователей через Socket.IO каждые 5 минут
  schedule.scheduleJob('*/5 * * * *', async () => {
    try {
      if (!exchangeService.isConfigured()) {
        return; // Exchange не настроен, пропускаем проверку
      }

      const socketService = SocketIOService.getInstance();
      const connectedUserIds = socketService.getConnectedUsers();
      
      if (connectedUserIds.length === 0) {
        return; // Нет активных пользователей
      }

      console.log(`[Exchange] [Cron] Checking emails for ${connectedUserIds.length} active users...`);

      // Получаем email для каждого активного пользователя
      const allUsers = await prisma.user.findMany({
        where: {
          id: { in: connectedUserIds }
        },
        select: {
          id: true,
          email: true
        }
      });

      // Фильтруем только пользователей с email
      const users = allUsers.filter(user => user.email !== null && user.email !== undefined);

      console.log(`[Exchange] [Cron] Found ${users.length} active users with email`);

      // Проверяем письма для каждого активного пользователя
      for (const user of users) {
        if (!user.email) continue;
        
        try {
          await exchangeService.checkNewEmailsAndNotify(user.id, user.email);
          // Небольшая задержка между проверками, чтобы не перегружать Exchange
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error: any) {
          console.error(`[Exchange] [Cron] Error checking emails for user ${user.id}:`, error.message);
          // Продолжаем проверку для других пользователей
        }
      }

      console.log(`[Exchange] [Cron] ✅ Finished checking emails for active users`);
    } catch (e) {
      console.error('[Exchange] [Cron] Email check error:', e);
    }
  });
}