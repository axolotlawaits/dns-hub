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
import merchRouter from './routes/retail/merch.js'
import printServiceRouter from './routes/retail/printService.js'
import appStoreRouter from './routes/retail/appStore.js'
import adminRouter from './routes/admin.js'
import telegramRouter  from './routes/app/telegram.js'
import bugReportsRouter from './routes/app/bugReports.js'
import branchesRouter from './routes/admin/branches.js'
import usersRouter from './routes/admin/users.js'
import systemRouter from './routes/admin/system.js'
import analyticsRouter from './routes/admin/analytics.js'
import auditRouter from './routes/admin/audit.js'

import fs from 'fs'
import cookieParser from 'cookie-parser'
import { refreshToken } from './middleware/auth.js';
import { createServer } from 'http';
import { SocketIOService } from './socketio.js';
import { telegramService } from './controllers/app/telegram.js';
import { merchBotService } from './controllers/app/merchBot.js';
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

// Аутентификация
app.use('/hub-api/user', userRouter)

// Bug reports
app.use('/hub-api/bug-reports', bugReportsRouter);

// Admin routes (только для DEVELOPER)
app.use('/hub-api/admin/branches', branchesRouter);
app.use('/hub-api/admin/users', usersRouter);
app.use('/hub-api/admin/system', systemRouter);
app.use('/hub-api/admin/analytics', analyticsRouter);
app.use('/hub-api/admin/audit', auditRouter);

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
app.use('/hub-api/retail/merch', merchRouter) // Дублируем маршрут для retail
app.use('/hub-api/retail/print-service', printServiceRouter);
app.use('/hub-api/retail/app-store', appStoreRouter);

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
      console.log('🔄 [Server] setImmediate выполняется...');
      
      // Запуск Telegram бота (не блокируем Merch бота)
      (async () => {
        try {
          console.log('🤖 [Server] Запускаем Telegram бота...');
          console.log('⏳ [Server] Вызываем telegramService.launch()...');
          const botStarted = await telegramService.launch();
          console.log('✅ [Server] telegramService.launch() завершен, результат:', botStarted);
          if (botStarted) {
            console.log('✅ [Server] Telegram bot started successfully');
          } else {
            console.log('❌ [Server] Telegram bot failed to start - check .env file');
          }
        } catch (error) {
          console.error('❌ [Server] Ошибка в блоке try для Telegram бота:', error);
          if (error instanceof Error && error.message.includes('Conflict: terminated by other getUpdates request')) {
            console.log('⚠️ [Server] Telegram bot conflict detected - another instance may be running');
          } else {
            console.error('❌ [Server] Failed to start Telegram bot:', error);
          }
        }
      })();

      console.log('✅ [Server] Telegram bot запущен в фоне, переходим к Merch боту...');

      // Ленивая загрузка и запуск Merch бота (независимо от Telegram бота)
      // Используем более длительную задержку для продакшена, чтобы убедиться, что все готово
      const merchBotDelay = process.env.NODE_ENV === 'production' ? 10000 : 5000;
      console.log(`⏳ [Server] Планируем запуск Merch бота через ${merchBotDelay / 1000} секунд...`);
      setTimeout(async () => {
        try {
          console.log('🤖 [Server] Загружаем и запускаем Merch бота...');
          console.log('📦 [Server] Импортируем модуль merchBot...');
          
          // Проверяем переменные окружения ДО импорта
          const hasToken = !!process.env.MERCH_BOT_TOKEN;
          const hasBotName = !!process.env.MERCH_BOT_NAME;
          const enableBots = process.env.ENABLE_BOTS !== 'false';
          
          console.log('🔍 [Server] Проверка переменных окружения:');
          console.log('  - ENABLE_BOTS:', enableBots ? 'включено' : 'выключено');
          console.log('  - MERCH_BOT_TOKEN:', hasToken ? 'найден' : 'НЕ НАЙДЕН');
          console.log('  - MERCH_BOT_NAME:', hasBotName ? `найден (${process.env.MERCH_BOT_NAME})` : 'НЕ НАЙДЕН');
          
          if (!enableBots) {
            console.log('⚠️ [Server] Боты отключены (ENABLE_BOTS=false), пропускаем запуск Merch бота');
            return;
          }
          
          if (!hasToken) {
            console.error('❌ [Server] MERCH_BOT_TOKEN не найден в переменных окружения');
            console.error('❌ [Server] Merch бот не может быть запущен без токена');
            console.error('❌ [Server] Проверьте, что переменная окружения MERCH_BOT_TOKEN установлена');
            return;
          }
          
          if (!hasBotName) {
            console.error('❌ [Server] MERCH_BOT_NAME не найден в переменных окружения');
            console.error('❌ [Server] Merch бот не может быть запущен без имени бота');
            console.error('❌ [Server] Проверьте, что переменная окружения MERCH_BOT_NAME установлена');
            return;
          }
          
          // merchBotService уже импортирован статически сверху
          console.log('✅ [Server] merchBotService доступен (статический импорт)');
          
          // Проверяем статус до запуска
          const statusBefore = merchBotService.status;
          console.log('📊 [Server] Статус Merch бота до запуска:', JSON.stringify(statusBefore, null, 2));
          
          if (!statusBefore.botInitialized) {
            console.error('❌ [Server] Merch бот не инициализирован');
            console.error('❌ [Server] Возможные причины:');
            console.error('  - Неверный формат токена');
            console.error('  - Отсутствует MERCH_BOT_TOKEN');
            console.error('  - Отсутствует MERCH_BOT_NAME');
            console.error('❌ [Server] Бот не будет запущен автоматически. Используйте /hub-api/retail/merch/bot-start для ручного запуска');
            return;
          }
          
          console.log('🚀 [Server] Запускаем Merch бота...');
          const merchBotStarted = await merchBotService.launch();
          
          // Проверяем статус после запуска
          const statusAfter = merchBotService.status;
          console.log('📊 [Server] Статус Merch бота после запуска:', JSON.stringify(statusAfter, null, 2));
          
          if (merchBotStarted) {
            console.log('✅ [Server] Merch bot started successfully');
            console.log('📊 [Server] Final status:', statusAfter);
          } else {
            console.error('❌ [Server] Merch bot failed to start');
            console.error('📊 [Server] Status:', statusAfter);
            console.error('❌ [Server] Возможные причины:');
            console.error('  - Ошибка подключения к Telegram API');
            console.error('  - Неверный токен');
            console.error('  - Конфликт с другим экземпляром бота');
            console.error('❌ [Server] Бот не запущен. Используйте /hub-api/retail/merch/bot-start для повторной попытки');
            
            // В продакшене логируем более детально
            if (process.env.NODE_ENV === 'production') {
              console.error('⚠️ [Server] PRODUCTION: Merch bot не запущен автоматически');
              console.error('⚠️ [Server] Проверьте логи выше для деталей ошибки');
            }
          }
        } catch (error) {
          console.error('❌ [Server] Failed to load/start Merch bot:', error);
          if (error instanceof Error) {
            console.error('❌ [Server] Error message:', error.message);
            console.error('❌ [Server] Error stack:', error.stack);
            
            // В продакшене логируем более детально
            if (process.env.NODE_ENV === 'production') {
              console.error('⚠️ [Server] PRODUCTION: Ошибка при попытке запустить Merch bot');
              console.error('⚠️ [Server] Используйте /hub-api/retail/merch/bot-start для ручного запуска');
            }
          }
        }
      }, merchBotDelay);
    });
  } else {
    console.log('🚫 [Server] Bots disabled (ENABLE_BOTS=false)');
  }
  
  console.log('🎉 [Server] Startup completed successfully!');
});