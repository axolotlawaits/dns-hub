import { Router } from 'express';
import {
  getMeterReadings,
  getMeterReadingById,
  createMeterReading,
  updateMeterReading,
  deleteMeterReading,
} from '../../controllers/aho/meterReading';

const router = Router();

// Получение всех показаний счетчиков
router.get('/', getMeterReadings);

// Получение конкретного показания по ID
router.get('/:id', getMeterReadingById);

// Создание нового показания счетчика
router.post('/', createMeterReading);

// Обновление существующего показания
router.patch('/:id', updateMeterReading);

// Удаление показания
router.delete('/:id', deleteMeterReading);

export default router;