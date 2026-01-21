// routes/docs/docs.ts
import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import * as articlesController from '../../controllers/docs/articles.js';
import * as categoriesController from '../../controllers/docs/categories.js';
import * as commentsController from '../../controllers/docs/comments.js';
import * as favoritesController from '../../controllers/docs/favorites.js';
import * as attachmentsController from '../../controllers/docs/attachments.js';
import uploadDocs from '../../middleware/uploaderDocs.js';

const router = Router();

// Статьи
router.get('/articles', articlesController.getArticles);
router.get('/articles/:id', articlesController.getArticleById);
router.get('/articles/slug/:slug', articlesController.getArticleBySlug);
router.post('/articles', authenticateToken, articlesController.createArticle);
router.patch('/articles/:id', authenticateToken, articlesController.updateArticle);
router.delete('/articles/:id', authenticateToken, articlesController.deleteArticle);
router.post('/articles/:id/pin', authenticateToken, articlesController.togglePinArticle);

// Вложения (файлы)
router.get('/articles/:articleId/attachments', attachmentsController.getArticleAttachments);
router.post('/articles/attachments', authenticateToken, uploadDocs.single('file'), attachmentsController.uploadAttachment);
router.delete('/attachments/:id', authenticateToken, attachmentsController.deleteAttachment);

// Комментарии
router.get('/articles/:id/comments', commentsController.getArticleComments);
router.post('/articles/:id/comments', authenticateToken, commentsController.createComment);
router.patch('/comments/:id', authenticateToken, commentsController.updateComment);
router.delete('/comments/:id', authenticateToken, commentsController.deleteComment);

// Избранное
router.get('/favorites', authenticateToken, favoritesController.getFavorites);
router.post('/articles/:id/favorite', authenticateToken, favoritesController.addToFavorites);
router.delete('/articles/:id/favorite', authenticateToken, favoritesController.removeFromFavorites);

// Категории
router.get('/categories', categoriesController.getCategories);
router.get('/categories/:id', categoriesController.getCategoryById);
router.post('/categories', authenticateToken, categoriesController.createCategory);
router.patch('/categories/:id', authenticateToken, categoriesController.updateCategory);
router.delete('/categories/:id', authenticateToken, categoriesController.deleteCategory);

export default router;

