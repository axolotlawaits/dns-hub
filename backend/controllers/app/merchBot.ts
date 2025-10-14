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

  // Инициализация бота
  private initializeBot(): void {
    const token = process.env.MERCH_BOT_TOKEN;
    if (!token) {
      console.error('MERCH_BOT_TOKEN not found');
      return;
    }
    
    const botName = process.env.MERCH_BOT_NAME;
    if (!botName) {
      console.error('MERCH_BOT_NAME not found');
      return;
    }
    
    this.bot = new Bot<MerchContext>(token);

    // Настройка middleware
    this.bot.use(
      session({
        initial: (): MerchSessionData => ({}),
      })
    );

    this.setupHandlers();
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
      await ctx.answerCallbackQuery();
      const itemId = ctx.callbackQuery.data.replace('item_', '');
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

    // Обработка кнопок постоянной клавиатуры (теперь обрабатывается через handleButtonClick)

    // Обработка фотографий
    this.bot.on('message:photo', async (ctx) => {
      await this.handlePhotoMessage(ctx);
    });

    // Обработка ошибок
    this.bot.catch((err) => {
      console.error('MerchBot error:', err);
    });
  }

  // Показать главное меню
  private async showMainMenu(ctx: MerchContext): Promise<void> {
    try {
      const buttonsHierarchy = await this.getButtonsHierarchy();
      const rootItems = buttonsHierarchy['0'] || [];

      // Создаем постоянную клавиатуру с категориями
      const keyboard = new Keyboard();
      
      // Добавляем основные функции (без навигационных кнопок в главном меню)
      keyboard.text('🔍 Поиск').text('📩 Обратная связь').row();
      
      // Добавляем категории (максимум 6 на экран)
      const maxCategories = 6;
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
      
      // Если категорий больше 6, добавляем кнопку "Еще"
      if (rootItems.length > maxCategories) {
        keyboard.text('📋 Еще категории').row();
      }
      
      keyboard.resized().persistent();

      // Отправляем сообщение с постоянной клавиатурой
      await ctx.reply('📑 Выбери категорию:', {
        reply_markup: keyboard
      });
      
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

      // Отправляем описание
      if (foundButton.text) {
        await ctx.reply(foundButton.text);
      }

      // Обновляем меню
      await this.updateMenu(ctx, buttonsHierarchy);

    } catch (error) {
      console.error('❌ Ошибка при обработке нажатия кнопки:', error);
      await ctx.reply('❌ Произошла ошибка при обработке запроса');
    }
  }

  // Обновление меню
  private async updateMenu(ctx: MerchContext, buttonsHierarchy: any): Promise<void> {
    try {
      const currentMenuId = ctx.session.userChoiceHistory?.[ctx.session.userChoiceHistory.length - 1] || '0';
      const keyboard = new Keyboard();

      // Добавляем кнопки для текущего меню
      const currentMenuButtons = buttonsHierarchy[currentMenuId] || [];
      for (const button of currentMenuButtons) {
        keyboard.text(button.name);
      }

      // Добавляем навигационные кнопки
      if (currentMenuId !== '0' && currentMenuButtons.length > 0) {
        keyboard.row().text('◀️ Назад').text('🏠 Главная');
      }

      await ctx.reply('➡️ Выберите действие:', {
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('❌ Ошибка при обновлении меню:', error);
    }
  }

  // Показать дополнительные категории
  private async showMoreCategories(ctx: MerchContext): Promise<void> {
    try {
      const buttonsHierarchy = await this.getButtonsHierarchy();
      const rootItems = buttonsHierarchy['0'] || [];

      // Создаем клавиатуру для дополнительных категорий
      const keyboard = new Keyboard();
      
      // Показываем категории начиная с 7-й (пропускаем первые 6)
      const moreCategories = rootItems.slice(6);
      
      for (let i = 0; i < moreCategories.length; i += 2) {
        const first = moreCategories[i];
        const second = moreCategories[i + 1];
        
        if (second) {
          keyboard.text(first.name).text(second.name).row();
        } else {
          keyboard.text(first.name).row();
        }
      }
      
      // Добавляем навигационные кнопки
      keyboard.text('◀️ Назад').text('🏠 Главная').row();
      
      keyboard.resized().persistent();

      await ctx.reply('📋 Дополнительные категории:', {
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('❌ Ошибка при показе дополнительных категорий:', error);
      await ctx.reply('❌ Ошибка загрузки категорий. Попробуйте позже.');
    }
  }

  // Обработка клика по элементу
  private async handleItemClick(ctx: MerchContext, itemId: string): Promise<void> {
    try {
      const buttonsHierarchy = await this.getButtonsHierarchy();
      const item = await this.findItemById(itemId);
      
      if (!item) {
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
        await ctx.reply(formattedText, { parse_mode: 'Markdown' });
      }

      // Проверяем, есть ли дочерние элементы
      const children = buttonsHierarchy[itemId] || [];
      
      if (children.length > 0) {
        // Добавляем в историю
        if (!ctx.session.userChoiceHistory) {
          ctx.session.userChoiceHistory = [];
        }
        ctx.session.userChoiceHistory.push(itemId);
        
        // Показываем дочерние элементы
        await this.showSubMenu(ctx, children);
      } else {
        // Это конечный элемент, показываем меню навигации
        await this.showNavigationMenu(ctx);
      }
    } catch (error) {
      console.error('Error handling item click:', error);
      await ctx.reply('❌ Ошибка обработки запроса. Попробуйте позже.');
    }
  }

  // Показать подменю
  private async showSubMenu(ctx: MerchContext, children: Array<{id: string, name: string, text: string}>): Promise<void> {
    // Создаем постоянную клавиатуру
    const keyboard = new Keyboard()
      .text('🔍 Поиск')
      .text('📩 Обратная связь')
      .row()
      .text('🏠 Главная')
      .text('◀️ Назад')
      .resized()
      .persistent();

    // Отправляем сообщение с постоянной клавиатурой
    await ctx.reply('➡️ Выберите подкатегорию:', {
      reply_markup: keyboard
    });
    
    // Отправляем inline кнопки для подкатегорий
    const inlineKeyboard = new InlineKeyboard();
    for (const child of children) {
      inlineKeyboard.text(child.name, `item_${child.id}`).row();
    }
    
    await ctx.reply('Подкатегории:', {
      reply_markup: inlineKeyboard
    });
  }

  // Показать меню навигации
  private async showNavigationMenu(ctx: MerchContext): Promise<void> {
    // Создаем постоянную клавиатуру
    const keyboard = new Keyboard()
      .text('🔍 Поиск')
      .text('📩 Обратная связь')
      .row()
      .text('🏠 Главная')
      .text('◀️ Назад')
      .resized()
      .persistent();

    // Отправляем сообщение с постоянной клавиатурой
    await ctx.reply('Выберите действие:', {
      reply_markup: keyboard
    });
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
    
    if (children.length > 0) {
      await this.showSubMenu(ctx, children);
    } else {
      await this.showMainMenu(ctx);
    }
  }

  // Начать поиск
  private async startSearch(ctx: MerchContext): Promise<void> {
    ctx.session.searchState = true;
    
    // Создаем постоянную клавиатуру
    const keyboard = new Keyboard()
      .text('🔍 Поиск')
      .text('📩 Обратная связь')
      .row()
      .text('🏠 Главная')
      .text('◀️ Назад')
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
    const keyboard = new Keyboard()
      .text('🔍 Поиск')
      .text('📩 Обратная связь')
      .row()
      .text('🏠 Главная')
      .text('◀️ Назад')
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
      if (ctx.from) {
        await this.updateStats(ctx.from.id, 'search', query.toLowerCase());
      }
      
      const results = await this.searchItems(query);
      
      if (results.length === 0) {
        await ctx.reply('Ничего не найдено. Попробуйте другое ключевое слово.');
        return;
      }
      
      const keyboard = new InlineKeyboard();
      
      for (const result of results) {
        keyboard.text(result.name, `item_${result.id}`).row();
      }
      
      keyboard.text('◀️ Назад', 'back').text('🏠 Главная', 'main_menu');
      
      await ctx.reply('Результаты поиска:', {
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
    
    switch (feedback.step) {
      case 'email':
        if (this.isValidEmail(text)) {
          feedback.email = text;
          feedback.step = 'text';
          await ctx.reply('📝 Теперь введите текст вашего сообщения:');
        } else {
          await ctx.reply('❌ Неверный формат email. Пожалуйста, введите корректный email адрес:');
        }
        break;
        
      case 'text':
        if (text.length >= 10) {
          feedback.text = text;
          feedback.step = 'photo';
          await ctx.reply('📷 Теперь вы можете отправить фотографию (необязательно) или написать "готово":');
        } else {
          await ctx.reply('❌ Сообщение слишком короткое. Пожалуйста, введите более подробное сообщение (минимум 10 символов):');
        }
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
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const file = await ctx.api.getFile(photo.file_id);
      
      // Сохраняем информацию о фото
      if (!feedback.photos) {
        feedback.photos = [];
      }
      if (file.file_path) {
        feedback.photos.push(file.file_path);
      }
      
      await ctx.reply('✅ Фотография сохранена! Отправьте еще одну или напишите "готово":');
    } catch (error) {
      console.error('Error handling photo:', error);
      await ctx.reply('❌ Ошибка сохранения фотографии.');
    }
  }

  // Завершить обратную связь
  private async finishFeedback(ctx: MerchContext): Promise<void> {
    const feedback = ctx.session.feedbackState;
    if (!feedback) return;
    
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
      
      // Очищаем состояние
      ctx.session.feedbackState = undefined;
      
      await ctx.reply('✅ Спасибо за ваше сообщение! Мы получили вашу обратную связь и обязательно рассмотрим её.');
      
      // Показываем главное меню
      await this.showMainMenu(ctx);
    } catch (error) {
      console.error('Error finishing feedback:', error);
      await ctx.reply('❌ Ошибка отправки сообщения. Попробуйте позже.');
    }
  }

  // Получение иерархии кнопок с кэшированием
  private async getButtonsHierarchy(): Promise<Record<string, Array<{id: string, name: string, text: string}>>> {
    const now = new Date();
    const cacheAge = now.getTime() - this.cache.lastUpdate.getTime();
    
    // Кэш действителен 1 час
    if (cacheAge < 3600000 && Object.keys(this.cache.buttonsHierarchy).length > 0) {
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
      
      this.cache.buttonsHierarchy = hierarchy;
      this.cache.lastUpdate = now;
      
      return hierarchy;
    } catch (error) {
      console.error('Error getting buttons hierarchy:', error);
      return this.cache.buttonsHierarchy;
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
      const item = await prisma.merch.findUnique({
        where: { id: itemId }
      });
      
      if (!item) return null;
      
      return {
        id: item.id,
        name: item.name,
        description: item.description || ''
      };
    } catch (error) {
      console.error('Error finding item:', error);
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
    // Простое форматирование для Markdown
    return description
      .replace(/\*\*(.*?)\*\*/g, '*$1*')
      .replace(/<b>(.*?)<\/b>/g, '*$1*')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]+>/g, '');
  }

  private getImageUrl(imagePath: string): string {
    if (imagePath.startsWith('http')) {
      return imagePath;
    }
    return `${API}/public/add/merch/${imagePath}`;
  }

  // Запуск бота
  public async launch(): Promise<boolean> {
    if (this.isRunning) {
      return false;
    }
    
    if (!this.bot) {
      console.error('MerchBot not initialized');
      return false;
    }

    try {
      await this.bot.start({
        drop_pending_updates: true,
        allowed_updates: ['message', 'callback_query'],
      });

      this.isRunning = true;
      this.retryCount = 0;
      console.log('MerchBot started successfully');
      return true;
    } catch (error) {
      console.error('Failed to start MerchBot:', error);

      if (this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        const delay = Math.min(2000 * this.retryCount, 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.launch();
      }

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

  // Статус бота
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

  // Перезапуск бота
  public async restart(): Promise<boolean> {
    await this.stop();
    this.retryCount = 0;
    this.initializeBot();
    return this.launch();
  }
}

// Экспорт синглтона
export const merchBotService = MerchBotService.getInstance();
