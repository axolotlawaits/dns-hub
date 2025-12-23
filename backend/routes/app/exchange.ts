// Роуты для Exchange интеграции
import express from 'express';
import {
  getMyCalendarEvents
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

// Календарь - только чтение
router.get('/calendar/events', getMyCalendarEvents);

// УДАЛЕНО: Создание, обновление, удаление событий, получение комнат, статус
// Оставлен только календарь (чтение) и проверка новых писем (через cron)

export default router;

