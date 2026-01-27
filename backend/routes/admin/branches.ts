import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import {
  getBranches,
  getBranchById,
  createBranch,
  updateBranch
} from '../../controllers/admin/branches.js';

const router = Router();

// Все маршруты требуют аутентификации и роли DEVELOPER
router.use(authenticateToken);

// Получение списка филиалов
router.get('/', getBranches);

// Получение филиала по ID
router.get('/:id', getBranchById);

// Создание филиала
router.post('/', createBranch);

// Обновление филиала
router.patch('/:id', updateBranch);

export default router;

