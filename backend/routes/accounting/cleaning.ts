import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import {
  getCleaningBranches,
  getCleaningBranchById,
  uploadDocuments,
  getOrCreateUserCleaningBranch,
  getDocumentsByMonths,
} from '../../controllers/accounting/cleaning.js';
import uploadCleaning from '../../middleware/uploaderCleaning.js';

const router = Router();

// Все маршруты требуют аутентификации
router.use(authenticateToken);

// Получение списка филиалов с данными клининга
router.get('/', getCleaningBranches);

// Получение или создание cleaning branch для текущего пользователя
router.get('/my-branch', getOrCreateUserCleaningBranch);

// Получение филиала по ID
router.get('/:id', getCleaningBranchById);

// Получение документов с группировкой по месяцам
router.get('/:id/documents/months', getDocumentsByMonths);

// Загрузить документы для филиала (id = branchId)
router.post('/:id/documents', uploadCleaning.array('files', 10), uploadDocuments);

export default router;
