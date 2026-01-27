import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth.js';
import * as employmentHistoryController from '../../../controllers/Education/Training/employmentHistory.js';

const router = Router();

// Все роуты требуют аутентификации
router.use(authenticateToken);

// История кадровых изменений управляющего
router.get('/:managerId', employmentHistoryController.getEmploymentHistory);

// Создание записи истории
router.post('/', employmentHistoryController.createEmploymentHistory);

export default router;
