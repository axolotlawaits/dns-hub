import { Router, Request, Response } from 'express';
import multer from 'multer';
import { 
  getCurrentUser,
  getBranchesWithJournals,
  uploadFile,
  getFileMetadata,
  downloadFile,
  viewFile,
  deleteFile,
  makeBranchJournalDecision,
  testExternalApi,
  getJournalFilesList,
  proxyFile
} from '../../controllers/jurists/safetyJournal.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = Router();

// Настройка multer для загрузки файлов
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Все роуты требуют аутентификации
router.use(authenticateToken);

// Получение информации о текущем пользователе
router.get('/me/', getCurrentUser as any);

// Получение списка филиалов с журналами
router.get('/me/branches_with_journals', getBranchesWithJournals as any);

// Тестовый endpoint для проверки структуры данных от внешнего API
router.get('/test-external-api', testExternalApi as any);

// Получение списка файлов для журнала
router.get('/journals/:journalId/files', getJournalFilesList as any);

// Загрузка файла
router.post('/files/', upload.single('file'), uploadFile as any);

// Получение метаданных файла
router.get('/files/:fileId', getFileMetadata as any);

// Скачивание файла
router.get('/files/:fileId/download', downloadFile as any);

// Просмотр файла (с аутентификацией)
router.get('/files/:fileId/view', viewFile as any);

// Удаление файла
router.delete('/files/:fileId', deleteFile as any);

// Принятие решения по журналу филиала
router.patch('/branch_journals/:branchJournalId/decision', upload.none(), makeBranchJournalDecision as any);

// Прокси для открытия файлов в новом окне
router.get('/proxy-file', proxyFile as any);

export default router;
