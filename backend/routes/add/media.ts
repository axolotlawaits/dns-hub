import { Router } from 'express';
import {
  getAllMedia,
  createMedia,
  getMediaById,
  updateMedia,
  deleteMedia,
} from '../../controllers/add/media'; // Обновленный путь к контроллерам
import uploadMedia from '../../middleware/uploader'; // Переименованный middleware

const router = Router();

// Получение всех медиа-записей
router.get('/', getAllMedia);

// Получение конкретной медиа-записи по ID
router.get('/:id', getMediaById);

// Создание новой медиа-записи с вложениями
router.post('/', uploadMedia.any(), (req, res, next) => {
  console.log('Media Creation Request Body:', req.body);
  console.log('Media Files Uploaded:', req.files);
  
  if (!req.files?.length) {
    console.log('No media files attached');
  }
  
  createMedia(req, res, next);
});

// Обновление существующей медиа-записи
router.put('/:id', uploadMedia.any(), (req, res, next) => {
  console.log('Media Update Request Body:', req.body);
  console.log('New Media Files:', req.files);
  
  if (req.files?.length) {
    console.log(`Uploaded ${req.files.length} new files`);
  }
  
  updateMedia(req, res, next);
});

// Удаление медиа-записи
router.delete('/:id', deleteMedia);

export default router;
