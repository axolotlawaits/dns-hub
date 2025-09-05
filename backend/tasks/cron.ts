import schedule from 'node-schedule'
import { scheduleRouteDay } from '../controllers/supply/routeDay.js'
import { dailyRKJob } from '../controllers/add/rk.js';
import { weeklyRocDocSync } from '../controllers/accounting/roc.js';
import { cleanupOldMusicFolders } from '../controllers/app/radio.js';

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
}