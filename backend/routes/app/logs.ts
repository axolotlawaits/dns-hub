import { Router } from 'express';
import { authenticateToken, authenticateTokenQuery } from '../../middleware/auth.js';
import { streamLogs, getRecentLogs } from '../../controllers/app/logs.js';

const router = Router();

// SSE endpoint для потоковой передачи логов (требует аутентификации)
// Используем authenticateTokenQuery для поддержки токена в query параметре
router.get('/stream', authenticateTokenQuery, streamLogs);

// REST endpoint для получения последних логов (требует аутентификации)
router.get('/recent', authenticateToken, getRecentLogs);

export default router;

