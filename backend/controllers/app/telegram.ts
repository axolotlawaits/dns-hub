import { Telegraf } from 'telegraf';
import { Notifications } from '@prisma/client';
import axios from 'axios';
import { prisma, API } from '../../server.js';

class TelegramBotService {
  private static instance: TelegramBotService;
  private bot: Telegraf;
  private isRunning = false;
  private restartAttempts = 0;
  private readonly MAX_RESTART_ATTEMPTS = 5;

  private constructor() {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined');
    }
    
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    this.setupCommands();
  }

  public static getInstance(): TelegramBotService {
    if (!TelegramBotService.instance) {
      TelegramBotService.instance = new TelegramBotService();
    }
    return TelegramBotService.instance;
  }

  public async launch(): Promise<void> {
    if (this.isRunning) {
      console.log('Bot is already running');
      return;
    }

    try {
      await this.bot.launch();
      this.isRunning = true;
      this.restartAttempts = 0;
      console.log('Telegram bot started successfully');
    } catch (error) {
      console.error('Failed to start Telegram bot:', error);
      
      if (this.restartAttempts < this.MAX_RESTART_ATTEMPTS) {
        this.restartAttempts++;
        const delay = Math.min(5000 * this.restartAttempts, 30000);
        console.log(`Retrying in ${delay}ms (attempt ${this.restartAttempts}/${this.MAX_RESTART_ATTEMPTS})`);
        setTimeout(() => this.launch(), delay);
      } else {
        console.error('Max restart attempts reached, giving up');
      }
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      await this.bot.stop();
      this.isRunning = false;
      console.log('Telegram bot stopped successfully');
    } catch (error) {
      console.error('Error stopping bot:', error);
    }
  }

  public getBot(): Telegraf {
    return this.bot;
  }

  private setupCommands(): void {
    this.bot.command('start', async (ctx) => {
      const token = ctx.message.text.split(' ')[1]?.trim();
      if (!token) {
        return ctx.reply('Для привязки аккаунта используйте ссылку из приложения');
      }

      try {
        const user = await prisma.user.findFirst({
          where: { telegramLinkToken: token }
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

        await this.sendConfirmationToFrontend(user.id);
        ctx.reply(`✅ Аккаунт привязан!\nДобро пожаловать, ${user.name}!`);
      } catch (error) {
        console.error('Link error:', error);
        ctx.reply('❌ Ошибка привязки. Пожалуйста, попробуйте снова');
      }
    });
  }

  public async sendNotification(notification: Notifications, chatId: string): Promise<boolean> {
    try {
      const message = `🔔 ${notification.title}\n\n${notification.message}`;
      await this.bot.telegram.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
      });
      return true;
    } catch (error) {
      console.error('Telegram send error:', error);
      if (error instanceof Error && error.message.includes('chat not found')) {
        await prisma.user.updateMany({
          where: { telegramChatId: chatId },
          data: { telegramChatId: null }
        });
      }
      return false;
    }
  }

  private async sendConfirmationToFrontend(userId: string): Promise<void> {
    try {
      const frontendEndpoint = `${API}/telegram/status/${userId}`;
      await axios.post(frontendEndpoint, { userId });
      console.log(`Confirmation sent to frontend for user ${userId}`);
    } catch (error) {
      console.error('Failed to send confirmation to frontend:', error);
    }
  }
}

export const telegramBotService = TelegramBotService.getInstance();