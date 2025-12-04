import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import {
  getSystemMetrics
} from '../../controllers/admin/system.js';

const router = Router();

// Все маршруты требуют аутентификации и роли DEVELOPER
router.use(authenticateToken);

// Получение метрик системы
router.get('/metrics', getSystemMetrics);

export default router;

