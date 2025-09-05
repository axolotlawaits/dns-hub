import express from 'express';
import { validateData } from '../../middleware/validation.js';
import { z } from 'zod';
import { 
  createOrUpdateDevice, 
  getDeviceByBranchId, 
  getAllDevices, 
  deleteDevice,
  heartbeat
} from '../../controllers/app/device.js';

const createDeviceSchema = z.object({
  userEmail: z.string().email('Некорректный email'),
  branchType: z.string().min(1, 'branchType обязателен'),
  deviceName: z.string().optional(),
  vendor: z.string().optional(),
  network: z.string().optional(),
  number: z.string().optional(),
  app: z.string().optional(),
  os: z.string().optional()
});

const heartbeatSchema = z.object({
  deviceId: z.string().min(1, 'deviceId обязателен'),
  appVersion: z.string().optional()
});

const router = express.Router();

// Создание или обновление устройства
router.post('/create', validateData(createDeviceSchema), createOrUpdateDevice);

// Heartbeat от устройства
router.post('/heartbeat', validateData(heartbeatSchema), heartbeat);

// Получение устройства по branchId
router.get('/branch/:branchId', getDeviceByBranchId);

// Получение всех устройств
router.get('/all', getAllDevices);

// Удаление устройства
router.delete('/:id', deleteDevice);

export default router;
