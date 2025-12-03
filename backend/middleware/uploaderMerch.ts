import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { decodeRussianFileName } from '../utils/format.js';

// Создаем директорию для мерч-файлов, если её нет
const merchUploadDir = path.join(process.cwd(), 'public', 'add', 'merch');
if (!fs.existsSync(merchUploadDir)) {
  fs.mkdirSync(merchUploadDir, { recursive: true });
}

// Настройка multer для мерч-системы
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log(`📁 [uploaderMerch] Сохраняем файл в: ${merchUploadDir}`);
    cb(null, merchUploadDir);
  },
  filename: (req, file, cb) => {
    // Исправляем кодировку русских символов и сохраняем оригинальное название
    const correctedFileName = decodeRussianFileName(file.originalname);
    console.log(`📄 [uploaderMerch] Исправляем кодировку: ${file.originalname} -> ${correctedFileName}`);
    
    // Генерируем уникальное имя файла с проверкой на существование
    const ext = path.extname(correctedFileName);
    const baseName = path.basename(correctedFileName, ext);
    let finalName = correctedFileName;
    let counter = 1;
    
    while (fs.existsSync(path.join(merchUploadDir, finalName))) {
      finalName = `${baseName}(${counter})${ext}`;
      counter++;
    }
    
    console.log(`📄 [uploaderMerch] Финальное имя файла: ${finalName}`);
    cb(null, finalName);
  }
});

// Фильтр для проверки типов файлов
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  console.log(`🔍 [uploaderMerch] Проверяем файл: ${file.originalname}, тип: ${file.mimetype}`);
  // Разрешаем изображения и PDF
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    console.log(`✅ [uploaderMerch] Файл ${file.originalname} принят`);
    cb(null, true);
  } else {
    console.log(`❌ [uploaderMerch] Файл ${file.originalname} отклонен (не изображение и не PDF)`);
    cb(new Error('Разрешены только изображения и PDF файлы!'));
  }
};

// Настройки multer
const uploadMerch = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB максимум
    files: 10 // Максимум 10 файлов за раз
  }
});

export { uploadMerch };
