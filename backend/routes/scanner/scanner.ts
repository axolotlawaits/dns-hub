import { Router } from 'express';
import { 
  scanNetworkForPrinters, 
  getKnownPrinters,
  addPrinter,
  startDocumentScanning,
  stopDocumentScanning,
  getScanningStatus,
  getScanHistory,
  getSessionFiles,
  downloadFile,
  downloadSessionZip,
  deleteFile,
  deleteSession
} from '../../controllers/scanner/scanner.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = Router();

// Сканирование сети на наличие принтеров со сканерами
router.post('/scan-network', authenticateToken, scanNetworkForPrinters);

// Получение списка известных принтеров
router.get('/printers', authenticateToken, getKnownPrinters);

// Добавление принтера в список известных
router.post('/printers', authenticateToken, addPrinter);

// Запуск автоматического сканирования документов
router.post('/start-scanning', authenticateToken, startDocumentScanning);

// Остановка автоматического сканирования
router.post('/stop-scanning', authenticateToken, stopDocumentScanning);

// Получение статуса сканирования
router.get('/scanning-status', authenticateToken, getScanningStatus);

// Получение истории сканирований
router.get('/history', authenticateToken, getScanHistory);

// Получение файлов сессии
router.get('/session/:sessionId/files', authenticateToken, getSessionFiles);

// Скачивание отдельного файла
router.get('/file/:fileId/download', authenticateToken, downloadFile);

// Скачивание всех файлов сессии в zip архиве
router.get('/session/:sessionId/download-zip', authenticateToken, downloadSessionZip);

// Удаление отдельного файла
router.delete('/file/:fileId', authenticateToken, deleteFile);

// Удаление сессии сканирования
router.delete('/session/:sessionId', authenticateToken, deleteSession);

export default router;
