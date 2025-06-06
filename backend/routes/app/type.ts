// routes/navigation.ts
import express from 'express';
import {  getTypes, getTypesByModelUuid } from '../../controllers/app/type.js';

const router = express.Router();

// Маршрут для всех элементов типов
router.get('/',  getTypes);

// Маршрут для получения типов для модели
router.get('/sub', getTypesByModelUuid);

export default router;
