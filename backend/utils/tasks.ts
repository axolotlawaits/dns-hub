import schedule from 'node-schedule'
import { scheduleRouteDay } from '../controllers/supply/routeDay.js';

schedule.scheduleJob('0 0 * * *', () => scheduleRouteDay())