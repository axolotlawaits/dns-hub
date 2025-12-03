// routes/app/type.ts
import express from 'express';
import { 
  getTypes, 
  getTypeById,
  getTypesByModelUuid,
  createType,
  updateType,
  deleteType
} from '../../controllers/app/type.js';

const router = express.Router();

// Маршрут для всех элементов типов
router.get('/', getTypes);

// Маршрут для получения типа по ID
router.get('/:id', getTypeById);

// Маршрут для получения типов для модели
router.get('/sub', getTypesByModelUuid);

// Маршрут для создания типа
router.post('/', createType);

// Маршрут для обновления типа
router.patch('/:id', updateType);

// Маршрут для удаления типа
router.delete('/:id', deleteType);

export default router;
