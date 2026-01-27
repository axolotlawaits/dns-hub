import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth.js';
import * as exportController from '../../../controllers/Education/Training/export.js';

const router = Router();

// Все роуты требуют аутентификации
router.use(authenticateToken);

// Экспорт в Excel
router.get('/', exportController.exportToExcel);

export default router;
