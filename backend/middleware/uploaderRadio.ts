import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadBase = './public/retail/radio';

if (!fs.existsSync(uploadBase)) {
  fs.mkdirSync(uploadBase, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Временная директория для приёма файла; контроллер переместит в нужную папку месяца
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
  const allowed = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/flac'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Неподдерживаемый тип файла. Разрешены только аудио файлы.'), false);
};

const uploadRadio = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

export default uploadRadio;
