import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth.js';
import * as trainingController from '../../../controllers/Education/Training/training.js';

const router = Router();

// Все роуты требуют аутентификации
router.use(authenticateToken);

// Прогресс обучения управляющего
router.get('/progress/:managerId', trainingController.getProgress);

// Создание/обновление прогресса
router.post('/progress', trainingController.upsertProgress);

// Обновление прогресса
router.put('/progress/:id', trainingController.updateProgress);

export default router;
