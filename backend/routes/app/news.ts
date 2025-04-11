import { Router } from 'express';
import {
  getNews,
  getNewsById,
  createNews,
  updateNews,
  deleteNews,
} from '../../controllers/app/news';

const router = Router();

router.get('/', getNews);
router.get('/:id', getNewsById);
router.post('/', createNews);
router.patch('/:id', updateNews);
router.delete('/:id', deleteNews);

export default router;