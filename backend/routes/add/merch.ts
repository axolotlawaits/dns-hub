import { Router } from 'express';
import {
  getMerchHierarchy,
  createMerchCategory,
  updateMerchCategory,
  deleteMerchCategory,
  createMerchCard,
  updateMerchCard,
  deleteMerchCard,
  addCardImages,
  addMerchAttachment,
  deleteMerchAttachment
} from '../../controllers/add/merch.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = Router();

// Middleware для логирования всех запросов (для отладки)
router.use((req: any, res: any, next: any) => {
  if (req.path.includes('bot-') || req.path.includes('cache-refresh')) {
    console.log(`🔍 [Routes] Запрос к эндпоинту управления ботом: ${req.method} ${req.path}`);
  }
  next();
});

// GET запросы публичные (для чтения данных)
router.get('/categories', getMerchHierarchy as any);

// Роуты для управления Merch ботом (без аутентификации для удобства администрирования)
// Эти эндпоинты должны обрабатываться ПЕРВЫМИ, до применения authenticateToken
router.get('/bot-status', async (req: any, res: any) => {
  try {
    console.log('🔍 [Routes] Проверяем статус Merch бота через /add/merch/bot-status...');
    const { merchBotService } = await import('../../controllers/app/merchBot.js');
    const service = merchBotService;
    const status = service.status;
    
    res.json({
      success: true,
      bot_status: status,
      environment: {
        hasToken: !!process.env.MERCH_BOT_TOKEN,
        hasBotName: !!process.env.MERCH_BOT_NAME,
        tokenPreview: process.env.MERCH_BOT_TOKEN ? 
          `${process.env.MERCH_BOT_TOKEN.substring(0, 10)}...` : 'Not set',
        botName: process.env.MERCH_BOT_NAME || 'Not set',
        enableBots: process.env.ENABLE_BOTS !== 'false'
      }
    });
  } catch (error) {
    console.error('MerchBot status check error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to check MerchBot status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Обработчик для запуска бота (поддерживает и GET, и POST для удобства)
const handleBotStart = async (req: any, res: any) => {
  try {
    console.log(`🚀 [Routes] ${req.method} /add/merch/bot-start - Запрос получен`);
    console.log('🚀 [Routes] Method:', req.method);
    console.log('🚀 [Routes] Path:', req.path);
    console.log('🚀 [Routes] Original URL:', req.originalUrl);
    
    const { merchBotService } = await import('../../controllers/app/merchBot.js');
    
    // Получаем текущий статус перед запуском
    const statusBefore = merchBotService.status;
    console.log('📊 [Routes] Статус до запуска:', JSON.stringify(statusBefore, null, 2));
    
    // Проверяем наличие необходимых переменных окружения
    const hasToken = !!process.env.MERCH_BOT_TOKEN;
    const hasBotName = !!process.env.MERCH_BOT_NAME;
    const enableBots = process.env.ENABLE_BOTS !== 'false';
    
    if (!enableBots) {
      return res.status(503).json({
        success: false,
        error: 'Bots are disabled',
        message: 'ENABLE_BOTS is set to false',
        environment: {
          enableBots: false,
          hasToken,
          hasBotName
        }
      });
    }
    
    if (!hasToken) {
      return res.status(500).json({
        success: false,
        error: 'MERCH_BOT_TOKEN not found',
        message: 'MERCH_BOT_TOKEN environment variable is not set',
        environment: {
          enableBots: true,
          hasToken: false,
          hasBotName
        }
      });
    }
    
    if (!hasBotName) {
      return res.status(500).json({
        success: false,
        error: 'MERCH_BOT_NAME not found',
        message: 'MERCH_BOT_NAME environment variable is not set',
        environment: {
          enableBots: true,
          hasToken: true,
          hasBotName: false
        }
      });
    }
    
    // Просто вызываем launch() (как в Telegram боте)
    // Метод launch() сам проверит, запущен ли бот, и попытается переинициализировать, если нужно
    console.log('🚀 [Routes] Вызываем merchBotService.launch()...');
    const success = await merchBotService.launch();
    
    console.log('📊 [Routes] Результат запуска:', success);
    const statusAfter = merchBotService.status;
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'MerchBot started successfully',
        status: statusAfter
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'MerchBot start failed',
        status: statusAfter,
        error: 'Check logs for details. Possible reasons: invalid token format, Telegram API error, or network issue',
        environment: {
          enableBots: true,
          hasToken: true,
          hasBotName: true,
          tokenPreview: process.env.MERCH_BOT_TOKEN ? 
            `${process.env.MERCH_BOT_TOKEN.substring(0, 10)}...` : 'Not set',
          botName: process.env.MERCH_BOT_NAME || 'Not set'
        }
      });
    }
  } catch (error) {
    console.error('MerchBot start error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to start MerchBot',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
    });
  }
};

// Поддерживаем и GET, и POST для удобства
router.get('/bot-start', handleBotStart);
router.post('/bot-start', handleBotStart);

router.post('/bot-stop', async (req: any, res: any) => {
  try {
    console.log('🛑 [Routes] Остановка Merch бота через /add/merch/bot-stop...');
    const { merchBotService } = await import('../../controllers/app/merchBot.js');
    
    await merchBotService.stop();
    
    res.json({ success: true, message: 'MerchBot stopped successfully' });
  } catch (error) {
    console.error('MerchBot stop error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to stop MerchBot',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.post('/bot-restart', async (req: any, res: any) => {
  try {
    console.log('🔄 [Routes] Перезапуск Merch бота через /add/merch/bot-restart...');
    const { merchBotService } = await import('../../controllers/app/merchBot.js');
    
    const success = await merchBotService.restart();
    
    if (success) {
      const status = merchBotService.status;
      res.json({ 
        success: true, 
        message: 'MerchBot restarted successfully',
        status
      });
    } else {
      const status = merchBotService.status;
      res.status(500).json({ 
        success: false, 
        message: 'MerchBot restart failed',
        status,
        error: 'Check logs for details'
      });
    }
  } catch (error) {
    console.error('MerchBot restart error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to restart MerchBot',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
    });
  }
});

// Все остальные операции требуют аутентификации
// Применяем authenticateToken только к конкретным роутам, НЕ к эндпоинтам управления ботом

// Роуты для категорий (layer = 1) - требуют аутентификации
router.post('/categories', authenticateToken, ...(createMerchCategory as any));
router.put('/categories/:id', authenticateToken, ...(updateMerchCategory as any));
router.delete('/categories/:id', authenticateToken, deleteMerchCategory as any);

// Роуты для карточек (layer = 0) - требуют аутентификации
router.post('/cards', authenticateToken, ...(createMerchCard as any));
router.put('/cards/:id', authenticateToken, ...(updateMerchCard as any));
router.delete('/cards/:id', authenticateToken, deleteMerchCard as any);
router.post('/cards/:id/images', authenticateToken, ...(addCardImages as any));

// Роуты для attachments - требуют аутентификации
router.post('/attachments/:recordId', authenticateToken, ...(addMerchAttachment as any));
router.delete('/attachments/:id', authenticateToken, deleteMerchAttachment as any);

export default router;
