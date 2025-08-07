import express from 'express';
import { prisma } from '../../server.js';
import crypto from 'crypto';

const router = express.Router();

router.get('/generate-link/:userId', async (req, res) => {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    
    await prisma.user.update({
      where: { id: req.params.userId },
      data: { telegramLinkToken: token }
    });

    res.json({
      link: `https://t.me/${process.env.TELEGRAM_BOT_NAME}?start=${token}`,
      expires_in: "15 minutes"
    });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: 'Link generation failed' });
  }
});

router.get('/status/:userId', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { telegramChatId: true, name: true }
    });

    res.json({
      is_connected: !!user?.telegramChatId,
      chat_id: user?.telegramChatId,
      user_name: user?.name
    });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: 'Status check failed' });
  }
});

router.post('/disconnect/:userId', async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.params.userId },
      data: { telegramChatId: null, telegramLinkToken: null }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Disconnect failed' });
  }
});

router.post('/status/:userId', (req, res) => {
  console.log(`Confirmation for ${req.params.userId}`);
  res.status(200).send({ success: true });
});

export default router;