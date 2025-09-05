import express, { RequestHandler } from 'express';
import uploadRadio from '../../middleware/uploaderRadio.js';
import {  createRadioFolder,  uploadMusic,  getRadioFolders,  getMusicInFolder,  deleteRadioFolder, getDevicesByBranches, getDevicesStatus, getDevicesStatusPing, updateDeviceTime, updateBranchDevicesTime, getDevicesStats, getDeviceInfo, actionRestartApp, actionGetTime, actionSyncTime, actionSetTime, actionGetDeviceStatus, actionConfigureWifi, actionReboot, actionUpdateApp} from '../../controllers/app/radio.js';

const router = express.Router();
const h = (fn: any) => fn as unknown as RequestHandler;

router.post('/folder/create', h(createRadioFolder));
router.post('/upload', uploadRadio.single('music'), h(uploadMusic));
router.get('/folders', h(getRadioFolders));
router.get('/folder/:folderName/music', h(getMusicInFolder));
router.delete('/folder/:folderName', h(deleteRadioFolder));

router.get('/devices', h(getDevicesByBranches));
router.get('/devices-status', h(getDevicesStatus));
router.get('/devices-status-ping', h(getDevicesStatusPing));
router.get('/stats', h(getDevicesStats));
router.get('/devices/:deviceId', h(getDeviceInfo));
router.put('/devices/:deviceId/time', h(updateDeviceTime));
router.put('/branches/:branchId/devices/time', h(updateBranchDevicesTime));
router.post('/devices/:deviceId/restart-app', h(actionRestartApp));
router.post('/devices/:deviceId/reboot', h(actionReboot));
router.post('/devices/:deviceId/get-time', h(actionGetTime));
router.post('/devices/:deviceId/sync-time', h(actionSyncTime));
router.post('/devices/:deviceId/set-time', h(actionSetTime));
router.post('/devices/:deviceId/get-status', h(actionGetDeviceStatus));
router.post('/devices/:deviceId/configure-wifi', h(actionConfigureWifi));
router.post('/devices/:deviceId/update-app', h(actionUpdateApp));

export default router;
