import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = './public/add/RK'

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Сохраняем оригинальное название файла
    let originalName = file.originalname;
    
    // Проверяем, есть ли проблемы с кодировкой (mojibake)
    if (/Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ/.test(originalName)) {
      try {
        // Пытаемся исправить mojibake
        originalName = Buffer.from(originalName, 'latin1').toString('utf8');
      } catch (e) {
        // Если не получается, оставляем как есть
      }
    }
    
    cb(null, originalName);
  },
});

const uploadRK = multer({ storage: storage });

export default uploadRK;