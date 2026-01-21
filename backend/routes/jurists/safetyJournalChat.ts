import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import uploadChat from '../../middleware/uploaderChat.js';
import {
  getAllUsers,
  getCheckers,
  getChatParticipants,
  getChats,
  getBranchesWithChats,
  getOrCreateChat,
  getMessages,
  sendMessage,
  markMessagesAsRead,
  deleteMessage,
  updateMessage
} from '../../controllers/jurists/safetyJournalChat.js';

const router = express.Router();

router.use(authenticateToken);

// Получить список всех пользователей
router.get('/users', getAllUsers);

// Получить список проверяющих
router.get('/checkers', getCheckers);

// Получить всех участников чата для ответственного (проверяющие + ответственные за филиал)
router.get('/participants', getChatParticipants);

// Получить чаты
router.get('/chats', getChats);

// Получить все филиалы с чатами (для проверяющего)
router.get('/branches-with-chats', getBranchesWithChats);

// Более специфичные маршруты должны быть ПЕРЕД общими
// Получить сообщения чата
router.get('/chats/:chatId/messages', getMessages);

// Отправить сообщение (с поддержкой файлов через multer)
router.post('/chats/:chatId/messages', (req, res, next) => {
  uploadChat.array('files', 10)(req, res, (err: any) => {
    if (err) {
      // Обрабатываем ошибки Multer
      if (err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ 
            error: 'Файл слишком большой',
            message: 'Максимальный размер файла: 50 МБ'
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({ 
            error: 'Слишком много файлов',
            message: 'Максимальное количество файлов: 10'
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ 
            error: 'Неожиданное поле файла',
            message: 'Используйте поле "files" для загрузки файлов'
          });
        }
        return res.status(400).json({ 
          error: 'Ошибка загрузки файла',
          message: err.message
        });
      }
      return next(err);
    }
    next();
  });
}, sendMessage);

// Редактировать сообщение
router.patch('/chats/:chatId/messages/:messageId', updateMessage);

// Удалить сообщение
router.delete('/chats/:chatId/messages/:messageId', deleteMessage);

// Отметить сообщения как прочитанные
router.post('/chats/:chatId/read', markMessagesAsRead);

// Получить или создать чат (должен быть после более специфичных маршрутов)
router.get('/chats/:branchId/:checkerId', getOrCreateChat);

export default router;

