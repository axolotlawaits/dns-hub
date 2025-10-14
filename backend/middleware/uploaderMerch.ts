import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Создаем директорию для мерч-файлов, если её нет
const merchUploadDir = path.join(process.cwd(), 'public', 'merch');
if (!fs.existsSync(merchUploadDir)) {
  fs.mkdirSync(merchUploadDir, { recursive: true });
}

// Настройка multer для мерч-системы
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, merchUploadDir);
  },
  filename: (req, file, cb) => {
    // Генерируем уникальное имя файла с timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `merch-${uniqueSuffix}${ext}`);
  }
});

// Фильтр для проверки типов файлов
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Разрешаем только изображения
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Разрешены только изображения!'));
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
