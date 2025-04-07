import express from 'express'
import { validateData } from '../../middleware/validation'
import { z } from 'zod'
import { login } from '../../controllers/app/user'

const ldapLoginSchema = z.object({
  login: z.string().min(1, 'введите логин'),
  pass: z.string().min(1, 'введите пароль'),
})

const router = express.Router()

router.post('/login', validateData(ldapLoginSchema), login)

export default router