import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { decodeRussianFileName } from '../utils/format.js';

// Создаем базовые папки для радио файлов
const musicBase = './public/retail/radio/music';
const streamBase = './public/retail/radio/stream';

[musicBase, streamBase].forEach(base => {
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let targetDir: string;
    
    // Для загрузки музыки - сразу в папку текущего месяца
    if (req.path === '/upload' || req.path.includes('/upload')) {
      const currentDate = new Date();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const year = currentDate.getFullYear();
      const folderName = `${month}-${year}`;
      targetDir = `./public/retail/radio/music/${folderName}`;
    }
    // Для загрузки потоков - в папку stream
    else if (req.path.includes('/streams')) {
      targetDir = './public/retail/radio/stream';
    }
    // Если маршрут не распознан - ошибка
    else {
      return cb(new Error(`Неизвестный маршрут для загрузки файлов: ${req.path}`), '');
    }
    
    // Создаем директорию если её нет
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    cb(null, targetDir);
  },
  filename: function (req, file, cb) {
    // Исправляем кодировку русских символов в названии файла
    const correctedFileName = decodeRussianFileName(file.originalname);
    cb(null, correctedFileName);
  },
});

const fileFilter = (req: any, file: any, cb: any) => {
  // Основной формат - MP3, также поддерживаем другие аудио форматы
  const allowed = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/flac'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Неподдерживаемый тип файла. Рекомендуется MP3 формат.'), false);
};

// Основной uploader для всех радио файлов
const uploadRadio = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

// Специализированные uploaders для разных типов файлов
const uploadMusic = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });
const uploadStream = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

export default uploadRadio;
export { uploadMusic, uploadStream };
