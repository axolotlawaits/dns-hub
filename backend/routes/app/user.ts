import express from 'express'
import { validateData } from '../../middleware/validation.js'
import { z } from 'zod'
import { login } from '../../controllers/app/user.js'
import { ldapAuth } from '../../utils/ldap.js'

const ldapLoginSchema = z.object({
  login: z.string().min(1, 'введите логин'),
  pass: z.string().min(1, 'введите пароль'),
})

const router = express.Router()

router.post('/login', validateData(ldapLoginSchema), ldapAuth, login)

export default router