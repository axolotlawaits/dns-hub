import { Telegraf } from 'telegraf';
import { Notifications } from '@prisma/client';
import { prisma } from '../server.js';

export class TelegramService {
  private static instance: TelegramService;
  private bot: Telegraf;

  private constructor() {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
  }

  public static getInstance(): TelegramService {
    if (!TelegramService.instance) {
      TelegramService.instance = new TelegramService();
    }
    return TelegramService.instance;
  }

  public async sendNotification(notification: Notifications, chatId: string) {
    try {
      const message = `🔔 ${notification.title}\n\n${notification.message}`;
      await this.bot.telegram.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
      return true;
    } catch (error) {
      console.error('Telegram send error:', error);
      
      // Если чат не найден, отвязываем Telegram от пользователя
      if (error instanceof Error && error.message.includes('chat not found')) {
        await prisma.user.updateMany({
          where: { telegramChatId: chatId },
          data: { telegramChatId: null }
        });
      }
      
      return false;
    }
  }

  public getBot() {
    return this.bot;
  }
}