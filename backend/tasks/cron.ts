import schedule from 'node-schedule'
import { scheduleRouteDay } from '../controllers/supply/routeDay'
import { dailyRKJob } from '../controllers/add/rk';

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
}