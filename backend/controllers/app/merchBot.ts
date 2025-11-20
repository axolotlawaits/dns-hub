import { Bot, Context, session, SessionFlavor, InlineKeyboard, InputFile, Keyboard } from 'grammy';
import { prisma } from '../../server.js';
import { API } from '../../server.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Типизация сессии для Merch бота
interface MerchSessionData {
  userChoiceHistory?: string[];
  searchState?: boolean;
  feedbackState?: {
    step: 'email' | 'text' | 'photo';
    email?: string;
    text?: string;
    photos?: string[];
  };
  lastMenuMessageId?: number; // ID последнего сообщения с меню для обновления
}

type MerchContext = Context & SessionFlavor<MerchSessionData>;

// Кэш для иерархии кнопок
interface CacheData {
  buttonsHierarchy: Record<string, Array<{id: string, name: string, text: string}>>;
  lastUpdate: Date;
}

class MerchBotService {
  private static instance: MerchBotService;
  private bot: Bot<MerchContext> | null = null;
  private isRunning = false;
  private readonly MAX_RETRIES = 3;
  private retryCount = 0;
  private restartAttempts = 0;
  private readonly MAX_RESTART_ATTEMPTS = 5;
  private readonly RESTART_DELAY_BASE = 5000;
  private cache: CacheData = {
    buttonsHierarchy: {},
    lastUpdate: new Date(0)
  };

  private constructor() {
    this.initializeBot();
  }

  public static getInstance(): MerchBotService {
    if (!MerchBotService.instance) {
      MerchBotService.instance = new MerchBotService();
    }
    return MerchBotService.instance;
  }

  // Геттеры для публичного доступа к статусу
  public get status() {
    return {
      isRunning: this.isRunning,
      retryCount: this.retryCount,
      botInitialized: !!this.bot,
      hasToken: !!process.env.MERCH_BOT_TOKEN,
      hasBotName: !!process.env.MERCH_BOT_NAME,
      botName: process.env.MERCH_BOT_NAME || 'Not set',
      cacheSize: Object.keys(this.cache.buttonsHierarchy).length,
      lastCacheUpdate: this.cache.lastUpdate
    };
  }

  // Валидация токена
  private validateToken(token: string): boolean {
    // Telegram токены имеют формат: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
    const tokenPattern = /^\d+:[A-Za-z0-9_-]{35}$/;
    return tokenPattern.test(token);
  }

  // Инициализация бота
  private initializeBot(): void {
    console.log('🔧 [MerchBot] Инициализация бота...');
    console.log('🔍 [MerchBot] Проверка переменных окружения:');
    
    const token = process.env.MERCH_BOT_TOKEN;
    console.log('  - MERCH_BOT_TOKEN:', token ? `найден (длина: ${token.length})` : 'НЕ НАЙДЕН');
    
    if (!token) {
      console.error('❌ [MerchBot] MERCH_BOT_TOKEN not found');
      console.error('❌ [MerchBot] Убедитесь, что переменная окружения MERCH_BOT_TOKEN установлена');
      return;
    }
    
    if (!this.validateToken(token)) {
      console.error('❌ [MerchBot] Invalid token format');
      console.error('❌ [MerchBot] Токен должен иметь формат: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz');
      console.error('❌ [MerchBot] Текущий токен:', token.substring(0, 10) + '...');
      return;
    }
    
    const botName = process.env.MERCH_BOT_NAME;
    console.log('  - MERCH_BOT_NAME:', botName ? `найден (${botName})` : 'НЕ НАЙДЕН');
    
    if (!botName) {
      console.error('❌ [MerchBot] MERCH_BOT_NAME not found');
      console.error('❌ [MerchBot] Убедитесь, что переменная окружения MERCH_BOT_NAME установлена');
      return;
    }
    
    try {
      console.log('🤖 [MerchBot] Создаем экземпляр бота...');
      this.bot = new Bot<MerchContext>(token);
      console.log('✅ [MerchBot] Экземпляр бота создан успешно');

      // Настройка middleware
      console.log('⚙️ [MerchBot] Настройка middleware...');
      this.bot.use(
        session({
          initial: (): MerchSessionData => ({}),
        })
      );
      console.log('✅ [MerchBot] Middleware настроен');

      console.log('⚙️ [MerchBot] Настройка обработчиков...');
      this.setupHandlers();
      console.log('✅ [MerchBot] Обработчики настроены');
      console.log('✅ [MerchBot] Инициализация завершена успешно');
    } catch (error) {
      console.error('❌ [MerchBot] Ошибка при создании экземпляра бота:', error);
      if (error instanceof Error) {
        console.error('❌ [MerchBot] Error message:', error.message);
        console.error('❌ [MerchBot] Error stack:', error.stack);
      }
      this.bot = null;
    }
  }

  // Настройка обработчиков
  private setupHandlers(): void {
    if (!this.bot) return;
    
    // Команда /start
    this.bot.command('start', async (ctx) => {
      const user = ctx.from;
      if (!user) return;

      // Сохраняем пользователя в БД
      await this.saveUserToDB(user.id, user.username, user.first_name, user.last_name);
      
      // Обновляем статистику
      await this.updateStats(user.id, 'start');

      await ctx.reply(`Привет, ${user.first_name}!`);
      
      const keyboard = new InlineKeyboard()
        .text('◀ Начать ▶', 'start_bot');
      
      await ctx.reply("Нажми на кнопку '◀ Начать ▶' чтобы начать работу с ботом.", {
        reply_markup: keyboard
      });
      
      ctx.session.userChoiceHistory = [];
    });

    // Обработка callback кнопки "Начать"
    this.bot.callbackQuery('start_bot', async (ctx) => {
      await ctx.answerCallbackQuery();
      if (ctx.from) {
        await this.updateStats(ctx.from.id, 'button_click', 'start');
      }
      await this.showMainMenu(ctx);
    });

    // Обработка кнопки "Обратная связь"
    this.bot.callbackQuery('feedback', async (ctx) => {
      await ctx.answerCallbackQuery();
      if (ctx.from) {
        await this.updateStats(ctx.from.id, 'feedback');
      }
      await this.startFeedback(ctx);
    });

    // Обработка кнопки "Поиск"
    this.bot.callbackQuery('search', async (ctx) => {
      await ctx.answerCallbackQuery();
      if (ctx.from) {
        await this.updateStats(ctx.from.id, 'button_click', 'search');
      }
      await this.startSearch(ctx);
    });

    // Обработка кнопки "Назад"
    this.bot.callbackQuery('back', async (ctx) => {
      await ctx.answerCallbackQuery();
      if (ctx.from) {
        await this.updateStats(ctx.from.id, 'button_click', 'back');
      }
      await this.goBack(ctx);
    });

    // Обработка кнопки "Главная"
    this.bot.callbackQuery('main_menu', async (ctx) => {
      await ctx.answerCallbackQuery();
      if (ctx.from) {
        await this.updateStats(ctx.from.id, 'button_click', 'main_menu');
      }
      await this.showMainMenu(ctx);
    });

    // Обработка выбора категории/карточки
    this.bot.callbackQuery(/^item_/, async (ctx) => {
      console.log(`🔘 [callbackQuery] Обрабатываем нажатие кнопки: "${ctx.callbackQuery.data}"`);
      await ctx.answerCallbackQuery();
      const itemId = ctx.callbackQuery.data.replace('item_', '');
      console.log(`🔘 [callbackQuery] Извлечен itemId: ${itemId}`);
      await this.handleItemClick(ctx, itemId);
    });

    // Обработка текстовых сообщений
    this.bot.on('message:text', async (ctx) => {
      const messageText = ctx.message?.text;
      if (!messageText) return;

      // Если пользователь в режиме обратной связи
      if (ctx.session.feedbackState) {
        await this.handleTextMessage(ctx);
        return;
      }
      
      // Если пользователь в режиме поиска
      if (ctx.session.searchState) {
        await this.handleSearchQuery(ctx, messageText);
        return;
      }
      
      // Обрабатываем как кнопку меню
      await this.handleButtonClick(ctx);
    });

    // Обработка фотографий (только для обратной связи)
    this.bot.on('message:photo', async (ctx) => {
      // Обрабатываем только если пользователь в режиме обратной связи
      if (ctx.session.feedbackState && ctx.session.feedbackState.step === 'photo') {
        await this.handlePhotoMessage(ctx);
      }
      // Иначе игнорируем фотографии
    });

    // Обработка ошибок (основной обработчик, детальная обработка в launch)
    this.bot.catch((err) => {
      console.error('❌ [MerchBot] Bot error:', err);
      // Логируем детали ошибки для отладки
      if (err instanceof Error) {
        console.error('❌ [MerchBot] Error message:', err.message);
        console.error('❌ [MerchBot] Error stack:', err.stack);
      }
      // Детальная обработка ошибок происходит в методе launch()
    });
  }

  // Показать главное меню
  private async showMainMenu(ctx: MerchContext): Promise<void> {
    try {
      const buttonsHierarchy = await this.getButtonsHierarchy();
      const rootItems = buttonsHierarchy['0'] || [];

      // Создаем постоянную клавиатуру с категориями
      const keyboard = new Keyboard();
      
      // Добавляем основные функции в один ряд
      keyboard.text('🔍 Поиск').text('📩 Обратная связь').row();
      
      // Добавляем категории в два столбца (по 2 кнопки в ряду)
      const maxCategories = 12; // 6 рядов по 2 кнопки
      const categoriesToShow = rootItems.slice(0, maxCategories);
      
      for (let i = 0; i < categoriesToShow.length; i += 2) {
        const first = categoriesToShow[i];
        const second = categoriesToShow[i + 1];
        
        if (second) {
          keyboard.text(first.name).text(second.name).row();
        } else {
          keyboard.text(first.name).row();
        }
      }
      
      // Если категорий больше, добавляем кнопку "Еще"
      if (rootItems.length > maxCategories) {
        keyboard.text('📋 Еще категории').row();
      }
      
      keyboard.resized().persistent();

      // Проверяем, есть ли уже сообщение с меню для обновления
      if (ctx.session.lastMenuMessageId && ctx.chat) {
        try {
          // Обновляем существующее сообщение
          await ctx.api.editMessageReplyMarkup(ctx.chat.id, ctx.session.lastMenuMessageId, {
            reply_markup: keyboard
          } as any);
          // Также обновляем текст сообщения
          await ctx.api.editMessageText(ctx.chat.id, ctx.session.lastMenuMessageId, '📑 Выбери категорию:', {
            reply_markup: keyboard
          } as any);
          return;
        } catch (error) {
          // Если не удалось обновить (сообщение не найдено), отправляем новое
          console.log('⚠️ [MerchBot] Не удалось обновить меню, отправляем новое сообщение');
        }
      }

      // Отправляем новое сообщение с постоянной клавиатурой
      const sentMessage = await ctx.reply('📑 Выбери категорию:', {
        reply_markup: keyboard
      });
      
      // Сохраняем ID сообщения для последующего обновления
      if (sentMessage && 'message_id' in sentMessage) {
        ctx.session.lastMenuMessageId = sentMessage.message_id as number;
      }
      
      ctx.session.userChoiceHistory = [];
    } catch (error) {
      console.error('Error showing main menu:', error);
      await ctx.reply('❌ Ошибка загрузки меню. Попробуйте позже.');
    }
  }

  // Обработка клика по категории (из постоянной клавиатуры)
  private async handleCategoryClick(ctx: MerchContext, itemId: string): Promise<void> {
    if (ctx.from) {
      await this.updateStats(ctx.from.id, 'button_click', 'category');
    }
    await this.handleItemClick(ctx, itemId);
  }

  // Обработка нажатия кнопок меню
  private async handleButtonClick(ctx: MerchContext): Promise<void> {
    try {
      const messageText = ctx.message?.text;
      if (!messageText || !ctx.from) return;

      console.log(`🔘 Обрабатываем нажатие кнопки: "${messageText}"`);

      // Обработка специальных кнопок
      if (messageText === '🏠 Главная') {
        await this.updateStats(ctx.from.id, 'button_click', 'main_menu');
        await this.showMainMenu(ctx);
        return;
      }

      if (messageText === '◀️ Назад') {
        await this.updateStats(ctx.from.id, 'button_click', 'back');
        await this.goBack(ctx);
        return;
      }

      if (messageText === '📋 Еще категории') {
        await this.updateStats(ctx.from.id, 'button_click', 'more_categories');
        await this.showMoreCategories(ctx);
        return;
      }

      // Инициализируем историю выбора
      if (!ctx.session.userChoiceHistory) {
        ctx.session.userChoiceHistory = [];
      }

      // Получаем иерархию кнопок
      const buttonsHierarchy = await this.getButtonsHierarchy();
      
      // Ищем кнопку в иерархии
      let foundButton = null;
      let foundParentId = null;

      for (const [parentId, children] of Object.entries(buttonsHierarchy)) {
        for (const child of children) {
          if (child.name === messageText) {
            foundButton = child;
            foundParentId = parentId;
            break;
          }
        }
        if (foundButton) break;
      }

      if (!foundButton) {
        console.log(`❌ Кнопка "${messageText}" не найдена в иерархии`);
        return;
      }

      console.log(`✅ Найдена кнопка: ${foundButton.name} (ID: ${foundButton.id})`);

      // Обновляем статистику
      await this.updateStats(ctx.from.id, 'button_click', foundButton.name);

      // Если у кнопки есть дети, добавляем в историю
      if (buttonsHierarchy[foundButton.id]) {
        ctx.session.userChoiceHistory.push(foundButton.id);
      }

      // Отправляем изображения
      const photoUrls = await this.getPhotoUrls(foundButton.id);
      console.log(`📸 Найдено ${photoUrls.length} изображений для отправки`);
      
      for (const photoUrl of photoUrls) {
        try {
          const fileName = photoUrl.split('/').pop();
          if (!fileName) continue;
          
          const filePath = path.join(__dirname, '..', '..', 'public', 'add', 'merch', fileName);
          console.log(`📤 Отправляем изображение: ${filePath}`);
          
          if (fs.existsSync(filePath)) {
            await ctx.replyWithPhoto(new InputFile(filePath));
            console.log(`✅ Изображение отправлено успешно: ${fileName}`);
          } else {
            console.log(`❌ Файл не найден: ${filePath}`);
          }
        } catch (error) {
          console.error(`❌ Ошибка отправки изображения ${photoUrl}:`, error);
        }
      }

      // Отправляем описание (получаем полный элемент из базы для получения description)
      const item = await this.findItemById(foundButton.id);
      if (item && item.description) {
        const formattedText = this.formatDescription(item.description);
        console.log(`📝 [MerchBot] Отправляем описание (raw из БД):`, item.description);
        console.log(`📝 [MerchBot] Отправляем описание (formatted):`, formattedText);
        console.log(`📝 [MerchBot] Содержит <b>:`, formattedText.includes('<b>'));
        console.log(`📝 [MerchBot] Содержит **:`, formattedText.includes('**'));
        
        try {
          if (!ctx.chat) {
            console.error(`❌ [MerchBot] ctx.chat не определен`);
            return;
          }
          
          await ctx.api.sendMessage(ctx.chat.id, formattedText, {
            parse_mode: 'HTML'
          } as any);
          
          console.log(`✅ [MerchBot] Сообщение отправлено успешно`);
        } catch (error: any) {
          console.error(`❌ [MerchBot] Ошибка отправки сообщения с форматированием:`, error.message);
          console.error(`❌ [MerchBot] Текст который вызвал ошибку:`, formattedText);
          // Если ошибка с форматированием, отправляем без форматирования
          const plainText = formattedText
            .replace(/<[^>]+>/g, '') // Убираем все HTML теги
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/\*\*/g, '') // Убираем Markdown
            .replace(/\*/g, '');
          await ctx.reply(plainText);
        }
      } else if (foundButton.text) {
        // Fallback на старый способ, если description нет
        await ctx.reply(foundButton.text);
      }

      // Обновляем меню после отправки всех данных
      // Проверяем, есть ли дочерние элементы для текущей кнопки
      const children = buttonsHierarchy[foundButton.id] || [];
      
      if (children.length > 0) {
        // У кнопки есть дочерние элементы, показываем подменю
        await this.showSubMenu(ctx, children);
      } else {
        // Это конечный элемент, показываем меню навигации
        await this.showNavigationMenu(ctx);
      }

    } catch (error) {
      console.error('❌ Ошибка при обработке нажатия кнопки:', error);
      await ctx.reply('❌ Произошла ошибка при обработке запроса');
    }
  }

  // Обновление меню (не используется, заменено на обновление через editMessageReplyMarkup)
  private async updateMenu(ctx: MerchContext, buttonsHierarchy: any): Promise<void> {
    // Метод оставлен для обратной совместимости, но не используется
    // Меню теперь обновляется через editMessageReplyMarkup в showMainMenu/showSubMenu
  }

  // Показать дополнительные категории
  private async showMoreCategories(ctx: MerchContext): Promise<void> {
    try {
      const buttonsHierarchy = await this.getButtonsHierarchy();
      const rootItems = buttonsHierarchy['0'] || [];

      // Создаем клавиатуру для дополнительных категорий
      const keyboard = new Keyboard();
      
      // Показываем категории начиная с 13-й (пропускаем первые 12)
      const moreCategories = rootItems.slice(12);
      
      // Категории в два столбца (по 2 кнопки в ряду)
      for (let i = 0; i < moreCategories.length; i += 2) {
        const first = moreCategories[i];
        const second = moreCategories[i + 1];
        
        if (second) {
          keyboard.text(first.name).text(second.name).row();
        } else {
          keyboard.text(first.name).row();
        }
      }
      
      // Добавляем навигационные кнопки: Главная и Назад в одном ряду, Поиск и Обратная связь в другом
      keyboard.text('🏠 Главная').text('◀️ Назад').row();
      keyboard.text('🔍 Поиск').text('📩 Обратная связь').row();
      
      keyboard.resized().persistent();

      // Проверяем, есть ли уже сообщение с меню для обновления
      if (ctx.session.lastMenuMessageId && ctx.chat) {
        try {
          // Обновляем существующее сообщение
          await ctx.api.editMessageReplyMarkup(ctx.chat.id, ctx.session.lastMenuMessageId, {
            reply_markup: keyboard
          } as any);
          // Также обновляем текст сообщения
          await ctx.api.editMessageText(ctx.chat.id, ctx.session.lastMenuMessageId, '📋 Дополнительные категории:', {
            reply_markup: keyboard
          } as any);
          return;
        } catch (error) {
          // Если не удалось обновить (сообщение не найдено), отправляем новое
          console.log('⚠️ [MerchBot] Не удалось обновить дополнительные категории, отправляем новое сообщение');
        }
      }

      // Отправляем новое сообщение с постоянной клавиатурой
      const sentMessage = await ctx.reply('📋 Дополнительные категории:', {
        reply_markup: keyboard
      });
      
      // Сохраняем ID сообщения для последующего обновления
      if (sentMessage && 'message_id' in sentMessage) {
        ctx.session.lastMenuMessageId = sentMessage.message_id as number;
      }
    } catch (error) {
      console.error('❌ Ошибка при показе дополнительных категорий:', error);
      await ctx.reply('❌ Ошибка загрузки категорий. Попробуйте позже.');
    }
  }

  // Обработка клика по элементу
  private async handleItemClick(ctx: MerchContext, itemId: string): Promise<void> {
    try {
      console.log(`🔘 [handleItemClick] Начало обработки клика для itemId: ${itemId}`);
      const buttonsHierarchy = await this.getButtonsHierarchy();
      const item = await this.findItemById(itemId);
      
      console.log('[DEBUG merch item]', {
        id: item?.id,
        name: item?.name,
        hasDescription: !!item?.description,
        descriptionLength: item?.description?.length || 0,
        descriptionPreview: item?.description?.substring(0, 100) || 'нет'
      });
      
      if (!item) {
        console.log(`❌ [handleItemClick] Элемент ${itemId} не найден`);
        await ctx.reply('❌ Элемент не найден.');
        return;
      }

      // Обновляем статистику
      if (ctx.from) {
        await this.updateStats(ctx.from.id, 'button_click', item.name);
      }

      // Получаем изображения
      const photoUrls = await this.getPhotoUrls(itemId);
      
      // Отправляем изображения
      console.log(`📸 Отправляем ${photoUrls.length} изображений для элемента ${itemId}:`, photoUrls);
      for (const url of photoUrls) {
        try {
          console.log(`📤 Отправляем изображение: ${url}`);
          
          // Извлекаем имя файла из URL
          const fileName = url.split('/').pop();
          if (!fileName) {
            console.error(`❌ Не удалось извлечь имя файла из URL: ${url}`);
            continue;
          }
          
          // Путь к файлу на сервере
          const filePath = path.join(__dirname, '..', '..', 'public', 'add', 'merch', fileName);
          
          // Проверяем, существует ли файл
          if (!fs.existsSync(filePath)) {
            console.error(`❌ Файл не найден: ${filePath}`);
            continue;
          }
          
          // Создаем InputFile и отправляем
          const photo = new InputFile(filePath);
          await ctx.replyWithPhoto(photo);
          console.log(`✅ Изображение отправлено успешно: ${fileName}`);
          await new Promise(resolve => setTimeout(resolve, 500)); // Задержка между фото
        } catch (error) {
          console.error(`❌ Ошибка отправки изображения ${url}:`, error);
        }
      }

      // Отправляем описание
      if (item.description) {
        const formattedText = this.formatDescription(item.description);
        console.log(`📝 [MerchBot] Отправляем описание (raw из БД):`, item.description);
        console.log(`📝 [MerchBot] Отправляем описание (formatted):`, formattedText);
        console.log(`📝 [MerchBot] Содержит <b>:`, formattedText.includes('<b>'));
        console.log(`📝 [MerchBot] Содержит **:`, formattedText.includes('**'));
        
        try {
          if (!ctx.chat) {
            console.error(`❌ [MerchBot] ctx.chat не определен`);
            return;
          }
          
          await ctx.api.sendMessage(ctx.chat.id, formattedText, {
            parse_mode: 'HTML'
          } as any);
          
          console.log(`✅ [MerchBot] Сообщение отправлено успешно`);
        } catch (error: any) {
          console.error(`❌ [MerchBot] Ошибка отправки сообщения с форматированием:`, error.message);
          console.error(`❌ [MerchBot] Текст который вызвал ошибку:`, formattedText);
          // Если ошибка с форматированием, отправляем без форматирования
          const plainText = formattedText
            .replace(/<[^>]+>/g, '') // Убираем все HTML теги
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/\*\*/g, '') // Убираем Markdown
            .replace(/\*/g, '');
          await ctx.reply(plainText);
        }
      }

      // Проверяем, есть ли дочерние элементы
      const children = buttonsHierarchy[itemId] || [];
      
      if (children.length > 0) {
        // Добавляем в историю
        if (!ctx.session.userChoiceHistory) {
          ctx.session.userChoiceHistory = [];
        }
        ctx.session.userChoiceHistory.push(itemId);
        
        // Показываем дочерние элементы (обновляем меню)
        await this.showSubMenu(ctx, children);
      } else {
        // Это конечный элемент, показываем меню навигации
        // Меню обновляется через lastMenuMessageId
        await this.showNavigationMenu(ctx);
      }
    } catch (error) {
      console.error('Error handling item click:', error);
      await ctx.reply('❌ Ошибка обработки запроса. Попробуйте позже.');
    }
  }

  // Показать подменю
  private async showSubMenu(ctx: MerchContext, children: Array<{id: string, name: string, text: string}>): Promise<void> {
    // Создаем постоянную клавиатуру в столбец
    const keyboard = new Keyboard();
    
    // Кнопки подкатегорий в столбец (каждая в своем ряду)
    for (const child of children) {
      keyboard.text(child.name).row();
    }
    
    // Навигационные кнопки: Главная и Назад в одном ряду, Поиск и Обратная связь в другом
    keyboard.text('🏠 Главная').text('◀️ Назад').row();
    keyboard.text('🔍 Поиск').text('📩 Обратная связь').row();
    
    keyboard.resized().persistent();

    // Проверяем, есть ли уже сообщение с меню для обновления
    if (ctx.session.lastMenuMessageId && ctx.chat) {
      try {
        // Обновляем существующее сообщение
        await ctx.api.editMessageReplyMarkup(ctx.chat.id, ctx.session.lastMenuMessageId, {
          reply_markup: keyboard
        } as any);
        // Также обновляем текст сообщения
        await ctx.api.editMessageText(ctx.chat.id, ctx.session.lastMenuMessageId, '➡️ Выберите подкатегорию:', {
          reply_markup: keyboard
        } as any);
        return;
      } catch (error) {
        // Если не удалось обновить (сообщение не найдено), отправляем новое
        console.log('⚠️ [MerchBot] Не удалось обновить подменю, отправляем новое сообщение');
      }
    }

    // Отправляем новое сообщение с постоянной клавиатурой
    const sentMessage = await ctx.reply('➡️ Выберите подкатегорию:', {
      reply_markup: keyboard
    });
    
    // Сохраняем ID сообщения для последующего обновления
    if (sentMessage && 'message_id' in sentMessage) {
      ctx.session.lastMenuMessageId = sentMessage.message_id as number;
    }
  }

  // Показать меню навигации
  private async showNavigationMenu(ctx: MerchContext): Promise<void> {
    // Создаем постоянную клавиатуру в столбец
    const keyboard = new Keyboard();
    
    // Навигационные кнопки: Главная и Назад в одном ряду, Поиск и Обратная связь в другом
    keyboard.text('🏠 Главная').text('◀️ Назад').row();
    keyboard.text('🔍 Поиск').text('📩 Обратная связь').row();
    
    keyboard.resized().persistent();

    // Проверяем, есть ли уже сообщение с меню для обновления
    if (ctx.session.lastMenuMessageId && ctx.chat) {
      try {
        // Обновляем существующее сообщение
        await ctx.api.editMessageReplyMarkup(ctx.chat.id, ctx.session.lastMenuMessageId, {
          reply_markup: keyboard
        } as any);
        // Также обновляем текст сообщения
        await ctx.api.editMessageText(ctx.chat.id, ctx.session.lastMenuMessageId, 'Выберите действие:', {
          reply_markup: keyboard
        } as any);
        return;
      } catch (error) {
        // Если не удалось обновить (сообщение не найдено), отправляем новое
        console.log('⚠️ [MerchBot] Не удалось обновить меню навигации, отправляем новое сообщение');
      }
    }

    // Отправляем новое сообщение с постоянной клавиатурой
    const sentMessage = await ctx.reply('Выберите действие:', {
      reply_markup: keyboard
    });
    
    // Сохраняем ID сообщения для последующего обновления
    if (sentMessage && 'message_id' in sentMessage) {
      ctx.session.lastMenuMessageId = sentMessage.message_id as number;
    }
  }

  // Назад
  private async goBack(ctx: MerchContext): Promise<void> {
    if (!ctx.session.userChoiceHistory || ctx.session.userChoiceHistory.length === 0) {
      await this.showMainMenu(ctx);
      return;
    }

    ctx.session.userChoiceHistory.pop();
    const currentMenuId = ctx.session.userChoiceHistory[ctx.session.userChoiceHistory.length - 1] || '0';
    
    const buttonsHierarchy = await this.getButtonsHierarchy();
    const children = buttonsHierarchy[currentMenuId] || [];
    
    if (currentMenuId === '0') {
      // Возвращаемся в главное меню
      await this.showMainMenu(ctx);
    } else if (children.length > 0) {
      // Показываем подменю с дочерними элементами
      await this.showSubMenu(ctx, children);
    } else {
      // Нет дочерних элементов, возвращаемся в главное меню
      await this.showMainMenu(ctx);
    }
  }

  // Начать поиск
  private async startSearch(ctx: MerchContext): Promise<void> {
    ctx.session.searchState = true;
    
    // Создаем постоянную клавиатуру
    // Навигационные кнопки: Главная и Назад в одном ряду, Поиск и Обратная связь в другом
    const keyboard = new Keyboard()
      .text('🏠 Главная')
      .text('◀️ Назад')
      .row()
      .text('🔍 Поиск')
      .text('📩 Обратная связь')
      .resized()
      .persistent();
    
    await ctx.reply('Введите ключевое слово для поиска:', {
      reply_markup: keyboard
    });
  }

  // Начать обратную связь
  private async startFeedback(ctx: MerchContext): Promise<void> {
    ctx.session.feedbackState = {
      step: 'email',
      email: undefined,
      text: undefined,
      photos: []
    };
    
    // Создаем постоянную клавиатуру
    // Навигационные кнопки: Главная и Назад в одном ряду, Поиск и Обратная связь в другом
    const keyboard = new Keyboard()
      .text('🏠 Главная')
      .text('◀️ Назад')
      .row()
      .text('🔍 Поиск')
      .text('📩 Обратная связь')
      .resized()
      .persistent();
    
    await ctx.reply('📧 Пожалуйста, введите ваш email адрес:', {
      reply_markup: keyboard
    });
  }

  // Обработка текстовых сообщений
  private async handleTextMessage(ctx: MerchContext): Promise<void> {
    if (!ctx.message || !ctx.message.text) return;
    const text = ctx.message.text;
    
    // Обработка поиска
    if (ctx.session.searchState) {
      await this.handleSearchQuery(ctx, text);
      return;
    }
    
    // Обработка обратной связи
    if (ctx.session.feedbackState) {
      await this.handleFeedbackText(ctx, text);
      return;
    }
    
    // Обычное сообщение
    await ctx.reply('Используйте кнопки меню для навигации.');
  }

  // Обработка поискового запроса
  private async handleSearchQuery(ctx: MerchContext, query: string): Promise<void> {
    try {
      // Валидация поискового запроса
      if (!query || query.trim().length === 0) {
        await ctx.reply('❌ Поисковый запрос не может быть пустым. Пожалуйста, введите ключевое слово:');
        return;
      }
      
      // Ограничение на длину поискового запроса
      const MAX_QUERY_LENGTH = 100;
      const MIN_QUERY_LENGTH = 2;
      const trimmedQuery = query.trim();
      
      if (trimmedQuery.length < MIN_QUERY_LENGTH) {
        await ctx.reply(`❌ Поисковый запрос слишком короткий (минимум ${MIN_QUERY_LENGTH} символа). Пожалуйста, введите более длинный запрос:`);
        return;
      }
      
      if (trimmedQuery.length > MAX_QUERY_LENGTH) {
        await ctx.reply(`❌ Поисковый запрос слишком длинный (максимум ${MAX_QUERY_LENGTH} символов). Пожалуйста, сократите запрос:`);
        return;
      }
      
      if (ctx.from) {
        await this.updateStats(ctx.from.id, 'search', trimmedQuery.toLowerCase());
      }
      
      const results = await this.searchItems(trimmedQuery);
      
      if (results.length === 0) {
        await ctx.reply('Ничего не найдено. Попробуйте другое ключевое слово.');
        return;
      }
      
      // Ограничение на количество результатов (максимум 20)
      const MAX_RESULTS = 20;
      const displayResults = results.slice(0, MAX_RESULTS);
      
      const keyboard = new InlineKeyboard();
      
      for (const result of displayResults) {
        keyboard.text(result.name, `item_${result.id}`).row();
      }
      
      keyboard.text('◀️ Назад', 'back').text('🏠 Главная', 'main_menu');
      
      const resultsText = results.length > MAX_RESULTS 
        ? `Результаты поиска (показано ${MAX_RESULTS} из ${results.length}):`
        : `Результаты поиска (найдено ${results.length}):`;
      
      await ctx.reply(resultsText, {
        reply_markup: keyboard
      });
      
      ctx.session.searchState = false;
    } catch (error) {
      console.error('Error handling search:', error);
      await ctx.reply('❌ Ошибка поиска. Попробуйте позже.');
    }
  }

  // Обработка текста обратной связи
  private async handleFeedbackText(ctx: MerchContext, text: string): Promise<void> {
    const feedback = ctx.session.feedbackState;
    if (!feedback) return;
    
    // Ограничение на длину текста (Telegram ограничение: 4096 символов)
    const MAX_TEXT_LENGTH = 4096;
    const MIN_TEXT_LENGTH = 10;
    
    switch (feedback.step) {
      case 'email':
        // Валидация email
        if (!text || text.length === 0) {
          await ctx.reply('❌ Email не может быть пустым. Пожалуйста, введите email адрес:');
          return;
        }
        if (text.length > 255) {
          await ctx.reply('❌ Email слишком длинный. Пожалуйста, введите корректный email адрес:');
          return;
        }
        if (this.isValidEmail(text)) {
          feedback.email = text;
          feedback.step = 'text';
          await ctx.reply('📝 Теперь введите текст вашего сообщения:');
        } else {
          await ctx.reply('❌ Неверный формат email. Пожалуйста, введите корректный email адрес:');
        }
        break;
        
      case 'text':
        // Валидация длины текста
        if (!text || text.length < MIN_TEXT_LENGTH) {
          await ctx.reply(`❌ Сообщение слишком короткое. Пожалуйста, введите более подробное сообщение (минимум ${MIN_TEXT_LENGTH} символов):`);
          return;
        }
        if (text.length > MAX_TEXT_LENGTH) {
          await ctx.reply(`❌ Сообщение слишком длинное (максимум ${MAX_TEXT_LENGTH} символов). Пожалуйста, сократите текст:`);
          return;
        }
        feedback.text = text;
        feedback.step = 'photo';
        await ctx.reply('📷 Теперь вы можете отправить фотографию (необязательно) или написать "готово":');
        break;
        
      case 'photo':
        if (text.toLowerCase() === 'готово') {
          await this.finishFeedback(ctx);
        } else {
          await ctx.reply('📷 Отправьте фотографию или напишите "готово":');
        }
        break;
    }
  }

  // Обработка фотографий
  private async handlePhotoMessage(ctx: MerchContext): Promise<void> {
    const feedback = ctx.session.feedbackState;
    if (!feedback || feedback.step !== 'photo') {
      await ctx.reply('Используйте кнопки меню для навигации.');
      return;
    }
    
    if (!ctx.message || !ctx.message.photo) {
      await ctx.reply('Ошибка обработки фотографии.');
      return;
    }
    
    try {
      // Ограничение на количество фотографий (максимум 10)
      const MAX_PHOTOS = 10;
      if (!feedback.photos) {
        feedback.photos = [];
      }
      
      if (feedback.photos.length >= MAX_PHOTOS) {
        await ctx.reply(`❌ Достигнуто максимальное количество фотографий (${MAX_PHOTOS}). Напишите "готово" для завершения.`);
        return;
      }
      
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      
      // Проверка размера файла (Telegram ограничение: 20MB для фото)
      const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
      if (photo.file_size && photo.file_size > MAX_FILE_SIZE) {
        await ctx.reply('❌ Фотография слишком большая (максимум 20MB). Пожалуйста, отправьте фотографию меньшего размера:');
        return;
      }
      
      const file = await ctx.api.getFile(photo.file_id);
      
      // Сохраняем информацию о фото
      if (file.file_path) {
        feedback.photos.push(file.file_path);
        const remaining = MAX_PHOTOS - feedback.photos.length;
        if (remaining > 0) {
          await ctx.reply(`✅ Фотография сохранена! Вы можете отправить еще ${remaining} фотографий или напишите "готово":`);
        } else {
          await ctx.reply('✅ Фотография сохранена! Достигнуто максимальное количество фотографий. Напишите "готово" для завершения:');
        }
      } else {
        await ctx.reply('❌ Ошибка получения информации о фотографии.');
      }
    } catch (error) {
      console.error('Error handling photo:', error);
      await ctx.reply('❌ Ошибка сохранения фотографии. Пожалуйста, попробуйте еще раз или напишите "готово":');
    }
  }

  // Завершить обратную связь
  private async finishFeedback(ctx: MerchContext): Promise<void> {
    const feedback = ctx.session.feedbackState;
    if (!feedback) {
      await ctx.reply('❌ Ошибка: состояние обратной связи не найдено. Пожалуйста, начните заново.');
      await this.showMainMenu(ctx);
      return;
    }
    
    // Валидация обязательных полей
    if (!feedback.email || !feedback.text) {
      await ctx.reply('❌ Ошибка: не все обязательные поля заполнены. Пожалуйста, начните заново.');
      ctx.session.feedbackState = undefined;
      await this.showMainMenu(ctx);
      return;
    }
    
    try {
      // Отправляем сообщение администратору
      const adminMessage = `
📩 НОВОЕ СООБЩЕНИЕ ОБРАТНОЙ СВЯЗИ

👤 Пользователь: ${ctx.from?.first_name || 'Unknown'} ${ctx.from?.last_name || ''}
🆔 ID: ${ctx.from?.id || 'Unknown'}
📧 Email: ${feedback.email}
📝 Сообщение: ${feedback.text}
📷 Фотографий: ${feedback.photos?.length || 0}
⏰ Время: ${new Date().toISOString()}
      `;
      
      // Здесь можно отправить сообщение администратору
      console.log('Feedback received:', adminMessage);
      
      // Очищаем состояние после успешной обработки
      ctx.session.feedbackState = undefined;
      
      await ctx.reply('✅ Спасибо за ваше сообщение! Мы получили вашу обратную связь и обязательно рассмотрим её.');
      
      // Показываем главное меню
      await this.showMainMenu(ctx);
    } catch (error) {
      console.error('Error finishing feedback:', error);
      // Не очищаем состояние при ошибке, чтобы пользователь мог попробовать снова
      await ctx.reply('❌ Ошибка отправки сообщения. Пожалуйста, попробуйте еще раз или напишите "готово" позже.');
    }
  }

  // Получение иерархии кнопок с кэшированием
  private async getButtonsHierarchy(forceRefresh: boolean = false): Promise<Record<string, Array<{id: string, name: string, text: string}>>> {
    const now = new Date();
    const cacheAge = now.getTime() - this.cache.lastUpdate.getTime();
    
    // Кэш действителен 1 час, если не требуется принудительное обновление
    if (!forceRefresh && cacheAge < 3600000 && Object.keys(this.cache.buttonsHierarchy).length > 0) {
      return this.cache.buttonsHierarchy;
    }
    
    try {
      const categories = await prisma.merch.findMany({
        where: { isActive: true },
        orderBy: [
          { sortOrder: 'asc' },
          { name: 'asc' }
        ],
        include: {
          attachments: {
            where: { type: 'image' },
            orderBy: { sortOrder: 'asc' }
          }
        }
      });
      
      const hierarchy: Record<string, Array<{id: string, name: string, text: string}>> = {};
      
      for (const category of categories) {
        const parentId = category.parentId || '0';
        if (!hierarchy[parentId]) {
          hierarchy[parentId] = [];
        }
        
        hierarchy[parentId].push({
          id: category.id,
          name: category.name,
          text: category.description || ''
        });
      }
      
      // Обновляем кэш только если загрузка прошла успешно
      this.cache.buttonsHierarchy = hierarchy;
      this.cache.lastUpdate = now;
      
      return hierarchy;
    } catch (error) {
      console.error('Error getting buttons hierarchy:', error);
      // Если кэш пуст, возвращаем пустой объект вместо старого кэша
      if (Object.keys(this.cache.buttonsHierarchy).length === 0) {
        return {};
      }
      // Если есть старый кэш, возвращаем его, но логируем ошибку
      console.warn('⚠️ [MerchBot] Using stale cache due to error');
      return this.cache.buttonsHierarchy;
    }
  }

  // Принудительное обновление кэша
  public async refreshCache(): Promise<boolean> {
    try {
      await this.getButtonsHierarchy(true);
      console.log('✅ [MerchBot] Cache refreshed successfully');
      return true;
    } catch (error) {
      console.error('❌ [MerchBot] Cache refresh failed:', error);
      return false;
    }
  }

  // Поиск элементов
  private async searchItems(query: string): Promise<Array<{id: string, name: string, text: string}>> {
    try {
      const items = await prisma.merch.findMany({
        where: {
          isActive: true,
          name: {
            contains: query,
            mode: 'insensitive'
          }
        },
        orderBy: [
          { sortOrder: 'asc' },
          { name: 'asc' }
        ]
      });
      
      return items.map(item => ({
        id: item.id,
        name: item.name,
        text: item.description || ''
      }));
    } catch (error) {
      console.error('Error searching items:', error);
      return [];
    }
  }

  // Получение URL изображений
  private async getPhotoUrls(itemId: string): Promise<string[]> {
    try {
      console.log(`🔍 Ищем изображения для элемента ${itemId}`);
      const item = await prisma.merch.findUnique({
        where: { id: itemId },
        include: {
          attachments: {
            where: { type: 'image' },
            orderBy: { sortOrder: 'asc' }
          }
        }
      });
      
      if (!item) {
        console.log(`❌ Элемент ${itemId} не найден в базе данных`);
        return [];
      }
      
      console.log(`📋 Найден элемент: ${item.name}, attachments: ${item.attachments.length}`);
      
      const urls: string[] = [];
      const addedFiles = new Set<string>(); // Для отслеживания уже добавленных файлов
      
      // Изображения из attachments
      for (const attachment of item.attachments) {
        if (!addedFiles.has(attachment.source)) { // Проверяем, не добавлен ли уже этот файл
          const attachmentUrl = this.getImageUrl(attachment.source);
          urls.push(attachmentUrl);
          addedFiles.add(attachment.source);
          console.log(`📎 Добавлено дополнительное изображение: ${attachmentUrl}`);
        } else {
          console.log(`⏭️ Пропущено дублирующее изображение: ${attachment.source}`);
        }
      }
      
      console.log(`📸 Итого URL изображений: ${urls.length}`, urls);
      return urls;
    } catch (error) {
      console.error('Error getting photo URLs:', error);
      return [];
    }
  }

  // Поиск элемента по ID
  private async findItemById(itemId: string): Promise<{id: string, name: string, description: string} | null> {
    try {
      console.log(`🔍 [findItemById] Ищем элемент с ID: ${itemId}`);
      const item = await prisma.merch.findUnique({
        where: { id: itemId },
        select: {
          id: true,
          name: true,
          description: true,
          layer: true
        }
      });
      
      if (!item) {
        console.log(`❌ [findItemById] Элемент ${itemId} не найден в БД`);
        return null;
      }
      
      console.log(`✅ [findItemById] Найден элемент:`, {
        id: item.id,
        name: item.name,
        layer: item.layer,
        hasDescription: !!item.description,
        descriptionLength: item.description?.length || 0
      });
      
      return {
        id: item.id,
        name: item.name,
        description: item.description || ''
      };
    } catch (error) {
      console.error('❌ [findItemById] Error finding item:', error);
      return null;
    }
  }

  // Сохранение пользователя Telegram в БД
  private async saveUserToDB(userId: number, username?: string, firstName?: string, lastName?: string): Promise<void> {
    try {
      await prisma.merchTgUser.upsert({
        where: { userId: userId },
        update: {
          username: username,
          firstName: firstName,
          lastName: lastName,
          updatedAt: new Date()
        },
        create: {
          userId: userId,
          username: username,
          firstName: firstName,
          lastName: lastName
        }
      });
    } catch (error) {
      console.error('Error saving Telegram user to DB:', error);
    }
  }

  // Обновление статистики
  private async updateStats(userId: number, actionType: string, details?: string): Promise<void> {
    try {
      // Сначала убеждаемся, что пользователь существует
      const telegramUser = await prisma.merchTgUser.findUnique({
        where: { userId: userId }
      });

      if (telegramUser) {
        // Сохраняем статистику
        await prisma.merchTgUserStats.create({
          data: {
            userId: telegramUser.id,
            action: actionType,
            details: details
          }
        });
      }
      
      console.log(`Stats: User ${userId} - ${actionType}${details ? ` - ${details}` : ''}`);
    } catch (error) {
      console.error('Error updating stats:', error);
    }
  }

  // Вспомогательные методы
  private isValidEmail(email: string): boolean {
    const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return pattern.test(email);
  }

  private formatDescription(description: string): string {
    if (!description) return '';
    
    // Description хранится в формате Markdown
    // Конвертируем Markdown в HTML для Telegram
    // Telegram HTML поддерживает: <b>bold</b>, <i>italic</i>, <u>underline</u>, 
    // <s>strike</s>, <code>code</code>, <a href="url">link</a>
    // ВАЖНО: Telegram НЕ поддерживает тег <br>! Переносы строк должны быть \n
    
    let markdown = description.trim();
    
    // Удаляем все теги <br> и заменяем их на переносы строк
    // Это нужно на случай, если в базе данных уже есть HTML с тегами <br>
    // Telegram НЕ поддерживает тег <br>, только переносы строк \n
    markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
    
    console.log(`🔍 [formatDescription] Входной Markdown (первые 200 символов):`, markdown.substring(0, 200));
    console.log(`🔍 [formatDescription] Содержит **:`, markdown.includes('**'));
    console.log(`🔍 [formatDescription] Содержит <br> (после замены):`, markdown.includes('<br>'));
    
    // Конвертируем Markdown в HTML для Telegram
    // Если текст уже содержит HTML теги, защищаем их перед обработкой Markdown
    let html = markdown;
    
    // Проверяем, есть ли уже HTML теги в тексте
    const hasExistingHtmlTags = /<\/?(?:b|i|u|s|code|pre|a)(?:\s+[^>]*)?>/gi.test(html);
    
    // Если есть существующие HTML теги, защищаем их перед обработкой Markdown
    const existingTags: Array<{ placeholder: string; tag: string }> = [];
    let existingTagIndex = 0;
    
    if (hasExistingHtmlTags) {
      // Защищаем существующие HTML теги перед обработкой Markdown
      // Используем нежадный поиск для парных тегов, чтобы защитить их содержимое
      const existingTagPattern = /<\/?(?:b|i|u|s|code|pre|a)(?:\s+[^>]*)?>/gi;
      let tagMatch;
      const tagMatches: Array<{ start: number; end: number; tag: string }> = [];
      
      // Находим все теги и их позиции
      while ((tagMatch = existingTagPattern.exec(html)) !== null) {
        tagMatches.push({
          start: tagMatch.index,
          end: tagMatch.index + tagMatch[0].length,
          tag: tagMatch[0]
        });
      }
      
      // Защищаем теги с конца к началу (чтобы не сбить индексы)
      tagMatches.reverse().forEach(({ start, end, tag }) => {
        const placeholder = `__EXISTING_HTML_${existingTagIndex++}__`;
        existingTags.unshift({ placeholder, tag }); // unshift для сохранения порядка
        html = html.substring(0, start) + placeholder + html.substring(end);
      });
    }
    
    // Порядок важен! Обрабатываем от более специфичных к менее специфичным
    
    // 1. Сначала обрабатываем код (чтобы не обрабатывать markdown внутри кода)
    const codeBlocks: string[] = [];
    html = html.replace(/`([^`]+)`/g, (_match, content) => {
      const index = codeBlocks.length;
      // Экранируем HTML-символы в коде
      const escapedContent = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      codeBlocks.push(`<code>${escapedContent}</code>`);
      return `__CODE_BLOCK_${index}__`;
    });
    
    // 2. Обрабатываем ссылки (чтобы не обрабатывать markdown внутри ссылок)
    const links: string[] = [];
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
      const index = links.length;
      // Экранируем URL и текст для HTML
      const escapedUrl = url
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      const escapedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      links.push(`<a href="${escapedUrl}">${escapedText}</a>`);
      return `__LINK_${index}__`;
    });
    
    // 3. Жирный текст: **текст** или __текст__
    // Важно: используем нежадное совпадение и обрабатываем до курсива
    html = html.replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>');
    html = html.replace(/__(?!CODE_BLOCK_|LINK_|EXISTING_HTML_|\d+__)([^_\n]+?)__(?!\d+__)/g, '<b>$1</b>');
    
    // 4. Зачеркнутый текст: ~~текст~~
    html = html.replace(/~~([^~\n]+?)~~/g, '<s>$1</s>');
    
    // 5. Курсив: *текст* (но не **текст**)
    html = html.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<i>$1</i>');
    // Курсив: _текст_ (но не __текст__)
    html = html.replace(/(?<!_)_([^_\n]+?)_(?!_)/g, '<i>$1</i>');
    
    // Восстанавливаем код и ссылки
    codeBlocks.forEach((code, index) => {
      html = html.replace(`__CODE_BLOCK_${index}__`, code);
    });
    links.forEach((link, index) => {
      html = html.replace(`__LINK_${index}__`, link);
    });
    
    // Восстанавливаем существующие HTML теги
    existingTags.forEach(({ placeholder, tag }) => {
      html = html.replace(placeholder, tag);
    });
    
    console.log(`🔄 [formatDescription] После конвертации (первые 200 символов):`, html.substring(0, 200));
    console.log(`🔄 [formatDescription] Содержит <b>:`, html.includes('<b>'));
    console.log(`🔄 [formatDescription] Содержит \n:`, html.includes('\n'));
    
    // Экранируем HTML-символы в тексте, но сохраняем разрешенные теги Telegram
    // Telegram HTML поддерживает ТОЛЬКО: <b>, <i>, <u>, <s>, <code>, <pre>, <a href="url">
    // ВАЖНО: Telegram НЕ поддерживает тег <br>! Переносы строк должны быть символами \n
    // Стратегия: находим все теги, защищаем их маркерами, экранируем текст, восстанавливаем теги
    
    // Регулярное выражение для всех разрешенных тегов Telegram (включая атрибуты)
    // Паттерн захватывает: <tag>, </tag>, <tag attr="value">
    // НЕ включает <br>, так как Telegram его не поддерживает
    const telegramTagRegex = /<\/?(?:b|i|u|s|code|pre|a)(?:\s+[^>]*)?>/gi;
    
    // Находим все теги и их позиции
    const tagMatches: Array<{ start: number; end: number; tag: string }> = [];
    let match;
    
    // Сбрасываем lastIndex для повторного использования
    telegramTagRegex.lastIndex = 0;
    while ((match = telegramTagRegex.exec(html)) !== null) {
      tagMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        tag: match[0]
      });
    }
    
    // Если нет тегов, просто экранируем весь текст
    if (tagMatches.length === 0) {
      html = html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return html.trim();
    }
    
    // Строим результат, защищая теги
    let result = '';
    let lastIndex = 0;
    const placeholders: Array<{ placeholder: string; tag: string }> = [];
    let placeholderIndex = 0;
    
    tagMatches.forEach(({ start, end, tag }) => {
      // Экранируем текст до тега (но сохраняем переносы строк \n)
      if (start > lastIndex) {
        const textBefore = html.substring(lastIndex, start);
        // Экранируем HTML символы, но сохраняем переносы строк
        result += textBefore
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        // Переносы строк \n остаются как есть - Telegram их поддерживает
      }
      
      // Добавляем маркер для тега
      const placeholder = `__TG_PL${placeholderIndex++}__`;
      placeholders.push({ placeholder, tag });
      result += placeholder;
      lastIndex = end;
    });
    
    // Экранируем остаток текста после последнего тега (сохраняем переносы строк)
    if (lastIndex < html.length) {
      const textAfter = html.substring(lastIndex);
      result += textAfter
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      // Переносы строк \n остаются как есть
    }
    
    // Восстанавливаем теги
    placeholders.forEach(({ placeholder, tag }) => {
      result = result.replace(placeholder, tag);
    });
    
    html = result;
    
    // Финальная проверка: убеждаемся, что нет тегов <br> (Telegram их не поддерживает)
    // Если остались какие-то <br> теги, заменяем их на переносы строк
    html = html.replace(/<br\s*\/?>/gi, '\n');
    
    console.log(`📤 [formatDescription] Итоговый HTML (первые 200 символов):`, html.substring(0, 200));
    console.log(`📤 [formatDescription] Итоговый HTML содержит <b>:`, html.includes('<b>'));
    console.log(`📤 [formatDescription] Итоговый HTML содержит \n:`, html.includes('\n'));
    console.log(`📤 [formatDescription] Итоговый HTML содержит <br>:`, html.includes('<br>'));
    
    // Убираем только начальные и конечные пробелы
    // Telegram HTML правильно обрабатывает переносы строк \n внутри текста
    return html.trim();
  }

  private getImageUrl(imagePath: string): string {
    if (imagePath.startsWith('http')) {
      return imagePath;
    }
    
    // Если imagePath содержит полный путь, извлекаем только имя файла
    let fileName = imagePath;
    
    // Убираем пути файловой системы (Windows и Unix)
    if (imagePath.includes('/') || imagePath.includes('\\')) {
      // Извлекаем только имя файла из пути
      const pathParts = imagePath.replace(/\\/g, '/').split('/');
      fileName = pathParts[pathParts.length - 1];
      console.log(`📁 [getImageUrl] Извлечено имя файла из пути: ${imagePath} -> ${fileName}`);
    }
    
    // Убираем префикс "public/add/merch/" если он есть
    if (fileName.startsWith('public/add/merch/')) {
      fileName = fileName.replace('public/add/merch/', '');
      console.log(`📁 [getImageUrl] Убран префикс public/add/merch/: ${fileName}`);
    }
    
    // Убираем префикс "add/merch/" если он есть
    if (fileName.startsWith('add/merch/')) {
      fileName = fileName.replace('add/merch/', '');
      console.log(`📁 [getImageUrl] Убран префикс add/merch/: ${fileName}`);
    }
    
    // Формируем правильный URL
    const url = `${API}/public/add/merch/${fileName}`;
    console.log(`📁 [getImageUrl] Итоговый URL: ${url}`);
    return url;
  }

  // Запуск бота
  public async launch(): Promise<boolean> {
    console.log('🚀 [MerchBot] Попытка запуска бота...');
    console.log('📊 [MerchBot] Статус:', { isRunning: this.isRunning, hasBot: !!this.bot, botInitialized: this.bot !== null });
    
    // Проверяем переменные окружения
    const hasToken = !!process.env.MERCH_BOT_TOKEN;
    const hasBotName = !!process.env.MERCH_BOT_NAME;
    console.log('🔍 [MerchBot] Проверка переменных окружения:');
    console.log('  - MERCH_BOT_TOKEN:', hasToken ? 'найден' : 'НЕ НАЙДЕН');
    console.log('  - MERCH_BOT_NAME:', hasBotName ? `найден (${process.env.MERCH_BOT_NAME})` : 'НЕ НАЙДЕН');
    
    if (!hasToken) {
      console.error('❌ [MerchBot] MERCH_BOT_TOKEN не найден - невозможно запустить бота');
      return false;
    }
    
    if (!hasBotName) {
      console.error('❌ [MerchBot] MERCH_BOT_NAME не найден - невозможно запустить бота');
      return false;
    }
    
    if (this.isRunning) {
      console.log('⚠️ [MerchBot] Бот уже запущен');
      return true; // Возвращаем true, так как бот уже работает
    }
    
    if (!this.bot) {
      console.error('❌ [MerchBot] Бот не инициализирован');
      // Пытаемся переинициализировать бота
      console.log('🔄 [MerchBot] Попытка переинициализации бота...');
      this.initializeBot();
      
      if (!this.bot) {
        console.error('❌ [MerchBot] Не удалось инициализировать бота после попытки');
        console.error('❌ [MerchBot] Возможные причины:');
        console.error('  - Неверный формат токена');
        console.error('  - Отсутствует MERCH_BOT_TOKEN');
        console.error('  - Отсутствует MERCH_BOT_NAME');
        return false;
      }
      console.log('✅ [MerchBot] Бот успешно переинициализирован');
    }

    try {
      console.log('🔄 [MerchBot] Вызываем bot.start()...');
      await this.bot.start({
        drop_pending_updates: true,
        allowed_updates: ['message', 'callback_query'],
      });

      this.isRunning = true;
      this.retryCount = 0;
      this.restartAttempts = 0; // Сбрасываем счетчик при успешном запуске
      console.log('✅ [MerchBot] Бот успешно запущен');
      console.log('📊 [MerchBot] Final status:', this.status);
      
      // Обработчик ошибок уже установлен в initializeBot(), не нужно устанавливать здесь
      
      return true;
    } catch (error) {
      console.error('❌ [MerchBot] Ошибка запуска бота:', error);
      if (error instanceof Error) {
        console.error('❌ [MerchBot] Error message:', error.message);
        console.error('❌ [MerchBot] Error stack:', error.stack);
        
        // Проверяем специфичные ошибки Telegram API
        if (error.message.includes('Conflict: terminated by other getUpdates request')) {
          console.error('⚠️ [MerchBot] Конфликт: другой экземпляр бота может быть запущен');
        } else if (error.message.includes('Unauthorized')) {
          console.error('⚠️ [MerchBot] Неверный токен или токен отозван');
        } else if (error.message.includes('network') || error.message.includes('timeout')) {
          console.error('⚠️ [MerchBot] Проблема с сетью или таймаут');
        }
      }

      // Упрощенный retry (как в Telegram боте)
      if (this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        const delay = Math.min(2000 * this.retryCount, 10000);
        console.log(`🔄 [MerchBot] Retry ${this.retryCount}/${this.MAX_RETRIES} через ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.launch();
      }

      console.error('❌ [MerchBot] Превышено максимальное количество попыток запуска');
      return false;
    }
  }

  // Остановка бота
  public async stop(): Promise<void> {
    if (!this.isRunning || !this.bot) return;

    try {
      await this.bot.stop();
      this.isRunning = false;
      console.log('MerchBot stopped');
    } catch (error) {
      console.error('Error stopping MerchBot:', error);
    }
  }


  // Перезапуск бота
  public async restart(): Promise<boolean> {
    console.log('🔄 [MerchBot] Перезапуск бота...');
    
    // Останавливаем бота, если он запущен
    if (this.isRunning && this.bot) {
      try {
        await this.bot.stop();
      } catch (error) {
        console.error('⚠️ [MerchBot] Ошибка при остановке бота:', error);
      }
      this.isRunning = false;
    }
    
    // Очищаем текущий экземпляр бота
    this.bot = null;
    
    // Сбрасываем счетчики
    this.retryCount = 0;
    this.restartAttempts = 0;
    
    // Переинициализируем бота (создаем новый экземпляр)
    console.log('🔧 [MerchBot] Переинициализация бота...');
    this.initializeBot();
    
    // Если после инициализации бот все еще не создан, возвращаем false
    if (!this.bot) {
      console.error('❌ [MerchBot] Не удалось инициализировать бота после перезапуска');
      console.error('❌ [MerchBot] Проверьте наличие MERCH_BOT_TOKEN и MERCH_BOT_NAME в .env');
      return false;
    }
    
    // Запускаем бота
    return this.launch();
  }
}

// Экспорт синглтона
export const merchBotService = MerchBotService.getInstance();
