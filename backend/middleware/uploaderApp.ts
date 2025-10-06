import multer from 'multer';
import fs from 'fs';
import path from 'path';

// Создаем папку temp если её нет
const tempDir = './temp';
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Временная директория для приёма файла; контроллер переместит в нужную папку
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    // Используем оригинальное имя файла
    cb(null, file.originalname);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Разрешаем все типы файлов для приложений
  cb(null, true);
};

const uploadApp = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB лимит
  }
});

export default uploadApp;
