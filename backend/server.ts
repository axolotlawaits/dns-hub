import 'dotenv/config';

console.log('🚀 Starting server...');

import express from 'express';
import cors from "cors"
import { PrismaClient } from "@prisma/client"
import path from 'path'

import userRouter from './routes/app/user.js'
import accessRouter from './routes/app/access.js'
import newsRouter from './routes/app/news.js'
import deviceRouter from './routes/app/device.js'
import radioRouter from './routes/app/radio.js'
import logsRouter from './routes/app/logs.js'
import meterReadingRouter from './routes/aho/meterReading.js'
import searchRouter from './routes/app/search.js'
import profileRouter from './routes/app/profile.js'
import eventsRouter from './routes/app/events.js'
import bookmarksRouter from './routes/app/bookmarks.js'
import notificationRouter from './routes/app/notification.js'
import correspondenceRouter from './routes/aho/correspondence.js'
import supplydocsRouter from './routes/accounting/supplydocs.js'
import rocRouter from './routes/accounting/roc.js'
import navigationRouter from './routes/app/navigation.js'
import typeRouter from './routes/app/type.js'
import routeDayRouter from './routes/supply/routeDay.js'
import routeRouter from './routes/supply/route.js'
import filialRouter from './routes/supply/filial.js'
import mediaRouter from './routes/add/media.js'
import rkRouter from './routes/add/rk.js'
import sliderRouter from './routes/add/slider.js'
import merchRouter from './routes/retail/merch.js'
import printServiceRouter from './routes/retail/printService.js'
import appStoreRouter from './routes/retail/appStore.js'
import trassirRouter from './routes/retail/trassir.js'
import shopRouter from './routes/retail/shop.js'
import adminRouter from './routes/admin.js'
import telegramRouter  from './routes/app/telegram.js'
import exchangeRouter from './routes/app/exchange.js'
import bugReportsRouter from './routes/app/bugReports.js'
import branchesRouter from './routes/admin/branches.js'
import usersRouter from './routes/admin/users.js'
import analyticsRouter from './routes/admin/analytics.js'
import auditRouter from './routes/admin/audit.js'
import pollRouter from './routes/app/poll.js'

import fs from 'fs'
import cookieParser from 'cookie-parser'
import { refreshToken } from './middleware/auth.js';
import { hsts, clearSensitiveData } from './middleware/security.js';
import { createServer } from 'http';
import { SocketIOService } from './socketio.js';
import { telegramService } from './controllers/app/telegram.js';
import { merchBotService } from './controllers/app/merchBot.js';
import { trassirService } from './controllers/app/trassirService.js';
import { initToolsCron } from './tasks/cron.js';
import promBundle from 'express-prom-bundle'

const app = express()


export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
})

const __dirname = path.resolve()

// Настройка доверия к прокси для правильного определения IP адресов
app.set('trust proxy', true);

const server = createServer(app);

const socketService = SocketIOService.getInstance();
socketService.initialize(server);


export const accessPrivateKey = fs.readFileSync(path.join(__dirname, 'keys/access_private.pem'), 'utf8');

export const accessPublicKey = fs.readFileSync(path.join(__dirname, 'keys/access_public.pem'), 'utf8');
export const refreshPrivateKey = fs.readFileSync(path.join(__dirname, 'keys/refresh_private.pem'), 'utf8');
export const refreshPublicKey = fs.readFileSync(path.join(__dirname, 'keys/refresh_public.pem'), 'utf8');


const allowedOrigins = process.env.NODE_ENV === 'production'  ? ['https://dns-zs.partner.ru', 'http://10.11.145.196']  : ['http://localhost:5173', 'http://localhost:5174', 'http://10.11.145.196:5173', 'http://10.11.145.196:5174', 'http://10.11.145.85:5173'];
export const API = process.env.NODE_ENV === 'production' ? `https://dns-zs.partner.ru/hub-api` : 'http://localhost:2000/hub-api';
export const APIWebSocket = process.env.NODE_ENV === 'production' ? `https://dns-zs.partner.ru/ws` : 'http://localhost:2000/ws';


const corsOptions: cors.CorsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  exposedHeaders: ['Content-Disposition', 'Content-Type', 'Content-Length']
}

const metricsMiddleware = promBundle({
  metricsPath: '/hub-api/metrics',
  includeMethod: true,
  includePath: true
});

// Trust proxy для правильного определения IP адресов
app.set('trust proxy', 1);

// Security middleware - применяем до всех роутов
app.use(hsts); // HSTS headers для HTTPS соединений
app.use(clearSensitiveData); // Очистка чувствительных данных после запроса

// CORS должен идти ДО любых лимитеров и роутов, чтобы preflight получал заголовки
app.use(cors(corsOptions))
// Явная обработка preflight (без path-to-regexp конфликтов)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = (req.headers.origin as string) || allowedOrigins[0];
    if (origin && allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.status(204).end();
    return;
  }
  next();
})


app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.json())
app.use(cookieParser())
app.use(metricsMiddleware)

// Аутентификация
app.use('/hub-api/user', userRouter)

// Bug reports
app.use('/hub-api/bug-reports', bugReportsRouter);

// Admin routes (только для DEVELOPER)
app.use('/hub-api/admin/branches', branchesRouter);
app.use('/hub-api/admin/users', usersRouter);
app.use('/hub-api/admin/analytics', analyticsRouter);
app.use('/hub-api/admin/audit', auditRouter);

// Остальные роуты
app.use('/hub-api/access', accessRouter)
app.use('/hub-api/news', newsRouter)
app.use('/hub-api/device', deviceRouter)
app.use('/hub-api/radio', radioRouter)
app.use('/hub-api/profile', profileRouter)
app.use('/hub-api/telegram', telegramRouter)

// Exchange роутер

app.use('/hub-api/exchange', exchangeRouter)

// Ленивая загрузка merch-bot роутера (только если боты включены)
if (process.env.ENABLE_BOTS !== 'false') {
  let merchBotRouterLoaded = false;
  let merchBotRouter: any = null;

  app.use('/hub-api/merch-bot', async (req, res, next) => {
    if (!merchBotRouterLoaded) {
      try {
        const { default: router } = await import('./routes/app/merchBot.js');
        merchBotRouter = router;
        merchBotRouterLoaded = true;
        console.log('✅ [Server] Merch bot router loaded lazily');
      } catch (error) {
        console.error('❌ [Server] Failed to load merch bot router:', error);
        return res.status(500).json({ error: 'Merch bot router not available' });
      }
    }
    
    if (merchBotRouter) {
      return merchBotRouter(req, res, next);
    }
    
    next();
  });
} else {
  // Если боты отключены, возвращаем 503
  app.use('/hub-api/merch-bot', (req, res) => {
    res.status(503).json({ error: 'Merch bot service disabled' });
  });
}

app.use('/hub-api/events', eventsRouter)
app.use('/hub-api/bookmarks', bookmarksRouter)
app.use('/hub-api/notifications', notificationRouter)
app.use('/hub-api/polls', pollRouter)
app.use('/hub-api/aho/meter-reading', meterReadingRouter)
app.use('/hub-api/aho/correspondence', correspondenceRouter)
app.use('/hub-api/accounting/supply-docs', supplydocsRouter)
app.use('/hub-api/accounting/roc', rocRouter)
// Файловые загрузки
app.use('/hub-api/add/media', mediaRouter)
app.use('/hub-api/add/rk', rkRouter)
app.use('/hub-api/add/sliders', sliderRouter)
app.use('/hub-api/retail/merch', merchRouter) // Дублируем маршрут для retail
app.use('/hub-api/retail/print-service', printServiceRouter);
app.use('/hub-api/retail/app-store', appStoreRouter);
app.use('/hub-api/retail/shop', shopRouter);
app.use('/hub-api/trassir', trassirRouter);

// Остальные роуты
app.use('/hub-api/radio', adminRouter)
app.use('/hub-api/logs', logsRouter)
app.use('/hub-api/search', searchRouter)
app.use('/hub-api/navigation', navigationRouter);
app.use('/hub-api/type', typeRouter);

// Ленивая загрузка scanner роутера
let scannerRouterLoaded = false;
let scannerRouter: any = null;

app.use('/hub-api/scanner', async (req, res, next) => {
  if (!scannerRouterLoaded) {
    try {
      const { default: router } = await import('./routes/scanner/scanner.js');
      scannerRouter = router;
      scannerRouterLoaded = true;
      console.log('✅ [Server] Scanner router loaded lazily');
    } catch (error) {
      console.error('❌ [Server] Failed to load scanner router:', error);
      return res.status(500).json({ error: 'Scanner router not available' });
    }
  }
  
  if (scannerRouter) {
    return scannerRouter(req, res, next);
  }
  
  next();
});

// Временный fallback для настроек пользователя (исключает 404 в dev и не ломает UI)
app.get('/hub-api/user/settings/:userId/auto_hide_footer', (req, res) => {
  res.json({ value: false });
});

app.get('/hub-api/user/settings/:userId/nav_menu_mode', (req, res) => {
  res.json({ value: 'auto' });
});

// Ленивая загрузка safety journal роутера
let safetyJournalRouterLoaded = false;
let safetyJournalRouter: any = null;

app.use('/hub-api/jurists/safety', async (req, res, next) => {
  if (!safetyJournalRouterLoaded) {
    try {
      const { default: router } = await import('./routes/jurists/safetyJournal.js');
      safetyJournalRouter = router;
      safetyJournalRouterLoaded = true;
      console.log('✅ [Server] Safety journal router loaded lazily');
    } catch (error) {
      console.error('❌ [Server] Failed to load safety journal router:', error);
      return res.status(500).json({ error: 'Safety journal router not available' });
    }
  }
  
  if (safetyJournalRouter) {
    return safetyJournalRouter(req, res, next);
  }
  
  next();
});
/* loader (mb fix later) */
app.use('/hub-api/loaders/route', routeRouter)
app.use('/hub-api/loaders/routeDay', routeDayRouter)
app.use('/hub-api/loaders/filial', filialRouter)

app.post('/hub-api/refresh-token', refreshToken)

// Статические файлы должны быть ПОСЛЕ всех роутов, чтобы не перехватывать API запросы
// Доступ к файлам по пути /hub-api/public/...
app.use('/hub-api/public', express.static(path.join(__dirname, 'public')))
// И прямой доступ по /public/... (для совместимости)
app.use('/public', express.static(path.join(__dirname, 'public')))

console.log('🚀 Server starting...');

// Оптимизированный запуск сервера
const port = process.env.PORT || 2000;


server.listen(port, async function() {
  
  // Условная инициализация cron задач
  if (process.env.ENABLE_CRON !== 'false') {
    setImmediate(() => {
      initToolsCron();
    });
  } else {
  }
  
  // Условная загрузка ботов (только если включены)
  if (process.env.ENABLE_BOTS !== 'false') {
    
    // Запуск ботов асинхронно в фоне (не блокируем старт сервера)
    setImmediate(async () => {
      
      // Загрузка дверей Trassir
      trassirService.loadDoors().catch(err => console.error('Failed to load Trassir doors:', err));

      // Запуск Telegram бота (не блокируем Merch бота)
      (async () => {
        try {
          const botStarted = await telegramService.launch();
          if (botStarted) {
            console.log('✅ [Server] Telegram bot started successfully');
          } else {
            console.log('❌ [Server] Telegram bot failed to start - check .env file');
          }
        } catch (error) {
          if (error instanceof Error && !error.message.includes('Conflict') && !error.message.includes('terminated by other getUpdates request')) {
            console.error('[Server] Failed to start Telegram bot:', error.message);
          }
        }
      })();


      // Ленивая загрузка и запуск Merch бота (независимо от Telegram бота)
      // Используем более длительную задержку для продакшена, чтобы убедиться, что все готово
      const merchBotDelay = process.env.NODE_ENV === 'production' ? 10000 : 5000;
      setTimeout(async () => {
        try {
          
          // Проверяем переменные окружения ДО импорта
          const hasToken = !!process.env.MERCH_BOT_TOKEN;
          const hasBotName = !!process.env.MERCH_BOT_NAME;
          const enableBots = process.env.ENABLE_BOTS !== 'false';
          
          if (!enableBots) {
            return;
          }
          
          if (!hasToken) {
            console.error('[Server] MERCH_BOT_TOKEN not found');
            return;
          }
          
          if (!hasBotName) {
            console.error('[Server] MERCH_BOT_NAME not found');
            return;
          }
          
          const statusBefore = merchBotService.status;
          
          if (!statusBefore.botInitialized) {
            console.error('[Server] Merch bot not initialized');
            return;
          }
          
          const merchBotStarted = await merchBotService.launch();
          
          if (!merchBotStarted) {
            console.error('[Server] Merch bot failed to start');
          }
        } catch (error) {
          console.error('[Server] Failed to load/start Merch bot:', error instanceof Error ? error.message : error);
        }

      }, merchBotDelay);

      // Запуск Trassir бота (независимо от Merch бота)
      setTimeout(async () => {
        try {
          // TrassirBot отключен - функционал дверей перенесен в основной Telegram бот
          if (process.env.TRASSIR_ADDRESS) {
          } else {
          }
        } catch (error) {
          console.error('[Server] Failed to start Trassir bot:', error instanceof Error ? error.message : error);
        }
      }, 3000);
    });
  } else {
  }
  
});