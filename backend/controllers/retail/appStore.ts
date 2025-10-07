import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../server.js';
import { AppCategory, AppType } from '@prisma/client';

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
    console.error('Ошибка при создании приложения:', error);
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
    
    console.log('Apps found:', apps.map(app => ({
      id: app.id,
      name: app.name,
      versions: app.versions.map(v => ({
        id: v.id,
        version: v.version,
        fileName: v.fileName,
        filePath: v.filePath
      }))
    })));

    res.status(200).json({ success: true, apps });
  } catch (error: any) {
    console.error('Ошибка при получении списка приложений:', error);
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
    console.error('Ошибка при получении приложения:', error);
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
    const appName = app.name.replace(/[^a-zA-Z0-9а-яА-Я\s-_]/g, '').replace(/\s+/g, '_');
    const uploadDir = `./public/retail/app/${appName}`;
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Формируем имя файла: название_приложения_версия_дата.расширение
    const fileExtension = path.extname(req.file.originalname);
    const baseFileName = path.basename(req.file.originalname, fileExtension);
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const newFileName = `${appName}_v${version}_${currentDate}${fileExtension}`;
    
    // Копируем файл из temp в целевую папку (избегаем cross-device link ошибки)
    const tempFilePath = req.file.path;
    const finalFilePath = path.join(uploadDir, newFileName);
    
    try {
      // Сначала пытаемся переместить (быстрее)
      fs.renameSync(tempFilePath, finalFilePath);
      console.log('File moved successfully from', tempFilePath, 'to', finalFilePath);
    } catch (renameError: any) {
      console.log('Rename failed, trying copy:', renameError.message);
      // Если перемещение не удалось (cross-device link), копируем
      try {
        fs.copyFileSync(tempFilePath, finalFilePath);
        fs.unlinkSync(tempFilePath); // Удаляем временный файл после копирования
        console.log('File copied successfully from', tempFilePath, 'to', finalFilePath);
      } catch (copyError: any) {
        console.error('Error copying file:', copyError);
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
    console.error('Ошибка при загрузке версии:', error);
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
    
    console.log('Download request for appId:', appId);

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
    
    console.log('Found latest version:', latestVersion ? {
      id: latestVersion.id,
      appId: latestVersion.appId,
      appName: latestVersion.app.name,
      version: latestVersion.version,
      fileName: latestVersion.fileName,
      filePath: latestVersion.filePath
    } : 'No version found');

    if (!latestVersion) {
      res.status(404).json({ 
        success: false, 
        message: 'Версия не найдена' 
      });
      return;
    }

    const filePath = path.join(process.cwd(), latestVersion.filePath);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ 
        success: false, 
        message: 'Файл не найден на сервере' 
      });
      return;
    }

    // Увеличиваем счетчик скачиваний
    await prisma.appVersion.update({
      where: { id: latestVersion.id },
      data: { downloadCount: { increment: 1 } }
    });

    // Формируем имя файла для скачивания: название_приложения_версия_дата.расширение
    const appName = latestVersion.app.name.replace(/[^a-zA-Z0-9а-яА-Я\s-_]/g, '').replace(/\s+/g, '_');
    const fileExtension = path.extname(latestVersion.fileName);
    const downloadDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const downloadFileName = `${appName}_v${latestVersion.version}_${downloadDate}${fileExtension}`;
    
    console.log('Download filename generated:', downloadFileName);
    console.log('App name:', latestVersion.app.name);
    console.log('Version:', latestVersion.version);
    console.log('File extension:', fileExtension);
    
    // Устанавливаем правильные заголовки для скачивания
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    console.log('Headers set:', {
      'Content-Disposition': `attachment; filename="${downloadFileName}"`,
      'Content-Type': 'application/octet-stream'
    });
    
    res.download(filePath, downloadFileName);
  } catch (error: any) {
    console.error('Ошибка при скачивании версии:', error);
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

    const versions = await prisma.appVersion.findMany({
      where: { appId },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ success: true, versions });
  } catch (error: any) {
    console.error('Ошибка при получении версий:', error);
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
    console.error('Ошибка при получении файлов:', error);
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
    console.error('Ошибка при обновлении приложения:', error);
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
    console.error('Ошибка при удалении приложения:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Ошибка сервера' 
    });
  }
};
