import { Request, Response } from 'express';
import { z } from 'zod';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as net from 'net';
import * as dns from 'dns';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Buffer } from 'buffer';
import { prisma } from '../../server.js';
import AdmZip from 'adm-zip';

const execAsync = promisify(exec);

// Схемы валидации
const networkScanSchema = z.object({
  networkRange: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/).optional(),
  startIp: z.string().refine(
    (val) =>
      /^(\d{1,3}\.){3}\d{1,3}$/.test(val) &&
      val.split('.').every((num) => Number(num) >= 0 && Number(num) <= 255),
    {
      message: "Invalid IPv4 address format",
    }
  ).optional(),
  endIp: z.string().refine(
    (val) =>
      /^(\d{1,3}\.){3}\d{1,3}$/.test(val) &&
      val.split('.').every((num) => Number(num) >= 0 && Number(num) <= 255),
    {
      message: "Invalid IPv4 address format",
    }
  ).optional(),
  singleIp: z.string().refine(
    (val) =>
      /^(\d{1,3}\.){3}\d{1,3}$/.test(val) &&
      val.split('.').every((num) => Number(num) >= 0 && Number(num) <= 255),
    {
      message: "Invalid IPv4 address format",
    }
  ).optional(), // Для тестирования конкретного IP
  ports: z.array(z.number().int().min(1).max(65535)).default([9100, 631, 515, 80, 443])
});

// Интерфейсы
interface PrinterInfo {
  ip: string;
  port: number;
  status: 'online' | 'offline';
  responseTime?: number;
  vendor?: string;
  model?: string;
  hasScanner?: boolean;
  scannerType?: string; // Тип сканера: MFP, All-in-One, Scanner, etc.
  lastSeen: Date;
}

interface NetworkScanResult {
  printers: PrinterInfo[];
  totalScanned: number;
  scanDuration: number;
  errors: string[];
}

// Сканирование сети на наличие принтеров со сканерами
// Поддерживает Linux и Docker окружения
export const scanNetworkForPrinters = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { networkRange, startIp, endIp, singleIp, ports } = networkScanSchema.parse(req.body);
    
    const startTime = Date.now();
    let ipList: string[] = [];

    console.log(`[Scanner] Начало сканирования на платформе: ${process.platform}`);
    
    // Проверяем Docker окружение
    const hasDockerEnv = process.env.DOCKER_HOST || process.env.DOCKER_NETWORK;
    let isDocker = !!hasDockerEnv;
    
    // Проверяем наличие файла /.dockerenv
    if (!isDocker) {
      try {
        const fs = await import('fs/promises');
        await fs.access('/.dockerenv');
        isDocker = true;
      } catch {
        isDocker = false;
      }
    }
    
    if (isDocker) {
      console.log('[Scanner] Обнаружено Docker окружение');
      // При использовании network_mode: "host" контейнер имеет прямой доступ к сетевому стеку хоста
      // Это позволяет корректно определять сетевые интерфейсы и сканировать сеть
      console.log('[Scanner] Используется host network mode - прямой доступ к сетевому стеку хоста Ubuntu');
    }

    // Если указан конкретный IP для тестирования, используем его
    if (singleIp) {
      console.log(`[Scanner] Тестовое сканирование конкретного IP: ${singleIp}`);
      ipList = [singleIp];
    } else if (networkRange) {
      ipList = await expandNetworkRange(networkRange);
    } else if (startIp && endIp) {
      ipList = await generateIpRange(startIp, endIp);
    } else {
      // Сканируем локальную сеть по умолчанию
      // Автоматически определяет сеть для Linux/Docker
      ipList = await getLocalNetworkIps();
    }
    
    console.log(`[Scanner] Будет просканировано ${ipList.length} IP адресов на портах: ${ports.join(', ')}`);

    const results: PrinterInfo[] = [];
    const errors: string[] = [];

    // Попробуем сначала nmap для быстрого сканирования
    try {
      console.log(`[Scanner] Попытка использования nmap для сканирования ${ipList.length} IP адресов`);
      const nmapResults = await scanWithNmap(ipList, ports);
      results.push(...nmapResults);
      console.log(`[Scanner] Nmap нашел ${nmapResults.length} принтеров со сканерами`);
      
      // Если nmap нашел результаты, можно пропустить ручное сканирование
      // или использовать его для дополнения результатов
      if (nmapResults.length > 0) {
        console.log(`[Scanner] Используем результаты nmap, пропускаем ручное сканирование`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Неизвестная ошибка';
      console.warn(`[Scanner] Nmap сканирование не удалось (${errorMsg}), используем ручное сканирование`);
    }
    
    // Если nmap не сработал, используем ручное сканирование
    if (results.length === 0) {
      console.log(`[Scanner] Используем ручное сканирование для ${ipList.length} IP адресов...`);
      
      // Оптимизируем размер батча
      const batchSize = 100;
      const totalBatches = Math.ceil(ipList.length / batchSize);
      
      console.log(`[Scanner] Разделено на ${totalBatches} батчей по ${batchSize} IP`);
      
      for (let i = 0; i < ipList.length; i += batchSize) {
        const batch = ipList.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        
        console.log(`[Scanner] Обработка батча ${batchNumber}/${totalBatches} (${batch.length} IP)`);
        
        const batchPromises = batch.map(async (ip) => {
          for (const port of ports) {
            try {
              // Уменьшаем таймаут для ускорения сканирования
              const timeout = 1500;
              const isOnline = await checkPortOpen(ip, port, timeout);
              
              if (isOnline) {
                const printerInfo: PrinterInfo = {
                  ip,
                  port,
                  status: 'online',
                  lastSeen: new Date()
                };

                try {
                  const details = await getPrinterDetails(ip, port);
                  Object.assign(printerInfo, details);
                  
                  // Добавляем только если это устройство со сканером
                  if (details.hasScanner || details.scannerType) {
                    // Проверяем на дубликаты перед добавлением
                    const isDuplicate = results.some(r => r.ip === ip && r.port === port);
                    if (!isDuplicate) {
                      results.push(printerInfo);
                      console.log(`[Scanner] Найден принтер со сканером: ${ip}:${port} (${details.scannerType || 'MFP'})`);
                    }
                  }
                } catch (error) {
                  const errorMsg = error instanceof Error ? error.message : 'Неизвестная ошибка';
                  console.warn(`[Scanner] Не удалось получить детали принтера ${ip}:${port}: ${errorMsg}`);
                  // Не добавляем в errors, так как это не критично
                }
                break; // Найден принтер на одном из портов, переходим к следующему IP
              }
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : 'Неизвестная ошибка';
              // Ограничиваем количество ошибок в массиве
              if (errors.length < 50) {
                errors.push(`Ошибка сканирования ${ip}:${port}: ${errorMsg}`);
              }
            }
          }
        });

        // Обрабатываем батч с ограничением параллелизма
        await Promise.allSettled(batchPromises);
        
        // Небольшая задержка между батчами для снижения нагрузки
        if (i + batchSize < ipList.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`[Scanner] Ручное сканирование завершено, найдено ${results.length} принтеров со сканерами`);
    }

    const scanDuration = Date.now() - startTime;

    res.json({
      success: true,
      result: {
        printers: results,
        totalScanned: ipList.length,
        scanDuration,
        errors: errors.slice(0, 10) // Ограничиваем количество ошибок
      } as NetworkScanResult
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Ошибка валидации',
        details: error.issues
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Ошибка сканирования сети',
        message: error instanceof Error ? error.message : 'Неизвестная ошибка'
      });
    }
  }
};

// Получение списка известных принтеров
export const getKnownPrinters = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const printers = await prisma.printer.findMany({
      where: {
        isActive: true,
        hasScanner: true // Возвращаем только принтеры со сканерами
      },
      orderBy: [
        { name: 'asc' },
        { ip: 'asc' }
      ]
    });

    res.json({
      success: true,
      printers: printers.map((p: {
        id: string;
        ip: string;
        port: number;
        name: string | null;
        vendor: string | null;
        model: string | null;
        hasScanner: boolean;
        scannerType: string | null;
      }) => ({
        id: p.id,
        ip: p.ip,
        port: p.port,
        name: p.name || `${p.vendor || ''} ${p.model || ''}`.trim() || `${p.ip}:${p.port}`,
        vendor: p.vendor,
        model: p.model,
        hasScanner: p.hasScanner,
        scannerType: p.scannerType,
        displayName: p.name || `${p.vendor || ''} ${p.model || ''} (${p.ip}:${p.port})`.trim() || `${p.ip}:${p.port}`
      }))
    });
  } catch (error) {
    console.error('[Scanner] Ошибка получения списка принтеров:', error);
    return res.status(500).json({
      success: false,
      error: 'Ошибка получения списка принтеров',
      message: error instanceof Error ? error.message : 'Неизвестная ошибка'
    });
  }
};

// Добавление принтера в список известных
export const addPrinter = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const token = (req as any).token;
    const userId = token?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Не авторизован'
      });
    }

    const { ip, port, name, vendor, model, hasScanner, scannerType } = req.body;

    if (!ip || !port) {
      return res.status(400).json({
        success: false,
        error: 'IP адрес и порт обязательны'
      });
    }

    const printer = await prisma.printer.upsert({
      where: {
        ip_port: {
          ip,
          port: parseInt(port)
        }
      },
      update: {
        name: name || null,
        vendor: vendor || null,
        model: model || null,
        hasScanner: hasScanner !== undefined ? hasScanner : true,
        scannerType: scannerType || null,
        isActive: true
      },
      create: {
        ip,
        port: parseInt(port),
        name: name || null,
        vendor: vendor || null,
        model: model || null,
        hasScanner: hasScanner !== undefined ? hasScanner : true,
        scannerType: scannerType || null
      }
    });

    res.json({
      success: true,
      printer: {
        id: printer.id,
        ip: printer.ip,
        port: printer.port,
        name: printer.name || `${printer.vendor || ''} ${printer.model || ''}`.trim() || `${printer.ip}:${printer.port}`,
        vendor: printer.vendor,
        model: printer.model,
        hasScanner: printer.hasScanner,
        scannerType: printer.scannerType,
        displayName: printer.name || `${printer.vendor || ''} ${printer.model || ''} (${printer.ip}:${printer.port})`.trim() || `${printer.ip}:${printer.port}`
      }
    });
  } catch (error) {
    console.error('[Scanner] Ошибка добавления принтера:', error);
    return res.status(500).json({
      success: false,
      error: 'Ошибка добавления принтера',
      message: error instanceof Error ? error.message : 'Неизвестная ошибка'
    });
  }
};

// Хранилище активных процессов сканирования (в продакшене лучше использовать Redis)
const activeScans = new Map<string, { 
  intervalId: NodeJS.Timeout; 
  stop: () => void;
  scanSessionId: string;
}>();

// Запуск автоматического сканирования документов
export const startDocumentScanning = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const token = (req as any).token;
    const userId = token?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Не авторизован'
      });
    }

    console.log('[Scanner] Получен запрос на запуск сканирования:', {
      body: req.body,
      userId
    });

    const { printerIp, printerPort, pages, unlimitedPages, delaySeconds, folderName } = req.body;

    // Валидация обязательных полей
    if (!printerIp || typeof printerIp !== 'string' || printerIp.trim() === '') {
      console.error('[Scanner] Ошибка валидации: неверный IP адрес', { printerIp, type: typeof printerIp });
      return res.status(400).json({
        success: false,
        error: 'IP адрес принтера обязателен и должен быть строкой'
      });
    }

    if (!printerPort || typeof printerPort !== 'number' || isNaN(printerPort) || printerPort < 1 || printerPort > 65535) {
      console.error('[Scanner] Ошибка валидации: неверный порт', { printerPort, type: typeof printerPort });
      return res.status(400).json({
        success: false,
        error: 'Порт принтера обязателен и должен быть числом от 1 до 65535'
      });
    }

    // Останавливаем предыдущее сканирование, если оно было
    if (activeScans.has(userId)) {
      const existingScan = activeScans.get(userId);
      if (existingScan) {
        clearInterval(existingScan.intervalId);
        existingScan.stop();
      }
      activeScans.delete(userId);
    }

    // Проверяем состояние принтера и сканера перед запуском
    console.log(`[Scanner] Проверка состояния принтера ${printerIp}:${printerPort}...`);
    
    const printerStatus = await checkPrinterAndScannerStatus(printerIp, printerPort);
    
    if (!printerStatus.isOnline) {
      return res.status(400).json({
        success: false,
        error: 'Принтер недоступен',
        message: `Принтер ${printerIp}:${printerPort} не отвечает. Проверьте, что принтер включен и подключен к сети.`
      });
    }
    
    if (!printerStatus.hasScanner) {
      return res.status(400).json({
        success: false,
        error: 'Сканер недоступен',
        message: `Принтер ${printerIp}:${printerPort} не имеет сканера или сканер не поддерживается.`
      });
    }
    
    if (printerStatus.isBusy) {
      return res.status(400).json({
        success: false,
        error: 'Принтер занят',
        message: `Принтер ${printerIp}:${printerPort} занят другой задачей. Попробуйте позже.`
      });
    }
    
    if (printerStatus.scannerBusy) {
      return res.status(400).json({
        success: false,
        error: 'Сканер занят',
        message: `Сканер на принтере ${printerIp}:${printerPort} занят другим процессом. Дождитесь завершения текущего сканирования.`
      });
    }
    
    console.log(`[Scanner] Принтер готов к сканированию:`, printerStatus);

    // Создаем сессию сканирования в базе данных
    const scanSession = await prisma.scanSession.create({
      data: {
        userId,
        printerIp,
        printerPort,
        folderName: folderName || 'scanned_documents',
        status: 'active'
      }
    });

    const delayMs = (delaySeconds || 5) * 1000;
    let currentPage = 0;
    const maxPages = unlimitedPages ? Infinity : (pages || 1);

    // Создаем директорию для сохранения файлов
    const uploadsDir = path.join(process.cwd(), 'public', 'scanner', folderName || 'scanned_documents', scanSession.id);
    await fs.mkdir(uploadsDir, { recursive: true });

    const scanDocument = async () => {
      if (currentPage >= maxPages) {
        // Достигнут лимит страниц
        await prisma.scanSession.update({
          where: { id: scanSession.id },
          data: { status: 'completed', stoppedAt: new Date() }
        });
        
        if (activeScans.has(userId)) {
          const scan = activeScans.get(userId);
          if (scan) {
            clearInterval(scan.intervalId);
            activeScans.delete(userId);
          }
        }
        return;
      }

      try {
        // Проверяем состояние принтера перед каждым сканированием
        const status = await checkPrinterAndScannerStatus(printerIp, printerPort);
        
        if (!status.isOnline) {
          console.warn(`[Scanner] Принтер ${printerIp}:${printerPort} недоступен, пропускаем сканирование`);
          return; // Пропускаем это сканирование, но продолжаем сессию
        }
        
        if (status.isBusy || status.scannerBusy) {
          console.warn(`[Scanner] Принтер ${printerIp}:${printerPort} занят, ждем ${delayMs}ms перед повторной попыткой`);
          return; // Пропускаем это сканирование, но продолжаем сессию
        }
        
        currentPage++;
        console.log(`[Scanner] Сканирование документа ${currentPage}/${unlimitedPages ? '∞' : maxPages} с принтера ${printerIp}:${printerPort}`);
        
        const fileName = `scan_${currentPage}_${Date.now()}.pdf`;
        const filePath = path.join(uploadsDir, fileName);
        
        // Пытаемся выполнить реальное сканирование через SANE (scanimage)
        let scanSuccess = false;
        let scanError = '';
        
        try {
          // Проверяем наличие scanimage
          try {
            await execAsync('which scanimage', { timeout: 2000 });
          } catch (whichError) {
            throw new Error('scanimage не установлен. Установите: apt-get install sane sane-utils');
          }
          
          // Получаем список доступных устройств SANE
          let availableDevices = '';
          try {
            const { stdout } = await execAsync('scanimage -L 2>&1', { timeout: 5000 });
            availableDevices = stdout;
            console.log(`[Scanner] Доступные SANE устройства:\n${availableDevices}`);
          } catch (listError) {
            console.log(`[Scanner] Не удалось получить список устройств:`, listError instanceof Error ? listError.message : String(listError));
          }
          
          // Пробуем разные форматы сетевых устройств SANE
          const deviceFormats = [
            `escl:http://${printerIp}:631`,      // eSCL через IPP порт
            `escl:http://${printerIp}:${printerPort}`, // eSCL через указанный порт
            `net:${printerIp}:${printerPort}`,   // SANE сетевой протокол
            `airscan:escl:${printerIp}`,         // AirPrint/eSCL
            `ipp:${printerIp}:631/ipp/print`,    // IPP
          ];
          
          // Если устройство найдено в списке, используем его напрямую
          if (availableDevices.includes(printerIp)) {
            // Ищем точное совпадение устройства
            const deviceMatch = availableDevices.match(new RegExp(`(\\S+${printerIp.replace(/\./g, '\\.')}\\S+)`, 'i'));
            if (deviceMatch && deviceMatch[1]) {
              deviceFormats.unshift(deviceMatch[1]); // Добавляем найденное устройство первым
            }
          }
          
          for (const device of deviceFormats) {
            try {
              console.log(`[Scanner] Попытка сканирования с устройства: ${device}`);
              
              // Сначала проверяем доступность устройства
              try {
                await execAsync(`scanimage -d "${device}" --test-option 2>&1 || true`, { timeout: 3000 });
              } catch (testError) {
                // Игнорируем ошибки теста, продолжаем
              }
              
              // Выполняем сканирование в PNM формат
              const pnmPath = filePath.replace('.pdf', '.pnm');
              try {
                await execAsync(
                  `scanimage -d "${device}" --format=pnm --resolution 300 --mode Color > "${pnmPath}" 2>&1`,
                  { timeout: 30000, maxBuffer: 50 * 1024 * 1024 }
                );
                
                // Проверяем, что PNM файл создан и не пустой
                const pnmStats = await fs.stat(pnmPath).catch(() => null);
                if (pnmStats && pnmStats.size > 100) {
                  // Пробуем конвертировать в PDF через ImageMagick
                  try {
                    await execAsync(`convert "${pnmPath}" "${filePath}"`, { timeout: 15000 });
                    await fs.unlink(pnmPath).catch(() => {});
                    const pdfStats = await fs.stat(filePath);
                    if (pdfStats.size > 0) {
                      scanSuccess = true;
                      console.log(`[Scanner] Сканирование успешно выполнено через ${device}`);
                      break;
                    }
                  } catch (convertError) {
                    // Если конвертация не удалась, оставляем PNM файл
                    console.log(`[Scanner] Конвертация в PDF не удалась, оставляем PNM:`, convertError instanceof Error ? convertError.message : String(convertError));
                    await fs.rename(pnmPath, filePath).catch(() => {});
                    const finalStats = await fs.stat(filePath);
                    if (finalStats.size > 0) {
                      scanSuccess = true;
                      console.log(`[Scanner] Сканирование выполнено, файл сохранен как PNM`);
                      break;
                    }
                  }
                }
              } catch (scanCmdError) {
                scanError = scanCmdError instanceof Error ? scanCmdError.message : String(scanCmdError);
                console.log(`[Scanner] Не удалось сканировать через ${device}:`, scanError);
                continue;
              }
            } catch (deviceError) {
              scanError = deviceError instanceof Error ? deviceError.message : String(deviceError);
              continue;
            }
          }
          
        } catch (saneError) {
          scanError = saneError instanceof Error ? saneError.message : String(saneError);
          console.log(`[Scanner] SANE (scanimage) недоступен:`, scanError);
        }
        
        // Если реальное сканирование не удалось, создаем информационный файл
        if (!scanSuccess) {
          console.warn(`[Scanner] Реальное сканирование не удалось. Ошибка: ${scanError || 'Неизвестная ошибка'}`);
          const infoContent = `Информация о сканировании ${currentPage}\n` +
            `Принтер: ${printerIp}:${printerPort}\n` +
            `Время: ${new Date().toISOString()}\n\n` +
            `Для реального сканирования необходимо:\n` +
            `1. Установить SANE: apt-get install sane sane-utils\n` +
            `2. Установить драйверы для вашего принтера (например, sane-airscan для сетевых принтеров)\n` +
            `3. Настроить сетевой доступ к сканеру\n` +
            `4. Убедиться, что принтер поддерживает сканирование по сети\n\n` +
            `Ошибка: ${scanError || 'Сканирование не выполнено'}`;
          await fs.writeFile(filePath, infoContent);
        }
        
        const stats = await fs.stat(filePath);
        
        // Сохраняем информацию о файле в базу данных
        // Сохраняем относительный путь от public для доступа через веб-сервер
        const relativePath = path.relative(path.join(process.cwd(), 'public'), filePath);
        await prisma.scannedFile.create({
          data: {
            scanSessionId: scanSession.id,
            fileName,
            filePath: relativePath,
            fileSize: stats.size
          }
        });
        
        console.log(`[Scanner] Файл сохранен: ${fileName} (${stats.size} байт)`);
        
      } catch (error) {
        console.error(`[Scanner] Ошибка сканирования документа:`, error);
      }
    };

    // Запускаем первое сканирование сразу
    await scanDocument();

    // Устанавливаем интервал для последующих сканирований
    const intervalId = setInterval(scanDocument, delayMs);

    const stopFunction = async () => {
      clearInterval(intervalId);
      activeScans.delete(userId);
      
      // Обновляем статус сессии
      await prisma.scanSession.update({
        where: { id: scanSession.id },
        data: { status: 'stopped', stoppedAt: new Date() }
      });
      
      console.log(`[Scanner] Сканирование остановлено для пользователя ${userId}`);
    };

    activeScans.set(userId, { intervalId, stop: stopFunction, scanSessionId: scanSession.id });

    res.json({
      success: true,
      message: 'Сканирование запущено',
      scanId: scanSession.id,
      sessionId: scanSession.id
    });
  } catch (error) {
    console.error('[Scanner] Ошибка запуска сканирования:', error);
    return res.status(500).json({
      success: false,
      error: 'Ошибка запуска сканирования',
      message: error instanceof Error ? error.message : 'Неизвестная ошибка'
    });
  }
};

// Остановка автоматического сканирования
export const stopDocumentScanning = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const token = (req as any).token;
    const userId = token?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Не авторизован'
      });
    }

    if (activeScans.has(userId)) {
      const scan = activeScans.get(userId);
      if (scan) {
        await scan.stop();
      }
      activeScans.delete(userId);
      
      res.json({
        success: true,
        message: 'Сканирование остановлено'
      });
    } else {
      res.json({
        success: false,
        message: 'Активное сканирование не найдено'
      });
    }
  } catch (error) {
    console.error('[Scanner] Ошибка остановки сканирования:', error);
    return res.status(500).json({
      success: false,
      error: 'Ошибка остановки сканирования',
      message: error instanceof Error ? error.message : 'Неизвестная ошибка'
    });
  }
};

// Получение статуса сканирования
export const getScanningStatus = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const token = (req as any).token;
    const userId = token?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Не авторизован'
      });
    }

    const isActive = activeScans.has(userId);
    let currentSessionId = null;
    let currentFiles: any[] = [];

    if (isActive) {
      const scan = activeScans.get(userId);
      if (scan) {
        currentSessionId = scan.scanSessionId;
        // Получаем файлы текущей сессии
        currentFiles = await prisma.scannedFile.findMany({
          where: { scanSessionId: scan.scanSessionId },
          orderBy: { scannedAt: 'desc' }
        });
      }
    }

    res.json({
      success: true,
      isActive,
      sessionId: currentSessionId,
      files: currentFiles,
      message: isActive ? 'Сканирование активно' : 'Сканирование не активно'
    });
  } catch (error) {
    console.error('[Scanner] Ошибка получения статуса:', error);
    return res.status(500).json({
      success: false,
      error: 'Ошибка получения статуса',
      message: error instanceof Error ? error.message : 'Неизвестная ошибка'
    });
  }
};

// Получение истории сканирований
export const getScanHistory = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const token = (req as any).token;
    const userId = token?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Не авторизован'
      });
    }

    const sessions = await prisma.scanSession.findMany({
      where: { userId },
      include: {
        files: {
          orderBy: { scannedAt: 'asc' }
        }
      },
      orderBy: { startedAt: 'desc' },
      take: 50 // Последние 50 сессий
    });

    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    console.error('[Scanner] Ошибка получения истории:', error);
    return res.status(500).json({
      success: false,
      error: 'Ошибка получения истории',
      message: error instanceof Error ? error.message : 'Неизвестная ошибка'
    });
  }
};

// Получение файлов сессии
export const getSessionFiles = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const token = (req as any).token;
    const userId = token?.userId;
    const { sessionId } = req.params;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Не авторизован'
      });
    }

    // Проверяем, что сессия принадлежит пользователю
    const session = await prisma.scanSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        files: {
          orderBy: { scannedAt: 'asc' }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Сессия не найдена'
      });
    }

    res.json({
      success: true,
      session,
      files: session.files
    });
  } catch (error) {
    console.error('[Scanner] Ошибка получения файлов сессии:', error);
    return res.status(500).json({
      success: false,
      error: 'Ошибка получения файлов',
      message: error instanceof Error ? error.message : 'Неизвестная ошибка'
    });
  }
};

// Скачивание отдельного файла
export const downloadFile = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const token = (req as any).token;
    const userId = token?.userId;
    const { fileId } = req.params;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Не авторизован'
      });
    }

    const file = await prisma.scannedFile.findUnique({
      where: { id: fileId },
      include: { scanSession: true }
    });

    if (!file || file.scanSession.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Файл не найден'
      });
    }

    // Путь к файлу относительно public директории
    const filePath = path.join(process.cwd(), 'public', file.filePath);
    
    // Проверяем существование файла
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Файл не найден на диске'
      });
    }

    res.download(filePath, file.fileName, (err) => {
      if (err) {
        console.error('[Scanner] Ошибка скачивания файла:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Ошибка скачивания файла'
          });
        }
      }
    });
  } catch (error) {
    console.error('[Scanner] Ошибка скачивания файла:', error);
    return res.status(500).json({
      success: false,
      error: 'Ошибка скачивания файла',
      message: error instanceof Error ? error.message : 'Неизвестная ошибка'
    });
  }
};

// Скачивание всех файлов сессии в zip архиве
export const downloadSessionZip = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const token = (req as any).token;
    const userId = token?.userId;
    const { sessionId } = req.params;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Не авторизован'
      });
    }

    // Проверяем, что сессия принадлежит пользователю
    const session = await prisma.scanSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        files: {
          orderBy: { scannedAt: 'asc' }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Сессия не найдена'
      });
    }

    if (session.files.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'В сессии нет файлов'
      });
    }

    // Создаем zip архив
    const zip = new AdmZip();

    // Добавляем файлы в архив
    for (const file of session.files) {
      // Путь к файлу относительно public директории
      const filePath = path.join(process.cwd(), 'public', file.filePath);
      try {
        await fs.access(filePath);
        zip.addLocalFile(filePath, '', file.fileName);
      } catch (error) {
        console.warn(`[Scanner] Файл не найден: ${filePath}`);
      }
    }

    // Генерируем буфер архива
    const zipBuffer = zip.toBuffer();

    // Устанавливаем заголовки для zip файла
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="scan_session_${sessionId}.zip"`);
    res.setHeader('Content-Length', zipBuffer.length.toString());

    res.send(zipBuffer);
  } catch (error) {
    console.error('[Scanner] Ошибка создания zip архива:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: 'Ошибка создания архива',
        message: error instanceof Error ? error.message : 'Неизвестная ошибка'
      });
    }
  }
};

// Удаление отдельного файла
export const deleteFile = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const token = (req as any).token;
    const userId = token?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Не авторизован'
      });
    }

    const { fileId } = req.params;

    // Проверяем, что файл принадлежит пользователю
    const file = await prisma.scannedFile.findFirst({
      where: { id: fileId },
      include: {
        scanSession: {
          select: { userId: true }
        }
      }
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'Файл не найден'
      });
    }

    if (file.scanSession.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Нет доступа к этому файлу'
      });
    }

    // Удаляем файл с диска
    const filePath = path.join(process.cwd(), 'public', file.filePath);
    try {
      await fs.unlink(filePath);
      console.log(`[Scanner] Файл удален с диска: ${filePath}`);
    } catch (fsError) {
      console.warn(`[Scanner] Не удалось удалить файл с диска: ${filePath}`, fsError);
      // Продолжаем удаление из БД даже если файл не найден на диске
    }

    // Удаляем запись из базы данных
    await prisma.scannedFile.delete({
      where: { id: fileId }
    });

    res.json({
      success: true,
      message: 'Файл удален'
    });
  } catch (error) {
    console.error('[Scanner] Ошибка удаления файла:', error);
    return res.status(500).json({
      success: false,
      error: 'Ошибка удаления файла',
      message: error instanceof Error ? error.message : 'Неизвестная ошибка'
    });
  }
};

// Удаление сессии сканирования со всеми файлами
export const deleteSession = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const token = (req as any).token;
    const userId = token?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Не авторизован'
      });
    }

    const { sessionId } = req.params;

    // Проверяем, что сессия принадлежит пользователю
    const session = await prisma.scanSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        files: true
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Сессия не найдена'
      });
    }

    // Удаляем все файлы сессии с диска
    for (const file of session.files) {
      const filePath = path.join(process.cwd(), 'public', file.filePath);
      try {
        await fs.unlink(filePath);
        console.log(`[Scanner] Файл удален с диска: ${filePath}`);
      } catch (fsError) {
        console.warn(`[Scanner] Не удалось удалить файл с диска: ${filePath}`, fsError);
      }
    }

    // Удаляем директорию сессии, если она пуста
    try {
      const sessionDir = path.dirname(path.join(process.cwd(), 'public', session.files[0]?.filePath || ''));
      if (session.files.length > 0) {
        const filesInDir = await fs.readdir(sessionDir).catch(() => []);
        if (filesInDir.length === 0) {
          await fs.rmdir(sessionDir).catch(() => {});
        }
      }
    } catch (dirError) {
      // Игнорируем ошибки удаления директории
      console.warn('[Scanner] Не удалось удалить директорию сессии:', dirError);
    }

    // Удаляем сессию и все связанные файлы из базы данных
    await prisma.scanSession.delete({
      where: { id: sessionId }
    });

    res.json({
      success: true,
      message: 'Сессия сканирования удалена'
    });
  } catch (error) {
    console.error('[Scanner] Ошибка удаления сессии:', error);
    return res.status(500).json({
      success: false,
      error: 'Ошибка удаления сессии',
      message: error instanceof Error ? error.message : 'Неизвестная ошибка'
    });
  }
};

// Вспомогательные функции

// Проверка открытости порта
async function checkPortOpen(host: string, port: number, timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;

    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve(false);
      }
    }, timeout);

    socket.connect(port, host, () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      }
    });

    socket.on('error', () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        resolve(false);
      }
    });
  });
}

// Получение деталей принтера
async function getPrinterDetails(ip: string, port: number): Promise<Partial<PrinterInfo>> {
  const details: Partial<PrinterInfo> = {};

  try {
    // Попытка получить информацию через SNMP для всех портов
    try {
      const snmpInfo = await getSnmpInfo(ip);
      if (snmpInfo.vendor) details.vendor = snmpInfo.vendor;
      if (snmpInfo.model) details.model = snmpInfo.model;
    } catch (error) {
      // Игнорируем ошибки SNMP
    }

    // Попытка HTTP запроса для веб-интерфейса (для всех портов)
    try {
      const protocol = port === 443 ? 'https' : 'http';
      const response = await fetch(`${protocol}://${ip}:${port}`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      
      if (response.ok) {
        const html = await response.text();
        const vendorModel = extractVendorFromHtml(html);
        if (vendorModel.vendor) {
          details.vendor = vendorModel.vendor;
        }
        if (vendorModel.model) {
          details.model = vendorModel.model;
        }
        const scannerInfo = checkScannerCapability(html);
        if (scannerInfo.hasScanner) {
          details.hasScanner = scannerInfo.hasScanner;
          details.scannerType = scannerInfo.scannerType;
        }
      }
    } catch (error) {
      // Игнорируем ошибки HTTP
    }

    // Попытка получить информацию через IPP (Internet Printing Protocol)
    try {
      const capabilities = await getIppCapabilities(ip, 631);
      if (capabilities) {
        const hasScanCapability = capabilities.some(cap => 
          cap.toLowerCase().includes('scan') || 
          cap.toLowerCase().includes('scanner') ||
          cap.toLowerCase().includes('fax')
        );
        if (hasScanCapability) {
          details.hasScanner = hasScanCapability;
          details.scannerType = 'IPP Scanner';
        }
        
        // Ищем информацию о производителе и модели в IPP ответе
        if (!details.vendor || !details.model) {
          for (const cap of capabilities) {
            const lowerCap = cap.toLowerCase();
            if (lowerCap.includes('manufacturer') || lowerCap.includes('make')) {
              if (!details.vendor) {
                details.vendor = cap;
              }
            }
            if (lowerCap.includes('model') || lowerCap.includes('product')) {
              if (!details.model) {
                details.model = cap;
              }
            }
          }
        }
      }
    } catch (error) {
      // Игнорируем ошибки IPP
    }

    // Для порта 9100 (Raw TCP) - базовая проверка
    if (port === 9100) {
      const hasScanner = await checkRawTcpScanner(ip, port);
      if (hasScanner) {
        details.hasScanner = hasScanner;
        if (!details.scannerType) {
          details.scannerType = 'Raw TCP Scanner';
        }
        
        // Пытаемся получить дополнительную информацию через HTTP
        if (!details.vendor || !details.model) {
          try {
            const httpResponse = await fetch(`http://${ip}`, {
              method: 'GET',
              signal: AbortSignal.timeout(2000)
            });
            
            if (httpResponse.ok) {
              const html = await httpResponse.text();
              const vendorModel = extractVendorFromHtml(html);
              if (vendorModel.vendor && !details.vendor) {
                details.vendor = vendorModel.vendor;
              }
              if (vendorModel.model && !details.model) {
                details.model = vendorModel.model;
              }
            }
          } catch (error) {
            // Игнорируем ошибки HTTP
          }
        }
      }
    }

  } catch (error) {
    console.warn(`[Scanner] Ошибка получения деталей принтера ${ip}:${port}:`, error);
  }

  return details;
}

// Проверка состояния принтера и сканера
async function checkPrinterAndScannerStatus(
  ip: string, 
  port: number
): Promise<{
  isOnline: boolean;
  hasScanner: boolean;
  isBusy: boolean;
  scannerBusy: boolean;
  status?: string;
  error?: string;
}> {
  const result = {
    isOnline: false,
    hasScanner: false,
    isBusy: false,
    scannerBusy: false,
    status: 'unknown' as string | undefined,
    error: undefined as string | undefined
  };

  try {
    // 1. Проверка доступности принтера (ping и порт)
    console.log(`[Scanner] Проверка доступности принтера ${ip}:${port}...`);
    
    // Проверяем открытость порта
    const portOpen = await checkPortOpen(ip, port, 3000);
    if (!portOpen) {
      // Пробуем другие стандартные порты
      const commonPorts = [631, 80, 443, 9100];
      let anyPortOpen = false;
      for (const testPort of commonPorts) {
        if (await checkPortOpen(ip, testPort, 2000)) {
          anyPortOpen = true;
          break;
        }
      }
      if (!anyPortOpen) {
        result.error = 'Принтер не отвечает на запросы';
        return result;
      }
    }
    
    result.isOnline = true;
    console.log(`[Scanner] Принтер ${ip}:${port} доступен`);

    // 2. Проверка наличия сканера через базу данных
    try {
      const printer = await prisma.printer.findUnique({
        where: {
          ip_port: { ip, port }
        }
      });
      
      if (printer && printer.hasScanner) {
        result.hasScanner = true;
        console.log(`[Scanner] Принтер ${ip}:${port} имеет сканер`);
      } else {
        // Пробуем определить наличие сканера динамически
        const details = await getPrinterDetails(ip, port);
        if (details.hasScanner) {
          result.hasScanner = true;
          console.log(`[Scanner] Сканер обнаружен на принтере ${ip}:${port}`);
        } else {
          result.error = 'Сканер не обнаружен на принтере';
          return result;
        }
      }
    } catch (dbError) {
      // Если не найдено в БД, пробуем определить динамически
      const details = await getPrinterDetails(ip, port);
      if (details.hasScanner) {
        result.hasScanner = true;
      } else {
        result.error = 'Сканер не обнаружен на принтере';
        return result;
      }
    }

    // 3. Проверка занятости принтера через SNMP
    try {
      const hasSnmp = await checkUtilityExists('snmpget');
      if (hasSnmp) {
        // Проверяем состояние принтера через SNMP
        // OID для состояния принтера: 1.3.6.1.2.1.25.3.2.1.5.1 (hrDeviceStatus)
        try {
          const { stdout: snmpStatus } = await execAsync(
            `snmpget -v2c -c public -t 1 -r 1 ${ip} 1.3.6.1.2.1.25.3.2.1.5.1 2>/dev/null || snmpget -v2c -c public -t 1 -r 1 ${ip} 1.3.6.1.2.1.25.3.2.1.5.1 2>/dev/null || echo "unknown"`,
            { timeout: 2000 }
          );
          
          // Значения: 1 = unknown, 2 = running, 3 = warning, 4 = testing, 5 = down
          if (snmpStatus.includes('= 5') || snmpStatus.includes('down')) {
            result.isBusy = false; // Принтер выключен, не занят, но и не работает
            result.status = 'down';
            result.error = 'Принтер выключен';
            return result;
          } else if (snmpStatus.includes('= 3') || snmpStatus.includes('warning')) {
            result.isBusy = true;
            result.status = 'warning';
          } else if (snmpStatus.includes('= 2') || snmpStatus.includes('running')) {
            result.status = 'running';
            // Дополнительно проверяем очередь печати
            try {
              const { stdout: queueStatus } = await execAsync(
                `snmpget -v2c -c public -t 1 -r 1 ${ip} 1.3.6.1.2.1.25.1.1.0 2>/dev/null || echo "unknown"`,
                { timeout: 2000 }
              );
              // Если есть активные задания, принтер занят
              if (queueStatus.includes('active') || queueStatus.includes('processing')) {
                result.isBusy = true;
                result.status = 'busy';
              }
            } catch {
              // Игнорируем ошибки проверки очереди
            }
          }
        } catch (snmpError) {
          // SNMP может быть недоступен, это не критично
          console.log(`[Scanner] SNMP проверка недоступна для ${ip}:`, snmpError instanceof Error ? snmpError.message : String(snmpError));
        }
      }
    } catch (snmpCheckError) {
      // Игнорируем ошибки SNMP
    }

    // 4. Проверка занятости сканера через SANE
    try {
      const hasScanimage = await checkUtilityExists('scanimage');
      if (hasScanimage) {
        // Пробуем получить список устройств и проверить их состояние
        try {
          const { stdout: devices } = await execAsync('scanimage -L 2>&1', { timeout: 3000 });
          
          // Ищем устройство с IP нашего принтера
          const deviceMatch = devices.match(new RegExp(`(\\S+${ip.replace(/\./g, '\\.')}\\S+)`, 'i'));
          if (deviceMatch && deviceMatch[1]) {
            const device = deviceMatch[1];
            
            // Пробуем получить статус устройства
            try {
              await execAsync(`scanimage -d "${device}" --test-option 2>&1`, { timeout: 2000 });
              // Если команда выполнилась без ошибок "busy" или "in use", сканер свободен
            } catch (testError) {
              const errorMsg = testError instanceof Error ? testError.message : String(testError);
              if (errorMsg.includes('busy') || errorMsg.includes('in use') || errorMsg.includes('locked')) {
                result.scannerBusy = true;
                result.status = 'scanner_busy';
                console.log(`[Scanner] Сканер на ${ip}:${port} занят`);
              }
            }
          }
        } catch (saneError) {
          // SANE может быть недоступен или устройство не найдено
          console.log(`[Scanner] SANE проверка недоступна для ${ip}:`, saneError instanceof Error ? saneError.message : String(saneError));
        }
      }
    } catch (saneCheckError) {
      // Игнорируем ошибки SANE
    }

    // 5. Дополнительная проверка через HTTP/IPP
    try {
      // Пробуем проверить состояние через IPP (Internet Printing Protocol)
      const ippUrl = `http://${ip}:631/ipp/print`;
      try {
        const response = await fetch(ippUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/ipp',
            'User-Agent': 'Scanner-Check/1.0'
          },
          body: Buffer.from([
            0x02, 0x00, // IPP version 2.0
            0x00, 0x0b, // Get-Printer-Attributes operation
            0x00, 0x00, 0x00, 0x01, // Request ID
            0x01, // Begin attribute group (printer-attributes-tag)
            0x47, // charset attribute
            0x00, 0x12, // name length
            ...Buffer.from('attributes-charset', 'utf-8'),
            0x00, 0x05, // value length
            ...Buffer.from('utf-8', 'utf-8'),
            0x03 // End of attributes
          ]),
          signal: AbortSignal.timeout(2000)
        });
        
        if (response.ok) {
          const ippData = await response.arrayBuffer();
          // Парсим IPP ответ для определения состояния
          // Если принтер отвечает, он доступен
          result.status = 'ipp_available';
        }
      } catch (ippError) {
        // IPP может быть недоступен, это не критично
      }
    } catch (httpError) {
      // Игнорируем ошибки HTTP/IPP
    }

    console.log(`[Scanner] Статус принтера ${ip}:${port}:`, result);
    return result;

  } catch (error) {
    console.error(`[Scanner] Ошибка проверки состояния принтера ${ip}:${port}:`, error);
    result.error = error instanceof Error ? error.message : 'Неизвестная ошибка';
    return result;
  }
}

// Получение информации через SNMP
async function getSnmpInfo(ip: string): Promise<{ vendor?: string; model?: string }> {
  const result: { vendor?: string; model?: string } = {};
  
  try {
    // Проверяем наличие утилиты snmpget
    const hasSnmp = await checkUtilityExists('snmpget');
    if (!hasSnmp) {
      // SNMP не критичен, просто возвращаем пустой результат
      return result;
    }
    
    // Получаем системную информацию через SNMP v2c
    // Используем несколько OID для лучшей совместимости
    const snmpOids = [
      '1.3.6.1.2.1.1.1.0', // sysDescr
      '1.3.6.1.2.1.1.2.0', // sysObjectID
      '1.3.6.1.2.1.25.3.2.1.3.1' // hrDeviceDescr
    ];
    
    let systemInfo = '';
    
    for (const oid of snmpOids) {
      try {
        const { stdout: snmpOut } = await execAsync(
          `snmpget -v2c -c public -t 1 -r 1 ${ip} ${oid} 2>/dev/null`,
          { timeout: 2000 }
        );
        
        if (!snmpOut.includes('No Such Object') && 
            !snmpOut.includes('No Such Instance') && 
            !snmpOut.includes('Timeout') &&
            !snmpOut.includes('Error')) {
          systemInfo += ' ' + snmpOut.split('\n')[0].trim();
        }
      } catch {
        // Продолжаем с следующим OID
        continue;
      }
    }
    
    if (!systemInfo.trim()) {
      return result;
    }

    // Ищем известных производителей
    const vendorPatterns = [
      { pattern: /pantum/i, name: 'Pantum' },
      { pattern: /kyocera/i, name: 'Kyocera' },
      { pattern: /canon/i, name: 'Canon' },
      { pattern: /hp|hewlett/i, name: 'HP' },
      { pattern: /epson/i, name: 'Epson' },
      { pattern: /brother/i, name: 'Brother' },
      { pattern: /samsung/i, name: 'Samsung' },
      { pattern: /xerox/i, name: 'Xerox' },
      { pattern: /lexmark/i, name: 'Lexmark' },
      { pattern: /ricoh/i, name: 'Ricoh' },
      { pattern: /kyocera/i, name: 'Kyocera' },
      { pattern: /konica/i, name: 'Konica' },
      { pattern: /minolta/i, name: 'Minolta' },
      { pattern: /sharp/i, name: 'Sharp' },
      { pattern: /toshiba/i, name: 'Toshiba' },
      { pattern: /panasonic/i, name: 'Panasonic' },
      { pattern: /oki/i, name: 'OKI' },
      { pattern: /dell/i, name: 'Dell' },
      { pattern: /lenovo/i, name: 'Lenovo' }
    ];

    for (const { pattern, name } of vendorPatterns) {
      if (pattern.test(systemInfo)) {
        result.vendor = name;
        break;
      }
    }

    // Пытаемся извлечь модель из системной информации
    const modelPatterns = [
      /model[:\s]+([a-zA-Z0-9\-_]+)/i,
      /([a-zA-Z]+[\s\-]?[0-9]+[a-zA-Z0-9\-_]*)/g,
      /([0-9]+[a-zA-Z]+[0-9a-zA-Z\-_]*)/g
    ];

    for (const pattern of modelPatterns) {
      const matches = systemInfo.match(pattern);
      if (matches && matches.length > 0) {
        const model = matches[1] || matches[0];
        if (model && model.length > 2 && model.length < 30) {
          result.model = model.replace(/^(model|type|series)[:\s]+/i, '').trim();
          break;
        }
      }
    }

    return result;
  } catch (error) {
    // SNMP не критичен, просто возвращаем пустой результат
    return result;
  }
}

// Извлечение вендора и модели из HTML
function extractVendorFromHtml(html: string): { vendor?: string; model?: string } {
  const result: { vendor?: string; model?: string } = {};

  // Сначала ищем в заголовках и мета-тегах
  const titleMatch = html.match(/<title[^>]*>([^<]*(?:printer|scanner|mfp|multifunction)[^<]*)</i);
  if (titleMatch) {
    const title = titleMatch[1].trim();
    const vendorModel = extractVendorModelFromText(title);
    if (vendorModel.vendor) result.vendor = vendorModel.vendor;
    if (vendorModel.model) result.model = vendorModel.model;
  }

  // Ищем в заголовках h1, h2
  const headerMatch = html.match(/<(h1|h2)[^>]*>([^<]*(?:printer|scanner|mfp|multifunction)[^<]*)<\/(h1|h2)>/i);
  if (headerMatch) {
    const header = headerMatch[2].trim();
    const vendorModel = extractVendorModelFromText(header);
    if (vendorModel.vendor && !result.vendor) result.vendor = vendorModel.vendor;
    if (vendorModel.model && !result.model) result.model = vendorModel.model;
  }

  // Ищем в мета-тегах
  const metaMatch = html.match(/<meta[^>]*(?:name|property)=["'](?:title|description|product)["'][^>]*content=["']([^"']*(?:printer|scanner|mfp|multifunction)[^"']*)["']/i);
  if (metaMatch) {
    const meta = metaMatch[1].trim();
    const vendorModel = extractVendorModelFromText(meta);
    if (vendorModel.vendor && !result.vendor) result.vendor = vendorModel.vendor;
    if (vendorModel.model && !result.model) result.model = vendorModel.model;
  }

  // Ищем известных производителей
  const vendorPatterns = [
    { pattern: /canon[^<\s]*/i, name: 'Canon' },
    { pattern: /hp[^<\s]*|hewlett[^<\s]*/i, name: 'HP' },
    { pattern: /epson[^<\s]*/i, name: 'Epson' },
    { pattern: /brother[^<\s]*/i, name: 'Brother' },
    { pattern: /samsung[^<\s]*/i, name: 'Samsung' },
    { pattern: /xerox[^<\s]*/i, name: 'Xerox' },
    { pattern: /lexmark[^<\s]*/i, name: 'Lexmark' },
    { pattern: /ricoh[^<\s]*/i, name: 'Ricoh' },
    { pattern: /kyocera[^<\s]*/i, name: 'Kyocera' },
    { pattern: /konica[^<\s]*/i, name: 'Konica' },
    { pattern: /minolta[^<\s]*/i, name: 'Minolta' },
    { pattern: /sharp[^<\s]*/i, name: 'Sharp' },
    { pattern: /toshiba[^<\s]*/i, name: 'Toshiba' },
    { pattern: /panasonic[^<\s]*/i, name: 'Panasonic' },
    { pattern: /oki[^<\s]*/i, name: 'OKI' },
    { pattern: /dell[^<\s]*/i, name: 'Dell' },
    { pattern: /lenovo[^<\s]*/i, name: 'Lenovo' }
  ];

  for (const { pattern, name } of vendorPatterns) {
    const match = html.match(pattern);
    if (match && !result.vendor) {
      result.vendor = match[0].trim();
      break;
    }
  }

  return result;
}

// Извлечение вендора и модели из текста
function extractVendorModelFromText(text: string): { vendor?: string; model?: string } {
  const result: { vendor?: string; model?: string } = {};

  // Паттерны для поиска модели (обычно содержит цифры и буквы)
  const modelPatterns = [
    /(?:model|type|series)[\s:]*([a-zA-Z0-9\-_]+)/i,
    /([a-zA-Z]+[\s\-]?[0-9]+[a-zA-Z0-9\-_]*)/g,
    /([0-9]+[a-zA-Z]+[0-9a-zA-Z\-_]*)/g
  ];

  for (const pattern of modelPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        const cleanMatch = match.replace(/^(model|type|series)[\s:]*/i, '').trim();
        if (cleanMatch.length > 2 && cleanMatch.length < 20) {
          result.model = cleanMatch;
          break;
        }
      }
      if (result.model) break;
    }
  }

  // Поиск вендора
  const vendorPatterns = [
    { pattern: /canon/i, name: 'Canon' },
    { pattern: /hp|hewlett/i, name: 'HP' },
    { pattern: /epson/i, name: 'Epson' },
    { pattern: /brother/i, name: 'Brother' },
    { pattern: /samsung/i, name: 'Samsung' },
    { pattern: /xerox/i, name: 'Xerox' },
    { pattern: /lexmark/i, name: 'Lexmark' },
    { pattern: /ricoh/i, name: 'Ricoh' },
    { pattern: /kyocera/i, name: 'Kyocera' },
    { pattern: /konica/i, name: 'Konica' },
    { pattern: /minolta/i, name: 'Minolta' },
    { pattern: /sharp/i, name: 'Sharp' },
    { pattern: /toshiba/i, name: 'Toshiba' },
    { pattern: /panasonic/i, name: 'Panasonic' },
    { pattern: /oki/i, name: 'OKI' },
    { pattern: /dell/i, name: 'Dell' },
    { pattern: /lenovo/i, name: 'Lenovo' }
  ];

  for (const { pattern, name } of vendorPatterns) {
    if (pattern.test(text)) {
      result.vendor = name;
      break;
    }
  }

  return result;
}

// Проверка наличия сканера в HTML
function checkScannerCapability(html: string): { hasScanner: boolean; scannerType?: string } {
  const scannerPatterns = [
    { pattern: /multifunction|mfp|all-in-one/i, type: 'MFP' },
    { pattern: /scanner|сканер/i, type: 'Scanner' },
    { pattern: /fax/i, type: 'Fax Machine' },
    { pattern: /copy|копир/i, type: 'Copier' },
    { pattern: /многофункциональный/i, type: 'Многофункциональное устройство' }
  ];

  for (const { pattern, type } of scannerPatterns) {
    if (pattern.test(html)) {
      return { hasScanner: true, scannerType: type };
    }
  }

  return { hasScanner: false };
}

// Проверка сканера через Raw TCP
async function checkRawTcpScanner(ip: string, port: number): Promise<boolean> {
  try {
    // Простая проверка через подключение к порту
    // Многие принтеры со сканерами отвечают на определенные команды
    const socket = new net.Socket();
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 3000);

      socket.connect(port, ip, () => {
        clearTimeout(timeout);
        socket.destroy();
        // Если подключение успешно, предполагаем что это может быть принтер со сканером
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

// Получение возможностей через IPP
async function getIppCapabilities(ip: string, port: number): Promise<string[] | undefined> {
  try {
    // Простая реализация IPP запроса
    const ippRequest = Buffer.from([
      0x02, 0x00, // version-number
      0x00, 0x02, // operation-id (Get-Printer-Attributes)
      0x00, 0x00, 0x00, 0x01, // request-id
      0x01, // operation-attributes-tag
      0x47, 0x00, 0x12, // charset
      0x61, 0x74, 0x74, 0x72, 0x69, 0x62, 0x75, 0x74, 0x65, 0x73, 0x2d, 0x63, 0x68, 0x61, 0x72, 0x73, 0x65, 0x74, 0x00,
      0x47, 0x00, 0x05, // natural-language
      0x61, 0x74, 0x74, 0x72, 0x69, 0x62, 0x75, 0x74, 0x65, 0x73, 0x2d, 0x6e, 0x61, 0x74, 0x75, 0x72, 0x61, 0x6c, 0x2d, 0x6c, 0x61, 0x6e, 0x67, 0x75, 0x61, 0x67, 0x65, 0x00,
      0x47, 0x00, 0x0b, // printer-uri
      0x61, 0x74, 0x74, 0x72, 0x69, 0x62, 0x75, 0x74, 0x65, 0x73, 0x2d, 0x63, 0x68, 0x61, 0x72, 0x73, 0x65, 0x74, 0x00,
      0x47, 0x00, 0x0b, // printer-uri
      0x61, 0x74, 0x74, 0x72, 0x69, 0x62, 0x75, 0x74, 0x65, 0x73, 0x2d, 0x63, 0x68, 0x61, 0x72, 0x73, 0x65, 0x74, 0x00,
      0x03 // end-of-attributes-tag
    ]);

    const response = await fetch(`http://${ip}:${port}/ipp/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ipp'
      },
      body: ippRequest,
      signal: AbortSignal.timeout(3000)
    });

    if (response.ok) {
      return ['IPP', 'Printing'];
    }
  } catch {
    // Игнорируем ошибки IPP
  }

  return undefined;
}

// Развертывание сетевого диапазона
async function expandNetworkRange(networkRange: string): Promise<string[]> {
  const [network, prefix] = networkRange.split('/');
  const prefixLength = parseInt(prefix);
  
  if (prefixLength < 24) {
    throw new Error('Слишком большой диапазон для сканирования');
  }

  const ipParts = network.split('.').map(Number);
  const hostBits = 32 - prefixLength;
  const hostCount = Math.pow(2, hostBits);
  
  const ips: string[] = [];
  const networkAddress = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
  
  for (let i = 1; i < hostCount - 1; i++) {
    const ip = networkAddress + i;
    ips.push(`${(ip >>> 24) & 0xFF}.${(ip >>> 16) & 0xFF}.${(ip >>> 8) & 0xFF}.${ip & 0xFF}`);
  }
  
  return ips;
}

// Генерация диапазона IP адресов
async function generateIpRange(startIp: string, endIp: string): Promise<string[]> {
  const start = ipToNumber(startIp);
  const end = ipToNumber(endIp);
  
  if (end - start > 1000) {
    throw new Error('Слишком большой диапазон для сканирования');
  }
  
  const ips: string[] = [];
  for (let i = start; i <= end; i++) {
    ips.push(numberToIp(i));
  }
  
  return ips;
}

// Получение IP адресов локальной сети
async function getLocalNetworkIps(): Promise<string[]> {
  try {
    return await getLinuxNetworkIps();
  } catch (error) {
    console.error('[Scanner] Критическая ошибка определения локальной сети:', error);
    throw new Error('Не удалось определить локальную сеть сервера. Проверьте сетевое подключение.');
  }
}

// Проверка наличия утилиты в системе
async function checkUtilityExists(utility: string): Promise<boolean> {
  try {
    await execAsync(`which ${utility}`, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

// Получение IP для Linux/Docker
async function getLinuxNetworkIps(): Promise<string[]> {
  try {
    const networks: string[] = [];
    const foundNetworks = new Set<string>(); // Для избежания дубликатов
    
    // Метод 1: Используем команду `ip` (предпочтительно)
    try {
      const hasIpCommand = await checkUtilityExists('ip');
      if (hasIpCommand) {
        const { stdout } = await execAsync('ip -4 addr show | grep -E "inet [0-9]"', { timeout: 5000 });
        const interfaces = stdout.trim().split('\n').filter(line => line.trim());
        
        for (const interfaceInfo of interfaces) {
          // Извлекаем IP и маску подсети (например: inet 192.168.1.100/24)
          const inetMatch = interfaceInfo.match(/inet (\d+\.\d+\.\d+\.\d+)\/(\d+)/);
          if (inetMatch) {
            const ip = inetMatch[1];
            const cidr = parseInt(inetMatch[2]);
            
            // Пропускаем loopback и link-local адреса
            if (ip.startsWith('127.') || ip.startsWith('169.254.') || cidr < 16) {
              continue;
            }
            
            // Ограничиваем размер подсети для производительности (максимум /24)
            if (cidr < 24) {
              console.log(`[Scanner] Пропускаем большую подсеть ${ip}/${cidr}, используем только /24`);
              // Для больших подсетей используем только первые 254 адреса
              const ipParts = ip.split('.').map(Number);
              const networkBase = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
              for (let i = 1; i < 255; i++) {
                const generatedIp = `${networkBase}.${i}`;
                if (!foundNetworks.has(generatedIp)) {
                  networks.push(generatedIp);
                  foundNetworks.add(generatedIp);
                }
              }
              console.log(`[Scanner] Найдена подсеть Linux: ${networkBase}.0/24 (254 адреса)`);
              continue;
            }
            
            const ipParts = ip.split('.').map(Number);
            const ipNum = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
            
            // Вычисляем маску подсети
            const mask = (0xFFFFFFFF << (32 - cidr)) >>> 0;
            const networkAddress = ipNum & mask;
            const broadcastAddress = networkAddress | (~mask >>> 0);
            
            // Ограничиваем количество адресов для производительности
            const maxAddresses = 254;
            let addressCount = 0;
            
            // Генерируем IP адреса в подсети
            for (let i = networkAddress + 1; i < broadcastAddress && addressCount < maxAddresses; i++) {
              const generatedIp = `${(i >>> 24) & 0xFF}.${(i >>> 16) & 0xFF}.${(i >>> 8) & 0xFF}.${i & 0xFF}`;
              if (!foundNetworks.has(generatedIp)) {
                networks.push(generatedIp);
                foundNetworks.add(generatedIp);
                addressCount++;
              }
            }
            
            console.log(`[Scanner] Найдена подсеть Linux: ${ip}/${cidr} (${addressCount} адресов)`);
          }
        }
      }
    } catch (ipError) {
      console.warn('[Scanner] Команда `ip` не доступна или завершилась с ошибкой:', ipError);
    }
    
    // Метод 2: Используем `ifconfig` (fallback для старых систем)
    if (networks.length === 0) {
      try {
        const hasIfconfig = await checkUtilityExists('ifconfig');
        if (hasIfconfig) {
          const { stdout } = await execAsync('ifconfig | grep -E "inet [0-9]"', { timeout: 5000 });
          const interfaces = stdout.trim().split('\n').filter(line => line.trim());
          
          for (const interfaceInfo of interfaces) {
            // Извлекаем IP адрес (ifconfig не всегда показывает маску в формате CIDR)
            const inetMatch = interfaceInfo.match(/inet (\d+\.\d+\.\d+\.\d+)/);
            if (inetMatch) {
              const ip = inetMatch[1];
              
              // Пропускаем loopback и link-local
              if (ip.startsWith('127.') || ip.startsWith('169.254.')) {
                continue;
              }
              
              // Предполагаем /24 подсеть
              const ipParts = ip.split('.').map(Number);
              const networkBase = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
              
              for (let i = 1; i < 255; i++) {
                const generatedIp = `${networkBase}.${i}`;
                if (!foundNetworks.has(generatedIp)) {
                  networks.push(generatedIp);
                  foundNetworks.add(generatedIp);
                }
              }
              
              console.log(`[Scanner] Найдена подсеть через ifconfig: ${networkBase}.0/24`);
            }
          }
        }
      } catch (ifconfigError) {
        console.warn('[Scanner] Команда `ifconfig` не доступна:', ifconfigError);
      }
    }
    
    // Метод 3: Используем `/proc/net/route` для определения сетевых интерфейсов (Linux специфично)
    if (networks.length === 0) {
      try {
        const fs = await import('fs/promises');
        const routeContent = await fs.readFile('/proc/net/route', 'utf-8');
        const lines = routeContent.split('\n').slice(1); // Пропускаем заголовок
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            const iface = parts[0];
            const dest = parseInt(parts[1], 16);
            const mask = parseInt(parts[7], 16);
            
            // Ищем только локальные сети (dest = 0)
            if (dest === 0 && mask !== 0) {
              // Получаем IP адрес интерфейса через ip или ifconfig
              try {
                const { stdout } = await execAsync(`ip addr show ${iface} | grep "inet "`, { timeout: 3000 });
                const inetMatch = stdout.match(/inet (\d+\.\d+\.\d+\.\d+)\/(\d+)/);
                if (inetMatch) {
                  const ip = inetMatch[1];
                  const cidr = parseInt(inetMatch[2]);
                  
                  if (!ip.startsWith('127.') && !ip.startsWith('169.254.') && cidr >= 24) {
                    const ipParts = ip.split('.').map(Number);
                    const networkBase = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
                    
                    for (let i = 1; i < 255; i++) {
                      const generatedIp = `${networkBase}.${i}`;
                      if (!foundNetworks.has(generatedIp)) {
                        networks.push(generatedIp);
                        foundNetworks.add(generatedIp);
                      }
                    }
                    
                    console.log(`[Scanner] Найдена подсеть через /proc/net/route: ${networkBase}.0/24`);
                  }
                }
              } catch {
                // Игнорируем ошибки для конкретного интерфейса
              }
            }
          }
        }
      } catch (procError) {
        console.warn('[Scanner] Не удалось прочитать /proc/net/route:', procError);
      }
    }
    
    // Метод 4: Используем переменные окружения Docker (если запущено в контейнере)
    // Примечание: При network_mode: "host" контейнер использует сетевой стек хоста,
    // поэтому методы 1-3 должны работать напрямую с сетевыми интерфейсами хоста
    if (networks.length === 0) {
      const dockerHost = process.env.DOCKER_HOST;
      const dockerNetwork = process.env.DOCKER_NETWORK;
      
      if (dockerHost) {
        console.log('[Scanner] Обнаружено Docker окружение, используем переменные окружения');
        // Пытаемся определить сеть из DOCKER_HOST
        const hostMatch = dockerHost.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (hostMatch) {
          const ip = hostMatch[1];
          const ipParts = ip.split('.').map(Number);
          const networkBase = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
          
          for (let i = 1; i < 255; i++) {
            const generatedIp = `${networkBase}.${i}`;
            if (!foundNetworks.has(generatedIp)) {
              networks.push(generatedIp);
              foundNetworks.add(generatedIp);
            }
          }
          
          console.log(`[Scanner] Найдена подсеть Docker: ${networkBase}.0/24`);
        }
      }
      
      // Дополнительно: если используется host network mode, пробуем получить IP хоста через hostname
      if (networks.length === 0) {
        try {
          const { stdout: hostnameOut } = await execAsync('hostname -I', { timeout: 2000 });
          const hostIps = hostnameOut.trim().split(/\s+/).filter(ip => ip.match(/^\d+\.\d+\.\d+\.\d+$/));
          
          for (const hostIp of hostIps) {
            if (!hostIp.startsWith('127.') && !hostIp.startsWith('169.254.')) {
              const ipParts = hostIp.split('.').map(Number);
              const networkBase = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
              
              for (let i = 1; i < 255; i++) {
                const generatedIp = `${networkBase}.${i}`;
                if (!foundNetworks.has(generatedIp)) {
                  networks.push(generatedIp);
                  foundNetworks.add(generatedIp);
                }
              }
              
              console.log(`[Scanner] Найдена подсеть через hostname: ${networkBase}.0/24`);
            }
          }
        } catch (hostnameError) {
          console.warn('[Scanner] Не удалось получить IP через hostname:', hostnameError);
        }
      }
    }
    
    // Метод 5: Используем nmap для обнаружения активных хостов (только если другие методы не сработали)
    if (networks.length === 0) {
      try {
        const hasNmap = await checkUtilityExists('nmap');
        if (hasNmap) {
          console.log('[Scanner] Попытка обнаружения активных хостов через nmap...');
          // Сканируем только стандартные приватные подсети
          const { stdout: nmapOut } = await execAsync(
            'nmap -sn --max-retries 1 --host-timeout 5s 192.168.0.0/16 10.0.0.0/8 172.16.0.0/12 2>/dev/null | grep -E "Nmap scan report" | grep -oE "([0-9]{1,3}\\.){3}[0-9]{1,3}"',
            { timeout: 30000 }
          );
          
          const activeHosts = nmapOut.trim().split('\n')
            .filter(host => host.match(/^\d+\.\d+\.\d+\.\d+$/))
            .filter(host => !host.startsWith('127.') && !host.startsWith('169.254.'));
          
          if (activeHosts.length > 0) {
            console.log(`[Scanner] Nmap обнаружил ${activeHosts.length} активных хостов`);
            return activeHosts;
          }
        } else {
          console.warn('[Scanner] Утилита nmap не найдена. Установите: sudo apt-get install nmap (Debian/Ubuntu) или sudo yum install nmap (RHEL/CentOS)');
        }
      } catch (nmapError) {
        console.warn('[Scanner] Nmap сканирование не удалось:', nmapError);
      }
    }
    
    if (networks.length > 0) {
      // Удаляем дубликаты и сортируем
      const uniqueNetworks = Array.from(foundNetworks);
      console.log(`[Scanner] Всего найдено ${uniqueNetworks.length} уникальных IP адресов в Linux сетях`);
      return uniqueNetworks;
    }
    
    // Последний fallback - возвращаем стандартные приватные подсети
    console.warn('[Scanner] Не удалось определить локальную сеть, используем стандартные приватные подсети');
    const fallbackNetworks: string[] = [];
    const commonSubnets = [
      '192.168.1', '192.168.0', '192.168.2',
      '10.0.0', '10.0.1',
      '172.16.0', '172.17.0'
    ];
    
    for (const subnet of commonSubnets) {
      for (let i = 1; i < 255; i++) {
        fallbackNetworks.push(`${subnet}.${i}`);
      }
    }
    
    console.log(`[Scanner] Используем fallback: ${fallbackNetworks.length} адресов из стандартных подсетей`);
    return fallbackNetworks;
  } catch (error) {
    console.error('[Scanner] Критическая ошибка определения Linux сети:', error);
    throw new Error(`Не удалось определить локальную сеть Linux: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
  }
}

// Конвертация IP в число
function ipToNumber(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + parseInt(part), 0) >>> 0;
}

// Конвертация числа в IP
function numberToIp(num: number): string {
  return `${(num >>> 24) & 0xFF}.${(num >>> 16) & 0xFF}.${(num >>> 8) & 0xFF}.${num & 0xFF}`;
}

// Сканирование через nmap
async function scanWithNmap(ipList: string[], ports: number[]): Promise<PrinterInfo[]> {
  try {
    // Проверяем наличие nmap
    const hasNmap = await checkUtilityExists('nmap');
    if (!hasNmap) {
      console.warn('[Scanner] Утилита nmap не найдена. Установите: sudo apt-get install nmap (Debian/Ubuntu) или sudo yum install nmap (RHEL/CentOS)');
      throw new Error('nmap не установлен');
    }
    
    const portString = ports.join(',');
    const results: PrinterInfo[] = [];
    
    // Оптимизируем сканирование больших сетей через батчинг
    if (ipList.length > 100) {
      console.log(`[Scanner] Большая сеть (${ipList.length} IP), используем батчинг для nmap`);
      const batchSize = 50; // Размер батча для nmap
      const batches: string[][] = [];
      
      for (let i = 0; i < ipList.length; i += batchSize) {
        batches.push(ipList.slice(i, i + batchSize));
      }
      
      console.log(`[Scanner] Разделено на ${batches.length} батчей по ${batchSize} IP`);
      
      // Обрабатываем батчи последовательно для избежания перегрузки
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`[Scanner] Обработка батча ${batchIndex + 1}/${batches.length} (${batch.length} IP)`);
        
        try {
          // Для Linux используем более агрессивные параметры nmap
          const command = `nmap -p ${portString} --open --max-retries 1 --host-timeout 10s -T4 -oG - ${batch.join(' ')}`;
          
          const { stdout } = await execAsync(command, {
            timeout: 60000, // 60 секунд на батч
            maxBuffer: 10 * 1024 * 1024 // 10MB буфер для больших выводов
          });
          
          const lines = stdout.split('\n');
          
          for (const line of lines) {
            if (line.includes('Ports:')) {
              const ipMatch = line.match(/Host: (\d+\.\d+\.\d+\.\d+)/);
              const portsMatch = line.match(/Ports: ([^\/]+)/);
              
              if (ipMatch && portsMatch) {
                const ip = ipMatch[1];
                const openPorts = portsMatch[1].split(',')
                  .map(port => {
                    const portNum = parseInt(port.split('/')[0].trim());
                    return portNum;
                  })
                  .filter(port => !isNaN(port) && ports.includes(port));
                
                // Обрабатываем каждый открытый порт
                for (const port of openPorts) {
                  const printerInfo: PrinterInfo = {
                    ip,
                    port,
                    status: 'online',
                    lastSeen: new Date()
                  };

                  try {
                    const details = await getPrinterDetails(ip, port);
                    Object.assign(printerInfo, details);
                    
                    // Добавляем только если это устройство со сканером
                    if (details.hasScanner || details.scannerType) {
                      results.push(printerInfo);
                      console.log(`[Scanner] Nmap: найден принтер со сканером: ${ip}:${port} (${details.scannerType || 'MFP'})`);
                    }
                  } catch (error) {
                    console.warn(`[Scanner] Не удалось получить детали принтера ${ip}:${port}`);
                  }
                }
              }
            }
          }
        } catch (batchError) {
          console.warn(`[Scanner] Ошибка при обработке батча ${batchIndex + 1}:`, batchError);
          // Продолжаем обработку следующих батчей
        }
      }
      
      return results;
    }
    
    // Для небольших сетей используем стандартный подход
    // Используем оптимизированные параметры для Linux
    const command = `nmap -p ${portString} --open --max-retries 1 --host-timeout 10s -T4 -oG - ${ipList.join(' ')}`;
    const timeout = Math.min(60000, ipList.length * 1000); // Динамический таймаут
    
    console.log(`[Scanner] Запуск nmap для ${ipList.length} IP адресов`);
    
    // Используем nmap для быстрого сканирования
    const { stdout } = await execAsync(command, {
      timeout: timeout,
      maxBuffer: 10 * 1024 * 1024 // 10MB буфер
    });
    
    const lines = stdout.split('\n');
    
    for (const line of lines) {
      if (line.includes('Ports:')) {
        const ipMatch = line.match(/Host: (\d+\.\d+\.\d+\.\d+)/);
        const portsMatch = line.match(/Ports: ([^\/]+)/);
        
        if (ipMatch && portsMatch) {
          const ip = ipMatch[1];
          const openPorts = portsMatch[1].split(',')
            .map(port => {
              const portNum = parseInt(port.split('/')[0].trim());
              return portNum;
            })
            .filter(port => !isNaN(port) && ports.includes(port));
          
          // Обрабатываем каждый открытый порт
          for (const port of openPorts) {
            const printerInfo: PrinterInfo = {
              ip,
              port,
              status: 'online',
              lastSeen: new Date()
            };

            try {
              const details = await getPrinterDetails(ip, port);
              Object.assign(printerInfo, details);
              
              // Добавляем только если это устройство со сканером
              if (details.hasScanner || details.scannerType) {
                results.push(printerInfo);
                console.log(`[Scanner] Nmap: найден принтер со сканером: ${ip}:${port} (${details.scannerType || 'MFP'})`);
              }
            } catch (error) {
              console.warn(`[Scanner] Не удалось получить детали принтера ${ip}:${port}`);
            }
          }
        }
      }
    }
    
    console.log(`[Scanner] Nmap сканирование завершено, найдено ${results.length} принтеров со сканерами`);
    return results;
  } catch (error) {
    console.warn('[Scanner] Ошибка nmap сканирования:', error);
    throw error;
  }
}
