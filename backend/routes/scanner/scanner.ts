import { Router } from 'express';
import { 
  scanNetworkForPrinters, 
  getKnownPrinters 
} from '../../controllers/scanner/scanner.js';

const router = Router();

// Сканирование сети на наличие принтеров со сканерами
router.post('/scan-network', scanNetworkForPrinters);

// Получение списка известных принтеров
router.get('/printers', getKnownPrinters);

export default router;
