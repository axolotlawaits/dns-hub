import express from 'express';
import {
  getActivePolls,
  votePoll,
  getAllPolls,
  createPoll,
  updatePoll,
  deletePoll
} from '../../controllers/app/poll.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = express.Router();

// Все роуты требуют аутентификации
router.use(authenticateToken);

// Публичные роуты (для всех авторизованных пользователей)
router.get('/active', getActivePolls);
router.post('/:pollId/vote', votePoll);

// Админские роуты
router.get('/', getAllPolls);
router.post('/', createPoll);
router.patch('/:pollId', updatePoll);
router.delete('/:pollId', deletePoll);

export default router;

