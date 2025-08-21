import { Bot, Context, session, SessionFlavor } from 'grammy';
import { Notifications } from '@prisma/client';
import axios from 'axios';
import { prisma, API } from '../../server.js';

// 1. Типизация сессии (если нужно хранить состояние)
interface SessionData {
  userData?: {
    id: string;
    name: string;
  };
  // ... другие поля сессии
}

type MyContext = Context & SessionFlavor<SessionData>;

// 2. Конфигурация бота
class TelegramService {
  private static instance: TelegramService;
  private bot: Bot<MyContext> | null = null;
  private isRunning = false;
  private readonly MAX_RETRIES = 3;
  private retryCount = 0;

  private constructor() {
    this.initializeBot();
  }

  public static getInstance(): TelegramService {
    if (!TelegramService.instance) {
      TelegramService.instance = new TelegramService();
    }
    return TelegramService.instance;
  }

  // 3. Инициализация бота
  private initializeBot(): void {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error('TELEGRAM_BOT_TOKEN not found');
      return;
    }
    
    const botName = process.env.TELEGRAM_BOT_NAME;
    if (!botName) {
      console.error('TELEGRAM_BOT_NAME not found');
      return;
    }
    
    this.bot = new Bot<MyContext>(token);

    // Настройка middleware
    this.bot.use(
      session({
        initial: (): SessionData => ({}),
      })
    );

    // 4. Обработка команды /start
    this.bot.command('start', async (ctx) => {
      const token = ctx.match.trim();
      if (!token) {
        return ctx.reply('Для привязки аккаунта используйте ссылку из приложения');
      }

      try {
        const user = await prisma.user.findFirst({
          where: { telegramLinkToken: token },
        });

        if (!user) {
          return ctx.reply('❌ Ссылка недействительна или истекла');
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            telegramChatId: ctx.chat.id.toString(),
            telegramLinkToken: null,
          },
        });

        await this.notifyFrontend(user.id);
        await ctx.reply(`✅ Аккаунт привязан!\nДобро пожаловать, ${user.name}!`);

        // Сохраняем данные в сессию (пример)
        ctx.session.userData = {
          id: user.id,
          name: user.name,
        };
      } catch (error) {
        console.error('Link error:', error);
        await ctx.reply('❌ Ошибка привязки. Пожалуйста, попробуйте снова');
      }
    });

    // 5. Обработка ошибок
    this.bot.catch((err) => {
      console.error('Bot error:', err);
    });
  }

  // 6. Запуск бота
  public async launch(): Promise<boolean> {
    if (this.isRunning) {
      return false;
    }
    
    if (!this.bot) {
      console.error('Bot not initialized');
      return false;
    }

    try {
      await this.bot.start({
        drop_pending_updates: true,
        allowed_updates: ['message', 'callback_query'],
      });

      this.isRunning = true;
      this.retryCount = 0;
      return true;
    } catch (error) {
      console.error('Failed to start bot:', error);

      if (this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        const delay = Math.min(2000 * this.retryCount, 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.launch();
      }

      return false;
    }
  }

  // 7. Остановка бота
  public async stop(): Promise<void> {
    if (!this.isRunning || !this.bot) return;

    try {
      await this.bot.stop();
      this.isRunning = false;
    } catch (error) {
      console.error('Error stopping bot:', error);
    }
  }

  // 8. Отправка уведомлений
  public async sendNotification(
    notification: Notifications,
    chatId: string
  ): Promise<boolean> {
    if (!this.isRunning || !this.bot) {
      console.error('Bot is not running');
      return false;
    }

    try {
      await this.bot.api.sendMessage(
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

  // 9. Вспомогательные методы
  private async notifyFrontend(userId: string): Promise<void> {
    try {
      await axios.post(`${API}/telegram/status/${userId}`, { userId });
    } catch (error) {
      console.error('Frontend notify error:', error);
    }
  }

  private async handleInvalidChat(chatId: string): Promise<void> {
    try {
      await prisma.user.updateMany({
        where: { telegramChatId: chatId },
        data: { telegramChatId: null },
      });
    } catch (error) {
      console.error('Database error in handleInvalidChat:', error);
    }
  }

  // 10. Статус бота
  public get status() {
    return {
      isRunning: this.isRunning,
      retryCount: this.retryCount,
      botInitialized: !!this.bot,
      hasToken: !!process.env.TELEGRAM_BOT_TOKEN,
      hasBotName: !!process.env.TELEGRAM_BOT_NAME,
    };
  }

  // 11. Метод для принудительного перезапуска бота
  public async restart(): Promise<boolean> {
    await this.stop();
    this.retryCount = 0;
    this.initializeBot();
    return this.launch();
  }
}

// Экспорт синглтона
export const telegramService = TelegramService.getInstance();