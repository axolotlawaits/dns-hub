import { Router } from 'express';
import { getUserDataByEmail } from '../../controllers/app/profile.js';

const router = Router();

// Маршрут для получения данных пользователя и филиала по email
router.post('/user-data', getUserDataByEmail);

export default router;
