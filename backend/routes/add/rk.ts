import { Router } from 'express';
import { getRKList, createRK, getRKById, updateRK, deleteRK } from '../../controllers/add/rk.js';
import uploadRK from '../../middleware/uploaderRK.js'; // Предполагается, что у вас есть middleware для загрузки файлов

const router = Router();

// Получить все записи RK
router.get('/', getRKList);

// Получить конкретную запись RK по ID
router.get('/:id', getRKById);

// Создать новую запись RK с загрузкой файлов
router.post('/', uploadRK.any(), (req, res, next) => {
  // Логирование запроса
  console.log('Request Body:', req.body);
  console.log('Request Files:', req.files);

  // Проверка наличия файлов
  if (!req.files || req.files.length === 0) {
    console.log('No files uploaded for RK');
  } else {
    console.log('RK files uploaded:', req.files);
  }

  // Вызов контроллера создания RK
  createRK(req, res, next);
});

// Обновить существующую запись RK с загрузкой новых файлов
router.put('/:id', uploadRK.any(), (req, res, next) => {
  // Логирование запроса
  console.log('Request Body:', req.body);
  console.log('Request Files:', req.files);

  // Проверка наличия файлов
  if (!req.files || req.files.length === 0) {
    console.log('No files uploaded for RK update');
  } else {
    console.log('RK update files uploaded:', req.files);
  }

  // Вызов контроллера обновления RK
  updateRK(req, res, next);
});

// Удалить запись RK
router.delete('/:id', deleteRK);

export default router;