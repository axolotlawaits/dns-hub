import { Bot, Context, session, SessionFlavor, Keyboard } from 'grammy';
import { Notifications } from '@prisma/client';
import axios from 'axios';
import { prisma, API } from '../../server.js';
import { getDoors, openDoor, findDoorByName, isTrassirConfigured, getFloorsSubmenuDoors, isSubmenuTrigger } from './trassirService.js';

// 1. Типизация сессии (если нужно хранить состояние)
interface SessionData {
  userData?: {
    id: string;
    name: string;
  };
  waitingForDoor?: boolean; // Ожидаем выбор двери
  inSubmenu?: boolean; // Находимся в подменю "3-6 Этаж"
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
      const chatId = ctx.chat.id.toString();

      // Проверяем, уже привязан ли пользователь
      const existingUser = await prisma.user.findFirst({
        where: { telegramChatId: chatId },
        select: { id: true, name: true }
      });

      // Если нет токена - показываем приветствие для уже привязанных
      if (!match || typeof match !== 'string' || !match.trim()) {
        if (existingUser) {
          // Проверяем настройку открытия дверей
          const doorOpeningSetting = await prisma.userSettings.findUnique({
            where: {
              userId_parameter: {
                userId: existingUser.id,
                parameter: 'telegram_door_opening_enabled'
              }
            }
          });
          
          const showDoorButton = !doorOpeningSetting || doorOpeningSetting.value !== 'false';
          const keyboard = showDoorButton 
            ? new Keyboard().text('🚪 Открыть дверь').resized()
            : new Keyboard().resized();
          
          let message = `Привет, ${existingUser.name}! 👋\n\nДоступные команды:\n`;
          if (showDoorButton) {
            message += `🚪 /open - открыть дверь\n`;
          }
          message += `❓ /help - справка`;
          
          return ctx.reply(message, { reply_markup: keyboard });
        }
        
        // Инструкция для неавторизованных пользователей
        const instructionMessage = 
          `👋 Добро пожаловать!\n\n` +
          `Для подключения бота к вашему аккаунту:\n\n` +
          `1️⃣ Откройте свой профиль на портале DNS HUB\n` +
          `2️⃣ Нажмите "Подключить Telegram"\n` +
          `3️⃣ Отсканируйте QR-код или перейдите по ссылке\n` +
          `4️⃣ После перехода в бот, нажмите "Запустить" или отправьте команду /start\n\n` +
          `После подключения вы сможете:\n` +
          `🔔 Получать уведомления из системы\n` +
          `🚪 Открывать двери (если включено в настройках профиля)\n` +
          `⚙️ Управлять настройками в профиле на портале\n\n` +
          `❓ Используйте /help для получения справки`;
        
        return ctx.reply(instructionMessage);
      }

      const token = match.trim();

      // Валидация формата токена
      if (token.length < 10 || token.length > 100) {
        const errorMessage = 
          `❌ Неверный формат ссылки\n\n` +
          `Для подключения бота:\n` +
          `1️⃣ Откройте профиль на портале\n` +
          `2️⃣ Перейдите в раздел "Telegram"\n` +
          `3️⃣ Нажмите "Подключить Telegram" и используйте полученную ссылку`;
        return ctx.reply(errorMessage);
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
          const errorMessage = 
            `❌ Ссылка недействительна или истекла\n\n` +
            `Для подключения бота:\n` +
            `1️⃣ Откройте профиль на портале\n` +
            `2️⃣ Перейдите в раздел "Telegram"\n` +
            `3️⃣ Нажмите "Подключить Telegram" и сгенерируйте новую ссылку`;
          return ctx.reply(errorMessage);
        }

        // Проверяем срок действия токена (15 минут)
        const TOKEN_EXPIRY_TIME = 15 * 60 * 1000;
        const tokenAge = Date.now() - user.updatedAt.getTime();
        
        if (tokenAge > TOKEN_EXPIRY_TIME) {
          await prisma.user.update({
            where: { id: user.id },
            data: { telegramLinkToken: null },
          });
          const errorMessage = 
            `❌ Ссылка истекла (действительна 15 минут)\n\n` +
            `Для подключения бота:\n` +
            `1️⃣ Откройте профиль на портале\n` +
            `2️⃣ Перейдите в раздел "Telegram"\n` +
            `3️⃣ Нажмите "Подключить Telegram" и сгенерируйте новую ссылку`;
          return ctx.reply(errorMessage);
        }

        // Проверяем, не привязан ли уже аккаунт к другому чату
        if (user.telegramChatId && user.telegramChatId !== chatId) {
          return ctx.reply('❌ Этот аккаунт уже привязан к другому чату Telegram');
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            telegramChatId: chatId,
            telegramLinkToken: null,
            telegramUsername: ctx.from?.username || null,
          },
        });

        await this.notifyFrontend(user.id);
        
        // Проверяем настройку открытия дверей
        const doorOpeningSetting = await prisma.userSettings.findUnique({
          where: {
            userId_parameter: {
              userId: user.id,
              parameter: 'telegram_door_opening_enabled'
            }
          }
        });
        
        const showDoorButton = !doorOpeningSetting || doorOpeningSetting.value !== 'false';
        const keyboard = showDoorButton 
          ? new Keyboard().text('🚪 Открыть дверь').resized()
          : new Keyboard().resized();
        
        let message = `✅ Аккаунт привязан!\nДобро пожаловать, ${user.name}! 👋\n\nДоступные команды:\n`;
        if (showDoorButton) {
          message += `🚪 /open - открыть дверь\n`;
        }
        message += `❓ /help - справка`;
        
        await ctx.reply(message, { reply_markup: keyboard });

        ctx.session.userData = {
          id: user.id,
          name: user.name,
        };
      } catch (error) {
        console.error('[Telegram] Link error:', error);
        await ctx.reply('❌ Ошибка привязки. Пожалуйста, попробуйте снова');
      }
    });

    // Команда /help
    this.bot.command('help', async (ctx) => {
      const chatId = ctx.chat?.id.toString();
      if (!chatId) return;
      
      const user = await prisma.user.findFirst({
        where: { telegramChatId: chatId },
        select: { id: true }
      });
      
      let message = `📋 Доступные команды:\n\n`;
      
      if (user) {
        const doorOpeningSetting = await prisma.userSettings.findUnique({
          where: {
            userId_parameter: {
              userId: user.id,
              parameter: 'telegram_door_opening_enabled'
            }
          }
        });
        
        if (!doorOpeningSetting || doorOpeningSetting.value !== 'false') {
          message += `🚪 /open - открыть дверь\n`;
        }
        
        message += `🔄 /start - главное меню\n`;
        message += `❓ /help - эта справка\n\n`;
        message += `Также вы получаете уведомления из системы.`;
      } else {
        message += `🔄 /start - главное меню\n`;
        message += `❓ /help - эта справка\n\n`;
        message += `🔗 Как подключить бота:\n`;
        message += `1. Откройте профиль на сайте\n`;
        message += `2. В разделе "Telegram" нажмите "Подключить Telegram"\n`;
        message += `3. Отсканируйте QR-код или перейдите по ссылке\n`;
        message += `4. Нажмите /start в этом чате\n\n`;
        message += `После подключения вы сможете:\n`;
        message += `• Получать уведомления из системы\n`;
        message += `• Открывать двери через бота\n`;
        message += `• Управлять настройками в профиле на сайте`;
      }
      
      await ctx.reply(message);
    });

    // Команда /open - открытие двери
    this.bot.command('open', async (ctx) => {
      await this.handleOpenDoor(ctx);
    });

    // Обработка текстовых сообщений (выбор двери)
    this.bot.on('message:text', async (ctx) => {
      const text = ctx.message.text;
      const chatId = ctx.chat.id.toString();

      // Кнопка "Открыть дверь"
      if (text === '🚪 Открыть дверь') {
        await this.handleOpenDoor(ctx);
        return;
      }

      // Кнопка "Назад" из подменю
      if (text === '◀️ Назад') {
        await this.handleOpenDoor(ctx);
        return;
      }

      // Проверяем, авторизован ли пользователь
      const user = await prisma.user.findFirst({
        where: { telegramChatId: chatId },
        select: { id: true, name: true }
      });

      if (!user) {
        return; // Игнорируем сообщения от неавторизованных
      }

      // Проверяем настройку пользователя для открытия дверей
      const doorOpeningSetting = await prisma.userSettings.findUnique({
        where: {
          userId_parameter: {
            userId: user.id,
            parameter: 'telegram_door_opening_enabled'
          }
        }
      });
      
      // Если настройка существует и отключена, запрещаем открытие дверей
      if (doorOpeningSetting && doorOpeningSetting.value === 'false') {
        await ctx.reply('❌ Открытие дверей через Telegram отключено в настройках профиля');
        return;
      }

      // Проверяем настройку для дополнительных дверей
      const additionalDoorsSetting = await prisma.userSettings.findUnique({
        where: {
          userId_parameter: {
            userId: user.id,
            parameter: 'telegram_additional_doors_enabled'
          }
        }
      });
      
      const showAdditionalDoors = additionalDoorsSetting?.value === 'true';

      // Проверяем, выбрано ли подменю "3-6 Этаж"
      if (isSubmenuTrigger(text)) {
        await this.handleFloorsSubmenu(ctx);
        return;
      }

      // Проверяем, выбрана ли дверь
      const door = await findDoorByName(text, showAdditionalDoors);
      if (door) {
        const opened = await openDoor(door.id, user.name, ctx.from?.id);
        if (opened) {
          const firstName = user.name.split(' ')[1] || user.name;
          await ctx.reply(`✅ ${firstName}, дверь "${door.name}" открыта!`);
        } else {
          await ctx.reply(`❌ Не удалось открыть дверь "${door.name}"`);
        }
        // Если мы в подменю, остаемся в подменю
        if (ctx.session.inSubmenu) {
          // Пересоздаем подменю, чтобы оно осталось активным
          await this.handleFloorsSubmenu(ctx);
        }
        // Меню с дверьми остаётся - не меняем клавиатуру
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
    // Проверяем настройку пользователя для Telegram уведомлений
    try {
      const user = await prisma.user.findFirst({
        where: { telegramChatId: chatId },
        select: { id: true }
      });
      
      if (user) {
        const telegramNotificationsSetting = await prisma.userSettings.findUnique({
          where: {
            userId_parameter: {
              userId: user.id,
              parameter: 'telegram_notifications_enabled'
            }
          }
        });
        
        // Если настройка существует и отключена, не отправляем уведомление
        if (telegramNotificationsSetting && telegramNotificationsSetting.value === 'false') {
          console.log(`[Telegram] Уведомления отключены для пользователя ${user.id}`);
          return false;
        }
      }
    } catch (error) {
      console.error('[Telegram] Error checking notification settings:', error);
      // Продолжаем отправку в случае ошибки проверки настроек
    }
    
    // Если бот не запущен, пытаемся запустить его
    if (!this.isRunning || !this.bot) {
      console.warn('[Telegram] Bot is not running, attempting to start...');
      const started = await this.launch();
      if (!started || !this.bot) {
        console.error('[Telegram] Failed to start bot for notification');
        return false;
      }
      console.log('[Telegram] Bot started successfully for notification');
    }

    // Проверяем, что бот все еще существует после запуска
    if (!this.bot) {
      console.error('[Telegram] Bot is null after launch attempt');
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
            await this.bot!.api.sendMessage(chatId, plainMessage);
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

  // 9. Обработка открытия двери
  private async handleOpenDoor(ctx: MyContext): Promise<void> {
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    // Проверяем авторизацию
    const user = await prisma.user.findFirst({
      where: { telegramChatId: chatId },
      select: { id: true, name: true }
    });

    if (!user) {
      await ctx.reply('❌ Сначала привяжите аккаунт через профиль на сайте');
      return;
    }

    // Проверяем настройку пользователя для открытия дверей
    const doorOpeningSetting = await prisma.userSettings.findUnique({
      where: {
        userId_parameter: {
          userId: user.id,
          parameter: 'telegram_door_opening_enabled'
        }
      }
    });
    
    // Если настройка существует и отключена, запрещаем открытие дверей
    if (doorOpeningSetting && doorOpeningSetting.value === 'false') {
      await ctx.reply('❌ Открытие дверей через Telegram отключено в настройках профиля');
      return;
    }

    // Проверяем, настроен ли Trassir
    if (!isTrassirConfigured()) {
      await ctx.reply('❌ Система управления дверьми не настроена');
      return;
    }

    // Проверяем настройку для дополнительных дверей
    const additionalDoorsSetting = await prisma.userSettings.findUnique({
      where: {
        userId_parameter: {
          userId: user.id,
          parameter: 'telegram_additional_doors_enabled'
        }
      }
    });
    
    const showAdditionalDoors = additionalDoorsSetting?.value === 'true';

    // Получаем список дверей (с учетом настройки дополнительных дверей)
    const doors = await getDoors(showAdditionalDoors);
    if (doors.size === 0) {
      await ctx.reply('❌ Не удалось получить список дверей');
      return;
    }

    // Создаем клавиатуру с дверьми
    // Двери 13-16 группируем в подменю "3-6 Этаж"
    const keyboard = new Keyboard();
    const floorsSubmenuDoors = [13, 14, 15, 16];
    let hasFloorsSubmenu = false;

    // Собираем обычные двери (не 13-16) в массив
    const regularDoors: Array<{ id: number; name: string }> = [];
    doors.forEach((name, id) => {
      // Пропускаем двери 13-16, они будут в подменю
      if (floorsSubmenuDoors.includes(id)) {
        hasFloorsSubmenu = true;
        return;
      }
      regularDoors.push({ id, name });
    });

    // Добавляем обычные двери в два столбца
    for (let i = 0; i < regularDoors.length; i += 2) {
      if (i + 1 < regularDoors.length) {
        // Две кнопки в ряд
        keyboard.text(regularDoors[i].name).text(regularDoors[i + 1].name).row();
      } else {
        // Одна кнопка в ряд (если нечетное количество)
        keyboard.text(regularDoors[i].name).row();
      }
    }

    // Проверяем, есть ли двери 13-16 в основном списке (без дополнительных)
    const basicDoors = await getDoors(false);
    const hasFloorsInBasic = floorsSubmenuDoors.some(id => basicDoors.has(id));

    // Добавляем кнопку подменю "3-6 Этаж" если:
    // 1. Есть такие двери в списке
    // 2. И (они в основном списке ИЛИ дополнительные двери включены)
    if (hasFloorsSubmenu && (hasFloorsInBasic || showAdditionalDoors)) {
      keyboard.text('3-6 Этаж').row();
    }

    keyboard.resized();

    ctx.session.waitingForDoor = true;
    ctx.session.inSubmenu = false;
    await ctx.reply('🚪 Какую дверь открыть?', { reply_markup: keyboard });
  }

  // Обработка подменю "3-6 Этаж"
  private async handleFloorsSubmenu(ctx: MyContext): Promise<void> {
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    // Проверяем авторизацию
    const user = await prisma.user.findFirst({
      where: { telegramChatId: chatId },
      select: { id: true, name: true }
    });

    if (!user) {
      await ctx.reply('❌ Сначала привяжите аккаунт через профиль на сайте');
      return;
    }

    // Проверяем настройку для дополнительных дверей
    const additionalDoorsSetting = await prisma.userSettings.findUnique({
      where: {
        userId_parameter: {
          userId: user.id,
          parameter: 'telegram_additional_doors_enabled'
        }
      }
    });
    
    const showAdditionalDoors = additionalDoorsSetting?.value === 'true';

    // Получаем двери для подменю с учетом настройки дополнительных дверей
    const submenuDoors = await getFloorsSubmenuDoors(showAdditionalDoors);
    if (submenuDoors.size === 0) {
      await ctx.reply('❌ Не удалось получить список дверей');
      return;
    }

    // Создаем клавиатуру с дверьми подменю в два столбца
    const keyboard = new Keyboard();
    const submenuDoorsArray = Array.from(submenuDoors.entries());
    
    // Добавляем двери в два столбца
    for (let i = 0; i < submenuDoorsArray.length; i += 2) {
      const [id1, name1] = submenuDoorsArray[i];
      if (i + 1 < submenuDoorsArray.length) {
        // Две кнопки в ряд
        const [id2, name2] = submenuDoorsArray[i + 1];
        keyboard.text(name1).text(name2).row();
      } else {
        // Одна кнопка в ряд (если нечетное количество)
        keyboard.text(name1).row();
      }
    }
    
    keyboard.text('◀️ Назад').row();
    keyboard.resized();

    ctx.session.inSubmenu = true;
    await ctx.reply('🏢 Выберите этаж:', { reply_markup: keyboard });
  }

  // Вспомогательные методы
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