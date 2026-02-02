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

// Функция для удаления папки прошлого месяца, когда в текущем появляется музыка
const cleanupPreviousMonthIfNeeded = async () => {
  try {
    const musicPath = './public/retail/radio/music';
    
    if (!fs.existsSync(musicPath)) {
      return;
    }

    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();
    const currentFolder = `${String(curMonth).padStart(2, '0')}-${curYear}`;
    
    // Проверяем, есть ли музыка в текущем месяце
    const currentMonthPath = path.join(musicPath, currentFolder);
    const currentMonthHasMusic = fs.existsSync(currentMonthPath) && 
      fs.readdirSync(currentMonthPath).length > 0;
    
    if (!currentMonthHasMusic) {
      return; // Если в текущем месяце нет музыки, ничего не удаляем
    }
    
    // Если в текущем месяце есть музыка, удаляем прошлый месяц
    const prevMonth = new Date(curYear, curMonth - 2, 1); // previous month
    const prevMonthFolder = `${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${prevMonth.getFullYear()}`;
    const prevMonthPath = path.join(musicPath, prevMonthFolder);
    
    if (fs.existsSync(prevMonthPath)) {
      fs.rmSync(prevMonthPath, { recursive: true, force: true });
    }
    
  } catch (error) {
    console.error('[Radio] Error cleaning previous month:', error);
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
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();
    const currentFolder = `${String(curMonth).padStart(2, '0')}-${curYear}`;
    const next = new Date(curYear, curMonth, 1); // first day of next month
    const nextFolder = `${String(next.getMonth() + 1).padStart(2, '0')}-${next.getFullYear()}`;
    
    // Проверяем, есть ли музыка в текущем месяце
    const currentMonthPath = path.join(musicPath, currentFolder);
    const currentMonthHasMusic = fs.existsSync(currentMonthPath) && 
      fs.readdirSync(currentMonthPath).length > 0;
    
    // Если в текущем месяце нет музыки, не удаляем прошлый месяц
    const prevMonth = new Date(curYear, curMonth - 2, 1); // previous month
    const prevMonthFolder = `${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${prevMonth.getFullYear()}`;
    
    let deletedCount = 0;
    
    for (const folder of folders) {
      // Проверяем формат папки (MM-YYYY)
      const folderRegex = /^\d{2}-\d{4}$/;
      if (!folderRegex.test(folder)) {
        continue;
      }
      
      // Оставляем текущий и следующий месяц без изменений
      if (folder === currentFolder || folder === nextFolder) {
        continue;
      }
      
      // Если в текущем месяце нет музыки, оставляем прошлый месяц
      if (!currentMonthHasMusic && folder === prevMonthFolder) {
        continue;
      }

      // Удаляем только прошедшие месяцы (меньше текущего), будущие — не трогаем
      const [mmStr, yyyyStr] = folder.split('-');
      const fMonth = parseInt(mmStr, 10);
      const fYear = parseInt(yyyyStr, 10);
      const isPast = fYear < curYear || (fYear === curYear && fMonth < curMonth);
      if (!isPast) {
        continue; // это будущая папка (включая за месяц и более вперёд)
      }

      const folderPath = path.join(musicPath, folder);
      const stats = fs.statSync(folderPath);
      
      if (stats.isDirectory()) {
        // Удаляем только прошедшие месяцы
        fs.rmSync(folderPath, { recursive: true, force: true });
        deletedCount++;
      }
    }
    
  } catch (error) {
  }
};

// Утилита для получения папки с музыкой для воспроизведения
// Если в текущем месяце нет музыки, возвращает прошлый месяц
const getCurrentMusicFolder = (): string => {
  const currentDate = new Date();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const year = currentDate.getFullYear();
  const currentFolder = `${month}-${year}`;
  
  const musicPath = './public/retail/radio/music';
  const currentMonthPath = path.join(musicPath, currentFolder);
  
  // Проверяем, есть ли музыка в текущем месяце
  if (fs.existsSync(currentMonthPath)) {
    const files = fs.readdirSync(currentMonthPath);
    if (files.length > 0) {
      return currentFolder;
    }
  }
  
  // Если в текущем месяце нет музыки, ищем в прошлом месяце
  const prevMonth = new Date(year, currentDate.getMonth() - 1, 1);
  const prevMonthFolder = `${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${prevMonth.getFullYear()}`;
  const prevMonthPath = path.join(musicPath, prevMonthFolder);
  
  if (fs.existsSync(prevMonthPath)) {
    const files = fs.readdirSync(prevMonthPath);
    if (files.length > 0) {
      return prevMonthFolder;
    }
  }
  
  // Если ничего не найдено, возвращаем текущий месяц (пустая папка)
  return currentFolder;
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

// Создание папки для следующего месяца (используется планировщиком)
export const preloadNextMonthMusic = async (): Promise<void> => {
  try {
    const now = new Date();
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const month = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
    const year = nextMonthDate.getFullYear();
    const nextFolder = `${month}-${year}`;
    const pathCreated = ensureMusicFolder(nextFolder);
  } catch (e) {
    console.error('[Radio] Preload next month music error:', e);
  }
};

export const uploadMusic = async (req: Request, res: Response): Promise<any> => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }
    
    const folderName = getCurrentMonthFolder();
    const fileName = req.file.filename;
    const filePath = req.file.path; // Файл уже в правильном месте благодаря middleware
    
    // Проверяем, что файл существует
    if (!fs.existsSync(filePath)) {
      return res.status(500).json({ error: 'Файл не найден' });
    }
    
    // После успешной загрузки музыки в текущий месяц, удаляем прошлый месяц
    await cleanupPreviousMonthIfNeeded();
    
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

// Загрузка музыки в конкретную папку MM-YYYY
export const uploadMusicToFolder = async (req: Request, res: Response): Promise<any> => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }
    const { folderName } = req.params as { folderName: string };
    const folderRegex = /^\d{2}-\d{4}$/;
    if (!folderName || !folderRegex.test(folderName)) {
      return res.status(400).json({ error: 'Неверное название папки. Ожидается MM-YYYY' });
    }
    const basePath = `./public/retail/radio/music/${folderName}`;
    if (!fs.existsSync(basePath)) {
      fs.mkdirSync(basePath, { recursive: true });
    }
    // Файл уже сохранён muler в нужную папку благодаря storage.destination
    const fileName = req.file.filename;
    const filePath = req.file.path;
    if (!fs.existsSync(filePath)) {
      return res.status(500).json({ error: 'Файл не найден' });
    }
    
    // Если загружаем в текущий месяц, удаляем прошлый месяц
    if (folderName === getCurrentMonthFolder()) {
      await cleanupPreviousMonthIfNeeded();
    }
    
    return res.status(200).json({
      success: true,
      message: 'Музыка загружена успешно',
      fileName,
      folderName,
      path: filePath
    });
  } catch (error) {
    console.error('[Radio] Error uploading music to folder:', error);
    return res.status(500).json({ error: 'Ошибка при загрузке музыки' });
  }
};

// Загрузка музыки в папку следующего месяца
export const uploadMusicNextMonth = async (req: Request, res: Response): Promise<any> => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const month = String(next.getMonth() + 1).padStart(2, '0');
    const year = next.getFullYear();
    const folderName = `${month}-${year}`;
    const basePath = `./public/retail/radio/music/${folderName}`;
    if (!fs.existsSync(basePath)) fs.mkdirSync(basePath, { recursive: true });
    const fileName = req.file.filename;
    const filePath = req.file.path;
    if (!fs.existsSync(filePath)) {
      return res.status(500).json({ error: 'Файл не найден' });
    }
    return res.status(200).json({ success: true, message: 'Музыка загружена (следующий месяц)', fileName, folderName, path: filePath });
  } catch (error) {
    console.error('[Radio] Error uploading music to next month:', error);
    return res.status(500).json({ error: 'Ошибка при загрузке музыки' });
  }
};

// Получение текущей папки с музыкой для воспроизведения
export const getCurrentMusicFolderForPlayback = async (req: Request, res: Response): Promise<any> => {
  try {
    const currentFolder = getCurrentMusicFolder();
    const musicPath = './public/retail/radio/music';
    const folderPath = path.join(musicPath, currentFolder);
    
    let files = [];
    if (fs.existsSync(folderPath)) {
      files = fs.readdirSync(folderPath);
    }
    
    return res.status(200).json({ 
      success: true, 
      currentFolder,
      hasMusic: files.length > 0,
      filesCount: files.length,
      isCurrentMonth: currentFolder === getCurrentMonthFolder()
    });
  } catch (error) {
    console.error('[Radio] Error getting current music folder for playback:', error);
    return res.status(500).json({ error: 'Ошибка при получении текущей папки с музыкой' });
  }
};

// Подсказка: текущая и следующая папки
export const getMonthFoldersInfo = async (req: Request, res: Response): Promise<any> => {
  try {
    const now = new Date();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const curYear = now.getFullYear();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonth = String(next.getMonth() + 1).padStart(2, '0');
    const nextYear = next.getFullYear();
    const msPerDay = 24 * 60 * 60 * 1000;
    const firstNext = new Date(nextYear, next.getMonth(), 1);
    const daysLeft = Math.ceil((firstNext.getTime() - now.getTime()) / msPerDay);
    
    // Проверяем наличие музыки в текущем месяце
    const currentFolder = `${curMonth}-${curYear}`;
    const musicPath = './public/retail/radio/music';
    const currentMonthPath = path.join(musicPath, currentFolder);
    let currentMonthHasMusic = false;
    let currentMonthFilesCount = 0;
    
    if (fs.existsSync(currentMonthPath)) {
      const files = fs.readdirSync(currentMonthPath);
      currentMonthFilesCount = files.length;
      currentMonthHasMusic = files.length > 0;
    }
    
    // Получаем папку для воспроизведения
    const playbackFolder = getCurrentMusicFolder();
    
    return res.json({ 
      success: true, 
      current: currentFolder,
      next: `${nextMonth}-${nextYear}`, 
      daysLeft,
      currentMonthHasMusic,
      currentMonthFilesCount,
      playbackFolder,
      isPlayingCurrentMonth: playbackFolder === currentFolder
    });
  } catch (e) {
    return res.status(500).json({ success: false });
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
    
    // Читаем все файлы из папки
    const allFiles = fs.readdirSync(folderPath);
    
    // Фильтруем по расширениям
    const supportedExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];
    const musicFiles = allFiles.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return supportedExtensions.includes(ext);
    });
    
    const files = musicFiles
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

export const deleteMusicFile = async (req: Request, res: Response): Promise<any> => {
  try {
    const { folderName, fileName } = req.params;
    if (!folderName || !fileName) return res.status(400).json({ error: 'Название папки и файла обязательно' });
    const filePath = `./public/retail/radio/music/${folderName}/${fileName}`;
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл не найден' });
    fs.unlinkSync(filePath);
    return res.status(200).json({ success: true, message: 'Файл музыки удален успешно', fileName });
  } catch (error) {
    console.error('[Radio] Error deleting music file:', error);
    return res.status(500).json({ error: 'Ошибка при удалении файла музыки' });
  }
};

// ===== Admin-related (moved) =====
export const getDevicesByBranches = async (req: Request, res: Response) => {
  try {
    // Убираем фильтрацию на бэкенде - пусть фронтенд фильтрует по правам доступа

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
        return { deviceId: d.id, branchId: d.branchId, online, rttMs: null, source: 'heartbeat' };
      } else {
        // Для обычных устройств используем WebSocket ping
        return { deviceId: d.id, branchId: d.branchId, online: !!pingResults[d.id]?.online, rttMs: pingResults[d.id]?.rttMs ?? null, source: 'websocket' };
      }
    });
    
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
    const [totalDevices, totalBranches, storesCount, discountCentersCount, topBranches] = await Promise.all([
      prisma.devices.count(),
      // Общее количество филиалов - только Магазин и Дисконт центр
      prisma.branch.count({
        where: { 
          status: { in: [0, 1] }, // Только филиалы со статусом 0 или 1
          type: { in: ['Магазин', 'Дисконт центр'] } // Только нужные типы (используем поле type)
        }
      }),
      // Количество магазинов
      prisma.branch.count({
        where: { 
          status: { in: [0, 1] },
          type: 'Магазин' // Используем поле type
        }
      }),
      // Количество дисконт-центров
      prisma.branch.count({
        where: { 
          status: { in: [0, 1] },
          type: 'Дисконт центр' // Используем поле type
        }
      }),
      prisma.branch.findMany({
        select: { name: true, type: true, _count: { select: { devices: true } } },
        where: { 
          devices: { some: {} },
          status: { in: [0, 1] }, // Только филиалы со статусом 0 или 1
          type: { in: ['Магазин', 'Дисконт центр'] } // Только нужные типы (используем поле type)
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
    
    // Асинхронный подсчет файлов
    const totalMusicFiles = await countMusicFilesAsync();
    
    const data = { 
      totalDevices, 
      activeDevices, 
      totalBranches, // Только Магазин + Дисконт центр
      storesCount, // Количество магазинов
      discountCentersCount, // Количество дисконт-центров
      totalMusicFiles, 
      topBranches 
    };
    
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
    
    // Проверяем, что устройство подключено
    const socketService = SocketIOService.getInstance();
    const connectedDevices = socketService.getConnectedDeviceIds();
    
    if (!connectedDevices.includes(deviceId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'DEVICE_OFFLINE',
        message: 'Устройство не подключено к серверу'
      });
    }
    
    const result = await socketService.sendToDeviceWithAck(deviceId, 'device_restart_app');
    
    if (!result.ok) {
      return res.status(400).json({ 
        success: false, 
        error: result.error || 'DEVICE_OFFLINE',
        message: 'Устройство недоступно для команды перезапуска'
      });
    }
    
    // Проверяем ответ от устройства
    const deviceResponse = result.data as any;
    
    // Если устройство вернуло ошибку
    if (deviceResponse?.error) {
      return res.status(400).json({ 
        success: false, 
        error: deviceResponse.error,
        message: `Устройство не может выполнить перезапуск: ${deviceResponse.error}`
      });
    }
    
    // Если устройство явно отказалось выполнить команду
    if (deviceResponse?.ok === false) {
      return res.status(400).json({ 
        success: false, 
        error: 'COMMAND_REJECTED',
        message: 'Устройство отказалось выполнить команду перезапуска'
      });
    }
    
    // Команда успешно отправлена
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
    
    // Проверяем, что устройство подключено
    const socketService = SocketIOService.getInstance();
    const connectedDevices = socketService.getConnectedDeviceIds();
    
    if (!connectedDevices.includes(deviceId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'DEVICE_OFFLINE',
        message: 'Устройство не подключено к серверу'
      });
    }
    
    const result = await socketService.sendToDeviceWithAck(deviceId, 'device_reboot');
    
    if (!result.ok) {
      return res.status(400).json({ 
        success: false, 
        error: result.error || 'DEVICE_OFFLINE',
        message: 'Устройство недоступно для команды перезагрузки'
      });
    }
    
    // Проверяем ответ от устройства
    const deviceResponse = result.data as any;
    
    // Если устройство вернуло ошибку
    if (deviceResponse?.error) {
      return res.status(400).json({ 
        success: false, 
        error: deviceResponse.error,
        message: `Устройство не может выполнить перезагрузку: ${deviceResponse.error}`
      });
    }
    
    // Если устройство явно отказалось выполнить команду
    if (deviceResponse?.ok === false) {
      return res.status(400).json({ 
        success: false, 
        error: 'COMMAND_REJECTED',
        message: 'Устройство отказалось выполнить команду перезагрузки'
      });
    }
    
    // Команда успешно отправлена
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
    const { name, branchTypeOfDist, frequencySongs, fadeInDuration, volumeLevel, startDate, endDate } = req.body;

    let attachmentPath = null;
    
    // Обработка загруженного файла
    if (req.file) {
            
      // Файл уже в правильном месте благодаря middleware
      if (fs.existsSync(req.file.path)) {
        // Используем название файла как оно сохранено на диске
        attachmentPath = req.file.filename;
      } else {
        attachmentPath = null;
      }
    } else {
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

    
    // Уведомляем устройства об обновлении потоков
    await notifyStreamsUpdate(stream.branchTypeOfDist);
    
    return res.status(201).json({ success: true, data: stream });
  } catch (error: any) {
    console.error('[Radio] Error creating radio stream:', error);
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
    
    const { id } = req.params;
    const { name, branchTypeOfDist, frequencySongs, fadeInDuration, volumeLevel, startDate, endDate, isActive } = req.body;

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
            
      // Файл уже в правильном месте благодаря middleware
      if (fs.existsSync(req.file.path)) {
        // Используем название файла как оно сохранено на диске
        updateData.attachment = req.file.filename;
      } else {
      }
    } else {
    }

    const stream = await prisma.radioStream.update({
      where: { id },
      data: updateData
    });


    // Уведомляем устройства об обновлении потоков
    await notifyStreamsUpdate(stream.branchTypeOfDist);
    
    return res.status(200).json({ success: true, data: stream });
  } catch (error: any) {
    console.error('[Radio] Error updating radio stream:', error);
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
    
    
    // Находим поток в базе данных
    const stream = await prisma.radioStream.findUnique({
      where: { id }
    });
    
    if (!stream) {
      return res.status(404).json({ error: 'Поток не найден' });
    }
    
    if (!stream.attachment) {
      return res.status(404).json({ error: 'Файл потока не найден' });
    }
    
    // Путь к файлу
    const filePath = path.join('./public/retail/radio/stream', stream.attachment);
    
    
    // Проверяем существование файла
    if (!fs.existsSync(filePath)) {
      
      // Пытаемся найти файл с исправленным названием (для совместимости с искаженными названиями)
      const streamDir = './public/retail/radio/stream';
      const files = fs.readdirSync(streamDir);
      
      // Ищем файл, который может соответствовать нашему потоку
      const matchingFile = files.find(file => {
        // Сравниваем название файла с attachment из базы данных
        // Также проверяем, может ли файл быть с исправленным названием
        const correctedFile = decodeRussianFileName(file);
        return file === stream.attachment || correctedFile === stream.attachment;
      });
      
      if (matchingFile) {
        const correctedFilePath = path.join(streamDir, matchingFile);
        
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

    // Получаем поток из базы данных
    const stream = await prisma.radioStream.findUnique({
      where: { id }
    });

    if (!stream) {
      return res.status(404).json({ error: 'Поток не найден' });
    }

    if (!stream.isActive) {
      return res.status(400).json({ error: 'Поток неактивен' });
    }

    // Проверяем, есть ли файл для проигрывания
    if (!stream.attachment) {
      return res.status(400).json({ error: 'У потока нет файла для проигрывания' });
    }

    const filePath = path.join(process.cwd(), 'public', 'retail', 'radio', 'stream', stream.attachment);
    
    // Проверяем существование файла
    if (!fs.existsSync(filePath)) {
      // Пытаемся найти файл с исправленным названием
      const streamDir = path.join(process.cwd(), 'public', 'retail', 'radio', 'stream');
      const files = fs.existsSync(streamDir) ? fs.readdirSync(streamDir) : [];
      
      // Ищем файл, который может соответствовать нашему потоку
      const matchingFile = files.find(file => {
        const correctedFile = decodeRussianFileName(file);
        return file === stream.attachment || correctedFile === stream.attachment;
      });
      
      if (matchingFile) {
        const correctedFilePath = path.join(streamDir, matchingFile);
        
        // Отправляем файл с исправленным путем
        const ext = path.extname(stream.attachment).toLowerCase();
        let contentType = 'audio/mpeg';
        
        switch (ext) {
          case '.mp3': contentType = 'audio/mpeg'; break;
          case '.wav': contentType = 'audio/wav'; break;
          case '.ogg': contentType = 'audio/ogg'; break;
          case '.aac': contentType = 'audio/aac'; break;
          case '.m4a': contentType = 'audio/mp4'; break;
        }
        
        // Получаем размер файла
        const stats = fs.statSync(correctedFilePath);
        const fileSize = stats.size;

        // Поддержка Range requests для буферизации и seek
        const range = req.headers.range;
        
        if (range) {
          // Парсим Range заголовок
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunksize = (end - start) + 1;
          
          // Устанавливаем заголовки для частичного контента
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length'
          });

          // Создаем поток для чтения части файла
          const fileStream = fs.createReadStream(correctedFilePath, { start, end });
          fileStream.pipe(res);
          
          fileStream.on('error', (err) => {
            console.error('❌ [playRadioStream] Ошибка чтения файла:', err);
            if (!res.headersSent) {
              res.status(500).json({ error: 'Ошибка при проигрывании потока' });
            }
          });
        } else {
          res.setHeader('Content-Type', contentType);
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Length', fileSize);
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
          
          res.sendFile(correctedFilePath, (err) => {
            if (err) {
              if (!res.headersSent) {
                res.status(500).json({ error: 'Ошибка при проигрывании потока' });
              }
            }
          });
        }
        return;
      }
      
      return res.status(404).json({ error: 'Файл потока не найден' });
    }


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


    // Получаем размер файла
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    // Поддержка Range requests для буферизации и seek
    const range = req.headers.range;
    
    if (range) {
      // Парсим Range заголовок
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      // Устанавливаем заголовки для частичного контента
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // Кешируем на 1 час для стабильности
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length'
      });

      // Создаем поток для чтения части файла
      const fileStream = fs.createReadStream(filePath, { start, end });
      fileStream.pipe(res);
      
      fileStream.on('error', (err) => {
        console.error('❌ [playRadioStream] Ошибка чтения файла:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Ошибка при проигрывании потока' });
        }
      });
    } else {
      // Полный файл - устанавливаем правильные заголовки для потокового воспроизведения
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Кешируем на 1 час
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
      
      // Отправляем файл для потокового воспроизведения
      res.sendFile(filePath, (err) => {
        if (err) {
          console.error('❌ [playRadioStream] Ошибка отправки файла:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Ошибка при проигрывании потока' });
          }
        } else {
            }
      });
    }

  } catch (error) {
    console.error('❌ [playRadioStream] Ошибка при проигрывании потока:', error);
    return res.status(500).json({ error: 'Ошибка при проигрывании потока' });
  }
};