import { Request, Response } from 'express';
import { z } from 'zod';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as net from 'net';
import * as dns from 'dns';

const execAsync = promisify(exec);

// Схемы валидации
const networkScanSchema = z.object({
  networkRange: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/).optional(),
  startIp: z.string().ip().optional(),
  endIp: z.string().ip().optional(),
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
export const scanNetworkForPrinters = async (req: Request, res: Response): Promise<void> => {
  try {
    const { networkRange, startIp, endIp, ports } = networkScanSchema.parse(req.body);
    
    const startTime = Date.now();
    let ipList: string[] = [];

    if (networkRange) {
      ipList = await expandNetworkRange(networkRange);
    } else if (startIp && endIp) {
      ipList = await generateIpRange(startIp, endIp);
    } else {
      // Сканируем локальную сеть по умолчанию
      ipList = await getLocalNetworkIps();
    }

    const results: PrinterInfo[] = [];
    const errors: string[] = [];

    // Попробуем сначала nmap для быстрого сканирования (только на Linux)
    if (process.platform !== 'win32') {
      try {
        const nmapResults = await scanWithNmap(ipList, ports);
        results.push(...nmapResults);
        console.log(`[Scanner] Nmap нашел ${nmapResults.length} принтеров со сканерами`);
      } catch (error) {
        console.warn('[Scanner] Nmap сканирование не удалось, используем ручное сканирование:', error);
      }
    }
    
    // Если nmap не сработал или это Windows, используем ручное сканирование
    if (results.length === 0) {
      console.log('[Scanner] Используем ручное сканирование...');
      const batchSize = 50;
      for (let i = 0; i < ipList.length; i += batchSize) {
        const batch = ipList.slice(i, i + batchSize);
        const batchPromises = batch.map(async (ip) => {
          for (const port of ports) {
            try {
              const isOnline = await checkPortOpen(ip, port, 2000);
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
                    results.push(printerInfo);
                    console.log(`[Scanner] Найден принтер со сканером: ${ip}:${port} (${details.scannerType || 'MFP'})`);
                  }
                } catch (error) {
                  console.warn(`[Scanner] Не удалось получить детали принтера ${ip}:${port}`);
                }
                break; // Найден принтер на одном из портов, переходим к следующему IP
              }
            } catch (error) {
              errors.push(`Ошибка сканирования ${ip}:${port}: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
            }
          }
        });

        await Promise.all(batchPromises);
      }
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
      res.status(400).json({
        success: false,
        error: 'Ошибка валидации',
        details: error.errors
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Ошибка сканирования сети',
        message: error instanceof Error ? error.message : 'Неизвестная ошибка'
      });
    }
  }
};

// Получение списка известных принтеров
export const getKnownPrinters = async (req: Request, res: Response): Promise<void> => {
  try {
    // В реальном приложении здесь будет запрос к БД
    // Пока возвращаем пустой массив
    res.json({
      success: true,
      printers: []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Ошибка получения списка принтеров',
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

// Получение информации через SNMP
async function getSnmpInfo(ip: string): Promise<{ vendor?: string; model?: string }> {
  const result: { vendor?: string; model?: string } = {};
  
  try {
    // Получаем системную информацию
    const { stdout: sysInfo } = await execAsync(`snmpget -v2c -c public ${ip} 1.3.6.1.2.1.1.1.0`, { timeout: 3000 });
    
    if (sysInfo.includes('No Such Object') || sysInfo.includes('No Such Instance')) {
      return result;
    }

    // Извлекаем информацию о системе
    const systemInfo = sysInfo.split('\n')[0];
    
    // Ищем известных производителей
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
      if (pattern.test(systemInfo)) {
        result.vendor = name;
        break;
      }
    }

    // Пытаемся получить модель через SNMP
    try {
      const { stdout: modelInfo } = await execAsync(`snmpget -v2c -c public ${ip} 1.3.6.1.2.1.25.3.2.1.3.1`, { timeout: 3000 });
      if (!modelInfo.includes('No Such Object') && !modelInfo.includes('No Such Instance')) {
        result.model = modelInfo.split('\n')[0].trim();
      }
    } catch {
      // Игнорируем ошибки получения модели
    }

    return result;
  } catch {
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
    // Определяем операционную систему
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      return await getWindowsNetworkIps();
    } else {
      return await getLinuxNetworkIps();
    }
  } catch (error) {
    console.error('[Scanner] Критическая ошибка определения локальной сети:', error);
    throw new Error('Не удалось определить локальную сеть сервера. Проверьте сетевое подключение.');
  }
}

// Получение IP для Windows
async function getWindowsNetworkIps(): Promise<string[]> {
  try {
    // Получаем информацию о сетевых адаптерах через ipconfig
    const { stdout } = await execAsync('ipconfig /all');
    const lines = stdout.split('\n');
    
    const networks: string[] = [];
    let currentAdapter = '';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Определяем адаптер
      if (trimmedLine.includes('адаптер') || trimmedLine.includes('Adapter')) {
        currentAdapter = trimmedLine;
        continue;
      }
      
      // Ищем IPv4 адреса
      const ipMatch = trimmedLine.match(/IPv4.*?(\d+\.\d+\.\d+\.\d+)/);
      if (ipMatch && currentAdapter && !currentAdapter.includes('Loopback')) {
        const ip = ipMatch[1];
        
        // Пропускаем loopback и нестандартные адреса
        if (ip.startsWith('127.') || ip.startsWith('169.254.')) {
          continue;
        }
        
        // Для Windows предполагаем /24 подсеть
        const ipParts = ip.split('.').map(Number);
        const networkBase = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
        
        // Генерируем IP адреса в подсети
        for (let i = 1; i < 255; i++) {
          networks.push(`${networkBase}.${i}`);
        }
        
        console.log(`Найдена подсеть Windows: ${networkBase}.0/24 (${networks.length} адресов)`);
      }
    }
    
    if (networks.length > 0) {
      console.log(`Всего найдено ${networks.length} IP адресов в Windows сетях`);
      return networks;
    }
    
    // Fallback - используем arp для получения активных хостов
    try {
      console.log('Попытка обнаружения активных хостов через arp...');
      const { stdout: arpOut } = await execAsync('arp -a');
      const arpLines = arpOut.split('\n');
      
      const activeHosts: string[] = [];
      for (const line of arpLines) {
        const ipMatch = line.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (ipMatch) {
          const ip = ipMatch[1];
          if (!ip.startsWith('127.') && !ip.startsWith('169.254.')) {
            activeHosts.push(ip);
          }
        }
      }
      
      if (activeHosts.length > 0) {
        console.log(`ARP обнаружил ${activeHosts.length} активных хостов`);
        return activeHosts;
      }
    } catch (arpError) {
      console.warn('ARP сканирование не удалось:', arpError);
    }
    
    throw new Error('Не удалось определить локальную сеть Windows');
  } catch (error) {
    console.error('Ошибка определения Windows сети:', error);
    throw error;
  }
}

// Получение IP для Linux/Docker
async function getLinuxNetworkIps(): Promise<string[]> {
  try {
    // Получаем информацию о сетевых интерфейсах с масками подсети
    const { stdout } = await execAsync('ip addr show | grep -E "inet [0-9]"');
    const interfaces = stdout.trim().split('\n');
    
    const networks: string[] = [];
    
    for (const interfaceInfo of interfaces) {
      // Извлекаем IP и маску подсети (например: inet 192.168.1.100/24)
      const inetMatch = interfaceInfo.match(/inet (\d+\.\d+\.\d+\.\d+)\/(\d+)/);
      if (inetMatch) {
        const ip = inetMatch[1];
        const cidr = parseInt(inetMatch[2]);
        
        // Пропускаем loopback и нестандартные подсети
        if (ip.startsWith('127.') || ip.startsWith('169.254.') || cidr < 16) {
          continue;
        }
        
        const ipParts = ip.split('.').map(Number);
        const ipNum = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
        
        // Вычисляем маску подсети
        const mask = (0xFFFFFFFF << (32 - cidr)) >>> 0;
        const networkAddress = ipNum & mask;
        const broadcastAddress = networkAddress | (~mask >>> 0);
        
        // Генерируем IP адреса в подсети
        for (let i = networkAddress + 1; i < broadcastAddress; i++) {
          const ip = `${(i >>> 24) & 0xFF}.${(i >>> 16) & 0xFF}.${(i >>> 8) & 0xFF}.${i & 0xFF}`;
          networks.push(ip);
        }
        
        console.log(`Найдена подсеть Linux: ${ip}/${cidr} (${networks.length} адресов)`);
      }
    }
    
    if (networks.length > 0) {
      console.log(`Всего найдено ${networks.length} IP адресов в Linux сетях`);
      return networks;
    }
    
    // Fallback - используем nmap для обнаружения активных хостов
    try {
      console.log('Попытка обнаружения активных хостов через nmap...');
      const { stdout: nmapOut } = await execAsync('nmap -sn 192.168.0.0/16 10.0.0.0/8 172.16.0.0/12 | grep -E "Nmap scan report" | grep -oE "([0-9]{1,3}\\.){3}[0-9]{1,3}"', {
        timeout: 60000 // 60 секунд
      });
      
      const activeHosts = nmapOut.trim().split('\n').filter(host => host.match(/^\d+\.\d+\.\d+\.\d+$/));
      
      if (activeHosts.length > 0) {
        console.log(`Nmap обнаружил ${activeHosts.length} активных хостов`);
        return activeHosts;
      }
    } catch (nmapError) {
      console.warn('Nmap сканирование не удалось:', nmapError);
    }
    
    throw new Error('Не удалось определить локальную сеть Linux');
  } catch (error) {
    console.error('Ошибка определения Linux сети:', error);
    throw error;
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
    const isWindows = process.platform === 'win32';
    const portString = ports.join(',');
    
    let command: string;
    let timeout = 30000;
    
    if (isWindows) {
      // Для Windows используем PowerShell или ограничиваем количество IP
      if (ipList.length > 50) {
        // Ограничиваем количество IP для Windows
        ipList = ipList.slice(0, 50);
        console.log(`Windows: ограничиваем сканирование до ${ipList.length} IP`);
      }
      command = `nmap -p ${portString} --open -oG - ${ipList.join(' ')}`;
    } else {
      command = `nmap -p ${portString} --open -oG - ${ipList.join(' ')}`;
    }
    
    // Используем nmap для быстрого сканирования
    const { stdout } = await execAsync(command, {
      timeout: timeout
    });
    
    const results: PrinterInfo[] = [];
    const lines = stdout.split('\n');
    
    for (const line of lines) {
      if (line.includes('Ports:')) {
        const ipMatch = line.match(/Host: (\d+\.\d+\.\d+\.\d+)/);
        const portsMatch = line.match(/Ports: ([^\/]+)/);
        
        if (ipMatch && portsMatch) {
          const ip = ipMatch[1];
          const openPorts = portsMatch[1].split(',').map(port => {
            const portNum = parseInt(port.split('/')[0]);
            return portNum;
          }).filter(port => !isNaN(port));
          
          for (const port of openPorts) {
            if (ports.includes(port)) {
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
                  console.log(`Nmap: найден принтер со сканером: ${ip}:${port} (${details.scannerType || 'MFP'})`);
                }
              } catch (error) {
                console.warn(`Не удалось получить детали принтера ${ip}:${port}`);
              }

              break; // Найден принтер на одном из портов
            }
          }
        }
      }
    }
    
    return results;
  } catch (error) {
    console.warn('Ошибка nmap сканирования:', error);
    throw error;
  }
}
