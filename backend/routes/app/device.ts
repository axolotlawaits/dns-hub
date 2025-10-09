import express from 'express';
import { validateData } from '../../middleware/validation.js';
import { z } from 'zod';
import { 
  createOrUpdateDevice, 
  getDeviceByBranchId, 
  getAllDevices, 
  deleteDevice,
  heartbeat,
  updateDeviceIP,
  getDeviceById,
  getDeviceByIP,
  getDeviceByMAC
} from '../../controllers/app/device.js';

const createDeviceSchema = z.object({
  userEmail: z.string().email('Некорректный email'),
  branchType: z.string().min(1, 'branchType обязателен'),
  deviceName: z.string().optional(),
  vendor: z.string().optional(),
  network: z.string().optional(),
  number: z.string().optional(),
  app: z.string().optional(),
  os: z.string().optional(),
  deviceIP: z.string().optional(),
  ip: z.string().optional(),
  deviceId: z.string().optional(),
  deviceUuid: z.string().optional(),
  macAddress: z.string().optional()
});

const heartbeatSchema = z.object({
  deviceId: z.string().min(1, 'deviceId обязателен'),
  appVersion: z.string().optional(),
  macAddress: z.string().optional(),
  currentIP: z.string().optional()
});

const updateDeviceIPSchema = z.object({
  deviceId: z.string().min(1, 'deviceId обязателен'),
  deviceIP: z.string().optional(),
  network: z.string().optional(),
  number: z.string().optional()
});

const router = express.Router();

// Создание или обновление устройства
router.post('/create', validateData(createDeviceSchema), createOrUpdateDevice);

// Heartbeat от устройства
router.post('/heartbeat', validateData(heartbeatSchema), heartbeat);

// Обновление IP адреса устройства
router.put('/update-ip', validateData(updateDeviceIPSchema), updateDeviceIP);

// Получение устройства по IP адресу
router.get('/ip/:ip', getDeviceByIP);

// Получение устройства по MAC адресу
router.get('/mac/:macAddress', getDeviceByMAC);

// Получение устройства по branchId
router.get('/branch/:branchId', getDeviceByBranchId);

// Получение устройства по ID
router.get('/:id', getDeviceById);

// Получение всех устройств
router.get('/all', getAllDevices);

// Удаление устройства
router.delete('/:id', deleteDevice);

export default router;
