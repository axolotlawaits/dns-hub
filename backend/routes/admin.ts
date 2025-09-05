import { Router, RequestHandler } from 'express';
import {
  getDevicesByBranches,
  updateDeviceTime,
  updateBranchDevicesTime,
  getDevicesStats,
  getDeviceInfo,
  getDevicesStatus,
  getDevicesStatusPing
} from '../controllers/app/radio.js'

const router = Router();
const h = (fn: any) => fn as unknown as RequestHandler;

router.get('/devices', h(getDevicesByBranches));
router.get('/stats', h(getDevicesStats));
router.get('/devices/:deviceId', h(getDeviceInfo));
router.get('/devices-status', h(getDevicesStatus));
router.get('/devices-status-ping', h(getDevicesStatusPing));
router.put('/devices/:deviceId/time', h(updateDeviceTime));
router.put('/branches/:branchId/devices/time', h(updateBranchDevicesTime));

export default router;
