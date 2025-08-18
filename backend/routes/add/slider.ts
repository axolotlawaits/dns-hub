import { Router } from 'express';
import { getAllSliders, createSlider, getSliderById, updateSlider, deleteSlider } from '../../controllers/add/slider.js';
import uploadSlider from '../../middleware/uploaderSlider.js';

const router = Router();

// Получение всех слайдеров
router.get('/', getAllSliders);

// Получение конкретного слайдера по ID
router.get('/:id', getSliderById);

// Создание нового слайдера
router.post('/', uploadSlider.single('attachment'), (req, res, next) => {
  console.log('Slider Creation Request Body:', req.body);
  console.log('Slider Attachment:', req.file);
  
  if (!req.file) {
    console.log('No slider attachment provided');
  }
  
  createSlider(req, res, next);
});

// Обновление существующего слайдера
router.put('/:id', uploadSlider.single('attachment'), (req, res, next) => {
  console.log('Slider Update Request Body:', req.body);
  console.log('New Slider Attachment:', req.file);
  
  if (req.file) {
    console.log('New attachment uploaded');
  }
  
  updateSlider(req, res, next);
});

// Удаление слайдера
router.delete('/:id', deleteSlider);

export default router;