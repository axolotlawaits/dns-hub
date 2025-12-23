import express from 'express';
import { 
  getUpcomingBirthdays
} from '../../controllers/app/events.js';

const router = express.Router();

// GET для получения данных о предстоящих днях рождения
router.get('/upcoming-birthdays/:id', getUpcomingBirthdays);

export default router;
