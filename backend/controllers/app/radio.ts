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
    const socketService = SocketIOService.getInstance();
    socketService.emit('device_streams_updated', {
      branchType: branchType
    });
  } catch (error) {
  }
};

// Функция для очистки старых папок с музыкой
export const cleanupOldMusicFolders = async () => {
  try {
    const musicPath = './public/retail/radio/music';
    
    if (!fs.existsSync(musicPath)) {
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
        continue;
      }
      
      // Проверяем формат папки (MM-YYYY)
      const folderRegex = /^\d{2}-\d{4}$/;
      if (!folderRegex.test(folder)) {
        continue;
      }
      
      const folderPath = path.join(musicPath, folder);
      const stats = fs.statSync(folderPath);
      
      if (stats.isDirectory()) {
        // Удаляем ВСЕ папки, которые не соответствуют текущему месяцу
        fs.rmSync(folderPath, { recursive: true, force: true });
        deletedCount++;
      }
    }
    
  } catch (error) {
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
    return res.status(500).json({ error: 'Ошибка при создании папки для музыки' });
  }
};

export const uploadMusic = async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('[Radio] Upload request received:', {
      body: req.body,
      file: req.file,
      files: req.files
    });
    
    if (!req.file) {
      console.log('[Radio] No file in request');
      return res.status(400).json({ error: 'Файл не загружен' });
    }
    
    const folderName = getCurrentMonthFolder();
    const fileName = req.file.filename;
    const filePath = req.file.path; // Файл уже в правильном месте благодаря middleware
    
    console.log('[Radio] File details:', {
      originalName: req.file.originalname,
      filePath: filePath,
      fileExists: fs.existsSync(filePath),
      fileSize: req.file.size
    });
    
    // Проверяем, что файл существует
    if (!fs.existsSync(filePath)) {
      console.error('[Radio] File does not exist:', filePath);
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
    console.error('[Radio] Error uploading music:', error);
    return res.status(500).json({ error: 'Ошибка при загрузке музыки' });
  }
};

// Асинхронная функция для получения папок музыки
const getMusicFoldersAsync = (): Promise<any[]> => {
  return new Promise((resolve) => {
    setImmediate(() => {
      try {
        const musicPath = './public/retail/radio/music';
        
        if (!fs.existsSync(musicPath)) {
          fs.mkdirSync(musicPath, { recursive: true });
          resolve([]);
          return;
        }
        
        const items = fs.readdirSync(musicPath, { withFileTypes: true });
        
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
        resolve(folders);
      } catch (error) {
        console.error('[Radio] Error getting music folders:', error);
        resolve([]);
      }
    });
  });
};

export const getMusicFolders = async (req: Request, res: Response): Promise<any> => {
  try {
    const folders = await getMusicFoldersAsync();
    if (folders.length === 0) {
      console.log('[Radio] No music folders found');
    }
    return res.status(200).json({ success: true, folders });
  } catch (error) {
    console.error('[Radio] Error getting music folders:', error);
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
      .sort((a, b) => a.name.localeCompare(b.name)); // Сортируем по имени файла
    return res.status(200).json({ success: true, folderName, files });
  } catch (error) {
    console.error('[Radio] Error getting music in folder:', error);
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
    console.error('[Radio] Error deleting music folder:', error);
    return res.status(500).json({ error: 'Ошибка при удалении папки музыки' });
  }
};

// ===== Admin-related (moved) =====
export const getDevicesByBranches = async (req: Request, res: Response) => {
  try {
    // Убираем фильтрацию на бэкенде - пусть фронтенд фильтрует по правам доступа
    console.log('🔍 [getDevicesByBranches] Возвращаем все устройства, фильтрация на фронтенде');

    const devices = await prisma.devices.findMany({
      select: {
        id: true,
        createdAt: true,
        lastSeen: true,
        vendor: true,
        name: true,
        timeFrom: true,
        timeUntil: true,
        network: true,
        number: true,
        app: true,
        os: true,
        macAddress: true,
        branchId: true,
        userEmail: true,
        branch: { select: { uuid: true, name: true, typeOfDist: true, city: true, address: true } }
      },
      orderBy: [ { branch: { name: 'asc' } }, { createdAt: 'desc' } ]
    });

    // Получаем информацию о пользователях из UserData по email
    const userEmails = devices
      .map(d => d.userEmail)
      .filter((email): email is string => email !== null && email !== undefined)
      .filter((email, index, arr) => arr.indexOf(email) === index); // Убираем дубликаты

    const userDataMap = new Map();
    if (userEmails.length > 0) {
      const userDataList = await prisma.userData.findMany({
        where: { email: { in: userEmails } },
        select: { email: true, fio: true }
      });
      
      userDataList.forEach(user => {
        userDataMap.set(user.email, user);
      });
    }

    // Используем Map для O(1) группировки вместо reduce
    const devicesByBranches = new Map();
    devices.forEach(device => {
      const bid = device.branchId;
      if (!devicesByBranches.has(bid)) {
        devicesByBranches.set(bid, { branch: device.branch, devices: [] });
      }
      
      // Добавляем информацию о пользователе из UserData
      const userInfo = device.userEmail ? userDataMap.get(device.userEmail) : null;
      const deviceWithUser = {
        ...device,
        user: userInfo ? {
          id: userInfo.email, // Используем email как ID
          name: userInfo.fio,
          login: userInfo.email
        } : null
      };
      
      devicesByBranches.get(bid).devices.push(deviceWithUser);
    });

    const result = Array.from(devicesByBranches.values());
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Radio] Error getting devices by branches:', error);
    res.status(500).json({ success: false, error: 'Ошибка при получении устройств' });
  }
};

export const getDevicesStatus = async (req: Request, res: Response) => {
  try {
    const { branchId } = req.query as { branchId?: string };
    const where: any = {};
    
    // Фильтруем только если явно указан branchId в query
    if (branchId) {
      where.branchId = String(branchId);
    }

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
      const timeDiff = lastSeenTime ? (now - lastSeenTime) : null;
      const online = lastSeenTime ? (timeDiff! <= ONLINE_THRESHOLD_MS) : false;
      
      return { 
        deviceId: d.id, 
        branchId: d.branchId, 
        online, 
        lastSeen: lastSeenTime ? new Date(lastSeenTime).toISOString() : null,
        source: lastSeenMem ? 'memory' : (lastSeenDb ? 'database' : 'none')
      };
    });
    
    const onlineCount = data.filter(d => d.online).length;
    console.log(`📊 [getDevicesStatus] Онлайн устройств: ${onlineCount}/${devices.length}`);

    res.json({ success: true, data });
  } catch (error) {
    console.error('[Radio] Error getting devices status:', error);
    res.status(500).json({ success: false, error: 'Ошибка при получении статусов' });
  }
};

export const getDevicesStatusPing = async (req: Request, res: Response) => {
  try {
    const { branchId } = req.query as { branchId?: string };
    const where: any = {};
    if (branchId) where.branchId = String(branchId);

    const devices = await prisma.devices.findMany({ where, select: { id: true, branchId: true, vendor: true, name: true } });
    const deviceIds = devices.map(d => d.id);

    const socketService = SocketIOService.getInstance();
    const pingResults = await socketService.pingDevices(deviceIds, 1500);

    // Комбинированный статус: для WebSocket устройств используем ping, для остальных (веб плеер) используем heartbeatStore
    const now = Date.now();
    const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
    
    const data = devices.map((d) => {
      // Проверяем, является ли это веб плеером (vendor === 'Web Browser' или начинается с 'Web')
      const isWebPlayer = d.vendor === 'Web Browser' || d.vendor?.startsWith('Web');
      
      if (isWebPlayer) {
        // Для веб плеера используем heartbeatStore
        // Ищем по deviceName, так как веб-плеер сохраняется в heartbeatStore по deviceName
        const deviceName = d.name || `DNS Radio Web (${d.id})`;
        const lastSeenMem = heartbeatStore.get(deviceName);
        const timeDiff = lastSeenMem ? (now - lastSeenMem) : null;
        const online = lastSeenMem ? (timeDiff! <= ONLINE_THRESHOLD_MS) : false;
        // console.log(`🔍 [getDevicesStatusPing] Web player ${d.id} (${deviceName}): lastSeen=${lastSeenMem}, timeDiff=${timeDiff}, online=${online}`);
        return { deviceId: d.id, branchId: d.branchId, online, rttMs: null, source: 'heartbeat' };
      } else {
        // Для обычных устройств используем WebSocket ping
        return { deviceId: d.id, branchId: d.branchId, online: !!pingResults[d.id]?.online, rttMs: pingResults[d.id]?.rttMs ?? null, source: 'websocket' };
      }
    });
    
    const onlineCount = data.filter(d => d.online).length;
    console.log(`📊 [getDevicesStatusPing] Онлайн устройств: ${onlineCount}/${devices.length}`);

    res.json({ success: true, data });
  } catch (error) {
    console.error('[Radio] Error getting devices status ping:', error);
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
      console.warn('[Radio] Socket emit device_time_updated failed', e);
    }
    
    res.json({ success: true, data: device, message: 'Время воспроизведения обновлено' });
  } catch (error) {
    console.error('[Radio] Error updating device time:', error);
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
      console.warn('[Radio] Socket emit device_time_updated (branch) failed', e);
    }
    
    res.json({ 
      success: true, 
      data: { updatedCount: result.count }, 
      message: `Время воспроизведения обновлено для ${result.count} устройств` 
    });
  } catch (error) {
    console.error('[Radio] Error updating branch devices time:', error);
    res.status(500).json({ success: false, error: 'Ошибка при обновлении времени устройств филиала' });
  }
};

// Асинхронная функция для подсчета музыкальных файлов
const countMusicFilesAsync = (): Promise<number> => {
  return new Promise((resolve) => {
    setImmediate(() => {
      try {
        const musicPath = './public/retail/radio/music';
        
        if (!fs.existsSync(musicPath)) {
          fs.mkdirSync(musicPath, { recursive: true });
          resolve(0);
          return;
        }
        
        const folders = fs.readdirSync(musicPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);
        
        let totalFiles = 0;
        for (const folder of folders) {
          const folderPath = path.join(musicPath, folder);
          const files = fs.readdirSync(folderPath)
            .filter(file => ['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(path.extname(file).toLowerCase()));
          totalFiles += files.length;
        }
        resolve(totalFiles);
      } catch (error) {
        console.error('[Radio] Error counting music files:', error);
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
    
    // Получаем все устройства для пинга
    const allDevices = await prisma.devices.findMany({ 
      select: { id: true } 
    });
    const deviceIds = allDevices.map(d => d.id);
    
    // Используем pingDevices для получения реального статуса
    const pingResults = await socketService.pingDevices(deviceIds, 1500);
    const activeDevices = Object.values(pingResults).filter(result => result.online).length;
    
    console.log('📊 [getDevicesStats] Всего устройств в БД:', deviceIds.length);
    console.log('📊 [getDevicesStats] Результаты пинга:', pingResults);
    console.log('📊 [getDevicesStats] Количество онлайн устройств (ping):', activeDevices);
    
    // Асинхронный подсчет файлов
    const totalMusicFiles = await countMusicFilesAsync();
    
    const data = { totalDevices, activeDevices, totalBranches, totalMusicFiles, topBranches };
    console.log('📊 [getDevicesStats] Финальная статистика:', data);
    
    // Кэшируем результат
    statsCache.set(cacheKey, { data, timestamp: Date.now() });
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('[Radio] Error getting devices stats:', error);
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
    console.error('[Radio] Error getting device info:', error);
    res.status(500).json({ success: false, error: 'Ошибка при получении информации об устройстве' });
  }
};

export const actionRestartApp = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params as any;
    console.log(`🔄 [actionRestartApp] Отправка команды перезапуска приложения для устройства: ${deviceId}`);
    
    // Проверяем, что устройство подключено
    const socketService = SocketIOService.getInstance();
    const connectedDevices = socketService.getConnectedDeviceIds();
    console.log(`🔄 [actionRestartApp] Подключенные устройства:`, connectedDevices);
    
    if (!connectedDevices.includes(deviceId)) {
      console.log(`❌ [actionRestartApp] Устройство ${deviceId} не подключено к Socket.IO`);
      return res.status(400).json({ 
        success: false, 
        error: 'DEVICE_OFFLINE',
        message: 'Устройство не подключено к серверу'
      });
    }
    
    const result = await socketService.sendToDeviceWithAck(deviceId, 'device_restart_app');
    
    console.log(`🔄 [actionRestartApp] Результат отправки команды:`, {
      deviceId,
      ok: result.ok,
      error: result.error,
      data: result.data
    });
    
    if (!result.ok) {
      console.log(`❌ [actionRestartApp] Устройство недоступно: ${result.error}`);
      return res.status(400).json({ 
        success: false, 
        error: result.error || 'DEVICE_OFFLINE',
        message: 'Устройство недоступно для команды перезапуска'
      });
    }
    
    // Проверяем ответ от устройства
    const deviceResponse = result.data as any;
    console.log(`🔄 [actionRestartApp] Ответ от устройства:`, deviceResponse);
    
    // Если устройство вернуло ошибку
    if (deviceResponse?.error) {
      console.log(`❌ [actionRestartApp] Устройство вернуло ошибку:`, deviceResponse.error);
      return res.status(400).json({ 
        success: false, 
        error: deviceResponse.error,
        message: `Устройство не может выполнить перезапуск: ${deviceResponse.error}`
      });
    }
    
    // Если устройство явно отказалось выполнить команду
    if (deviceResponse?.ok === false) {
      console.log(`❌ [actionRestartApp] Устройство отказалось выполнить команду:`, deviceResponse);
      return res.status(400).json({ 
        success: false, 
        error: 'COMMAND_REJECTED',
        message: 'Устройство отказалось выполнить команду перезапуска'
      });
    }
    
    // Команда успешно отправлена
    console.log(`✅ [actionRestartApp] Команда перезапуска успешно отправлена`);
    res.json({ 
      success: true, 
      data: result.data ?? null, 
      message: 'Команда перезапуска приложения отправлена устройству' 
    });
  } catch (error) {
    console.error('❌ [actionRestartApp] Ошибка отправки команды:', error);
    res.status(500).json({ 
      success: false, 
      error: 'INTERNAL_ERROR',
      message: 'Внутренняя ошибка сервера при отправке команды'
    });
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
        console.error('[Radio] Error parsing device status data:', parseError);
        // Keep original data if parsing fails
      }
    }
    
    res.json({ success: true, data: parsedData });
  } catch (error) {
    console.error('[Radio] Error getting device status:', error);
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
    console.error('[Radio] Error getting app version:', error);
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
    console.error('[Radio] Error configuring WiFi:', error);
    res.status(500).json({ success: false, error: 'Ошибка настройки WiFi' });
  }
};

export const actionReboot = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params as any;
    console.log(`🔄 [actionReboot] Отправка команды перезагрузки для устройства: ${deviceId}`);
    
    // Проверяем, что устройство подключено
    const socketService = SocketIOService.getInstance();
    const connectedDevices = socketService.getConnectedDeviceIds();
    console.log(`🔄 [actionReboot] Подключенные устройства:`, connectedDevices);
    
    if (!connectedDevices.includes(deviceId)) {
      console.log(`❌ [actionReboot] Устройство ${deviceId} не подключено к Socket.IO`);
      return res.status(400).json({ 
        success: false, 
        error: 'DEVICE_OFFLINE',
        message: 'Устройство не подключено к серверу'
      });
    }
    
    const result = await socketService.sendToDeviceWithAck(deviceId, 'device_reboot');
    
    console.log(`🔄 [actionReboot] Результат отправки команды:`, {
      deviceId,
      ok: result.ok,
      error: result.error,
      data: result.data
    });
    
    if (!result.ok) {
      console.log(`❌ [actionReboot] Устройство недоступно: ${result.error}`);
      return res.status(400).json({ 
        success: false, 
        error: result.error || 'DEVICE_OFFLINE',
        message: 'Устройство недоступно для команды перезагрузки'
      });
    }
    
    // Проверяем ответ от устройства
    const deviceResponse = result.data as any;
    console.log(`🔄 [actionReboot] Ответ от устройства:`, deviceResponse);
    
    // Если устройство вернуло ошибку
    if (deviceResponse?.error) {
      console.log(`❌ [actionReboot] Устройство вернуло ошибку:`, deviceResponse.error);
      return res.status(400).json({ 
        success: false, 
        error: deviceResponse.error,
        message: `Устройство не может выполнить перезагрузку: ${deviceResponse.error}`
      });
    }
    
    // Если устройство явно отказалось выполнить команду
    if (deviceResponse?.ok === false) {
      console.log(`❌ [actionReboot] Устройство отказалось выполнить команду:`, deviceResponse);
      return res.status(400).json({ 
        success: false, 
        error: 'COMMAND_REJECTED',
        message: 'Устройство отказалось выполнить команду перезагрузки'
      });
    }
    
    // Команда успешно отправлена
    console.log(`✅ [actionReboot] Команда перезагрузки успешно отправлена`);
    res.json({ 
      success: true, 
      data: result.data ?? null, 
      message: 'Команда перезагрузки отправлена устройству' 
    });
  } catch (error) {
    console.error('❌ [actionReboot] Ошибка отправки команды:', error);
    res.status(500).json({ 
      success: false, 
      error: 'INTERNAL_ERROR',
      message: 'Внутренняя ошибка сервера при отправке команды'
    });
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
    console.error('[Radio] Error sending update app:', error);
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
    console.error('[Radio] Error getting radio streams:', error);
    return res.status(500).json({ error: 'Ошибка при получении радио потоков' });
  }
};

// Создание нового радио потока
export const createRadioStream = async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('[Radio] Creating radio stream with data:', req.body);
    console.log('[Radio] Request file:', req.file);
    console.log('[Radio] Request files:', req.files);
    console.log('[Radio] Content-Type:', req.headers['content-type']);
    const { name, branchTypeOfDist, frequencySongs, fadeInDuration, volumeLevel, startDate, endDate } = req.body;

    console.log('[Radio] Parsed data:', {
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
      console.log('[Radio] File uploaded:', req.file);
      console.log('[Radio] File path:', req.file.path);
      console.log('[Radio] File exists:', fs.existsSync(req.file.path));
      
      // Файл уже в правильном месте благодаря middleware
      if (fs.existsSync(req.file.path)) {
        // Используем название файла как оно сохранено на диске
        attachmentPath = req.file.filename;
        console.log('[Radio] Attachment path set to:', attachmentPath);
      } else {
        console.error('[Radio] File does not exist at path:', req.file.path);
        attachmentPath = null;
      }
    } else {
      console.log('[Radio] No file uploaded');
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

    console.log('[Radio] Created stream:', stream);
    
    // Уведомляем устройства об обновлении потоков
    await notifyStreamsUpdate(stream.branchTypeOfDist);
    
    return res.status(201).json({ success: true, data: stream });
  } catch (error: any) {
    console.error('[Radio] Error creating radio stream:', error);
    console.error('[Radio] Error details:', error.message);
    console.error('[Radio] Error stack:', error.stack);
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

    // Используем название файла как оно сохранено на диске
    const fileName = req.file.filename;
    const filePath = req.file.path; // Файл уже в правильном месте благодаря middleware

    // Обновляем запись в базе данных - записываем название файла
    const stream = await prisma.radioStream.update({
      where: { id: streamId },
      data: { attachment: fileName }
    });

    return res.status(200).json({
      success: true,
      message: 'Ролик загружен успешно',
      fileName: fileName,
      streamId,
      path: filePath
    });
  } catch (error) {
    console.error('[Radio] Error uploading stream roll:', error);
    return res.status(500).json({ error: 'Ошибка при загрузке ролика' });
  }
};

// Обновление радио потока
export const updateRadioStream = async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('[Radio] Updating radio stream with data:', req.body);
    console.log('[Radio] Request file:', req.file);
    console.log('[Radio] Request files:', req.files);
    console.log('[Radio] Content-Type:', req.headers['content-type']);
    
    const { id } = req.params;
    const { name, branchTypeOfDist, frequencySongs, fadeInDuration, volumeLevel, startDate, endDate, isActive } = req.body;

    console.log('[Radio] Parsed data:', {
      id,
      name,
      branchTypeOfDist,
      frequencySongs,
      fadeInDuration,
      volumeLevel,
      startDate,
      endDate,
      isActive
    });

    // Подготавливаем данные для обновления
    const updateData: any = {
      name,
      branchTypeOfDist,
      frequencySongs: frequencySongs ? parseInt(frequencySongs) : undefined,
      fadeInDuration: fadeInDuration ? parseInt(fadeInDuration) : undefined,
      volumeLevel: volumeLevel ? parseInt(volumeLevel) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      isActive
    };

    // Обработка загруженного файла
    if (req.file) {
      console.log('[Radio] File uploaded:', req.file);
      console.log('[Radio] File path:', req.file.path);
      console.log('[Radio] File exists:', fs.existsSync(req.file.path));
      
      // Файл уже в правильном месте благодаря middleware
      if (fs.existsSync(req.file.path)) {
        // Используем название файла как оно сохранено на диске
        updateData.attachment = req.file.filename;
        console.log('[Radio] Attachment path set to:', req.file.filename);
      } else {
        console.error('[Radio] File does not exist at path:', req.file.path);
      }
    } else {
      console.log('[Radio] No file uploaded for update');
    }

    const stream = await prisma.radioStream.update({
      where: { id },
      data: updateData
    });

    console.log('[Radio] Updated stream:', stream);

    // Уведомляем устройства об обновлении потоков
    await notifyStreamsUpdate(stream.branchTypeOfDist);
    
    return res.status(200).json({ success: true, data: stream });
  } catch (error: any) {
    console.error('[Radio] Error updating radio stream:', error);
    console.error('[Radio] Error details:', error.message);
    console.error('[Radio] Error stack:', error.stack);
    return res.status(500).json({ error: 'Ошибка при обновлении радио потока', details: error.message });
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
    console.error('[Radio] Error getting active streams by branch type:', error);
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
    console.error('[Radio] Error deleting radio stream:', error);
    return res.status(500).json({ error: 'Ошибка при удалении радио потока' });
  }
};

// Скачивание файла потока
export const downloadStreamFile = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    console.log('[Radio] Downloading stream file for ID:', id);
    
    // Находим поток в базе данных
    const stream = await prisma.radioStream.findUnique({
      where: { id }
    });
    
    if (!stream) {
      console.log('[Radio] Stream not found:', id);
      return res.status(404).json({ error: 'Поток не найден' });
    }
    
    if (!stream.attachment) {
      console.log('[Radio] Stream has no attachment:', id);
      return res.status(404).json({ error: 'Файл потока не найден' });
    }
    
    // Путь к файлу
    const filePath = path.join('./public/retail/radio/stream', stream.attachment);
    
    console.log('[Radio] Looking for file at path:', filePath);
    
    // Проверяем существование файла
    if (!fs.existsSync(filePath)) {
      console.log('[Radio] File does not exist at path:', filePath);
      
      // Пытаемся найти файл с исправленным названием (для совместимости с искаженными названиями)
      const streamDir = './public/retail/radio/stream';
      const files = fs.readdirSync(streamDir);
      console.log('[Radio] Available files in stream directory:', files);
      
      // Ищем файл, который может соответствовать нашему потоку
      const matchingFile = files.find(file => {
        // Сравниваем название файла с attachment из базы данных
        // Также проверяем, может ли файл быть с исправленным названием
        const correctedFile = decodeRussianFileName(file);
        console.log('[Radio] Comparing:', file, 'corrected:', correctedFile, 'with', stream.attachment);
        return file === stream.attachment || correctedFile === stream.attachment;
      });
      
      if (matchingFile) {
        console.log('[Radio] Found matching file:', matchingFile);
        const correctedFilePath = path.join(streamDir, matchingFile);
        console.log('[Radio] Using corrected file path:', correctedFilePath);
        
        // Отправляем файл с исправленным путем
        res.download(correctedFilePath, stream.attachment, (err) => {
          if (err) {
            console.error('[Radio] Error sending file:', err);
            if (!res.headersSent) {
              res.status(500).json({ error: 'Ошибка при скачивании файла' });
            }
          }
        });
        return;
      }
      
      return res.status(404).json({ error: 'Файл не найден на сервере' });
    }
    
    console.log('[Radio] File found, sending download response');
    
    // Отправляем файл
    res.download(filePath, stream.attachment, (err) => {
      if (err) {
        console.error('[Radio] Error sending file:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Ошибка при скачивании файла' });
        }
      }
    });
    
  } catch (error) {
    console.error('[Radio] Error downloading stream file:', error);
    return res.status(500).json({ error: 'Ошибка при скачивании файла потока' });
  }
};

// Проигрывание радио потока для веб-плеера
export const playRadioStream = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    console.log('🎵 [playRadioStream] Запрос на проигрывание потока:', id);

    // Получаем поток из базы данных
    const stream = await prisma.radioStream.findUnique({
      where: { id }
    });

    if (!stream) {
      console.log('❌ [playRadioStream] Поток не найден:', id);
      return res.status(404).json({ error: 'Поток не найден' });
    }

    if (!stream.isActive) {
      console.log('⚠️ [playRadioStream] Поток неактивен:', id);
      return res.status(400).json({ error: 'Поток неактивен' });
    }

    // Проверяем, есть ли файл для проигрывания
    if (!stream.attachment) {
      console.log('❌ [playRadioStream] У потока нет файла для проигрывания:', id);
      return res.status(400).json({ error: 'У потока нет файла для проигрывания' });
    }

    const filePath = path.join(process.cwd(), 'public', 'retail', 'radio', 'stream', stream.attachment);
    
    // Проверяем существование файла
    if (!fs.existsSync(filePath)) {
      console.log('❌ [playRadioStream] Файл не найден:', filePath);
      return res.status(404).json({ error: 'Файл потока не найден' });
    }

    console.log('✅ [playRadioStream] Отправляем файл для проигрывания:', filePath);

    // Определяем MIME тип по расширению файла
    const ext = path.extname(stream.attachment).toLowerCase();
    let contentType = 'audio/mpeg'; // по умолчанию
    
    switch (ext) {
      case '.mp3':
        contentType = 'audio/mpeg';
        break;
      case '.wav':
        contentType = 'audio/wav';
        break;
      case '.ogg':
        contentType = 'audio/ogg';
        break;
      case '.aac':
        contentType = 'audio/aac';
        break;
      case '.m4a':
        contentType = 'audio/mp4';
        break;
      default:
        contentType = 'audio/mpeg';
    }

    console.log(`🎵 [playRadioStream] MIME тип: ${contentType} для файла ${stream.attachment}`);

    // Устанавливаем правильные заголовки для потокового воспроизведения
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache');
    
    // Отправляем файл для потокового воспроизведения
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('❌ [playRadioStream] Ошибка отправки файла:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Ошибка при проигрывании потока' });
        }
      } else {
        console.log('✅ [playRadioStream] Файл успешно отправлен для проигрывания');
      }
    });

  } catch (error) {
    console.error('❌ [playRadioStream] Ошибка при проигрывании потока:', error);
    return res.status(500).json({ error: 'Ошибка при проигрывании потока' });
  }
};