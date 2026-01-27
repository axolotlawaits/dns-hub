import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth.js';
import * as homeworkController from '../../../controllers/Education/Training/homework.js';

const router = Router();

// Все роуты требуют аутентификации
router.use(authenticateToken);

// Статусы сдачи работ управляющего
router.get('/:managerId', homeworkController.getHomeworkStatuses);

// Создание/обновление статуса
router.post('/', homeworkController.upsertHomeworkStatus);

// Обновление статуса
router.put('/:id', homeworkController.updateHomeworkStatus);

export default router;
