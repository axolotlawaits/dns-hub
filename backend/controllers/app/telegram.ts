import { Telegraf } from 'telegraf';
import { Notifications } from '@prisma/client';
import axios from 'axios';
import { prisma, API } from '../../server.js';

class TelegramService {
  private static instance: TelegramService;
  private bot: Telegraf;
  private isBotRunning: boolean;

  private constructor() {
    this.isBotRunning = false;
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
    this.setupCommands();
  }

  public static getInstance(): TelegramService {
    if (!TelegramService.instance) {
      TelegramService.instance = new TelegramService();
    }
    return TelegramService.instance;
  }

  public async launch(): Promise<void> {
    if (this.isBotRunning) {
      console.log('Bot is already running');
      return;
    }

    try {
      await this.bot.launch();
      this.isBotRunning = true;
      console.log('Telegram bot started');
      console.log(`Bot username: @${process.env.TELEGRAM_BOT_NAME}`);
      
      // Handle graceful shutdown
      process.once('SIGINT', () => this.stop('SIGINT'));
      process.once('SIGTERM', () => this.stop('SIGTERM'));
    } catch (error) {
      console.error('Failed to start bot:', error);
      throw error;
    }
  }

  public async stop(signal?: string): Promise<void> {
    if (!this.isBotRunning) return;
    
    try {
      if (signal) {
        console.log(`Received ${signal}, stopping bot...`);
      }
      await this.bot.stop();
      this.isBotRunning = false;
      console.log('Bot stopped successfully');
    } catch (error) {
      console.error('Error stopping bot:', error);
    }
  }

  public async sendNotification(notification: Notifications, chatId: string): Promise<boolean> {
    if (!this.isBotRunning) {
      console.error('Bot is not running, cannot send notification');
      return false;
    }

    try {
      await this.bot.telegram.sendMessage(
        chatId,
        `🔔 ${notification.title}\n\n${notification.message}`,
        { parse_mode: 'Markdown' }
      );
      return true;
    } catch (error) {
      console.error('Send error:', error);
      if (error instanceof Error && error.message.includes('chat not found')) {
        await this.handleInvalidChat(chatId);
      }
      return false;
    }
  }

  private async handleInvalidChat(chatId: string): Promise<void> {
    await prisma.user.updateMany({
      where: { telegramChatId: chatId },
      data: { telegramChatId: null }
    });
  }

  private setupCommands(): void {
    this.bot.command('start', async (ctx) => {
      const token = ctx.message.text.split(' ')[1]?.trim();
      if (!token) return ctx.reply('Для привязки аккаунта используйте ссылку из приложения');

      try {
        const user = await prisma.user.findFirst({ where: { telegramLinkToken: token } });
        if (!user) return ctx.reply('❌ Ссылка недействительна или истекла');

        await prisma.user.update({
          where: { id: user.id },
          data: { 
            telegramChatId: ctx.chat.id.toString(),
            telegramLinkToken: null 
          }
        });

        await this.notifyFrontend(user.id);
        ctx.reply(`✅ Аккаунт привязан!\nДобро пожаловать, ${user.name}!`);
      } catch (error) {
        console.error('Link error:', error);
        ctx.reply('❌ Ошибка привязки. Пожалуйста, попробуйте снова');
      }
    });
  }

  private async notifyFrontend(userId: string): Promise<void> {
    try {
      await axios.post(`${API}/telegram/status/${userId}`, { userId });
    } catch (error) {
      console.error('Frontend notify error:', error);
    }
  }
}

export const telegramService = TelegramService.getInstance();