import schedule from 'node-schedule'
import { scheduleRouteDay } from '../controllers/supply/routeDay.js'
import { dailyRKJob } from '../controllers/add/rk.js';
import { weeklyRocDocSync } from '../controllers/accounting/roc.js';
import { cleanupOldMusicFolders, preloadNextMonthMusic } from '../controllers/app/radio.js';
import { SocketIOService } from '../socketio.js';
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

}