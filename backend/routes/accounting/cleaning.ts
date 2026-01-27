import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import {
  getCleaningBranches,
  getCleaningBranchById,
  upsertCleaningBranch,
  markDocumentsReceived,
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

// Создание или обновление записи клининга
router.post('/', upsertCleaningBranch);
router.put('/:id', upsertCleaningBranch);
router.patch('/:id', upsertCleaningBranch);

// Отметить документы как полученные
router.patch('/:id/documents-received', markDocumentsReceived);

// Загрузить документы для филиала
router.post('/:id/documents', uploadCleaning.array('files', 10), uploadDocuments);

export default router;
