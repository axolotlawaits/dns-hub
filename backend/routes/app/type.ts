// routes/app/type.ts
import express from 'express';
import { 
  getTypes, 
  getTypeById,
  getTypesByModelUuid,
  createType,
  updateType,
  deleteType,
  loadCorrespondenceTypes
} from '../../controllers/app/type.js';

const router = express.Router();

// Маршрут для всех элементов типов
router.get('/', getTypes);

// Маршрут для получения типов для модели
// ВАЖНО: этот маршрут должен идти ДО `/:id`, иначе Express
// будет интерпретировать `sub` как значение параметра `id`
router.get('/sub', getTypesByModelUuid);

// Маршрут для получения типа по ID
router.get('/:id', getTypeById);

// Маршрут для создания типа
router.post('/', createType);

// Маршрут для обновления типа
router.patch('/:id', updateType);

// Маршрут для удаления типа
router.delete('/:id', deleteType);

// Маршрут для загрузки типов корреспонденции
router.post('/load-correspondence-types', loadCorrespondenceTypes);

export default router;
