import express from 'express';
import { 
  getUpcomingBirthdays
} from '../../controllers/app/birthday.js';

const router = express.Router();

// GET для получения данных о предстоящих днях рождения
router.get('/upcoming-birthdays/:id', getUpcomingBirthdays);

export default router;