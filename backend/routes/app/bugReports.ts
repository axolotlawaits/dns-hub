import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import {
  createBugReport,
  getBugReports,
  getBugReportStatistics,
  resolveBugReport,
  getBugReportById,
  getBugReportsByDevice
} from '../../controllers/app/bugReports.js';

const router = Router();

// Все маршруты требуют аутентификации
router.use(authenticateToken);

// Создание отчета об ошибке
router.post('/', createBugReport);

// Получение списка отчетов с фильтрацией
router.get('/', getBugReports);

// Получение статистики ошибок (должен быть ДО /:id)
router.get('/statistics', getBugReportStatistics);

// Получение отчетов по устройству (должен быть ДО /:id)
router.get('/device/:deviceId', getBugReportsByDevice);

// Отметка отчета как решенного
router.post('/resolve', resolveBugReport);

// Получение отчета по ID (должен быть последним)
router.get('/:id', getBugReportById);

export default router;
