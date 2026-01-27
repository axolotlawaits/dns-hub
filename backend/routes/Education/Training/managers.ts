import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth.js';
import * as managersController from '../../../controllers/Education/Training/managers.js';

const router = Router();

// Все роуты требуют аутентификации
router.use(authenticateToken);

// Список управляющих (с фильтрами)
router.get('/', managersController.getManagers);

// Детали управляющего
router.get('/:id', managersController.getManagerById);

// Изменение статуса управляющего
router.put('/:id/status', managersController.updateManagerStatus);

export default router;
