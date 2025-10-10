import express, { Request, Response, NextFunction } from 'express';
import { validateData } from '../../middleware/validation.js';
import { z } from 'zod';
import { getLastUser, login, updateUserSettings, getUserSettings, updateUser, getUserData } from '../../controllers/app/user.js';
import { ldapAuth, updateUserPhoto } from '../../utils/ldap.js';

const ldapLoginSchema = z.object({
  login: z.string().min(1, 'введите логин').transform(val => val.trim()),
  pass: z.string().min(1, 'введите пароль').transform(val => val.trim()),
});

const updatePhotoSchema = z.object({
  login: z.string().min(1, 'введите логин').transform(val => val.trim()),
  photo: z.string().min(1, 'введите фото в формате base64'),
  password: z.string().min(1, 'введите пароль').transform(val => val.trim()),
});

const router = express.Router();

router.get('/:id', getUserData)
router.post('/login', validateData(ldapLoginSchema), ldapAuth, login);
router.get('/last-user/:login', getLastUser);
router.patch('/:id', updateUser)
router.put('/update-photo', validateData(updatePhotoSchema), updateUserPhoto);
router.put('/settings', updateUserSettings);
router.get('/settings/:userId/:parameter', getUserSettings);

export default router;
