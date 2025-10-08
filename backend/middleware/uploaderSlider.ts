import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { decodeRussianFileName } from '../utils/format.js';

const uploadDir = './public/add/slider'

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Исправляем кодировку русских символов в названии файла
    const correctedFileName = decodeRussianFileName(file.originalname);
    cb(null, correctedFileName);
  },
});

const uploadSlider = multer({ storage: storage });

export default uploadSlider;