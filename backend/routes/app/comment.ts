import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import {
  createComment,
  getComments,
  updateComment,
  deleteComment,
  markCommentsAsRead,
} from '../../controllers/app/comment.js';

const router = Router();

// Публичные роуты (чтение)
router.get('/', getComments);

// Защищенные роуты
router.use(authenticateToken);

router.post('/', createComment);
router.put('/:id', updateComment);
router.delete('/:id', deleteComment);
router.post('/mark-read', markCommentsAsRead);

export default router;

