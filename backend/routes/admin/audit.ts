import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { getAuditLogs, getAuditStats } from '../../controllers/admin/audit.js';

const router = Router();

// Все маршруты требуют аутентификации и роли DEVELOPER
router.use(authenticateToken);

router.get('/', getAuditLogs);
router.get('/stats', getAuditStats);

export default router;

