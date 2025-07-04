import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = './public/advertisement/media'

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

const uploadCorrespondence = multer({ storage: storage });

export default uploadCorrespondence;