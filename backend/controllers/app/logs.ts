import { Request, Response } from 'express';

// Хранилище для клиентов SSE
const sseClients = new Set<Response>();

// Перехватываем console.log для отправки логов клиентам
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;
const originalConsoleDebug = console.debug;

// Функция для добавления нового клиента
export const addSSEClient = (res: Response) => {
  sseClients.add(res);
  
  // Отправляем приветственное сообщение
  res.write(`data: ${JSON.stringify({ 
    type: 'connected', 
    message: 'Подключен к потоковым логам' 
  })}\n\n`);
  
  console.log(`📡 [SSE] Новый клиент подключен. Всего клиентов: ${sseClients.size}`);
  
  // Обработка отключения клиента
  res.on('close', () => {
    sseClients.delete(res);
    console.log(`📡 [SSE] Клиент отключен. Осталось клиентов: ${sseClients.size}`);
  });
};

// Функция для отправки лога всем подключенным клиентам
export const broadcastLog = (logData: {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  source?: string;
  data?: any;
}) => {
  const message = `data: ${JSON.stringify(logData)}\n\n`;
  
  sseClients.forEach((client) => {
    try {
      client.write(message);
    } catch (error) {
      // Если клиент отключен, удаляем его
      sseClients.delete(client);
    }
  });
};

// Переопределяем console методы для автоматической отправки логов
console.log = (...args: any[]) => {
  originalConsoleLog(...args);
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  
  // Отправляем все логи (фильтрация теперь на клиенте)
  broadcastLog({
    level: 'info',
    message,
    timestamp: new Date().toISOString(),
    source: 'console'
  });
};

console.error = (...args: any[]) => {
  originalConsoleError(...args);
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  broadcastLog({
    level: 'error',
    message,
    timestamp: new Date().toISOString(),
    source: 'console'
  });
};

console.warn = (...args: any[]) => {
  originalConsoleWarn(...args);
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  broadcastLog({
    level: 'warn',
    message,
    timestamp: new Date().toISOString(),
    source: 'console'
  });
};

console.info = (...args: any[]) => {
  originalConsoleInfo(...args);
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  broadcastLog({
    level: 'info',
    message,
    timestamp: new Date().toISOString(),
    source: 'console'
  });
};

console.debug = (...args: any[]) => {
  originalConsoleDebug(...args);
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  broadcastLog({
    level: 'debug',
    message,
    timestamp: new Date().toISOString(),
    source: 'console'
  });
};

// SSE endpoint для подключения к логам
export const streamLogs = async (req: Request, res: Response) => {
  try {
    // Устанавливаем заголовки для SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Важно для nginx
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');
    
    // Добавляем клиента в список подписчиков
    addSSEClient(res);
    
    // Отправляем текущие логи (последние 50)
    // В будущем можно добавить буфер недавних логов
    
  } catch (error) {
    console.error('Error in SSE stream:', error);
    res.status(500).end();
  }
};

// Получение последних логов (для REST API)
export const getRecentLogs = async (req: Request, res: Response) => {
  try {
    const { limit = 100 } = req.query;
    
    // В текущей реализации возвращаем информацию о SSE подключениях
    // В будущем можно добавить буфер логов
    res.json({
      success: true,
      data: {
        connectedClients: sseClients.size,
        message: 'Для получения логов в реальном времени используйте SSE endpoint'
      }
    });
  } catch (error) {
    console.error('Error getting recent logs:', error);
    res.status(500).json({ success: false, error: 'Ошибка получения логов' });
  }
};

