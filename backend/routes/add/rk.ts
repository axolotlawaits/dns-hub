import { Router, Request, Response, NextFunction } from 'express';
import { getRKList, getRKById, createRK, updateRK, deleteRK, getRKTypes, getRKStatuses, getBranchesList } from '../../controllers/add/rk.js';
import uploadRK from '../../middleware/uploaderRK.js';

const router = Router();

// Основные маршруты RK
router.get('/', getRKList); // Получить все записи RK
router.get('/:id', getRKById); // Получить конкретную запись RK по ID

// Создание и обновление с обработкой файлов
router.post('/', uploadRK.any(), (req: Request, res: Response, next: NextFunction) => {
  console.log('RK Creation Request:', {
    body: req.body,
    files: Array.isArray(req.files) ? req.files.map((f: Express.Multer.File) => ({
      originalname: f.originalname,
      size: f.size,
      mimetype: f.mimetype
    })) : []
  });
  createRK(req, res, next);
});

router.put('/:id', uploadRK.any(), (req: Request, res: Response, next: NextFunction) => {
  console.log('RK Update Request:', {
    id: req.params.id,
    body: req.body,
    files: Array.isArray(req.files) ? req.files.map((f: Express.Multer.File) => ({
      originalname: f.originalname,
      size: f.size,
      mimetype: f.mimetype
    })) : []
  });
  updateRK(req, res, next);
});

router.delete('/:id', deleteRK); // Удалить запись RK

// Справочные данные
router.get('/types/list', getRKTypes); // Получить список типов конструкций
router.get('/statuses/list', getRKStatuses); // Получить список статусов
router.get('/branches/list', getBranchesList); // Получить список филиалов

export default router;