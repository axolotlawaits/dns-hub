import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth.js';
import * as analyticsController from '../../../controllers/Education/Training/analytics.js';

const router = Router();

// Все роуты требуют аутентификации
router.use(authenticateToken);

// Аналитика
router.get('/', analyticsController.getAnalytics);

export default router;
