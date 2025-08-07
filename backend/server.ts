import express from 'express';
import cors from "cors"
import { PrismaClient } from "@prisma/client"
import path from 'path'
import userRouter from './routes/app/user.js'
import accessRouter from './routes/app/access.js'
import newsRouter from './routes/app/news.js'
import meterReadingRouter from './routes/aho/meterReading.js'
import searchRouter from './routes/app/search.js'
import profileRouter from './routes/app/profile.js'
import birthdayRouter from './routes/app/birthday.js'
import bookmarksRouter from './routes/app/bookmarks.js'
import notificationRouter from './routes/app/notification.js'
import correspondenceRouter from './routes/aho/correspondence.js'
import supplydocsRouter from './routes/accounting/supplydocs.js'
import navigationRouter from './routes/app/navigation.js'
import typeRouter from './routes/app/type.js'
import routeDayRouter from './routes/supply/routeDay.js'
import routeRouter from './routes/supply/route.js'
import filialRouter from './routes/supply/filial.js'
import mediaRouter from './routes/add/media.js'
import rkRouter from './routes/add/rk.js'
import sliderRouter from './routes/add/slider.js'
import printServiceRouter from './routes/retail/printService.js'
import telegramRouter  from './routes/app/telegram.js'
import schedule from 'node-schedule'
import { scheduleRouteDay } from './controllers/supply/routeDay.js';
import fs from 'fs'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import { refreshToken } from './middleware/auth.js';
import { createServer } from 'http';
import { SocketIOService } from './socketio.js';
import { telegramService } from './controllers/app/telegram.js';

const app = express()
export const prisma = new PrismaClient()
const __dirname = path.resolve()
const server = createServer(app);

const socketService = SocketIOService.getInstance();
socketService.initialize(server);

export const accessPrivateKey = fs.readFileSync(path.join(__dirname, 'keys/access_private.pem'), 'utf8');
export const accessPublicKey = fs.readFileSync(path.join(__dirname, 'keys/access_public.pem'), 'utf8');
export const refreshPrivateKey = fs.readFileSync(path.join(__dirname, 'keys/refresh_private.pem'), 'utf8');
export const refreshPublicKey = fs.readFileSync(path.join(__dirname, 'keys/refresh_public.pem'), 'utf8');

const allowedOrigins = process.env.NODE_ENV === 'production'  ? ['https://dns-zs.partner.ru', 'http://10.11.145.196']  : ['http://localhost:5173', 'http://10.11.145.196'];
export const API = process.env.NODE_ENV === 'production' ? `https://${window.location.host}/hub-api` : 'http://localhost:2000/hub-api';
export const APIWebSocket = process.env.NODE_ENV === 'production' ? 'wss://dns-zs.partner.ru/socket.io' : 'ws://localhost:2000/socket.io';

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
}

// const corsOptions = {
//   origin: allowedOrigins,
//   credentials: true,                
// }

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())
app.use(express.static(path.join(__dirname, 'public')))

app.use("/hub-api", express.static(__dirname))

app.use('/hub-api/user', userRouter)
app.use('/hub-api/access', accessRouter)
app.use('/hub-api/news', newsRouter)
app.use('/hub-api/profile', profileRouter)
app.use('/hub-api/telegram', telegramRouter);
app.use('/hub-api/birthday', birthdayRouter)
app.use('/hub-api/bookmarks', bookmarksRouter)
app.use('/hub-api/notifications', notificationRouter)
app.use('/hub-api/aho/meter-reading', meterReadingRouter)
app.use('/hub-api/aho/correspondence', correspondenceRouter)
app.use('/hub-api/accounting/supply-docs', supplydocsRouter)
app.use('/hub-api/add/media', mediaRouter)
app.use('/hub-api/add/rk', rkRouter)
app.use('/hub-api/add/sliders', sliderRouter)
app.use('/hub-api/search', searchRouter)
app.use('/hub-api/navigation', navigationRouter);
app.use('/hub-api/type', typeRouter);
app.use('/hub-api/retail/print-service', printServiceRouter);
/* loader (mb fix later) */
app.use('/hub-api/loaders/route', routeRouter)
app.use('/hub-api/loaders/routeDay', routeDayRouter)
app.use('/hub-api/loaders/filial', filialRouter)

app.post('/hub-api/refresh-token', refreshToken)

server.listen(2000, async function() {
  console.log('Server running on port 2000');
  await telegramService.launch(); // Запуск бота
  schedule.scheduleJob('0 0 * * *', () => scheduleRouteDay());
});