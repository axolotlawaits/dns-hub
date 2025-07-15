import express from 'express';
import { prisma } from '../../server.js';
import crypto from 'crypto';
import { TelegramController } from '../../controllers/app/telegram.js';

const router = express.Router();

// Генерация ссылки для привязки
router.get('/generate-link/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const token = crypto.randomBytes(32).toString('hex');

    await prisma.user.update({
      where: { id: userId },
      data: {
        telegramLinkToken: token // Только это поле, без expires
      }
    });

    res.json({
      link: `https://t.me/${process.env.TELEGRAM_BOT_NAME}?start=${token}`,
      expires_in: "15 minutes" // Просто информационное поле, не хранится в БД
    });
  } catch (error) {
    console.error('Generate link error:', error);
    res.status(500).json({ error: 'Failed to generate link' });
  }
});

// Проверка статуса подключения
router.get('/status/:userId', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: {
        telegramChatId: true,
        name: true
      }
    });

    res.json({
      is_connected: !!user?.telegramChatId,
      chat_id: user?.telegramChatId,
      user_name: user?.name
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// Отключение Telegram
router.post('/disconnect/:userId', async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.params.userId },
      data: {
        telegramChatId: null,
        telegramLinkToken: null
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Endpoint to handle confirmation from the backend
router.post('/status/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log(`Received confirmation for user ${userId}`);
  res.status(200).send({ success: true, message: 'Confirmation received' });
});

export default router;