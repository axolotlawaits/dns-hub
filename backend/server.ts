import express from 'express';
import cors from "cors"
import { PrismaClient } from "@prisma/client"
import path from 'path'
import userRouter from './routes/app/user.js'
import newsRouter from './routes/app/news.js'
import meterReadingRouter from './routes/app/meterReading.js'
import searchRouter from './routes/app/search.js'

const app = express()
export const prisma = new PrismaClient()
const __dirname = path.resolve()
  
app.use(cors())
app.use(express.json())
app.use("/hub-api", express.static(__dirname))

app.use('/hub-api/user', userRouter)
app.use('/hub-api/news', newsRouter)
app.use('/hub-api/aho', meterReadingRouter)
app.use('/hub-api/search', searchRouter)

app.listen(2000, function() { 
  console.log('server running on port 2000')
}) 
 