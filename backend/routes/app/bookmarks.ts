import express from 'express';
import { 
  getUserBookmarks, 
  createBookmark, 
  deleteBookmark, 
  updateBookmark, 
  reorderBookmarks 
} from '../../controllers/app/bookmarks.js';

const router = express.Router();

// GET /:id - Get all user bookmarks
router.get('/:id', getUserBookmarks);

// POST / - Create new bookmark
router.post('/', createBookmark);

// DELETE /:id - Delete bookmark by ID
router.delete('/:id', deleteBookmark);

// PUT /:id - Update bookmark by ID
router.put('/:id', updateBookmark);

// POST /reorder - Manual reordering with confirmation
router.post('/reorder', reorderBookmarks);

export default router;