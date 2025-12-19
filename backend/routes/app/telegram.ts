import express from 'express';
import { prisma } from '../../server.js';
import crypto from 'crypto';

const router = express.Router();

router.get('/generate-link/:userId', async (req: any, res: any) => {
  try {
    const botName = process.env.TELEGRAM_BOT_NAME;
    if (!botName) {
      return res.status(500).json({ error: 'Bot configuration error' });
    }

    // Валидация userId
    if (!req.params.userId || req.params.userId.length === 0) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 минут
    
    await prisma.user.update({
      where: { id: req.params.userId },
      data: { 
        telegramLinkToken: token,
        // Используем updatedAt как время создания токена (будет обновлено автоматически)
      }
    });

    const link = `https://t.me/${botName}?start=${token}`;
    res.json({
      link,
      expires_in: "15 minutes",
      expires_at: expiresAt.toISOString()
    });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: 'Link generation failed' });
  }
});

router.get('/status/:userId', async (req: any, res: any) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { 
        telegramChatId: true, 
        telegramUsername: true,
        name: true,
      }
    });

    const status = {
      is_connected: !!user?.telegramChatId,
      chat_id: user?.telegramChatId,
      user_name: user?.telegramUsername || null,
    };

    res.json(status);
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: 'Status check failed' });
  }
});

router.post('/disconnect/:userId', async (req: any, res: any) => {
  try {
    await prisma.user.update({
      where: { id: req.params.userId },
      data: { 
        telegramChatId: null, 
        telegramLinkToken: null,
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Disconnect failed' });
  }
});

router.post('/status/:userId', (req: any, res: any) => {
  res.status(200).send({ success: true });
});

// Маршрут для проверки статуса бота
router.get('/bot-status', async (req: any, res: any) => {
  try {
    const { telegramService } = await import('../../controllers/app/telegram.js');
    const status = telegramService.status;
    
    res.json({
      bot_status: status,
      environment: {
        hasToken: !!process.env.TELEGRAM_BOT_TOKEN,
        hasBotName: !!process.env.TELEGRAM_BOT_NAME,
        tokenPreview: process.env.TELEGRAM_BOT_TOKEN ? 
          `${process.env.TELEGRAM_BOT_TOKEN.substring(0, 10)}...` : 'Not set',
        botName: process.env.TELEGRAM_BOT_NAME || 'Not set'
      }
    });
  } catch (error) {
    console.error('Bot status check error:', error);
    res.status(500).json({ error: 'Failed to check bot status' });
  }
});

// Маршрут для перезапуска бота
router.post('/bot-restart', async (req: any, res: any) => {
  try {
    const { telegramService } = await import('../../controllers/app/telegram.js');
    
    const success = await telegramService.restart();
    
    if (success) {
      res.json({ success: true, message: 'Bot restarted successfully' });
    } else {
      res.status(500).json({ success: false, message: 'Bot restart failed' });
    }
  } catch (error) {
    console.error('Bot restart error:', error);
    res.status(500).json({ error: 'Failed to restart bot' });
  }
});

export default router;