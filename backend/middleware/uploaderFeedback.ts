import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { decodeRussianFileName } from '../utils/format.js';

// Директория для хранения файлов обратной связи
const feedbackUploadDir = path.join(process.cwd(), 'public', 'feedback');

// Создаем директорию, если её нет
if (!fs.existsSync(feedbackUploadDir)) {
  fs.mkdirSync(feedbackUploadDir, { recursive: true });
}

// Функция для генерации уникального имени файла с проверкой на существование
const generateUniqueFilename = (dir: string, originalName: string): string => {
  const correctedFileName = decodeRussianFileName(originalName);
  const ext = path.extname(correctedFileName);
  const baseName = path.basename(correctedFileName, ext);
  
  // Проверяем, существует ли файл с таким именем
  let finalName = correctedFileName;
  let counter = 1;
  
  while (fs.existsSync(path.join(dir, finalName))) {
    finalName = `${baseName}(${counter})${ext}`;
    counter++;
  }
  
  return finalName;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, feedbackUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = generateUniqueFilename(feedbackUploadDir, file.originalname);
    cb(null, uniqueName);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Разрешаем только изображения
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Разрешены только изображения'));
  }
};

const uploadFeedback = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

export default uploadFeedback;

