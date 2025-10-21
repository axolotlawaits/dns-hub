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
import meterReadingRouter from './routes/aho/meterReading.js'
import searchRouter from './routes/app/search.js'
import profileRouter from './routes/app/profile.js'
import birthdayRouter from './routes/app/birthday.js'
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
import merchRouter from './routes/add/merch.js'
import printServiceRouter from './routes/retail/printService.js'
import appStoreRouter from './routes/retail/appStore.js'
import adminRouter from './routes/admin.js'
import telegramRouter  from './routes/app/telegram.js'
import bugReportsRouter from './routes/app/bugReports.js'

import fs from 'fs'
import cookieParser from 'cookie-parser'
import { refreshToken } from './middleware/auth.js';
import { createServer } from 'http';
import { SocketIOService } from './socketio.js';
import { telegramService } from './controllers/app/telegram.js';
import { initToolsCron } from './tasks/cron.js';


const app = express()


// Оптимизированное подключение к Prisma
const getDatabaseUrl = () => {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }
  
  // Проверяем, есть ли уже параметры в URL
  const hasParams = baseUrl.includes('?');
  const separator = hasParams ? '&' : '?';
  
  const params = process.env.NODE_ENV === 'development' 
    ? 'connection_limit=2&pool_timeout=5&connect_timeout=5'
    : 'connection_limit=10&pool_timeout=20';
    
  return `${baseUrl}${separator}${params}`;
};

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error'] : ['error'],
  datasources: {
    db: {
      url: getDatabaseUrl()
    }
  },
  // Дополнительные оптимизации для dev режима
  ...(process.env.NODE_ENV === 'development' && {
    errorFormat: 'minimal'
  })
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


const allowedOrigins = process.env.NODE_ENV === 'production'  ? ['https://dns-zs.partner.ru', 'http://10.11.145.196']  : ['http://localhost:5173', 'http://localhost:5174', 'http://10.11.145.196:5173', 'http://10.11.145.196:5174'];
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

// const corsOptions = {
//   origin: allowedOrigins,
//   credentials: true,                
// }

// Trust proxy для правильного определения IP адресов
app.set('trust proxy', 1);

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
app.use(express.static(path.join(__dirname, 'public')))

app.use("/hub-api", express.static(__dirname))



// Аутентификация
app.use('/hub-api/user', userRouter)

// Bug reports
app.use('/hub-api/bug-reports', bugReportsRouter);

// Остальные роуты
app.use('/hub-api/access', accessRouter)
app.use('/hub-api/news', newsRouter)
app.use('/hub-api/device', deviceRouter)
app.use('/hub-api/radio', radioRouter)
app.use('/hub-api/profile', profileRouter)
app.use('/hub-api/telegram', telegramRouter)

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

app.use('/hub-api/birthday', birthdayRouter)
app.use('/hub-api/bookmarks', bookmarksRouter)
app.use('/hub-api/notifications', notificationRouter)
app.use('/hub-api/aho/meter-reading', meterReadingRouter)
app.use('/hub-api/aho/correspondence', correspondenceRouter)
app.use('/hub-api/accounting/supply-docs', supplydocsRouter)
app.use('/hub-api/accounting/roc', rocRouter)
// Файловые загрузки
app.use('/hub-api/add/media', mediaRouter)
app.use('/hub-api/add/rk', rkRouter)
app.use('/hub-api/add/sliders', sliderRouter)
app.use('/hub-api/add/merch', merchRouter)
app.use('/hub-api/retail/print-service', printServiceRouter);
app.use('/hub-api/retail/app-store', appStoreRouter);

// Остальные роуты
app.use('/hub-api/radio', adminRouter)
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

// Временный fallback для настройки футера (исключает 404 в dev и не ломает UI)
app.get('/hub-api/user/settings/:userId/auto_hide_footer', (req, res) => {
  res.json({ value: false });
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

console.log('🚀 Server starting...');

// Оптимизированный запуск сервера
const port = process.env.PORT || 2000;


server.listen(port, async function() {
  
  // Условная инициализация cron задач
  if (process.env.ENABLE_CRON !== 'false') {
    setImmediate(() => {
      console.log('⏰ [Server] Инициализируем cron задачи...');
      initToolsCron();
    });
  } else {
    console.log('🚫 [Server] Cron tasks disabled (ENABLE_CRON=false)');
  }
  
  // Условная загрузка ботов (только если включены)
  if (process.env.ENABLE_BOTS !== 'false') {
    console.log('🤖 [Server] Bots enabled, starting in background...');
    
    // Запуск ботов асинхронно в фоне (не блокируем старт сервера)
    setImmediate(async () => {
      // Запуск Telegram бота
      try {
        console.log('🤖 [Server] Запускаем Telegram бота...');
        const botStarted = await telegramService.launch();
        if (botStarted) {
          console.log('✅ [Server] Telegram bot started successfully');
        } else {
          console.log('❌ [Server] Telegram bot failed to start - check .env file');
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('Conflict: terminated by other getUpdates request')) {
          console.log('⚠️ [Server] Telegram bot conflict detected - another instance may be running');
        } else {
          console.error('❌ [Server] Failed to start Telegram bot:', error);
        }
      }

      // Ленивая загрузка и запуск Merch бота
      setTimeout(async () => {
        try {
          console.log('🤖 [Server] Загружаем и запускаем Merch бота...');
          const { merchBotService } = await import('./controllers/app/merchBot.js');
          const merchBotStarted = await merchBotService.launch();
          
          if (merchBotStarted) {
            console.log('✅ [Server] Merch bot started successfully');
          } else {
            console.log('❌ [Server] Merch bot failed to start - check .env file');
          }
        } catch (error) {
          console.error('❌ [Server] Failed to load/start Merch bot:', error);
        }
      }, 5000); // Увеличиваем задержку до 5 секунд для ленивой загрузки
    });
  } else {
    console.log('🚫 [Server] Bots disabled (ENABLE_BOTS=false)');
  }
  
  console.log('🎉 [Server] Startup completed successfully!');
});