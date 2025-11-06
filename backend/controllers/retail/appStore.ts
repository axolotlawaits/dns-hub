import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from '../../server.js';
import { AppCategory, AppType } from '@prisma/client';
import { decodeRussianFileName } from '../../utils/format.js';

const execAsync = promisify(exec);

// Создание нового приложения
export const createApp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, category, appType, description, icon } = req.body;

    // Проверяем обязательные поля
    if (!name || !category || !appType) {
      res.status(400).json({ 
        success: false, 
        message: 'Название, категория и тип приложения обязательны' 
      });
      return;
    }

    // Проверяем, что приложение с таким именем не существует
    const existingApp = await prisma.app.findFirst({
      where: { name }
    });

    if (existingApp) {
      res.status(400).json({ 
        success: false, 
        message: 'Приложение с таким названием уже существует' 
      });
      return;
    }

    const newApp = await prisma.app.create({
      data: {
        name,
        category: category as AppCategory,
        appType: appType as AppType,
        description,
        icon
      }
    });

    res.status(201).json({ 
      success: true, 
      message: 'Приложение создано успешно', 
      app: newApp 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Ошибка сервера при создании приложения' 
    });
  }
};

// Получение списка всех приложений
export const getApps = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, appType, isActive } = req.query;
    
    const where: any = {};
    if (category) where.category = category;
    if (appType) where.appType = appType;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const apps = await prisma.app.findMany({
      where,
      include: {
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.status(200).json({ success: true, apps });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Ошибка сервера' 
    });
  }
};

// Получение приложения по ID
export const getAppById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const app = await prisma.app.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!app) {
      res.status(404).json({ 
        success: false, 
        message: 'Приложение не найдено' 
      });
      return;
    }

    res.status(200).json({ success: true, app });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Ошибка сервера' 
    });
  }
};

// Загрузка новой версии приложения
export const uploadAppVersion = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'Файл не был загружен' });
      return;
    }

    const { id: appId } = req.params;
    const { version, description } = req.body;

    // Проверяем обязательные поля
    if (!appId || !version) {
      res.status(400).json({ 
        success: false, 
        message: 'ID приложения и версия обязательны' 
      });
      return;
    }

    // Проверяем, что приложение существует
    const app = await prisma.app.findUnique({
      where: { id: appId }
    });

    if (!app) {
      res.status(404).json({ 
        success: false, 
        message: 'Приложение не найдено' 
      });
      return;
    }

    // Проверяем, что версия не существует
    const existingVersion = await prisma.appVersion.findFirst({
      where: { 
        appId, 
        version 
      }
    });

    if (existingVersion) {
      res.status(400).json({ 
        success: false, 
        message: 'Версия уже существует' 
      });
      return;
    }

    // Определяем папку для файла: public/retail/app/{название_приложения}/
    // Исправляем кодировку русских символов в названии приложения
    const correctedAppName = decodeRussianFileName(app.name);
    const appName = correctedAppName.replace(/[^a-zA-Z0-9а-яА-Я\s-_]/g, '').replace(/\s+/g, '_');
    const uploadDir = `./public/retail/app/${appName}`;
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Формируем имя файла: название_приложения_версия_дата.расширение
    // Исправляем кодировку в оригинальном названии файла
    const correctedOriginalName = decodeRussianFileName(req.file.originalname);
    const fileExtension = path.extname(correctedOriginalName);
    const baseFileName = path.basename(correctedOriginalName, fileExtension);
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const newFileName = `${appName}_v${version}_${currentDate}${fileExtension}`;
    
    // Копируем файл из temp в целевую папку (избегаем cross-device link ошибки)
    const tempFilePath = req.file.path;
    const finalFilePath = path.join(uploadDir, newFileName);
    
    try {
      // Сначала пытаемся переместить (быстрее)
      fs.renameSync(tempFilePath, finalFilePath);
    } catch (renameError: any) {
      // Если перемещение не удалось (cross-device link), копируем
      try {
        fs.copyFileSync(tempFilePath, finalFilePath);
        fs.unlinkSync(tempFilePath); // Удаляем временный файл после копирования
      } catch (copyError: any) {
        throw new Error(`Ошибка при сохранении файла: ${copyError.message}`);
      }
    }

    // Деактивируем все предыдущие версии
    await prisma.appVersion.updateMany({
      where: { appId },
      data: { isActive: false }
    });

    // Создаем новую версию
    const newVersion = await prisma.appVersion.create({
      data: {
        appId,
        version,
        fileName: newFileName,
        filePath: finalFilePath.replace(/\\/g, '/'),
        fileSize: req.file.size,
        description,
        isActive: true
      }
    });

    res.status(201).json({ 
      success: true, 
      message: 'Версия загружена успешно', 
      version: newVersion 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Ошибка сервера при загрузке версии' 
    });
  }
};

// Скачивание последней версии приложения
export const downloadLatestVersion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: appId } = req.params;
    
    const startTime = Date.now();
    console.log(`[Download] Starting download for app ID: ${appId}, IP: ${req.ip}`);
    console.log(`[Download] User-Agent: ${req.headers['user-agent'] || 'unknown'}`);
    console.log(`[Download] Accept: ${req.headers['accept'] || 'unknown'}`);
    console.log(`[Download] Connection: ${req.headers['connection'] || 'unknown'}`);
    console.log(`[Download] Range: ${req.headers['range'] || 'none'}`);
    console.log(`[Download] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[Download] Request URL: ${req.url}`);
    console.log(`[Download] Request method: ${req.method}`);
    
    // Логируем важные заголовки
    const importantHeaders = ['content-type', 'accept-encoding', 'cache-control', 'referer', 'origin'];
    importantHeaders.forEach(header => {
      if (req.headers[header]) {
        console.log(`[Download] ${header}: ${req.headers[header]}`);
      }
    });
    
    // Логируем ВСЕ заголовки для диагностики
    console.log(`[Download] ==== ALL HEADERS ====`);
    Object.keys(req.headers).forEach(key => {
      console.log(`[Download] ${key}: ${req.headers[key]}`);
    });
    console.log(`[Download] ==== END HEADERS ====`);
    
    const dbStartTime = Date.now();
    const latestVersion = await prisma.appVersion.findFirst({
      where: { 
        appId, 
        isActive: true 
      },
      include: {
        app: true
      },
      orderBy: { createdAt: 'desc' }
    });
    const dbTime = Date.now() - dbStartTime;
    console.log(`[Download] Database query took ${dbTime}ms`);

    if (!latestVersion) {
      console.log(`[Download] Version not found for app ID: ${appId}`);
      res.status(404).json({ 
        success: false, 
        message: 'Версия не найдена' 
      });
      return;
    }

    const fileCheckStartTime = Date.now();
    const filePath = path.join(process.cwd(), latestVersion.filePath);
    if (!fs.existsSync(filePath)) {
      console.error(`[Download] File not found at path: ${filePath}`);
      res.status(404).json({ 
        success: false, 
        message: 'Файл не найден на сервере' 
      });
      return;
    }
    const fileCheckTime = Date.now() - fileCheckStartTime;
    console.log(`[Download] File existence check took ${fileCheckTime}ms`);

    // Получаем информацию о файле
    const fileStats = fs.statSync(filePath);
    const fileSize = fileStats.size;
    const fileName = latestVersion.fileName;

    // Формируем имя файла для скачивания (только ASCII символы для заголовков)
    const appName = latestVersion.app.name
      .replace(/[^a-zA-Z0-9\s-_]/g, '') // Убираем все не-ASCII символы
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, ''); // Дополнительная очистка
    const fileExtension = path.extname(latestVersion.fileName);
    const downloadDate = new Date().toISOString().split('T')[0];
    const downloadFileName = `${appName}_v${latestVersion.version}_${downloadDate}${fileExtension}`;
    
    // Создаем безопасное имя файла для заголовка (только ASCII)
    const safeFileName = downloadFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // Определяем правильный MIME-тип для лучшей совместимости с QR-скачиванием
    const getContentType = (ext: string) => {
      const extLower = ext.toLowerCase();
      if (extLower === '.apk') return 'application/vnd.android.package-archive';
      if (extLower === '.exe') return 'application/x-msdownload';
      if (extLower === '.msi') return 'application/x-msi';
      if (extLower === '.dmg') return 'application/x-apple-diskimage';
      if (extLower === '.deb') return 'application/x-debian-package';
      if (extLower === '.rpm') return 'application/x-rpm';
      return 'application/octet-stream';
    };
    const contentType = getContentType(fileExtension);
    
    console.log(`[Download] File info - Size: ${fileSize} bytes, Original: ${downloadFileName}, Safe: ${safeFileName}`);
    console.log(`[Download] Content-Type: ${contentType}`);
    console.log(`[Download] Content-Disposition header: attachment; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(downloadFileName)}`);

    // Увеличиваем счетчик скачиваний (делаем это асинхронно, чтобы не блокировать скачивание)
    prisma.appVersion.update({
      where: { id: latestVersion.id },
      data: { downloadCount: { increment: 1 } }
    }).catch(err => console.error('[Download] Error updating download count:', err));

    // Поддержка Range requests для докачки
    const range = req.headers.range;
    if (range) {
      console.log(`[Download] Range request detected: ${range}`);
      
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      // Проверяем валидность диапазона
      if (start >= fileSize || end >= fileSize) {
        res.status(416).json({ 
          success: false, 
          message: 'Requested range not satisfiable' 
        });
        return;
      }

      // Устанавливаем заголовки для частичного контента
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', chunksize);
      res.setHeader('Content-Type', contentType);
      // Disable proxy buffering (e.g., nginx) to avoid stalled progress at 0%
      res.setHeader('X-Accel-Buffering', 'no');
      // Используем RFC 5987 для поддержки Unicode имен файлов
      const encodedFileName = encodeURIComponent(downloadFileName);
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`);
      // Полностью отключаем кеш для того, чтобы всегда скачивалась последняя активная версия
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Connection', 'keep-alive');
      // Валидаторы ответа
      try {
        const stats = fs.statSync(filePath);
        res.setHeader('Last-Modified', stats.mtime.toUTCString());
        res.setHeader('ETag', `${stats.size}-${Math.floor(stats.mtimeMs)}`);
      } catch {}

      // Flush headers early so clients show progress immediately
      if (typeof (res as any).flushHeaders === 'function') {
        (res as any).flushHeaders();
      }

      // Создаем поток для чтения части файла с оптимизированными настройками
      const fileStream = fs.createReadStream(filePath, { 
        start, 
        end,
        highWaterMark: 64 * 1024, // 64KB буфер для лучшей производительности
        autoClose: true
      });
      fileStream.on('open', () => {
        console.log('[Download] Range file stream opened');
      });
      
      let bytesSent = 0;
      
      // Счетчик отправленных байт для Range запросов
      fileStream.on('data', (chunk) => {
        bytesSent += chunk.length;
      });
      
      fileStream.on('error', (err) => {
        console.error('[Download] Stream error:', err);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            message: 'Ошибка чтения файла' 
          });
        }
      });
      
      fileStream.on('end', () => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        console.log(`[Download] Range stream ended, ${bytesSent}/${chunksize} bytes sent`);
        console.log(`[Download] Range download completed in ${duration}ms`);
      });
      
      res.on('close', () => {
        console.log(`[Download] Range client disconnected: ${bytesSent}/${chunksize} bytes sent`);
        if (!fileStream.destroyed) {
          fileStream.destroy();
        }
      });

      fileStream.pipe(res);
      return;
    }

    // Обычное скачивание (без Range)
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Type', contentType);
    // Используем RFC 5987 для поддержки Unicode имен файлов
    const encodedFileName = encodeURIComponent(downloadFileName);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`);
    res.setHeader('Accept-Ranges', 'bytes');
    // Полностью отключаем кеш, чтобы исключить выдачу старого файла
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Connection', 'keep-alive');
    // Валидаторы ответа
    try {
      const stats = fs.statSync(filePath);
      res.setHeader('Last-Modified', stats.mtime.toUTCString());
      res.setHeader('ETag', `${stats.size}-${Math.floor(stats.mtimeMs)}`);
    } catch {}

    // Flush headers early so clients show progress immediately
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }
    
    // Создаем поток для чтения файла с оптимизированными настройками
    const fileStream = fs.createReadStream(filePath, {
      highWaterMark: 64 * 1024, // 64KB буфер для лучшей производительности
      autoClose: true
    });
    fileStream.on('open', () => {
      console.log('[Download] File stream opened');
    });
    
    // Таймаут для скачивания (30 минут)
    const downloadTimeout = setTimeout(() => {
      console.log(`[Download] Download timeout for ${safeFileName}`);
      fileStream.destroy();
      if (!res.headersSent) {
        res.status(408).json({ 
          success: false, 
          message: 'Время скачивания истекло' 
        });
      }
    }, 30 * 60 * 1000); // 30 минут

    fileStream.on('error', (err) => {
      console.error('[Download] Stream error:', err);
      clearTimeout(downloadTimeout);
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          message: 'Ошибка чтения файла' 
        });
      }
    });

    let bytesSent = 0;
    
    // Счетчик отправленных байт
    fileStream.on('data', (chunk) => {
      bytesSent += chunk.length;
    });

    fileStream.on('end', () => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      const speed = fileSize / (duration / 1000) / 1024; // KB/s
      console.log(`[Download] Stream ended, ${bytesSent}/${fileSize} bytes sent`);
      console.log(`[Download] Download completed for ${safeFileName} in ${duration}ms (${speed.toFixed(2)} KB/s)`);
      
      // Логируем медленные скачивания для анализа
      if (speed < 100) {
        console.warn(`[Download] SLOW DOWNLOAD WARNING: ${speed.toFixed(2)} KB/s for ${safeFileName}`);
        console.warn(`[Download] User-Agent: ${req.headers['user-agent'] || 'unknown'}`);
        console.warn(`[Download] IP: ${req.ip}, Duration: ${duration}ms, Size: ${fileSize} bytes`);
      }
      
      clearTimeout(downloadTimeout);
    });

    // Обработка закрытия соединения клиентом (событие на Response, а не Request!)
    res.on('close', () => {
      const closeTime = Date.now();
      const totalDuration = closeTime - startTime;
      console.log(`[Download] Client disconnected: ${bytesSent}/${fileSize} bytes sent in ${totalDuration}ms`);
      console.log(`[Download] Disconnect during download of ${safeFileName}`);
      clearTimeout(downloadTimeout);
      if (!fileStream.destroyed) {
        fileStream.destroy();
      }
    });

    res.on('finish', () => {
      const finishTime = Date.now();
      const totalDuration = finishTime - startTime;
      console.log(`[Download] Response finished: ${bytesSent}/${fileSize} bytes sent in ${totalDuration}ms`);
    });

    fileStream.pipe(res);

  } catch (error: any) {
    console.error('[Download] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Ошибка сервера' 
    });
  }
};

// Получение истории версий приложения
export const getAppVersions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: appId } = req.params;

    // Проверяем, что приложение существует
    const app = await prisma.app.findUnique({
      where: { id: appId }
    });

    if (!app) {
      res.status(404).json({ 
        success: false, 
        message: 'Приложение не найдено' 
      });
      return;
    }

    const versions = await prisma.appVersion.findMany({
      where: { appId },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ success: true, versions });
  } catch (error: any) {
    console.error('❌ [getAppVersions] Ошибка:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Ошибка сервера' 
    });
  }
};

// Получение информации о файлах приложения (для отладки)
export const getAppFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const app = await prisma.app.findUnique({
      where: { id }
    });

    if (!app) {
      res.status(404).json({ 
        success: false, 
        message: 'Приложение не найдено' 
      });
      return;
    }

    const appName = app.name.replace(/[^a-zA-Z0-9а-яА-Я\s-_]/g, '').replace(/\s+/g, '_');
    const appDir = `./public/retail/app/${appName}`;
    
    if (!fs.existsSync(appDir)) {
      res.status(200).json({ 
        success: true, 
        files: [],
        message: 'Папка приложения не существует' 
      });
      return;
    }

    const files = fs.readdirSync(appDir).map(file => {
      const filePath = path.join(appDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        isDirectory: stats.isDirectory()
      };
    });

    res.status(200).json({ 
      success: true, 
      files,
      appName,
      appDir 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Ошибка сервера' 
    });
  }
};

// Обновление информации о приложении
export const updateApp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, icon, isActive } = req.body;

    const updatedApp = await prisma.app.update({
      where: { id },
      data: {
        name,
        description,
        icon,
        isActive
      }
    });

    res.status(200).json({ 
      success: true, 
      message: 'Приложение обновлено успешно', 
      app: updatedApp 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Ошибка сервера' 
    });
  }
};

// Диагностика скачивания
export const downloadDiagnostics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: appId } = req.params;
    
    console.log(`[Diagnostics] Download diagnostics for app ID: ${appId}, IP: ${req.ip}`);
    
    const latestVersion = await prisma.appVersion.findFirst({
      where: { 
        appId, 
        isActive: true 
      },
      include: {
        app: true
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!latestVersion) {
      res.status(404).json({ 
        success: false, 
        message: 'Версия не найдена' 
      });
      return;
    }

    const filePath = path.join(process.cwd(), latestVersion.filePath);
    const fileExists = fs.existsSync(filePath);
    let fileStats = null;
    
    if (fileExists) {
      fileStats = fs.statSync(filePath);
    }

    const diagnostics = {
      appId,
      version: latestVersion.version,
      fileName: latestVersion.fileName,
      filePath: latestVersion.filePath,
      fileExists,
      fileSize: fileStats ? fileStats.size : null,
      lastModified: fileStats ? fileStats.mtime : null,
      downloadCount: latestVersion.downloadCount,
      createdAt: latestVersion.createdAt,
      userAgent: req.headers['user-agent'] || 'unknown',
      ip: req.ip,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    };

    res.status(200).json({ 
      success: true, 
      diagnostics 
    });
  } catch (error: any) {
    console.error('[Diagnostics] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Ошибка сервера' 
    });
  }
};

// Удаление приложения
export const deleteApp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Получаем информацию о приложении для определения папки
    const app = await prisma.app.findUnique({
      where: { id }
    });

    if (app) {
      // Удаляем папку приложения по названию
      const appName = app.name.replace(/[^a-zA-Z0-9а-яА-Я\s-_]/g, '').replace(/\s+/g, '_');
      const appDir = `./public/retail/app/${appName}`;
      if (fs.existsSync(appDir)) {
        fs.rmSync(appDir, { recursive: true, force: true });
      }
    }

    // Удаляем из базы данных (каскадное удаление версий)
    await prisma.app.delete({
      where: { id }
    });

    res.status(200).json({ 
      success: true, 
      message: 'Приложение удалено успешно' 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Ошибка сервера' 
    });
  }
};

// Получение SHA-256 checksum сертификата APK для QR provisioning
export const getApkChecksum = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: appId } = req.params;
    
    console.log(`[Checksum] Получение checksum для app ID: ${appId}`);

    // Получаем последнюю активную версию приложения
    const latestVersion = await prisma.appVersion.findFirst({
      where: { 
        appId, 
        isActive: true 
      },
      include: {
        app: true
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!latestVersion) {
      res.status(404).json({ 
        success: false, 
        message: 'Версия не найдена' 
      });
      return;
    }

    // Проверяем, что это APK файл
    if (latestVersion.app.appType !== 'ANDROID_APK') {
      res.status(400).json({ 
        success: false, 
        message: 'Этот endpoint предназначен только для Android APK файлов' 
      });
      return;
    }

    // Формируем путь к файлу
    const appName = latestVersion.app.name.replace(/[^a-zA-Z0-9а-яА-Я\s-_]/g, '').replace(/\s+/g, '_');
    const appDir = `./public/retail/app/${appName}`;
    const filePath = path.join(appDir, latestVersion.fileName);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ 
        success: false, 
        message: 'APK файл не найден на сервере' 
      });
      return;
    }

    console.log(`[Checksum] APK файл: ${filePath}`);

    let checksum: string | null = null;
    let method: string = 'unknown';
    let error: string | null = null;

    // Пытаемся использовать apksigner (Android SDK)
    // Ищем apksigner в стандартных местах установки Android SDK
    const isWindows = process.platform === 'win32';
    let apksignerCommand = 'apksigner verify --print-certs';
    
    // Функция для поиска apksigner
    const findApksigner = (): string | null => {
      // Сначала проверяем переменные окружения
      const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
      if (androidHome) {
        console.log(`[Checksum] Найден ANDROID_HOME/ANDROID_SDK_ROOT: ${androidHome}`);
        const buildToolsDirs = fs.existsSync(path.join(androidHome, 'build-tools')) 
          ? fs.readdirSync(path.join(androidHome, 'build-tools')).filter((dir: string) => {
              const dirPath = path.join(androidHome, 'build-tools', dir);
              return fs.statSync(dirPath).isDirectory() && /^\d+\.\d+\.\d+/.test(dir);
            }).sort((a: string, b: string) => {
              // Сортируем по версии (новые версии первыми)
              const aParts = a.split('.').map(Number);
              const bParts = b.split('.').map(Number);
              for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                const aVal = aParts[i] || 0;
                const bVal = bParts[i] || 0;
                if (bVal !== aVal) return bVal - aVal;
              }
              return 0;
            })
          : [];
        
        for (const buildToolsDir of buildToolsDirs) {
          const apksignerPath = isWindows 
            ? path.join(androidHome, 'build-tools', buildToolsDir, 'apksigner.bat')
            : path.join(androidHome, 'build-tools', buildToolsDir, 'apksigner');
          
          if (fs.existsSync(apksignerPath)) {
            console.log(`[Checksum] ✅ Найден apksigner через ANDROID_HOME: ${apksignerPath}`);
            return apksignerPath;
          }
        }
      }
      
      // Если не нашли через переменные окружения, пробуем стандартные пути
      const possiblePaths: string[] = [];
      
      if (isWindows) {
        const localAppData = process.env.LOCALAPPDATA || '';
        const userProfile = process.env.USERPROFILE || '';
        
        possiblePaths.push(
          'apksigner.bat', // Если в PATH
          path.join(localAppData, 'Android', 'Sdk', 'build-tools', '33.0.0', 'apksigner.bat'),
          path.join(localAppData, 'Android', 'Sdk', 'build-tools', '34.0.0', 'apksigner.bat'),
          path.join(localAppData, 'Android', 'Sdk', 'build-tools', '35.0.0', 'apksigner.bat'),
          path.join(userProfile, 'AppData', 'Local', 'Android', 'Sdk', 'build-tools', '33.0.0', 'apksigner.bat'),
          path.join(userProfile, 'AppData', 'Local', 'Android', 'Sdk', 'build-tools', '34.0.0', 'apksigner.bat'),
          path.join('C:', 'Android', 'Sdk', 'build-tools', '33.0.0', 'apksigner.bat'),
          path.join('C:', 'Android', 'Sdk', 'build-tools', '34.0.0', 'apksigner.bat'),
        );
      } else {
        // Linux/Mac пути
        const home = process.env.HOME || '';
        possiblePaths.push(
          'apksigner', // Если в PATH
          path.join(home, 'Android', 'Sdk', 'build-tools', '33.0.0', 'apksigner'),
          path.join(home, 'Android', 'Sdk', 'build-tools', '34.0.0', 'apksigner'),
          path.join('/opt', 'android-sdk', 'build-tools', '33.0.0', 'apksigner'),
          path.join('/opt', 'android-sdk', 'build-tools', '34.0.0', 'apksigner'),
        );
      }
      
      // Проверяем каждый путь
      for (const possiblePath of possiblePaths) {
        try {
          if (fs.existsSync(possiblePath)) {
            console.log(`[Checksum] ✅ Найден apksigner: ${possiblePath}`);
            return possiblePath;
          }
        } catch {}
      }
      
      // Если не нашли конкретный файл, пробуем найти build-tools директории и искать там
      const searchDirs: string[] = [];
      if (isWindows) {
        const localAppData = process.env.LOCALAPPDATA || '';
        const userProfile = process.env.USERPROFILE || '';
        searchDirs.push(
          path.join(localAppData, 'Android', 'Sdk', 'build-tools'),
          path.join(userProfile, 'AppData', 'Local', 'Android', 'Sdk', 'build-tools'),
          path.join('C:', 'Android', 'Sdk', 'build-tools'),
        );
      } else {
        const home = process.env.HOME || '';
        searchDirs.push(
          path.join(home, 'Android', 'Sdk', 'build-tools'),
          '/opt/android-sdk/build-tools',
        );
      }
      
      for (const searchDir of searchDirs) {
        try {
          if (fs.existsSync(searchDir)) {
            const versions = fs.readdirSync(searchDir)
              .filter((dir: string) => {
                const dirPath = path.join(searchDir, dir);
                return fs.statSync(dirPath).isDirectory() && /^\d+\.\d+\.\d+/.test(dir);
              })
              .sort((a: string, b: string) => {
                const aParts = a.split('.').map(Number);
                const bParts = b.split('.').map(Number);
                for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                  const aVal = aParts[i] || 0;
                  const bVal = bParts[i] || 0;
                  if (bVal !== aVal) return bVal - aVal;
                }
                return 0;
              });
            
            for (const version of versions) {
              const apksignerPath = isWindows
                ? path.join(searchDir, version, 'apksigner.bat')
                : path.join(searchDir, version, 'apksigner');
              
              if (fs.existsSync(apksignerPath)) {
                console.log(`[Checksum] ✅ Найден apksigner в build-tools: ${apksignerPath}`);
                return apksignerPath;
              }
            }
          }
        } catch {}
      }
      
      return null;
    };
    
    const apksignerPath = findApksigner();
    if (apksignerPath) {
      apksignerCommand = `"${apksignerPath}" verify --print-certs`;
      console.log(`[Checksum] Используем apksigner: ${apksignerPath}`);
      
      // Добавляем путь к build-tools в PATH для текущего процесса
      // Это нужно, чтобы apksigner мог найти свои зависимости (например, d8.jar)
      const buildToolsDir = path.dirname(apksignerPath);
      const currentPath = process.env.PATH || '';
      const pathSeparator = isWindows ? ';' : ':';
      
      if (!currentPath.includes(buildToolsDir)) {
        process.env.PATH = `${buildToolsDir}${pathSeparator}${currentPath}`;
        console.log(`[Checksum] ✅ Добавлен путь в PATH: ${buildToolsDir}`);
      }
      
      // Также добавляем путь к lib директории build-tools, если она существует
      const libDir = path.join(buildToolsDir, 'lib');
      if (fs.existsSync(libDir) && !currentPath.includes(libDir)) {
        process.env.PATH = `${libDir}${pathSeparator}${process.env.PATH}`;
        console.log(`[Checksum] ✅ Добавлен путь к lib в PATH: ${libDir}`);
      }
    } else {
      console.log(`[Checksum] ⚠️ apksigner не найден, пробуем использовать из PATH`);
    }
    
    try {
      console.log(`[Checksum] Попытка использовать apksigner для файла: ${filePath}`);
      const { stdout, stderr } = await execAsync(
        `${apksignerCommand} "${filePath}"`,
        { 
          timeout: 30000, 
          maxBuffer: 1024 * 1024,
          env: {
            ...process.env,
            // Убеждаемся, что PATH содержит нужные пути
            PATH: process.env.PATH
          }
        }
      );
      
      console.log(`[Checksum] apksigner stdout: ${stdout.substring(0, 500)}`);
      if (stderr) console.log(`[Checksum] apksigner stderr: ${stderr.substring(0, 500)}`);
      
      // Парсим вывод apksigner - ищем SHA-256 сертификата
      // Формат вывода: "Signer #1 certificate SHA-256 digest: <hex>"
      // Также может быть формат: "SHA-256 digest: <hex>" или просто хеш
      // Важно: хеш может быть на той же строке или на следующей, может содержать пробелы/переносы
      const sha256Patterns = [
        // Формат: "Signer #1 certificate SHA-256 digest: <hex>"
        /Signer\s+#\d+\s+certificate\s+SHA-256\s+digest[:\s]+([a-fA-F0-9\s]+)/i,
        // Формат: "SHA-256 digest: <hex>"
        /SHA-256\s+digest[:\s]+([a-fA-F0-9\s]+)/i,
        // Просто SHA-256 с хешем
        /SHA-256[:\s]+([a-fA-F0-9\s]+)/i,
      ];
      
      let hexHash: string | null = null;
      for (const pattern of sha256Patterns) {
        const match = stdout.match(pattern);
        if (match && match[1]) {
          // Удаляем все пробелы, переносы строк и другие не-hex символы
          hexHash = match[1].replace(/[\s\n\r\t:]/g, '').toLowerCase();
          console.log(`[Checksum] Извлеченный hex hash (длина ${hexHash.length}): ${hexHash.substring(0, 32)}...`);
          
          // Проверяем, что это валидный hex и правильной длины
          if (/^[a-f0-9]{64}$/.test(hexHash)) {
            break; // Нашли правильный хеш
          } else {
            console.log(`[Checksum] ⚠️ Извлеченный хеш не соответствует формату (длина: ${hexHash.length})`);
            hexHash = null; // Сбрасываем, пробуем следующий паттерн
          }
        }
      }
      
      if (hexHash && hexHash.length === 64) {
        // Конвертируем hex в base64 (URL-safe)
        const hashBuffer = Buffer.from(hexHash, 'hex');
        checksum = hashBuffer.toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '');
        method = 'apksigner';
        console.log(`[Checksum] ✅ Checksum получен через apksigner: ${checksum.substring(0, 32)}...`);
        console.log(`[Checksum] Hex hash: ${hexHash}`);
      } else {
        console.log(`[Checksum] ⚠️ SHA-256 digest не найден или неправильного формата в выводе apksigner`);
        console.log(`[Checksum] Полный вывод (первые 2000 символов): ${stdout.substring(0, 2000)}`);
        if (hexHash) {
          console.log(`[Checksum] ⚠️ Извлеченный хеш (длина ${hexHash.length}): ${hexHash}`);
        }
      }
    } catch (e: any) {
      console.log(`[Checksum] apksigner недоступен или ошибка: ${e.message}`);
      if (e.stderr) console.log(`[Checksum] apksigner stderr: ${e.stderr}`);
      if (e.stdout) console.log(`[Checksum] apksigner stdout: ${e.stdout}`);
    }

    // Если apksigner не сработал, пытаемся использовать jarsigner -verify напрямую
    // Обратите внимание: jarsigner работает только с v1 JAR signing. 
    // Если APK подписан только v2/v3 схемой, jarsigner вернет "jar is unsigned"
    if (!checksum) {
      try {
        console.log(`[Checksum] Попытка использовать jarsigner -verify напрямую с APK...`);
        const absolutePath = path.resolve(filePath);
        
        const { stdout: jarsignerOut, stderr: jarsignerErr } = await execAsync(
          `jarsigner -verify -verbose -certs "${absolutePath}" 2>&1`,
          { timeout: 30000 }
        );
        
        const combinedOutput = jarsignerOut + '\n' + jarsignerErr;
        console.log(`[Checksum] jarsigner stdout (первые 2000 символов):\n${combinedOutput.substring(0, 2000)}`);
        
        // Проверяем, если jarsigner говорит "jar is unsigned" - значит APK подписан только v2/v3
        if (combinedOutput.includes('jar is unsigned') || combinedOutput.includes('no manifest')) {
          console.log(`[Checksum] ⚠️ APK подписан только v2/v3 схемой (без v1 JAR signing)`);
          console.log(`[Checksum] 💡 jarsigner не может извлечь сертификат из v2/v3 signing`);
          console.log(`[Checksum] 💡 Нужен apksigner или распаковка APK как ZIP для извлечения сертификата`);
          // Не пробуем дальше с jarsigner, переходим к распаковке
        } else {
          // Ищем SHA-256 в выводе jarsigner
          const sha256Patterns = [
            /SHA-256\s+digest[:\s]+([a-fA-F0-9:\s]+)/i,
            /SHA256\s+digest[:\s]+([a-fA-F0-9:\s]+)/i,
            /SHA-256[:\s]+([a-fA-F0-9:\s]+)/i,
            /SHA256[:\s]+([a-fA-F0-9:\s]+)/i,
            /([a-fA-F0-9]{2}:){31}[a-fA-F0-9]{2}/,
            /([a-fA-F0-9]{64})/,
          ];
          
          for (const pattern of sha256Patterns) {
            const match = combinedOutput.match(pattern);
            if (match) {
              let hexHash = match[1] ? match[1].replace(/[:\\s]/g, '').toLowerCase() : match[0].replace(/[:\\s]/g, '').toLowerCase();
              if (hexHash.length === 64 && /^[a-f0-9]{64}$/.test(hexHash)) {
                const hashBuffer = Buffer.from(hexHash, 'hex');
                checksum = hashBuffer.toString('base64')
                  .replace(/\+/g, '-')
                  .replace(/\//g, '_')
                  .replace(/=/g, '');
                method = 'jarsigner';
                console.log(`[Checksum] ✅ Checksum получен через jarsigner: ${checksum.substring(0, 32)}...`);
                break;
              }
            }
          }
          
          // Если не нашли в тексте, пробуем извлечь сертификат из PEM формата
          if (!checksum) {
            const certMatch = combinedOutput.match(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/i);
            if (certMatch && certMatch[1]) {
              try {
                const certBase64 = certMatch[1].replace(/[\s\n\r]/g, '');
                const certBuffer = Buffer.from(certBase64, 'base64');
                const crypto = require('crypto');
                const hash = crypto.createHash('sha256').update(certBuffer).digest('hex');
                if (hash.length === 64) {
                  const hashBuffer = Buffer.from(hash, 'hex');
                  checksum = hashBuffer.toString('base64')
                    .replace(/\+/g, '-')
                    .replace(/\//g, '_')
                    .replace(/=/g, '');
                  method = 'jarsigner-cert';
                  console.log(`[Checksum] ✅ Checksum получен из сертификата jarsigner: ${checksum.substring(0, 32)}...`);
                }
              } catch (certError: any) {
                console.log(`[Checksum] Ошибка при обработке сертификата: ${certError.message}`);
              }
            }
          }
        }
      } catch (e: any) {
        console.log(`[Checksum] jarsigner -verify не сработал: ${e.message}`);
        if (e.stderr) console.log(`[Checksum] jarsigner stderr: ${e.stderr.substring(0, 500)}`);
      }
    }

    // Если предыдущие методы не сработали, используем распаковку APK как ZIP + keytool
    // Зачем нужен unzip: APK файл - это ZIP архив. Внутри него есть папка META-INF/ с файлами сертификатов
    // (.RSA, .DSA, .EC). Если apksigner/jarsigner не работают, нужно распаковать APK как ZIP,
    // извлечь файл сертификата из META-INF/ и использовать keytool для получения SHA-256 из него.
    // 
    // ВАЖНО: Если APK подписан только v2/v3 схемой (без v1 JAR signing), файлы сертификатов
    // могут отсутствовать в META-INF/. В этом случае нужен apksigner или библиотека для чтения
    // блоков подписи APK Signature Scheme v2/v3.
    // 
    // На Windows: используем Node.js библиотеку adm-zip (нет системного unzip)
    // На Linux: используем системный unzip
    if (!checksum) {
      try {
        console.log(`[Checksum] Попытка использовать распаковку APK как ZIP + keytool...`);
        console.log(`[Checksum] ⚠️ APK - это ZIP архив, внутри META-INF/ находятся файлы сертификатов (.RSA/.DSA/.EC)`);
        console.log(`[Checksum] 💡 Если файлы не найдены - APK подписан только v2/v3, нужен apksigner`);
        
        // Создаем временную папку для распаковки
        const tempDir = path.join(appDir, '.temp_checksum');
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
        fs.mkdirSync(tempDir, { recursive: true });

        try {
          const absolutePath = path.resolve(filePath);
          console.log(`[Checksum] Распаковка APK: ${absolutePath}`);
          console.log(`[Checksum] Платформа: ${process.platform}`);
          
          const isWindows = process.platform === 'win32';
          let certFiles: string[] = [];
          
          if (isWindows) {
            // На Windows используем Node.js библиотеку adm-zip
            console.log(`[Checksum] Используем Node.js adm-zip для Windows...`);
            try {
              const AdmZip = (await import('adm-zip')).default;
              const zip = new AdmZip(filePath);
              const entries = zip.getEntries();
              
              console.log(`[Checksum] ZIP архив загружен, записей: ${entries.length}`);
              
              const metaInfPath = path.join(tempDir, 'META-INF');
              fs.mkdirSync(metaInfPath, { recursive: true });
              
              for (const entry of entries) {
                if (entry.entryName.startsWith('META-INF/') && 
                    (entry.entryName.endsWith('.RSA') || 
                     entry.entryName.endsWith('.DSA') || 
                     entry.entryName.endsWith('.EC'))) {
                  const entryData = entry.getData();
                  if (entryData) {
                    const fullOutputPath = path.join(tempDir, entry.entryName);
                    const entryDir = path.dirname(fullOutputPath);
                    if (!fs.existsSync(entryDir)) {
                      fs.mkdirSync(entryDir, { recursive: true });
                    }
                    fs.writeFileSync(fullOutputPath, entryData);
                    certFiles.push(path.basename(entry.entryName));
                    console.log(`[Checksum] ✅ Извлечен сертификат: ${entry.entryName}`);
                  }
                }
              }
              
              if (fs.existsSync(metaInfPath)) {
                const extractedFiles = fs.readdirSync(metaInfPath).filter(f => 
                  f.endsWith('.RSA') || f.endsWith('.DSA') || f.endsWith('.EC')
                );
                if (extractedFiles.length > 0) {
                  certFiles = extractedFiles;
                }
              }
            } catch (zipError: any) {
              console.log(`[Checksum] Ошибка при использовании adm-zip: ${zipError.message}`);
              throw zipError;
            }
          } else {
            // На Linux используем системный unzip
            console.log(`[Checksum] Используем системный unzip для Linux...`);
            
            // Пробуем разные варианты команд unzip
            const unzipCommands = [
              `unzip -q "${absolutePath}" "META-INF/*.RSA" "META-INF/*.DSA" "META-INF/*.EC" -d "${tempDir}" 2>&1`,
              `cd "${tempDir}" && unzip -q "${absolutePath}" "META-INF/*.RSA" "META-INF/*.DSA" "META-INF/*.EC" -d "${tempDir}" 2>&1`,
            ];
            
            let unzipSuccess = false;
            for (const cmd of unzipCommands) {
              try {
                console.log(`[Checksum] Выполняем: ${cmd}`);
                await execAsync(cmd, { timeout: 30000 });
                unzipSuccess = true;
                break;
              } catch (e: any) {
                // Проверяем, что это не ошибка "файлы не найдены"
                const errorMsg = (e.stderr || e.stdout || e.message || '').toLowerCase();
                if (errorMsg.includes('warning') || errorMsg.includes('nothing to do')) {
                  // Это предупреждение, не критическая ошибка
                  console.log(`[Checksum] Предупреждение при распаковке (файлы могут отсутствовать): ${errorMsg.substring(0, 200)}`);
                  unzipSuccess = true; // Продолжаем, чтобы проверить что извлеклось
                  break;
                }
                console.log(`[Checksum] Команда не сработала, пробуем следующую...`);
              }
            }
            
            if (!unzipSuccess) {
              // Пробуем извлечь все META-INF
              console.log(`[Checksum] Пробуем извлечь все META-INF...`);
              try {
                await execAsync(
                  `unzip -q "${absolutePath}" "META-INF/*" -d "${tempDir}" 2>&1`,
                  { timeout: 30000 }
                );
              } catch (e: any) {
                // Игнорируем ошибки, продолжаем проверку
                console.log(`[Checksum] Не удалось извлечь META-INF: ${(e.message || '').substring(0, 200)}`);
              }
            }

          }
          
          // Проверяем, что файлы извлечены
          const metaInfPath = path.join(tempDir, 'META-INF');
          
          if (!isWindows) {
            // Для Linux проверяем результаты unzip
            if (fs.existsSync(metaInfPath)) {
              certFiles = fs.readdirSync(metaInfPath).filter(f => 
                f.endsWith('.RSA') || f.endsWith('.DSA') || f.endsWith('.EC')
              );
            } else {
              // Проверяем корень tempDir (если использовали -j флаг)
              certFiles = fs.readdirSync(tempDir).filter(f => 
                f.endsWith('.RSA') || f.endsWith('.DSA') || f.endsWith('.EC')
              );
            }
          }
          // Для Windows certFiles уже заполнен выше

          console.log(`[Checksum] Найдено файлов сертификатов: ${certFiles.length}`);

          if (certFiles.length > 0) {
            const certFile = fs.existsSync(metaInfPath) 
              ? path.join(metaInfPath, certFiles[0])
              : path.join(tempDir, certFiles[0]);
            
            if (!fs.existsSync(certFile)) {
              // Ищем рекурсивно
              const findFile = (dir: string, fileName: string): string | null => {
                try {
                  const entries = fs.readdirSync(dir, { withFileTypes: true });
                  for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                      const found = findFile(fullPath, fileName);
                      if (found) return found;
                    } else if (entry.name === fileName) {
                      return fullPath;
                    }
                  }
                } catch {}
                return null;
              };
              const found = findFile(tempDir, certFiles[0]);
              if (found) {
                const certFile = found;
                console.log(`[Checksum] ✅ Используем сертификат: ${certFile}`);
                
                const absoluteCertPath = path.resolve(certFile);
                const { stdout: keytoolOut, stderr: keytoolErr } = await execAsync(
                  `keytool -printcert -file "${absoluteCertPath}" 2>&1`,
                  { timeout: 30000 }
                );
                
                console.log(`[Checksum] keytool stdout (первые 1000 символов):\n${keytoolOut.substring(0, 1000)}`);
                
                const sha256Match = keytoolOut.match(/SHA-?256[:\s]+([a-fA-F0-9:\s]+)/i);
                if (sha256Match && sha256Match[1]) {
                  const hexHash = sha256Match[1].replace(/[:\\s]/g, '').toLowerCase();
                  if (hexHash.length === 64) {
                    const hashBuffer = Buffer.from(hexHash, 'hex');
                    checksum = hashBuffer.toString('base64')
                      .replace(/\+/g, '-')
                      .replace(/\//g, '_')
                      .replace(/=/g, '');
                    method = 'keytool';
                    console.log(`[Checksum] ✅ Checksum получен через keytool: ${checksum.substring(0, 32)}...`);
                  }
                }
              }
            } else {
              console.log(`[Checksum] ✅ Используем сертификат: ${certFile}`);
              
              const absoluteCertPath = path.resolve(certFile);
              const { stdout: keytoolOut, stderr: keytoolErr } = await execAsync(
                `keytool -printcert -file "${absoluteCertPath}" 2>&1`,
                { timeout: 30000 }
              );
              
              console.log(`[Checksum] keytool stdout (первые 1000 символов):\n${keytoolOut.substring(0, 1000)}`);
              
              const sha256Match = keytoolOut.match(/SHA-?256[:\s]+([a-fA-F0-9:\s]+)/i);
              if (sha256Match && sha256Match[1]) {
                const hexHash = sha256Match[1].replace(/[:\\s]/g, '').toLowerCase();
                if (hexHash.length === 64) {
                  const hashBuffer = Buffer.from(hexHash, 'hex');
                  checksum = hashBuffer.toString('base64')
                    .replace(/\+/g, '-')
                    .replace(/\//g, '_')
                    .replace(/=/g, '');
                  method = 'keytool';
                  console.log(`[Checksum] ✅ Checksum получен через keytool: ${checksum.substring(0, 32)}...`);
                }
              }
            }
          } else {
            console.log(`[Checksum] ⚠️ Файлы сертификатов не найдены в META-INF`);
            
            // Если файлы не найдены, возможно APK подписан только v2/v3 схемой
            const isWindows = process.platform === 'win32';
            const isLinux = process.platform === 'linux';
            
            if (isWindows) {
              console.log(`[Checksum] 💡 Для Windows: Установите Android SDK Build Tools для работы с v2/v3 signing:`);
              console.log(`[Checksum] 💡 1. Скачайте Android SDK Command Line Tools:`);
              console.log(`[Checksum] 💡    https://developer.android.com/studio#command-tools`);
              console.log(`[Checksum] 💡 2. Установите через sdkmanager:`);
              console.log(`[Checksum] 💡    sdkmanager "build-tools;33.0.0"`);
              console.log(`[Checksum] 💡 3. Добавьте путь к apksigner в PATH:`);
              console.log(`[Checksum] 💡    %LOCALAPPDATA%\\Android\\Sdk\\build-tools\\33.0.0`);
              console.log(`[Checksum] 💡 Или используйте полный путь к apksigner.bat`);
            } else if (isLinux) {
              console.log(`[Checksum] 💡 Для Ubuntu: Установите apksigner для работы с v2/v3 signing:`);
              console.log(`[Checksum] 💡 sudo apt-get install android-sdk-build-tools`);
              console.log(`[Checksum] 💡 или добавьте путь к apksigner в PATH`);
            }
            
            throw new Error('Файлы сертификатов (.RSA, .DSA, .EC) не найдены в META-INF. Возможно APK подписан только v2/v3 схемой. Установите apksigner для работы с таким APK.');
          }
        } finally {
          // Удаляем временную папку
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        }
      } catch (e: any) {
        console.log(`[Checksum] Ошибка при использовании unzip/keytool: ${e.message}`);
        if (e.stderr) console.log(`[Checksum] stderr: ${e.stderr.substring(0, 500)}`);
        if (e.stdout) console.log(`[Checksum] stdout: ${e.stdout.substring(0, 500)}`);
        error = e.message;
      }
    }

    if (!checksum) {
      // Проверяем, какие инструменты доступны
      let availableTools: string[] = [];
      try {
        await execAsync('apksigner --version', { timeout: 5000 });
        availableTools.push('apksigner');
      } catch {}
      
      try {
        await execAsync('keytool -help', { timeout: 5000 });
        availableTools.push('keytool');
      } catch {}
      
      try {
        await execAsync('unzip -v', { timeout: 5000 });
        availableTools.push('unzip');
      } catch {}
      
      const errorMessage = availableTools.length > 0
        ? `Не удалось извлечь checksum из APK. Доступные инструменты: ${availableTools.join(', ')}. Ошибка: ${error || 'Неизвестная ошибка'}`
        : 'Не удалось вычислить checksum. Убедитесь, что установлены Android SDK (apksigner) или Java JDK (keytool, unzip).';
      
      console.log(`[Checksum] ❌ Итоговая ошибка: ${errorMessage}`);
      console.log(`[Checksum] Доступные инструменты: ${availableTools.length > 0 ? availableTools.join(', ') : 'нет'}`);
      
      res.status(500).json({ 
        success: false, 
        message: errorMessage,
        error: error || 'Инструменты для извлечения checksum недоступны',
        availableTools: availableTools
      });
      return;
    }

    res.status(200).json({ 
      success: true, 
      checksum,
      method,
      version: latestVersion.version,
      fileName: latestVersion.fileName
    });
  } catch (error: any) {
    console.error('[Checksum] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Ошибка сервера' 
    });
  }
};
