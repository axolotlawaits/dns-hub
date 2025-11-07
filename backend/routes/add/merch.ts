import { Router } from 'express';
import {
  getMerchHierarchy,
  createMerchCategory,
  updateMerchCategory,
  deleteMerchCategory,
  createMerchCard,
  updateMerchCard,
  deleteMerchCard,
  addCardImages,
  addMerchAttachment,
  deleteMerchAttachment
} from '../../controllers/add/merch.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = Router();

// GET запросы публичные (для чтения данных)
router.get('/categories', getMerchHierarchy as any);

// Все остальные операции требуют аутентификации
router.use(authenticateToken);

// Роуты для категорий (layer = 1)
router.post('/categories', ...(createMerchCategory as any));
router.put('/categories/:id', ...(updateMerchCategory as any));
router.delete('/categories/:id', deleteMerchCategory as any);

// Роуты для карточек (layer = 0)
router.post('/cards', ...(createMerchCard as any));
router.put('/cards/:id', ...(updateMerchCard as any));
router.delete('/cards/:id', deleteMerchCard as any);
router.post('/cards/:id/images', ...(addCardImages as any));

// Роуты для attachments
router.post('/attachments/:recordId', ...(addMerchAttachment as any));
router.delete('/attachments/:id', deleteMerchAttachment as any);

export default router;
