import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = './public/add/slider'

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  },
});

const uploadSlider = multer({ storage: storage });

export default uploadSlider;