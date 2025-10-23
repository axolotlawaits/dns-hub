import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../server.js';
import { AppCategory, AppType } from '@prisma/client';
import { decodeRussianFileName } from '../../utils/format.js';

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
    
    console.log(`[Download] File info - Size: ${fileSize} bytes, Original: ${downloadFileName}, Safe: ${safeFileName}`);
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
      res.setHeader('Content-Type', 'application/octet-stream');
      // Используем RFC 5987 для поддержки Unicode имен файлов
      const encodedFileName = encodeURIComponent(downloadFileName);
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`);
      // Определяем стратегию кеширования на основе User-Agent
      const userAgent = req.headers['user-agent'] || '';
      const isProblematicBrowser = userAgent.includes('Chrome/') && userAgent.includes('Mobile') || 
                                  userAgent.includes('Safari/') && userAgent.includes('Mobile') ||
                                  userAgent.includes('Edge/');
      
      if (isProblematicBrowser) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // Отключаем кеш для проблемных браузеров
        console.log(`[Download] Disabled caching for problematic browser: ${userAgent}`);
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Кеширование на 1 час для обычных браузеров
      res.setHeader('Connection', 'keep-alive'); // Поддержка keep-alive
      }

      // Создаем поток для чтения части файла с оптимизированными настройками
      const fileStream = fs.createReadStream(filePath, { 
        start, 
        end,
        highWaterMark: 64 * 1024, // 64KB буфер для лучшей производительности
        autoClose: true
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
    res.setHeader('Content-Type', 'application/octet-stream');
    // Используем RFC 5987 для поддержки Unicode имен файлов
    const encodedFileName = encodeURIComponent(downloadFileName);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Кеширование на 1 час
    res.setHeader('Connection', 'keep-alive'); // Поддержка keep-alive
    
    // Создаем поток для чтения файла с оптимизированными настройками
    const fileStream = fs.createReadStream(filePath, {
      highWaterMark: 64 * 1024, // 64KB буфер для лучшей производительности
      autoClose: true
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
