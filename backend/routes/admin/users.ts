import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  loginAsUser
} from '../../controllers/admin/users.js';

const router = Router();

// Все маршруты требуют аутентификации и роли DEVELOPER
router.use(authenticateToken);

// Получение списка пользователей
router.get('/', getUsers);

// Получение пользователя по ID
router.get('/:id', getUserById);

// Создание пользователя
router.post('/', createUser);

// Обновление пользователя
router.patch('/:id', updateUser);

// Удаление пользователя
router.delete('/:id', deleteUser);

// Войти как пользователь
router.post('/:userId/login-as', loginAsUser);

export default router;

