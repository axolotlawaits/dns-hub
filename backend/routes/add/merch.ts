import { Router } from 'express';
import {
  getMerchHierarchy,
  createMerchCategory,
  updateMerchCategory,
  deleteMerchCategory,
  createMerchCard,
  addMerchAttachment,
  deleteMerchAttachment
} from '../../controllers/add/merch.js';

const router = Router();

// Роуты для категорий (layer = 1)
router.get('/categories', getMerchHierarchy as any);
router.post('/categories', ...(createMerchCategory as any));
router.put('/categories/:id', ...(updateMerchCategory as any));
router.delete('/categories/:id', deleteMerchCategory as any);

// Роуты для карточек (layer = 0)
router.post('/cards', ...(createMerchCard as any));

// Роуты для attachments
router.post('/attachments/:recordId', ...(addMerchAttachment as any));
router.delete('/attachments/:id', deleteMerchAttachment as any);

export default router;
