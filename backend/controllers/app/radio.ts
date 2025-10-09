import { Request, Response } from "express";
import fs from 'fs';
import path from 'path';
import { prisma } from '../../server.js';
import { heartbeatStore } from './device.js';
import { SocketIOService } from '../../socketio.js';
import { decodeRussianFileName } from '../../utils/format.js';

// Кэш для статистики
const statsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

// Функция для уведомления об обновлении потоков
const notifyStreamsUpdate = async (branchType: string) => {
  try {
    console.log(`Notifying devices about stream update for branch type: ${branchType}`);
    const socketService = SocketIOService.getInstance();
    socketService.emit('device_streams_updated', {
      branchType: branchType
    });
  } catch (error) {
    console.error('Error notifying streams update:', error);
  }
};

// Функция для очистки старых папок с музыкой
export const cleanupOldMusicFolders = async () => {
  try {
    console.log('🧹 Запуск очистки папок с музыкой...');
    const musicPath = './public/retail/radio/music';
    
    if (!fs.existsSync(musicPath)) {
      console.log('📁 Папка retail/radio/music не существует, пропускаем очистку');
      return;
    }

    const folders = fs.readdirSync(musicPath);
    const currentDate = new Date();
    const currentMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
    const currentYear = currentDate.getFullYear();
    const currentFolder = `${currentMonth}-${currentYear}`;
    
    let deletedCount = 0;
    
    for (const folder of folders) {
      // Пропускаем текущую папку
      if (folder === currentFolder) {
        console.log(`✅ Пропускаем текущую папку: ${folder}`);
        continue;
      }
      
      // Проверяем формат папки (MM-YYYY)
      const folderRegex = /^\d{2}-\d{4}$/;
      if (!folderRegex.test(folder)) {
        console.log(`⚠️ Пропускаем папку с неверным форматом: ${folder}`);
        continue;
      }
      
      const folderPath = path.join(musicPath, folder);
      const stats = fs.statSync(folderPath);
      
      if (stats.isDirectory()) {
        // Удаляем ВСЕ папки, которые не соответствуют текущему месяцу
        console.log(`🗑️ Удаляем папку: ${folder} (не соответствует текущему месяцу ${currentFolder})`);
        fs.rmSync(folderPath, { recursive: true, force: true });
        deletedCount++;
        console.log(`✅ Папка ${folder} успешно удалена`);
      }
    }
    
    console.log(`🧹 Очистка завершена. Удалено ${deletedCount} папок.`);
  } catch (error) {
    console.error('❌ Ошибка при очистке папок с музыкой:', error);
  }
};

// Утилита для получения текущей папки месяца
const getCurrentMonthFolder = (): string => {
  const currentDate = new Date();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const year = currentDate.getFullYear();
  return `${month}-${year}`;
};

// Утилита для создания папки музыки
const ensureMusicFolder = (folderName?: string): string => {
  const folder = folderName || getCurrentMonthFolder();
  const musicPath = `./public/retail/radio/music/${folder}`;
  const baseMusicPath = './public/retail/radio/music';
  
  if (!fs.existsSync(baseMusicPath)) {
    fs.mkdirSync(baseMusicPath, { recursive: true });
  }
  if (!fs.existsSync(musicPath)) {
    fs.mkdirSync(musicPath, { recursive: true });
  }
  
  return musicPath;
};

// Утилита для создания папки дополнительных роликов

// Создание папки для музыки с текущей датой
export const createMusicFolder = async (req: Request, res: Response): Promise<any> => {
  try {
    const folderName = getCurrentMonthFolder();
    const musicPath = ensureMusicFolder(folderName);
    
    return res.status(200).json({ 
      success: true, 
      message: 'Папка для музыки создана успешно', 
      folderName, 
      path: musicPath 
    });
  } catch (error) {
    console.error('Error creating music folder:', error);
    return res.status(500).json({ error: 'Ошибка при создании папки для музыки' });
  }
};

export const uploadMusic = async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('Upload request received:', {
      body: req.body,
      file: req.file,
      files: req.files
    });
    
    if (!req.file) {
      console.log('No file in request');
      return res.status(400).json({ error: 'Файл не загружен' });
    }
    
    const folderName = getCurrentMonthFolder();
    const fileName = req.file.originalname;
    const filePath = req.file.path; // Файл уже в правильном месте благодаря middleware
    
    console.log('File details:', {
      originalName: req.file.originalname,
      filePath: filePath,
      fileExists: fs.existsSync(filePath),
      fileSize: req.file.size
    });
    
    // Проверяем, что файл существует
    if (!fs.existsSync(filePath)) {
      console.error('File does not exist:', filePath);
      return res.status(500).json({ error: 'Файл не найден' });
    }
    
    return res.status(200).json({ 
      success: true, 
      message: 'Музыка загружена успешно', 
      fileName, 
      folderName, 
      path: filePath 
    });
  } catch (error) {
    console.error('Error uploading music:', error);
    return res.status(500).json({ error: 'Ошибка при загрузке музыки' });
  }
};

// Асинхронная функция для получения папок музыки
const getMusicFoldersAsync = (): Promise<any[]> => {
  return new Promise((resolve) => {
    setImmediate(() => {
      try {
        const musicPath = './public/retail/radio/music';
        console.log('Getting music folders from:', musicPath);
        console.log('Music path exists:', fs.existsSync(musicPath));
        
        if (!fs.existsSync(musicPath)) {
          console.log('Music path does not exist, creating...');
          fs.mkdirSync(musicPath, { recursive: true });
          resolve([]);
          return;
        }
        
        const items = fs.readdirSync(musicPath, { withFileTypes: true });
        console.log('All items in music path:', items.map(i => ({ name: i.name, isDirectory: i.isDirectory() })));
        
        const folders = items
          .filter(i => i.isDirectory())
          .map(dirent => {
            const folderPath = path.join(musicPath, dirent.name);
            const stats = fs.statSync(folderPath);
            return {
              name: dirent.name,
              path: folderPath,
              created: stats.birthtime
            };
          })
          .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
        
        console.log('Found music folders:', folders);
        resolve(folders);
      } catch (error) {
        console.error('Error getting music folders:', error);
        resolve([]);
      }
    });
  });
};

export const getMusicFolders = async (req: Request, res: Response): Promise<any> => {
  try {
    const folders = await getMusicFoldersAsync();
    return res.status(200).json({ success: true, folders });
  } catch (error) {
    console.error('Error getting music folders:', error);
    return res.status(500).json({ error: 'Ошибка при получении списка папок музыки' });
  }
};

export const getMusicInFolder = async (req: Request, res: Response): Promise<any> => {
  try {
    const { folderName } = req.params;
    if (!folderName) {
      return res.status(400).json({ error: 'Название папки обязательно' });
    }
    const folderPath = `./public/retail/radio/music/${folderName}`;
    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: 'Папка не найдена' });
    }
    const files = fs.readdirSync(folderPath)
      .filter(file => ['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(path.extname(file).toLowerCase()))
      .map(file => {
        const filePath = path.join(folderPath, file);
        const stats = fs.statSync(filePath);
        return { name: file, size: stats.size, created: stats.birthtime, modified: stats.mtime, path: `/retail/radio/music/${folderName}/${file}` };
      })
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    return res.status(200).json({ success: true, folderName, files });
  } catch (error) {
    console.error('Error getting music in folder:', error);
    return res.status(500).json({ error: 'Ошибка при получении списка музыки' });
  }
};

export const deleteMusicFolder = async (req: Request, res: Response): Promise<any> => {
  try {
    const { folderName } = req.params;
    if (!folderName) return res.status(400).json({ error: 'Название папки обязательно' });
    const folderPath = `./public/retail/radio/music/${folderName}`;
    if (!fs.existsSync(folderPath)) return res.status(404).json({ error: 'Папка не найдена' });
    fs.rmSync(folderPath, { recursive: true, force: true });
    return res.status(200).json({ success: true, message: 'Папка музыки удалена успешно', folderName });
  } catch (error) {
    console.error('Error deleting music folder:', error);
    return res.status(500).json({ error: 'Ошибка при удалении папки музыки' });
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

    const devices = await prisma.devices.findMany({ 
      where, 
      select: { id: true, branchId: true, lastSeen: true } 
    });
    const now = Date.now();
    const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

    const data = devices.map((d: any) => {
      // Приоритет: heartbeatStore (память) > lastSeen (база данных)
      const lastSeenMem = heartbeatStore.get(d.id);
      const lastSeenDb = d.lastSeen ? new Date(d.lastSeen).getTime() : null;
      
      // Используем данные из памяти, если они есть, иначе из базы данных
      const lastSeenTime = lastSeenMem || lastSeenDb;
      const online = lastSeenTime ? (now - lastSeenTime <= ONLINE_THRESHOLD_MS) : false;
      
      return { 
        deviceId: d.id, 
        branchId: d.branchId, 
        online, 
        lastSeen: lastSeenTime ? new Date(lastSeenTime).toISOString() : null,
        source: lastSeenMem ? 'memory' : (lastSeenDb ? 'database' : 'none')
      };
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
        const musicPath = './public/retail/radio/music';
        console.log('Checking music path:', musicPath);
        console.log('Music path exists:', fs.existsSync(musicPath));
        
        if (!fs.existsSync(musicPath)) {
          console.log('Music path does not exist, creating...');
          fs.mkdirSync(musicPath, { recursive: true });
          resolve(0);
          return;
        }
        
        const folders = fs.readdirSync(musicPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);
        
        console.log('Found music folders:', folders);
        
        let totalFiles = 0;
        for (const folder of folders) {
          const folderPath = path.join(musicPath, folder);
          console.log('Checking folder:', folderPath);
          const files = fs.readdirSync(folderPath)
            .filter(file => ['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(path.extname(file).toLowerCase()));
          console.log(`Files in ${folder}:`, files);
          totalFiles += files.length;
        }
        
        console.log('Total music files found:', totalFiles);
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
    // Очищаем старые папки с музыкой при каждом запросе статистики
    await cleanupOldMusicFolders();
    
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
    console.log('Restart app request for device:', deviceId);
    
    const socketService = SocketIOService.getInstance();
    const result = await socketService.sendToDeviceWithAck(deviceId, 'device_restart_app');
    
    console.log('Restart app result:', {
      deviceId,
      ok: result.ok,
      error: result.error,
      data: result.data
    });
    
    if (!result.ok) {
      console.log('Device restart failed:', result.error);
      return res.status(400).json({ success: false, error: result.error || 'DEVICE_OFFLINE' });
    }
    
    const ok = (result.data as any)?.ok !== false; // по умолчанию ок, если нет явного отказа
    if (!ok) {
      console.log('Device restart rejected by device');
      return res.status(400).json({ success: false, error: 'RESTART_FAILED' });
    }
    
    console.log('Device restart successful');
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
        // Parse string like '{batteryLevel=100, isPlaying=false, currentMonth=09-2025, currentWifiSSID=Не подключено, currentWifiBSSID=, appVersion=1.0}'
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

// Получение версии приложения с устройства
export const actionGetAppVersion = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params as any;
    const socketService = SocketIOService.getInstance();
    const result = await socketService.sendToDeviceWithAck(deviceId, 'device_get_app_version');
    if (!result.ok) return res.json({ success: false, error: result.error || 'DEVICE_OFFLINE' });
    
    res.json({ success: true, data: { appVersion: result.data } });
  } catch (error) {
    console.error('Error getting app version:', error);
    res.status(500).json({ success: false, error: 'Ошибка получения версии приложения' });
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




// ===== Radio Streams Functions =====

// Создание папки для радио потоков
const ensureStreamFolder = (): string => {
  const streamPath = './public/retail/radio/stream';
  
  if (!fs.existsSync(streamPath)) {
    fs.mkdirSync(streamPath, { recursive: true });
  }
  
  return streamPath;
};

// Получение всех радио потоков
export const getRadioStreams = async (req: Request, res: Response): Promise<any> => {
  try {
    const streams = await prisma.radioStream.findMany({
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ success: true, data: streams });
  } catch (error) {
    console.error('Error getting radio streams:', error);
    return res.status(500).json({ error: 'Ошибка при получении радио потоков' });
  }
};

// Создание нового радио потока
export const createRadioStream = async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('Creating radio stream with data:', req.body);
    console.log('Request file:', req.file);
    console.log('Request files:', req.files);
    console.log('Content-Type:', req.headers['content-type']);
    const { name, branchTypeOfDist, frequencySongs, fadeInDuration, volumeLevel, startDate, endDate } = req.body;

    console.log('Parsed data:', {
      name,
      branchTypeOfDist,
      frequencySongs,
      fadeInDuration,
      volumeLevel,
      startDate,
      endDate
    });

    let attachmentPath = null;
    
    // Обработка загруженного файла
    if (req.file) {
      console.log('File uploaded:', req.file);
      console.log('File path:', req.file.path);
      console.log('File exists:', fs.existsSync(req.file.path));
      
      // Файл уже в правильном месте благодаря middleware
      if (fs.existsSync(req.file.path)) {
        // Исправляем кодировку русских символов в названии файла
        const correctedFileName = decodeRussianFileName(req.file.originalname);
        console.log('File name encoding correction:', {
          original: req.file.originalname,
          corrected: correctedFileName
        });
        attachmentPath = correctedFileName;
        console.log('Attachment path set to:', attachmentPath);
      } else {
        console.error('File does not exist at path:', req.file.path);
        attachmentPath = null;
      }
    } else {
      console.log('No file uploaded');
    }

    const stream = await prisma.radioStream.create({
      data: {
        name,
        branchTypeOfDist,
        frequencySongs: parseInt(frequencySongs) || 5,
        fadeInDuration: parseInt(fadeInDuration) || 2,
        volumeLevel: parseInt(volumeLevel) || 80,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        attachment: attachmentPath
      }
    });

    console.log('Created stream:', stream);
    
    // Уведомляем устройства об обновлении потоков
    await notifyStreamsUpdate(stream.branchTypeOfDist);
    
    return res.status(201).json({ success: true, data: stream });
  } catch (error: any) {
    console.error('Error creating radio stream:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ error: 'Ошибка при создании радио потока', details: error.message });
  }
};

// Загрузка файла ролика для радио потока
export const uploadStreamRoll = async (req: Request, res: Response): Promise<any> => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const { streamId } = req.body;
    if (!streamId) {
      return res.status(400).json({ error: 'ID потока обязателен' });
    }

    // Исправляем кодировку русских символов в названии файла
    const correctedFileName = decodeRussianFileName(req.file.originalname);
    console.log('File name encoding correction:', {
      original: req.file.originalname,
      corrected: correctedFileName
    });
    
    const filePath = req.file.path; // Файл уже в правильном месте благодаря middleware

    // Обновляем запись в базе данных - записываем исправленное название файла
    const stream = await prisma.radioStream.update({
      where: { id: streamId },
      data: { attachment: correctedFileName }
    });

    return res.status(200).json({
      success: true,
      message: 'Ролик загружен успешно',
      fileName: correctedFileName,
      streamId,
      path: filePath
    });
  } catch (error) {
    console.error('Error uploading stream roll:', error);
    return res.status(500).json({ error: 'Ошибка при загрузке ролика' });
  }
};

// Обновление радио потока
export const updateRadioStream = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { name, branchTypeOfDist, frequencySongs, fadeInDuration, volumeLevel, startDate, endDate, isActive } = req.body;

    const stream = await prisma.radioStream.update({
      where: { id },
      data: {
        name,
        branchTypeOfDist,
        frequencySongs: frequencySongs ? parseInt(frequencySongs) : undefined,
        fadeInDuration: fadeInDuration ? parseInt(fadeInDuration) : undefined,
        volumeLevel: volumeLevel ? parseInt(volumeLevel) : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        isActive
      }
    });

    // Уведомляем устройства об обновлении потоков
    await notifyStreamsUpdate(stream.branchTypeOfDist);
    
    return res.status(200).json({ success: true, data: stream });
  } catch (error) {
    console.error('Error updating radio stream:', error);
    return res.status(500).json({ error: 'Ошибка при обновлении радио потока' });
  }
};

// Удаление радио потока
// Получение активных потоков по типу филиала
export const getActiveStreamsByBranchType = async (req: Request, res: Response): Promise<any> => {
  try {
    const { branchType } = req.query;
    
    if (!branchType) {
      return res.status(400).json({ error: 'Тип филиала обязателен' });
    }

    const currentDate = new Date();
    
    const streams = await prisma.radioStream.findMany({
      where: {
        branchTypeOfDist: branchType as string,
        isActive: true,
        startDate: {
          lte: currentDate
        },
        OR: [
          { endDate: null },
          { endDate: { gte: currentDate } }
        ]
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return res.status(200).json({
      success: true,
      data: streams
    });
  } catch (error) {
    console.error('Error getting active streams by branch type:', error);
    return res.status(500).json({ error: 'Ошибка при получении активных потоков' });
  }
};

export const deleteRadioStream = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    // Получаем информацию о потоке перед удалением
    const stream = await prisma.radioStream.findUnique({
      where: { id }
    });

    if (stream && stream.attachment) {
      // Удаляем файл ролика
      const filePath = path.join('./public/retail/stream', stream.attachment);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await prisma.radioStream.delete({
      where: { id }
    });

    // Уведомляем устройства об обновлении потоков
    if (stream) {
      await notifyStreamsUpdate(stream.branchTypeOfDist);
    }

    return res.status(200).json({ success: true, message: 'Радио поток удален' });
  } catch (error) {
    console.error('Error deleting radio stream:', error);
    return res.status(500).json({ error: 'Ошибка при удалении радио потока' });
  }
};

// Скачивание файла потока
export const downloadStreamFile = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    console.log('Downloading stream file for ID:', id);
    
    // Находим поток в базе данных
    const stream = await prisma.radioStream.findUnique({
      where: { id }
    });
    
    if (!stream) {
      console.log('Stream not found:', id);
      return res.status(404).json({ error: 'Поток не найден' });
    }
    
    if (!stream.attachment) {
      console.log('Stream has no attachment:', id);
      return res.status(404).json({ error: 'Файл потока не найден' });
    }
    
    // Путь к файлу
    const filePath = path.join('./public/retail/radio/stream', stream.attachment);
    
    console.log('Looking for file at path:', filePath);
    
    // Проверяем существование файла
    if (!fs.existsSync(filePath)) {
      console.log('File does not exist at path:', filePath);
      
      // Пытаемся найти файл с исправленным названием (для совместимости с искаженными названиями)
      const streamDir = './public/retail/radio/stream';
      const files = fs.readdirSync(streamDir);
      console.log('Available files in stream directory:', files);
      
      // Ищем файл, который может соответствовать нашему потоку
      const matchingFile = files.find(file => {
        // Декодируем название файла и сравниваем с attachment из базы данных
        const decodedFileName = decodeRussianFileName(file);
        console.log('Comparing:', decodedFileName, 'with', stream.attachment);
        return decodedFileName === stream.attachment;
      });
      
      if (matchingFile) {
        console.log('Found matching file:', matchingFile);
        const correctedFilePath = path.join(streamDir, matchingFile);
        console.log('Using corrected file path:', correctedFilePath);
        
        // Отправляем файл с исправленным путем
        res.download(correctedFilePath, stream.attachment, (err) => {
          if (err) {
            console.error('Error sending file:', err);
            if (!res.headersSent) {
              res.status(500).json({ error: 'Ошибка при скачивании файла' });
            }
          }
        });
        return;
      }
      
      return res.status(404).json({ error: 'Файл не найден на сервере' });
    }
    
    console.log('File found, sending download response');
    
    // Отправляем файл
    res.download(filePath, stream.attachment, (err) => {
      if (err) {
        console.error('Error sending file:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Ошибка при скачивании файла' });
        }
      }
    });
    
  } catch (error) {
    console.error('Error downloading stream file:', error);
    return res.status(500).json({ error: 'Ошибка при скачивании файла потока' });
  }
};