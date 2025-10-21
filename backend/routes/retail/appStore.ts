import express, { Request, Response, NextFunction } from 'express';
import uploadApp from '../../middleware/uploaderApp.js';
import { 
  createApp, 
  getApps, 
  getAppById, 
  uploadAppVersion, 
  downloadLatestVersion, 
  getAppVersions, 
  getAppFiles,
  updateApp, 
  deleteApp,
  downloadDiagnostics
} from '../../controllers/retail/appStore.js';

const router = express.Router();

// Создание нового приложения
router.post('/', createApp);

// Получение списка приложений
router.get('/', getApps);

// Получение приложения по ID
router.get('/:id', getAppById);

// Загрузка новой версии приложения
router.post('/:id/versions', uploadApp.single('file'), uploadAppVersion);

// Скачивание последней версии
router.get('/:id/download', downloadLatestVersion);

// Диагностика скачивания
router.get('/:id/download-diagnostics', downloadDiagnostics);

// Получение истории версий
router.get('/:id/versions', getAppVersions);

// Получение файлов приложения (для отладки)
router.get('/:id/files', getAppFiles);

// Обновление приложения
router.put('/:id', updateApp);

// Удаление приложения
router.delete('/:id', deleteApp);

export default router;
