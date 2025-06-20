// routes/navigation.ts
import express from 'express';
import { getRootMenuItems, getNonRootMenuItems, getAllNonRootMenuItems } from '../../controllers/app/navigation.js';

const router = express.Router();

// Маршрут для получения корневых элементов меню
router.get('/', getRootMenuItems);

// Маршрут для получения дочерних элементов меню по parent_id
router.get('/sub', getNonRootMenuItems);

router.get('/all-sub', getAllNonRootMenuItems);

export default router;
