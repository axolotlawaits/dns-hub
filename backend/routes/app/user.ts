import express, { Request, Response } from 'express';
import { validateData } from '../../middleware/validation.js';
import { z } from 'zod';
import { getLastUser, login } from '../../controllers/app/user.js';
import { ldapAuth, updateUserPhoto } from '../../utils/ldap.js';

const ldapLoginSchema = z.object({
  login: z.string().min(1, 'введите логин'),
  pass: z.string().min(1, 'введите пароль'),
});

const updatePhotoSchema = z.object({
  login: z.string().min(1, 'введите логин'),
  photo: z.string().min(1, 'введите фото в формате base64'),
});

const router = express.Router();

router.post('/login', validateData(ldapLoginSchema), ldapAuth, login);
router.get('/last-user/:login', getLastUser);
router.put('/update-photo', validateData(updatePhotoSchema), updateUserPhoto);

export default router;