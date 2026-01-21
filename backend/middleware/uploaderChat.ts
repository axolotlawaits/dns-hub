import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { decodeRussianFileName } from '../utils/format.js';

const uploadDir = './public/jurists/safety/chat'

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    try {
      // Исправляем кодировку русских символов в названии файла
      const correctedFileName = decodeRussianFileName(file.originalname);
      // Добавляем timestamp для уникальности
      const timestamp = Date.now();
      const ext = path.extname(correctedFileName) || '';
      let name = path.basename(correctedFileName, ext);
      
      // Если имя файла пустое (например, файл без расширения или с только расширением), используем GUID
      if (!name || name.trim() === '') {
        name = `file_${timestamp}`;
      }
      
      // Заменяем проблемные символы в имени файла (пробелы, скобки и т.д.) на подчеркивания
      // Это предотвращает проблемы с URL-кодированием
      name = name.replace(/[^\w\-_\.]/g, '_');
      // Убираем множественные подчеркивания
      name = name.replace(/_+/g, '_');
      // Убираем подчеркивания в начале и конце
      name = name.replace(/^_+|_+$/g, '');
      
      // Если после обработки имя стало пустым, используем GUID
      if (!name || name.trim() === '') {
        name = `file_${timestamp}`;
      }
      
      cb(null, `${name}_${timestamp}${ext}`);
    } catch (error) {
      // В случае ошибки используем GUID с timestamp
      const timestamp = Date.now();
      const ext = path.extname(file.originalname) || '';
      cb(null, `file_${timestamp}${ext}`);
    }
  },
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Разрешаем все типы файлов
  cb(null, true);
};

const uploadChat = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB максимум
    files: 10 // Максимум 10 файлов за раз
  }
});

export default uploadChat;

