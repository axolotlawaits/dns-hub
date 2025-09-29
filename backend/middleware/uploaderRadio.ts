import multer from 'multer';
import path from 'path';
import fs from 'fs';

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
    // Временная директория для приёма файла; контроллер переместит в нужную папку
    const tempDir = './temp';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
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
