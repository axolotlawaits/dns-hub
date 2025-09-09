import express from 'express';
import { NotificationController } from '../../controllers/app/notification.js'

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const notification = await NotificationController.create(req.body);
    res.status(201).json(notification);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid data' });
  }
});

// Mark single notification as read (change to PATCH)
router.patch('/read/:id', async (req, res) => {
  try {
    const result = await NotificationController.markAsRead({
      notificationId: req.params.id,
      userId: req.body.userId
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid data' });
  }
});

// Add mark all as read endpoint
router.patch('/read-all', async (req, res) => {
  try {
    const result = await NotificationController.markAllAsRead(req.body.userId);
    res.json({ success: true, count: result.count });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid data' });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await NotificationController.getNotifications({
      userId: req.query.userId as string,
      limit: Number(req.query.limit) || 20,
      offset: Number(req.query.offset) || 0,
      read: req.query.read ? req.query.read === 'true' : undefined,
      include: req.query.include ? String(req.query.include).split(',') as any : [],
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid data' });
  }
});

router.get('/unread-count/:userId', async (req, res) => {
  try {
    const count = await NotificationController.getUnreadCount(req.params.userId);
    res.json({ count });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid data' });
  }
});

// Delete notification by ID
router.delete('/:id', async (req, res) => {
  try {
    const result = await NotificationController.delete(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid data' });
  }
});

export default router;