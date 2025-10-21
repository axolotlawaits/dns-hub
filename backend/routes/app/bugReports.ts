import { Router } from 'express';
import {
  createBugReport,
  getBugReports,
  getBugReportStatistics,
  resolveBugReport,
  getBugReportById,
  getBugReportsByDevice
} from '../../controllers/app/bugReports.js';

const router = Router();

// Создание отчета об ошибке
router.post('/', createBugReport);

// Получение списка отчетов с фильтрацией
router.get('/', getBugReports);

// Получение статистики ошибок
router.get('/statistics', getBugReportStatistics);

// Отметка отчета как решенного
router.post('/resolve', resolveBugReport);

// Получение отчета по ID
router.get('/:id', getBugReportById);

// Получение отчетов по устройству
router.get('/device/:deviceId', getBugReportsByDevice);

export default router;
