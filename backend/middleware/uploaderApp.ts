import multer from 'multer';
import fs from 'fs';
import path from 'path';

// Создаем базовую папку для приложений
const appBase = './public/retail/app';
if (!fs.existsSync(appBase)) {
  fs.mkdirSync(appBase, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Для загрузки версий приложений - используем temp, но контроллер будет копировать, а не перемещать
    if (req.path.includes('/versions')) {
      const tempDir = './temp';
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      cb(null, tempDir);
    } else {
      cb(new Error(`Неизвестный маршрут для загрузки файлов: ${req.path}`), '');
    }
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
