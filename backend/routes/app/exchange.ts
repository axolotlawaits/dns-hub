// Роуты для Exchange интеграции
import express from 'express';
import {
  getMyCalendarEvents
} from '../../controllers/app/exchange.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = express.Router();

// Логирование только ошибок происходит в контроллерах

// Все роуты требуют аутентификации
router.use(authenticateToken);

// Календарь - только чтение
router.get('/calendar/events', getMyCalendarEvents);

// УДАЛЕНО: Создание, обновление, удаление событий, получение комнат, статус
// Оставлен только календарь (чтение) и проверка новых писем (через cron)

export default router;

