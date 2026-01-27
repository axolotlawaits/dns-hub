import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth.js';
import * as programsController from '../../../controllers/Education/Training/programs.js';

const router = Router();

// Все роуты требуют аутентификации
router.use(authenticateToken);

// Список программ (дерево)
router.get('/', programsController.getPrograms);

// Детали программы
router.get('/:id', programsController.getProgramById);

// Создание программы (только для админов)
router.post('/', programsController.createProgram);

// Обновление программы
router.put('/:id', programsController.updateProgram);

// Удаление программы
router.delete('/:id', programsController.deleteProgram);

export default router;
