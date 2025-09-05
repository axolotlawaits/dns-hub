import { Request, Response } from "express";
import fs from 'fs';
import path from 'path';
import { prisma } from '../../server.js';
import { heartbeatStore } from './device.js';
import { SocketIOService } from '../../socketio.js';

// Кэш для статистики
const statsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

// Утилита для получения текущей папки месяца
const getCurrentMonthFolder = (): string => {
  const currentDate = new Date();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const year = currentDate.getFullYear();
  return `01-${month}-${year}`;
};

// Утилита для создания папки радио
const ensureRadioFolder = (folderName?: string): string => {
  const folder = folderName || getCurrentMonthFolder();
  const radioPath = `./public/retail/radio/${folder}`;
  const baseRadioPath = './public/retail/radio';
  
  if (!fs.existsSync(baseRadioPath)) {
    fs.mkdirSync(baseRadioPath, { recursive: true });
  }
  if (!fs.existsSync(radioPath)) {
    fs.mkdirSync(radioPath, { recursive: true });
  }
  
  return radioPath;
};

// Создание папки для радио с текущей датой
export const createRadioFolder = async (req: Request, res: Response): Promise<any> => {
  try {
    const folderName = getCurrentMonthFolder();
    const radioPath = ensureRadioFolder(folderName);
    
    return res.status(200).json({ 
      success: true, 
      message: 'Папка для радио создана успешно', 
      folderName, 
      path: radioPath 
    });
  } catch (error) {
    console.error('Error creating radio folder:', error);
    return res.status(500).json({ error: 'Ошибка при создании папки для радио' });
  }
};

export const uploadMusic = async (req: Request, res: Response): Promise<any> => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }
    
    const folderName = getCurrentMonthFolder();
    const radioPath = ensureRadioFolder(folderName);
    
    const fileName = req.file.originalname;
    const filePath = path.join(radioPath, fileName);
    
    if (fs.existsSync(filePath)) {
      const timestamp = Date.now();
      const nameWithoutExt = path.parse(fileName).name;
      const ext = path.parse(fileName).ext;
      const newFileName = `${nameWithoutExt}_${timestamp}${ext}`;
      const newFilePath = path.join(radioPath, newFileName);
      fs.renameSync(req.file.path, newFilePath);
      return res.status(200).json({ 
        success: true, 
        message: 'Музыка загружена успешно', 
        fileName: newFileName, 
        folderName, 
        path: newFilePath 
      });
    } else {
      fs.renameSync(req.file.path, filePath);
      return res.status(200).json({ 
        success: true, 
        message: 'Музыка загружена успешно', 
        fileName, 
        folderName, 
        path: filePath 
      });
    }
  } catch (error) {
    console.error('Error uploading music:', error);
    return res.status(500).json({ error: 'Ошибка при загрузке музыки' });
  }
};

// Асинхронная функция для получения папок радио
const getRadioFoldersAsync = (): Promise<any[]> => {
  return new Promise((resolve) => {
    setImmediate(() => {
      try {
        const radioPath = './public/retail/radio';
        if (!fs.existsSync(radioPath)) {
          resolve([]);
          return;
        }
        
        const items = fs.readdirSync(radioPath, { withFileTypes: true });
        const folders = items
          .filter(i => i.isDirectory())
          .map(dirent => {
            const folderPath = path.join(radioPath, dirent.name);
            const stats = fs.statSync(folderPath);
            return {
              name: dirent.name,
              path: folderPath,
              created: stats.birthtime
            };
          })
          .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
        
        resolve(folders);
      } catch (error) {
        console.error('Error getting radio folders:', error);
        resolve([]);
      }
    });
  });
};

export const getRadioFolders = async (req: Request, res: Response): Promise<any> => {
  try {
    const folders = await getRadioFoldersAsync();
    return res.status(200).json({ success: true, folders });
  } catch (error) {
    console.error('Error getting radio folders:', error);
    return res.status(500).json({ error: 'Ошибка при получении списка папок радио' });
  }
};

export const getMusicInFolder = async (req: Request, res: Response): Promise<any> => {
  try {
    const { folderName } = req.params;
    if (!folderName) {
      return res.status(400).json({ error: 'Название папки обязательно' });
    }
    const folderPath = `./public/retail/radio/${folderName}`;
    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: 'Папка не найдена' });
    }
    const files = fs.readdirSync(folderPath)
      .filter(file => ['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(path.extname(file).toLowerCase()))
      .map(file => {
        const filePath = path.join(folderPath, file);
        const stats = fs.statSync(filePath);
        return { name: file, size: stats.size, created: stats.birthtime, modified: stats.mtime, path: `/retail/radio/${folderName}/${file}` };
      })
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    return res.status(200).json({ success: true, folderName, files });
  } catch (error) {
    console.error('Error getting music in folder:', error);
    return res.status(500).json({ error: 'Ошибка при получении списка музыки' });
  }
};

export const deleteRadioFolder = async (req: Request, res: Response): Promise<any> => {
  try {
    const { folderName } = req.params;
    if (!folderName) return res.status(400).json({ error: 'Название папки обязательно' });
    const folderPath = `./public/retail/radio/${folderName}`;
    if (!fs.existsSync(folderPath)) return res.status(404).json({ error: 'Папка не найдена' });
    fs.rmSync(folderPath, { recursive: true, force: true });
    return res.status(200).json({ success: true, message: 'Папка радио удалена успешно', folderName });
  } catch (error) {
    console.error('Error deleting radio folder:', error);
    return res.status(500).json({ error: 'Ошибка при удалении папки радио' });
  }
};

// ===== Admin-related (moved) =====
export const getDevicesByBranches = async (req: Request, res: Response) => {
  try {
    const devices = await prisma.devices.findMany({
      include: { branch: { select: { uuid: true, name: true, typeOfDist: true, city: true, address: true } } },
      orderBy: [ { branch: { name: 'asc' } }, { createdAt: 'desc' } ]
    });

    // Используем Map для O(1) группировки вместо reduce
    const devicesByBranches = new Map();
    devices.forEach(device => {
      const bid = device.branchId;
      if (!devicesByBranches.has(bid)) {
        devicesByBranches.set(bid, { branch: device.branch, devices: [] });
      }
      devicesByBranches.get(bid).devices.push(device);
    });

    const result = Array.from(devicesByBranches.values());
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error getting devices by branches:', error);
    res.status(500).json({ success: false, error: 'Ошибка при получении устройств' });
  }
};

export const getDevicesStatus = async (req: Request, res: Response) => {
  try {
    const { branchId } = req.query as { branchId?: string };
    const where: any = {};
    if (branchId) where.branchId = String(branchId);

    const devices = await prisma.devices.findMany({ where, select: { id: true, branchId: true } });
    const now = Date.now();
    const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

    const data = devices.map((d: any) => {
      const lastSeenMem = heartbeatStore.get(d.id);
      const online = lastSeenMem ? (now - lastSeenMem <= ONLINE_THRESHOLD_MS) : false;
      return { deviceId: d.id, branchId: d.branchId, online, lastSeen: lastSeenMem ? new Date(lastSeenMem).toISOString() : null };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting devices status:', error);
    res.status(500).json({ success: false, error: 'Ошибка при получении статусов' });
  }
};

export const getDevicesStatusPing = async (req: Request, res: Response) => {
  try {
    const { branchId } = req.query as { branchId?: string };
    const where: any = {};
    if (branchId) where.branchId = String(branchId);

    const devices = await prisma.devices.findMany({ where, select: { id: true, branchId: true } });
    const deviceIds = devices.map(d => d.id);

    const socketService = SocketIOService.getInstance();
    const pingResults = await socketService.pingDevices(deviceIds, 1500);

    const data = devices.map((d) => ({ deviceId: d.id, branchId: d.branchId, online: !!pingResults[d.id]?.online, rttMs: pingResults[d.id]?.rttMs ?? null }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting devices status ping:', error);
    res.status(500).json({ success: false, error: 'Ошибка при пинге устройств' });
  }
};

// Утилита для валидации времени
const validateTimeFormat = (time: string): boolean => {
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
};

export const updateDeviceTime = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params as any;
    const { timeFrom, timeUntil } = req.body as any;
    
    if (!validateTimeFormat(timeFrom) || !validateTimeFormat(timeUntil)) {
      return res.status(400).json({ success: false, error: 'Неверный формат времени. Используйте формат HH:MM' });
    }
    
    const device = await prisma.devices.update({ 
      where: { id: deviceId }, 
      data: { timeFrom, timeUntil }, 
      include: { branch: { select: { name: true, typeOfDist: true } } } 
    });
    
    try {
      const socketService = SocketIOService.getInstance();
      (socketService as any)?.io?.emit('device_time_updated', { deviceId, timeFrom, timeUntil });
    } catch (e) {
      console.warn('Socket emit device_time_updated failed', e);
    }
    
    res.json({ success: true, data: device, message: 'Время воспроизведения обновлено' });
  } catch (error) {
    console.error('Error updating device time:', error);
    res.status(500).json({ success: false, error: 'Ошибка при обновлении времени устройства' });
  }
};

export const updateBranchDevicesTime = async (req: Request, res: Response) => {
  try {
    const { branchId } = req.params as any;
    const { timeFrom, timeUntil } = req.body as any;
    
    if (!validateTimeFormat(timeFrom) || !validateTimeFormat(timeUntil)) {
      return res.status(400).json({ success: false, error: 'Неверный формат времени. Используйте формат HH:MM' });
    }
    
    const result = await prisma.devices.updateMany({ 
      where: { branchId }, 
      data: { timeFrom, timeUntil } 
    });
    
    try {
      const socketService = SocketIOService.getInstance();
      (socketService as any)?.io?.emit('device_time_updated', { branchId, timeFrom, timeUntil });
    } catch (e) {
      console.warn('Socket emit device_time_updated (branch) failed', e);
    }
    
    res.json({ 
      success: true, 
      data: { updatedCount: result.count }, 
      message: `Время воспроизведения обновлено для ${result.count} устройств` 
    });
  } catch (error) {
    console.error('Error updating branch devices time:', error);
    res.status(500).json({ success: false, error: 'Ошибка при обновлении времени устройств филиала' });
  }
};

// Асинхронная функция для подсчета музыкальных файлов
const countMusicFilesAsync = (): Promise<number> => {
  return new Promise((resolve) => {
    setImmediate(() => {
      try {
        const radioPath = './public/retail/radio';
        if (!fs.existsSync(radioPath)) {
          resolve(0);
          return;
        }
        
        const folders = fs.readdirSync(radioPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);
        
        let totalFiles = 0;
        for (const folder of folders) {
          const folderPath = path.join(radioPath, folder);
          const files = fs.readdirSync(folderPath)
            .filter(file => ['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(path.extname(file).toLowerCase()));
          totalFiles += files.length;
        }
        resolve(totalFiles);
      } catch (error) {
        console.error('Error counting music files:', error);
        resolve(0);
      }
    });
  });
};

export const getDevicesStats = async (req: Request, res: Response) => {
  try {
    const cacheKey = 'devices_stats';
    const cached = statsCache.get(cacheKey);
    
    // Проверяем кэш
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json({ success: true, data: cached.data });
    }

    // Параллельные запросы к базе данных
    const [totalDevices, totalBranches, topBranches] = await Promise.all([
      prisma.devices.count(),
      prisma.branch.count({
        where: { status: { in: [0, 1] } } // Только филиалы со статусом 0 или 1
      }),
      prisma.branch.findMany({
        select: { name: true, typeOfDist: true, _count: { select: { devices: true } } },
        where: { 
          devices: { some: {} },
          status: { in: [0, 1] } // Только филиалы со статусом 0 или 1
        },
        orderBy: { devices: { _count: 'desc' } },
        take: 5
      })
    ]);

    const socketService = SocketIOService.getInstance();
    const activeDevices = socketService.getConnectedDeviceIds().length;
    
    // Асинхронный подсчет файлов
    const totalMusicFiles = await countMusicFilesAsync();
    
    const data = { totalDevices, activeDevices, totalBranches, totalMusicFiles, topBranches };
    
    // Кэшируем результат
    statsCache.set(cacheKey, { data, timestamp: Date.now() });
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting devices stats:', error);
    res.status(500).json({ success: false, error: 'Ошибка при получении статистики' });
  }
};

export const getDeviceInfo = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params as any;
    const device = await prisma.devices.findUnique({ where: { id: deviceId }, include: { branch: { select: { name: true, typeOfDist: true, city: true, address: true } } } });
    if (!device) return res.status(404).json({ success: false, error: 'Устройство не найдено' });
    res.json({ success: true, data: device });
  } catch (error) {
    console.error('Error getting device info:', error);
    res.status(500).json({ success: false, error: 'Ошибка при получении информации об устройстве' });
  }
};

export const actionRestartApp = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params as any;
    const socketService = SocketIOService.getInstance();
    const result = await socketService.sendToDeviceWithAck(deviceId, 'device_restart_app');
    if (!result.ok) return res.status(400).json({ success: false, error: result.error || 'DEVICE_OFFLINE' });
    const ok = (result.data as any)?.ok !== false; // по умолчанию ок, если нет явного отказа
    if (!ok) return res.status(400).json({ success: false, error: 'RESTART_FAILED' });
    res.json({ success: true, data: result.data ?? null, message: 'Команда перезапуска отправлена' });
  } catch (error) {
    console.error('Error sending restart app:', error);
    res.status(500).json({ success: false, error: 'Ошибка отправки команды' });
  }
};

export const actionGetTime = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params as any;
    const socketService = SocketIOService.getInstance();
    const result = await socketService.sendToDeviceWithAck(deviceId, 'device_get_time');
    if (!result.ok) {
      return res.json({ success: false, error: result.error || 'DEVICE_OFFLINE' });
    }
    const data: any = result.data || {};
    
    // Handle case where data might be a string representation
    let deviceTimeMs = data.deviceTimeMs;
    if (!deviceTimeMs && typeof data === 'string') {
      // Try to parse string format like '{deviceTimeMs=1756880475288, timezone=Europe/Moscow}'
      const match = data.match(/deviceTimeMs=(\d+)/);
      if (match) {
        deviceTimeMs = parseInt(match[1]);
      }
    }
    
    if (!deviceTimeMs) {
      return res.json({ success: false, error: 'NO_TIME_DATA' });
    }
    
    // Ensure we have proper data structure
    const responseData = {
      deviceTimeMs: deviceTimeMs,
      timezone: data.timezone || 'Europe/Moscow'
    };
    res.json({ success: true, data: responseData });
  } catch (error) {
    console.error('Error requesting device time:', error);
    res.status(500).json({ success: false, error: 'Ошибка запроса времени устройства' });
  }
};

// Синхронизация времени с сервером
export const actionSyncTime = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params as any;
    const socketService = SocketIOService.getInstance();
    const serverTime = new Date().toISOString();
    const result = await socketService.sendToDeviceWithAck(deviceId, 'device_sync_time', { serverTime });
    if (!result.ok) return res.json({ success: false, error: result.error || 'DEVICE_OFFLINE' });
    res.json({ success: true, data: { serverTime, deviceTime: result.data } });
  } catch (error) {
    console.error('Error syncing time:', error);
    res.status(500).json({ success: false, error: 'Ошибка синхронизации времени' });
  }
};

// Установка времени вручную
export const actionSetTime = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params as any;
    const { dateTime } = req.body;
    
    if (!dateTime) {
      return res.status(400).json({ success: false, error: 'dateTime обязателен' });
    }

    const socketService = SocketIOService.getInstance();
    const result = await socketService.sendToDeviceWithAck(deviceId, 'device_set_time', { dateTime });
    if (!result.ok) return res.json({ success: false, error: result.error || 'DEVICE_OFFLINE' });
    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Error setting time:', error);
    res.status(500).json({ success: false, error: 'Ошибка установки времени' });
  }
};

// Получение статуса устройства
export const actionGetDeviceStatus = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params as any;
    const socketService = SocketIOService.getInstance();
    const result = await socketService.sendToDeviceWithAck(deviceId, 'device_get_status');
    if (!result.ok) return res.json({ success: false, error: result.error || 'DEVICE_OFFLINE' });
    
    // Parse the data if it's a string representation
    let parsedData = result.data;
    if (typeof result.data === 'string') {
      try {
        // Parse string like '{batteryLevel=100, isPlaying=false, currentMonth=09-2025, currentWifiSSID=Не подключено, currentWifiBSSID=}'
        const dataString = result.data.replace(/[{}]/g, '');
        const pairs = dataString.split(', ');
        const parsed: any = {};
        
        for (const pair of pairs) {
          const [key, value] = pair.split('=');
          if (key && value !== undefined) {
            // Convert numeric values
            if (key === 'batteryLevel' || key === 'isPlaying') {
              parsed[key] = key === 'isPlaying' ? (value === 'true') : parseInt(value);
            } else {
              parsed[key] = value;
            }
          }
        }
        
        parsedData = parsed;
      } catch (parseError) {
        console.error('Error parsing device status data:', parseError);
        // Keep original data if parsing fails
      }
    }
    
    res.json({ success: true, data: parsedData });
  } catch (error) {
    console.error('Error getting device status:', error);
    res.status(500).json({ success: false, error: 'Ошибка получения статуса устройства' });
  }
};

// Настройка WiFi
export const actionConfigureWifi = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params as any;
    const { ssid, password, securityType = 'WPA' } = req.body;
    
    if (!ssid) {
      return res.status(400).json({ success: false, error: 'ssid обязателен' });
    }

    const socketService = SocketIOService.getInstance();
    const result = await socketService.sendToDeviceWithAck(deviceId, 'device_configure_wifi', { 
      ssid, 
      password, 
      securityType 
    });
    if (!result.ok) return res.json({ success: false, error: result.error || 'DEVICE_OFFLINE' });
    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Error configuring WiFi:', error);
    res.status(500).json({ success: false, error: 'Ошибка настройки WiFi' });
  }
};

export const actionReboot = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params as any;
    const socketService = SocketIOService.getInstance();
    const result = await socketService.sendToDeviceWithAck(deviceId, 'device_reboot');
    if (!result.ok) return res.status(400).json({ success: false, error: result.error || 'DEVICE_OFFLINE' });
    const ok = (result.data as any)?.ok === true;
    if (!ok) return res.status(400).json({ success: false, error: (result.data as any)?.error || 'NOT_SUPPORTED' });
    res.json({ success: true, data: result.data ?? null, message: 'Команда перезагрузки отправлена' });
  } catch (error) {
    console.error('Error sending reboot:', error);
    res.status(500).json({ success: false, error: 'Ошибка отправки команды' });
  }
};

export const actionUpdateApp = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params as any;
    const { apkUrl, version } = req.body as any;
    if (!apkUrl) return res.status(400).json({ success: false, error: 'apkUrl обязателен' });
    const socketService = SocketIOService.getInstance();
    const result = await socketService.sendToDeviceWithAck(deviceId, 'device_update_app', { apkUrl, version });
    if (!result.ok) return res.status(400).json({ success: false, error: result.error || 'DEVICE_OFFLINE' });
    const ok = (result.data as any)?.ok !== false;
    if (!ok) return res.status(400).json({ success: false, error: 'UPDATE_REJECTED' });
    res.json({ success: true, data: result.data ?? null, message: 'Команда обновления отправлена' });
  } catch (error) {
    console.error('Error sending update app:', error);
    res.status(500).json({ success: false, error: 'Ошибка отправки команды' });
  }
};



export const cleanupOldMusicFolders = async () => {
  try {
    console.log('🧹 Запуск очистки старых папок с музыкой...');
    
    const radioPath = './public/retail/radio';
    
    // Проверяем существование папки
    if (!fs.existsSync(radioPath)) {
      console.log('📁 Папка retail/radio не существует, пропускаем очистку');
      return;
    }
    
    // Получаем текущую дату
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // getMonth() возвращает 0-11
    
    // Вычисляем прошлый месяц
    let lastMonth = currentMonth - 1;
    let lastYear = currentYear;
    
    if (lastMonth === 0) {
      lastMonth = 12;
      lastYear = currentYear - 1;
    }
    
    // Формируем название папки за прошлый месяц
    const lastMonthFolder = `01-${String(lastMonth).padStart(2, '0')}-${lastYear}`;
    const folderPath = path.join(radioPath, lastMonthFolder);
    
    console.log(`🗑️ Удаляем папку: ${lastMonthFolder}`);
    
    // Проверяем существование папки
    if (fs.existsSync(folderPath)) {
      // Удаляем папку рекурсивно
      fs.rmSync(folderPath, { recursive: true, force: true });
      console.log(`✅ Папка ${lastMonthFolder} успешно удалена`);
    } else {
      console.log(`ℹ️ Папка ${lastMonthFolder} не найдена, пропускаем`);
    }
    
    // Дополнительно: удаляем папки старше 3 месяцев
    await cleanupVeryOldFolders(radioPath);
    
  } catch (error) {
    console.error('❌ Ошибка при очистке папок с музыкой:', error);
  }
};

/**
 * Удаляет папки старше 3 месяцев
 */
const cleanupVeryOldFolders = async (radioPath: string) => {
  try {
    const items = fs.readdirSync(radioPath, { withFileTypes: true });
    const folders = items.filter(item => item.isDirectory());
    
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    
    for (const folder of folders) {
      const folderName = folder.name;
      
      // Проверяем формат папки (01-MM-YYYY)
      const match = folderName.match(/^01-(\d{2})-(\d{4})$/);
      if (!match) {
        console.log(`⚠️ Пропускаем папку с неверным форматом: ${folderName}`);
        continue;
      }
      
      const [, month, year] = match;
      const folderDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      
      // Если папка старше 3 месяцев, удаляем её
      if (folderDate < threeMonthsAgo) {
        const folderPath = path.join(radioPath, folderName);
        console.log(`🗑️ Удаляем старую папку: ${folderName}`);
        fs.rmSync(folderPath, { recursive: true, force: true });
        console.log(`✅ Старая папка ${folderName} удалена`);
      }
    }
  } catch (error) {
    console.error('❌ Ошибка при удалении старых папок:', error);
  }
};