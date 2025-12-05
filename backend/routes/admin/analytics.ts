import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { getAnalytics, getToolAnalytics } from '../../controllers/admin/analytics.js';

const router = Router();

// Все маршруты требуют аутентификации и роли DEVELOPER
router.use(authenticateToken);

router.get('/', getAnalytics as any);
router.get('/tools/:toolId', getToolAnalytics as any);

export default router;

