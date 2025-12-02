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

  // Валидация токена
  private validateToken(token: string): boolean {
    // Telegram токены имеют формат: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
    const tokenPattern = /^\d+:[A-Za-z0-9_-]{35}$/;
    return tokenPattern.test(token);
  }

  // 3. Инициализация бота
  private initializeBot(): void {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error('[Telegram] TELEGRAM_BOT_TOKEN not found');
      return;
    }
    
    if (!this.validateToken(token)) {
      console.error('[Telegram] Invalid token format');
      return;
    }
    
    const botName = process.env.TELEGRAM_BOT_NAME;
    if (!botName) {
      console.error('[Telegram] TELEGRAM_BOT_NAME not found');
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
      const match = ctx.match;
      if (!match || typeof match !== 'string') {
        return ctx.reply('Для привязки аккаунта используйте ссылку из приложения');
      }

      const token = match.trim();
      if (!token) {
        return ctx.reply('Для привязки аккаунта используйте ссылку из приложения');
      }

      // Валидация формата токена
      if (token.length < 10 || token.length > 100) {
        return ctx.reply('❌ Неверный формат ссылки');
      }

      try {
        const user = await prisma.user.findFirst({
          where: { telegramLinkToken: token },
          select: {
            id: true,
            name: true,
            telegramChatId: true,
            updatedAt: true,
          },
        });

        if (!user) {
          return ctx.reply('❌ Ссылка недействительна или истекла');
        }

        // Проверяем срок действия токена (15 минут)
        const TOKEN_EXPIRY_TIME = 15 * 60 * 1000; // 15 минут в миллисекундах
        const tokenAge = Date.now() - user.updatedAt.getTime();
        
        if (tokenAge > TOKEN_EXPIRY_TIME) {
          // Удаляем истекший токен
          await prisma.user.update({
            where: { id: user.id },
            data: { telegramLinkToken: null },
          });
          return ctx.reply('❌ Ссылка истекла. Пожалуйста, сгенерируйте новую ссылку в приложении');
        }

        // Проверяем, не привязан ли уже аккаунт к другому чату
        if (user.telegramChatId && user.telegramChatId !== ctx.chat.id.toString()) {
          return ctx.reply('❌ Этот аккаунт уже привязан к другому чату Telegram');
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
        console.error('[Telegram] Link error:', error);
        await ctx.reply('❌ Ошибка привязки. Пожалуйста, попробуйте снова');
      }
    });

  // 5. Обработка ошибок
  this.bot.catch((err) => {
    console.error('[Telegram] Bot error:', err);
    // Логируем детали ошибки для отладки
    if (err instanceof Error) {
      console.error('[Telegram] Error message:', err.message);
      console.error('[Telegram] Error stack:', err.stack);
    }
    // Не перезапускаем бота автоматически - пусть работает дальше
    // Критические ошибки будут обработаны на уровне launch()
  });
  }

  // 6. Запуск бота
  public async launch(): Promise<boolean> {
    if (this.isRunning) {
      return false;
    }
    
    if (!this.bot) {
      console.error('[Telegram] Bot not initialized');
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
      console.error('[Telegram] Failed to start bot:', error);

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
      console.error('[Telegram] Error stopping bot:', error);
    }
  }

  // 8. Отправка уведомлений
  public async sendNotification(
    notification: Notifications,
    chatId: string
  ): Promise<boolean> {
    if (!this.isRunning || !this.bot) {
      console.error('[Telegram] Bot is not running');
      return false;
    }

    // Валидация chatId
    if (!chatId || chatId.length === 0) {
      console.error('[Telegram] Invalid chatId');
      return false;
    }

    // Валидация размера сообщения (Telegram ограничение: 4096 символов)
    const message = `🔔 ${notification.title}\n\n${notification.message}`;
    if (message.length > 4096) {
      console.error('[Telegram] Message too long:', message.length);
      // Обрезаем сообщение до допустимого размера
      const truncatedMessage = message.substring(0, 4093) + '...';
      try {
        await this.bot.api.sendMessage(chatId, truncatedMessage);
        return true;
      } catch (error) {
        console.error('[Telegram] Send error:', error);
        return false;
      }
    }

    try {
      // Пытаемся отправить с Markdown форматированием
      await this.bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      return true;
    } catch (error) {
      console.error('[Telegram] Send error:', error);
      if (error instanceof Error) {
        // Если ошибка парсинга Markdown, отправляем без форматирования
        if (error.message.includes('can\'t parse entities') || 
            error.message.includes('parse error') ||
            error.message.includes('Bad Request')) {
          try {
            // Убираем Markdown форматирование
            const plainMessage = message
              .replace(/\*\*/g, '')
              .replace(/__/g, '')
              .replace(/\*/g, '')
              .replace(/_/g, '')
              .replace(/`/g, '')
              .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'); // Убираем ссылки [text](url)
            await this.bot.api.sendMessage(chatId, plainMessage);
            return true;
          } catch (retryError) {
            console.error('[Telegram] Retry send error:', retryError);
          }
        }
        
        // Обработка ошибок чата
        if (this.isBlockedError(error)) {
          await this.handleInvalidChat(chatId);
        }
      }
      return false;
    }
  }

  // Определяем, что бот заблокирован пользователем или чат недоступен
  private isBlockedError(error: any): boolean {
    const message: string = (error?.message || '').toString().toLowerCase();
    const description: string = (error?.description || '').toString().toLowerCase();
    const text = `${message} ${description}`;

    return (
      text.includes('forbidden') ||
      text.includes('bot was blocked') ||
      text.includes('user is deactivated') ||
      text.includes('chat not found') ||
      text.includes('bot was kicked') ||
      text.includes('chat_id is empty')
    );
  }

  // 9. Вспомогательные методы
  private async notifyFrontend(userId: string): Promise<void> {
    try {
      await axios.post(`${API}/telegram/status/${userId}`, { userId });
    } catch (error) {
      console.error('[Telegram] Frontend notify error:', error);
    }
  }

  private async handleInvalidChat(chatId: string): Promise<void> {
    try {
      await prisma.user.updateMany({
        where: { telegramChatId: chatId },
        data: { telegramChatId: null },
      });
    } catch (error) {
      console.error('[Telegram] Database error in handleInvalidChat:', error);
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
    // Небольшая задержка для полной остановки бота перед переинициализацией
    await new Promise(resolve => setTimeout(resolve, 500));
    this.retryCount = 0;
    this.initializeBot();
    return this.launch();
  }
}

// Экспорт синглтона
export const telegramService = TelegramService.getInstance();