import { Telegraf } from 'telegraf';
import { prisma } from '../../server.js';
import { Router } from 'express';
import crypto from 'crypto';

export class TelegramController {
  private static instance: TelegramController;
  private bot: Telegraf;
  public router: Router;

  private constructor() {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined');
    }
    
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    this.router = Router();
    this.setupRoutes();
    this.setupCommands();
    this.launchBot();
  }

  public static getInstance(): TelegramController {
    if (!TelegramController.instance) {
      TelegramController.instance = new TelegramController();
    }
    return TelegramController.instance;
  }

  private setupRoutes() {
    this.router.get('/generate-link', async (req, res) => {
      try {
        const userId = req.user.id; // Предполагаем, что middleware аутентификации добавит user в запрос
        const token = crypto.randomBytes(32).toString('hex');
        
        await prisma.user.update({
          where: { id: userId },
          data: { 
            telegramLinkToken: token,
          }
        });
        
        res.json({
          link: `https://t.me/${process.env.TELEGRAM_BOT_NAME}?start=${token}`,
          expires_in: "15 minutes"
        });
      } catch (error) {
        console.error('Generate link error:', error);
        res.status(500).json({ error: 'Failed to generate link' });
      }
    });

    this.router.get('/status', async (req, res) => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: req.user.id },
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

    this.router.post('/disconnect', async (req, res) => {
      try {
        await prisma.user.update({
          where: { id: req.user.id },
          data: { 
            telegramChatId: null,
            telegramLinkToken: null,
          }
        });
        
        res.json({ success: true });
      } catch (error) {
        console.error('Disconnect error:', error);
        res.status(500).json({ error: 'Failed to disconnect' });
      }
    });
  }

  private launchBot() {
    this.bot.launch()
      .then(() => console.log('Telegram bot started'))
      .catch((error) => {
        console.error('Failed to start Telegram bot:', error);
        process.exit(1);
      });
  }

  private setupCommands() {
    this.bot.command('start', async (ctx) => {
      const token = ctx.message.text.split(' ')[1]?.trim();
      if (!token) {
        return ctx.reply('Для привязки аккаунта используйте ссылку из приложения');
      }

      try {
        const user = await prisma.user.findFirst({
          where: { 
            telegramLinkToken: token,
          }
        });

        if (!user) {
          return ctx.reply('❌ Ссылка недействительна или истекла');
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { 
            telegramChatId: ctx.chat.id.toString(),
            telegramLinkToken: null,
          }
        });
        
        ctx.reply(`✅ Аккаунт привязан!\nДобро пожаловать, ${user.name}!`);
      } catch (error) {
        console.error('Link error:', error);
        ctx.reply('❌ Ошибка привязки. Пожалуйста, попробуйте снова');
      }
    });
  }

  public getBot(): Telegraf {
    return this.bot;
  }
}