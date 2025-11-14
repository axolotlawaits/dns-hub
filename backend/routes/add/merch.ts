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

// GET запросы публичные (для чтения данных)
router.get('/categories', getMerchHierarchy as any);

// Роуты для управления Merch ботом (без аутентификации для удобства администрирования)
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

router.post('/bot-start', async (req: any, res: any) => {
  try {
    console.log('🚀 [Routes] Запуск Merch бота через /add/merch/bot-start...');
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
    
    let success = false;
    
    // Если бот не инициализирован или не запущен, используем restart для полной переинициализации
    if (!statusBefore.botInitialized || !statusBefore.isRunning) {
      console.log('⚠️ [Routes] Бот не инициализирован или не запущен, выполняем полный перезапуск...');
      // Используем restart для полной переинициализации и запуска
      success = await merchBotService.restart();
    } else {
      console.log('✅ [Routes] Бот уже запущен, статус:', statusBefore.isRunning);
      // Если бот уже запущен, просто возвращаем успех
      const statusAfter = merchBotService.status;
      return res.json({
        success: true,
        message: 'MerchBot is already running',
        status: statusAfter
      });
    }
    
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
});

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
router.use(authenticateToken);

// Роуты для категорий (layer = 1)
router.post('/categories', ...(createMerchCategory as any));
router.put('/categories/:id', ...(updateMerchCategory as any));
router.delete('/categories/:id', deleteMerchCategory as any);

// Роуты для карточек (layer = 0)
router.post('/cards', ...(createMerchCard as any));
router.put('/cards/:id', ...(updateMerchCard as any));
router.delete('/cards/:id', deleteMerchCard as any);
router.post('/cards/:id/images', ...(addCardImages as any));

// Роуты для attachments
router.post('/attachments/:recordId', ...(addMerchAttachment as any));
router.delete('/attachments/:id', deleteMerchAttachment as any);

export default router;
