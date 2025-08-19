import schedule from 'node-schedule'
import { scheduleRouteDay } from '../controllers/supply/routeDay'
import { dailyRKJob } from '../controllers/add/rk';
import { weeklyRocDocSync } from '../controllers/accounting/roc';

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
}