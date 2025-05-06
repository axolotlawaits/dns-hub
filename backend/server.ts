import express from 'express';
import cors from "cors"
import { PrismaClient } from "@prisma/client"
import path from 'path'
import userRouter from './routes/app/user.js'
import newsRouter from './routes/app/news.js'
import meterReadingRouter from './routes/app/meterReading.js'
import searchRouter from './routes/app/search.js'
import correspondenceRouter from './routes/app/correspondence.js'
import navigationRouter from './routes/app/navigation.js'
import typeRouter from './routes/app/type.js'
import routeDayRouter from './routes/supply/routeDay.js'
import routeRouter from './routes/supply/route.js'
import filialRouter from './routes/supply/filial.js'

const app = express()
export const prisma = new PrismaClient()
const __dirname = path.resolve()
  
app.use(cors())
app.use(express.json())
app.use("/hub-api", express.static(__dirname))

app.use('/hub-api/user', userRouter)
app.use('/hub-api/news', newsRouter)
app.use('/hub-api/aho/meter-reading', meterReadingRouter)
app.use('/hub-api/aho/correspondence', correspondenceRouter)
app.use('/hub-api/search', searchRouter)
app.use('/hub-api/navigation', navigationRouter);
app.use('/hub-api/type', typeRouter);
/* loader (mb fix later) */
app.use('/hub-api/loaders/route', routeRouter)
app.use('/hub-api/loaders/routeDay', routeDayRouter)
app.use('/hub-api/loaders/filial', filialRouter)
/* */

app.use(express.static(path.join(__dirname, 'public')))

app.listen(2000, function() { 
  console.log('server running on port 2000')
}) 
 