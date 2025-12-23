// Роуты для Exchange интеграции
import express from 'express';
import {
  getMyCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getExchangeStatus,
  getRooms
} from '../../controllers/app/exchange.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = express.Router();

// Логирование всех запросов к Exchange API
router.use((req, res, next) => {
  console.log(`[Exchange Router] 📨 ${req.method} ${req.path} - Request received`);
  console.log(`[Exchange Router] 📨 Full URL: ${req.originalUrl}`);
  console.log(`[Exchange Router] 📨 Query:`, req.query);
  console.log(`[Exchange Router] 📨 Headers:`, {
    authorization: req.headers.authorization ? 'present' : 'missing',
    'content-type': req.headers['content-type'] || 'not set'
  });
  next();
});

// Все роуты требуют аутентификации
router.use(authenticateToken);

// Статус интеграции
router.get('/status', getExchangeStatus);

// Помещения
router.get('/rooms', getRooms);

// Календарь
router.get('/calendar/events', getMyCalendarEvents);
router.post('/calendar/events', createCalendarEvent);
router.patch('/calendar/events/:eventId', updateCalendarEvent);
router.delete('/calendar/events/:eventId', deleteCalendarEvent);

// УДАЛЕНО: Контакты, задачи, информация о пользователе - не используются
// Оставлен только календарь и проверка новых писем

export default router;

