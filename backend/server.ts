import express, {Request, Response} from 'express';
import { spawn } from "child_process" 
import cors from "cors"
import { PrismaClient } from "@prisma/client"
import path from 'path'
import { z } from 'zod'
import { validateData } from './middleware/validation.js';

const app = express()
export const prisma = new PrismaClient()
const __dirname = path.resolve()
  
app.use(cors())
app.use(express.json())
app.use("/hub-api", express.static(__dirname))

const ldapLoginSchema = z.object({
  login: z.string().min(1, 'введите логин'),
  pass: z.string().min(1, 'введите пароль'),
})

app.post('/uweb-api/login', validateData(ldapLoginSchema), async (req: Request, res: Response) => {
  const { login, pass } = req.body
  const process = spawn('python', ["./utilities/ldap.py", login, pass])
  process.stdout.on('data', data => { 
    console.log(JSON.parse(data))
    try {
      res.status(200).json(JSON.parse(data))
    } catch {
      res.status(400).json({ldapError: 'проверьте введенные данные'})
    }
  }) 
  
  process.on('close', code => {
    console.log('child process exited with code ', code)
  })
})

app.listen(2000, function() { 
  console.log('server running on port 2000')
}) 
 