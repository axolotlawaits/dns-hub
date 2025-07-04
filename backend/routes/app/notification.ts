import express from 'express';
import { getNotifications, markAsRead } from '../../controllers/app/notification.js';

const router = express.Router();

router.get('/', getNotifications);
router.patch('/:id/read', markAsRead);

export default router;