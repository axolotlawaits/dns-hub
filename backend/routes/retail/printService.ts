import { Router } from 'express';
import { authPrintService, previewPrintService, printFromDate } from '../../controllers/retail/printService.js';

const router = Router();

// Авторизация
router.post('/auth', authPrintService);

// Печать с указанной даты
router.post('/print', printFromDate);

// Preview
router.post('/preview', previewPrintService);

export default router;