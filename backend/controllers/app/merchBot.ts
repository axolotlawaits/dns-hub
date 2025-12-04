import { Bot, Context, session, SessionFlavor, InlineKeyboard, InputFile, Keyboard } from 'grammy';
import { prisma } from '../../server.js';
import { API } from '../../server.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

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
  messageToCardMap?: Record<number, { // Связь между messageId и карточкой
    itemId: string;
    itemName: string;
    itemType: 'card' | 'category';
  }>;
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
    const token = process.env.MERCH_BOT_TOKEN;
    
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
    
    if (!botName) {
      console.error('❌ [MerchBot] MERCH_BOT_NAME not found');
      console.error('❌ [MerchBot] Убедитесь, что переменная окружения MERCH_BOT_NAME установлена');
      return;
    }
    
    try {
      this.bot = new Bot<MerchContext>(token);
      this.bot.use(
        session({
          initial: (): MerchSessionData => ({}),
        })
      );
      this.setupHandlers();
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

    // Обработка реакций на сообщения
    this.bot.on('message_reaction', async (ctx) => {
      try {
        const userId = ctx.from?.id;
        if (!userId) return;

        // Получаем или создаем пользователя и помечаем его как активного
        let user = await prisma.merchTgUser.findUnique({
          where: { userId }
        });

        if (!user) {
          user = await prisma.merchTgUser.create({
            data: {
              userId,
              username: ctx.from?.username || null,
              firstName: ctx.from?.first_name || null,
              lastName: ctx.from?.last_name || null,
              isActive: true
            }
          });
        } else {
          user = await prisma.merchTgUser.update({
            where: { userId },
            data: {
              username: ctx.from?.username || user.username,
              firstName: ctx.from?.first_name || user.firstName,
              lastName: ctx.from?.last_name || user.lastName,
              isActive: true
            }
          });
        }

        const reactions = ctx.messageReaction?.new_reaction || [];
        if (reactions.length === 0) return;

        const messageId = ctx.messageReaction?.message_id;
        const chatId = ctx.messageReaction?.chat?.id;

        // Ищем информацию о карточке в базе данных
        // Ищем последнее событие card_sent для этого пользователя с этим messageId и chatId
        let cardInfo: { itemId: string; itemName: string; itemType: 'card' | 'category' } | null = null;
        
        if (messageId && chatId) {
          try {
            // Ищем событие card_sent с этим messageId и chatId для этого пользователя
            const cardSentEvent = await prisma.merchTgUserStats.findFirst({
              where: {
                userId: user.id,
                action: 'card_sent',
                details: {
                  contains: `"messageId":${messageId}`
                }
              },
              orderBy: {
                timestamp: 'desc'
              }
            });

            if (cardSentEvent && cardSentEvent.details) {
              try {
                const parsed = JSON.parse(cardSentEvent.details);
                // Проверяем, что chatId совпадает
                if (parsed.chatId === chatId && parsed.messageId === messageId) {
                  cardInfo = {
                    itemId: parsed.itemId,
                    itemName: parsed.itemName,
                    itemType: parsed.itemType
                  };
                  console.log(`📌 Найдена карточка для реакции: ${cardInfo.itemName} (${cardInfo.itemId})`);
                }
              } catch (parseError) {
                console.error('Ошибка парсинга details для card_sent:', parseError);
              }
            }
          } catch (dbError) {
            console.error('Ошибка поиска карточки в базе данных:', dbError);
          }
        }

        // Сохраняем статистику для каждой реакции
        for (const reaction of reactions) {
          const emoji = reaction.type === 'emoji' ? reaction.emoji : 'unknown';
          
          const details: any = {
            emoji,
            messageId,
            chatId,
            userId: user.userId, // Telegram user ID
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName
          };

          // Добавляем информацию о карточке, если она найдена
          if (cardInfo) {
            details.itemId = cardInfo.itemId;
            details.itemName = cardInfo.itemName;
            details.itemType = cardInfo.itemType;
          }

          await prisma.merchTgUserStats.create({
            data: {
              userId: user.id,
              action: 'message_reaction',
              details: JSON.stringify(details)
            }
          });
        }
      } catch (error) {
        console.error('Ошибка при обработке реакции:', error);
      }
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
        ctx.session.searchState = false;
        ctx.session.feedbackState = undefined;
        await this.updateStats(ctx.from.id, 'button_click', 'main_menu');
        await this.showMainMenu(ctx);
        return;
      }

      if (messageText === '◀️ Назад') {
        await this.updateStats(ctx.from.id, 'button_click', 'back');
        await this.goBack(ctx);
        return;
      }

      if (messageText === '🔍 Поиск') {
        ctx.session.feedbackState = undefined;
        await this.updateStats(ctx.from.id, 'button_click', 'search');
        await this.startSearch(ctx);
        return;
      }

      if (messageText === '📩 Обратная связь') {
        ctx.session.searchState = false;
        await this.updateStats(ctx.from.id, 'button_click', 'feedback');
        await this.startFeedback(ctx);
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

      // Получаем элемент для определения типа и сохранения связи
      const item = await this.findItemById(foundButton.id);
      const isCard = item?.layer === 0;
      const itemType: 'card' | 'category' = isCard ? 'card' : 'category';

      // Получаем пользователя для сохранения связи в базе и помечаем его как активного
      let tgUser = null;
      if (ctx.from) {
        tgUser = await prisma.merchTgUser.findUnique({
          where: { userId: ctx.from.id }
        });
        if (!tgUser) {
          tgUser = await prisma.merchTgUser.create({
            data: {
              userId: ctx.from.id,
              username: ctx.from.username || null,
              firstName: ctx.from.first_name || null,
              lastName: ctx.from.last_name || null,
              isActive: true
            }
          });
        } else {
          tgUser = await prisma.merchTgUser.update({
            where: { userId: ctx.from.id },
            data: {
              username: ctx.from.username || tgUser.username,
              firstName: ctx.from.first_name || tgUser.firstName,
              lastName: ctx.from.last_name || tgUser.lastName,
              isActive: true
            }
          });
        }
      }

      // Инициализируем мапу для связи сообщений с карточками в сессии
      if (!ctx.session.messageToCardMap) {
        ctx.session.messageToCardMap = {};
      }

      // Отправляем связанные файлы (изображения и PDF)
      const photoPaths = await this.getPhotoPaths(foundButton.id);
      console.log(`📎 Найдено ${photoPaths.length} файлов для отправки`);
      
      for (const photoPath of photoPaths) {
        try {
          // Проверяем, что файл существует
          if (!fs.existsSync(photoPath)) {
            console.error(`❌ Файл не найден: ${photoPath}`);
            continue;
          }
          
          console.log(`📤 Отправляем файл: ${photoPath}`);
          
          const lowerPath = photoPath.toLowerCase();
          const isPdf = lowerPath.endsWith('.pdf');

          let sentMessage;
          if (isPdf) {
            // Для PDF используем отправку как документ, чтобы не конвертировался в фото
            sentMessage = await ctx.replyWithDocument(new InputFile(photoPath));
          } else {
            // Остальные считаем изображениями
            sentMessage = await ctx.replyWithPhoto(new InputFile(photoPath));
          }

          // Сохраняем связь между messageId и карточкой
          if (sentMessage && 'message_id' in sentMessage && tgUser && ctx.chat && item) {
            const messageId = sentMessage.message_id as number;
            const chatId = ctx.chat.id;
            
            // Сохраняем в сессию
            ctx.session.messageToCardMap[messageId] = {
              itemId: foundButton.id,
              itemName: item.name,
              itemType: itemType
            };
            
            // Сохраняем в базу данных (для фото сохраняем без текста, текст будет в следующем сообщении)
            await prisma.merchTgUserStats.create({
              data: {
                userId: tgUser.id,
                action: 'card_sent',
                details: JSON.stringify({
                  messageId,
                  chatId,
                  itemId: foundButton.id,
                  itemName: item.name,
                  itemType,
                  messageText: '' // Для фото сообщения текст пустой
                })
              }
            });
          }
          await new Promise(resolve => setTimeout(resolve, 500)); // Задержка между фото
        } catch (error) {
          console.error(`❌ Ошибка отправки изображения ${photoPath}:`, error);
          if (error instanceof Error) {
            console.error(`❌ Error message: ${error.message}`);
            console.error(`❌ Error stack: ${error.stack}`);
          }
        }
      }

      // Отправляем описание (получаем полный элемент из базы для получения description)
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
          
          const sentMessage = await ctx.api.sendMessage(ctx.chat.id, formattedText, {
            parse_mode: 'HTML'
          } as any);
          
          // Сохраняем связь между messageId и карточкой
          if (sentMessage && 'message_id' in sentMessage && tgUser && item) {
            const messageId = sentMessage.message_id as number;
            const chatId = ctx.chat.id;
            
            // Сохраняем в сессию
            ctx.session.messageToCardMap[messageId] = {
              itemId: foundButton.id,
              itemName: item.name,
              itemType: itemType
            };
            
            // Сохраняем в базу данных с текстом сообщения
            await prisma.merchTgUserStats.create({
              data: {
                userId: tgUser.id,
                action: 'card_sent',
                details: JSON.stringify({
                  messageId,
                  chatId,
                  itemId: foundButton.id,
                  itemName: item.name,
                  itemType,
                  messageText: formattedText
                })
              }
            });
          }
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
          const sentMessage = await ctx.reply(plainText);
          
          // Сохраняем связь даже для сообщения без форматирования
          if (sentMessage && 'message_id' in sentMessage && tgUser && ctx.chat && item) {
            const messageId = sentMessage.message_id as number;
            const chatId = ctx.chat.id;
            
            ctx.session.messageToCardMap[messageId] = {
              itemId: foundButton.id,
              itemName: item.name,
              itemType: itemType
            };
            
            await prisma.merchTgUserStats.create({
              data: {
                userId: tgUser.id,
                action: 'card_sent',
                details: JSON.stringify({
                  messageId,
                  chatId,
                  itemId: foundButton.id,
                  itemName: item.name,
                  itemType,
                  messageText: foundButton.text || ''
                })
              }
            });
          }
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
        // Это конечный элемент (карточка без дочерних пунктов).
        // Оставляем пользователю ту же иерархию, из которой он пришёл,
        // чтобы не терять контекст и не заставлять его возвращаться назад вручную.
        const parentChildren =
          (foundParentId && buttonsHierarchy[foundParentId]) || buttonsHierarchy['0'] || [];
        await this.showSubMenu(ctx, parentChildren);
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

      // Инициализируем мапу для связи сообщений с карточками в сессии
      if (!ctx.session.messageToCardMap) {
        ctx.session.messageToCardMap = {};
      }

      // Определяем тип элемента (карточка или категория)
      const isCard = item.layer === 0; // Карточки имеют layer = 0
      const itemType: 'card' | 'category' = isCard ? 'card' : 'category';

      // Получаем пользователя для сохранения связи в базе
      let tgUser = null;
      if (ctx.from) {
        tgUser = await prisma.merchTgUser.findUnique({
          where: { userId: ctx.from.id }
        });
        if (!tgUser) {
          tgUser = await prisma.merchTgUser.create({
            data: {
              userId: ctx.from.id,
              username: ctx.from.username || null,
              firstName: ctx.from.first_name || null,
              lastName: ctx.from.last_name || null
            }
          });
        }
      }

      // Получаем связанные файлы (изображения и PDF)
      const photoPaths = await this.getPhotoPaths(itemId);
      
      // Отправляем файлы
      console.log(`📎 Отправляем ${photoPaths.length} файлов для элемента ${itemId}`);
      for (const photoPath of photoPaths) {
        try {
          // Проверяем, что файл существует
          if (!fs.existsSync(photoPath)) {
            console.error(`❌ Файл не найден: ${photoPath}`);
            continue;
          }
          
          console.log(`📤 Отправляем файл: ${photoPath}`);
          
          const lowerPath = photoPath.toLowerCase();
          const isPdf = lowerPath.endsWith('.pdf');

          let sentMessage;
          if (isPdf) {
            sentMessage = await ctx.replyWithDocument(new InputFile(photoPath));
          } else {
            sentMessage = await ctx.replyWithPhoto(new InputFile(photoPath));
          }

          // Сохраняем связь между messageId и карточкой
          if (sentMessage && 'message_id' in sentMessage && tgUser && ctx.chat) {
            const messageId = sentMessage.message_id as number;
            const chatId = ctx.chat.id;
            
            // Сохраняем в сессию
            ctx.session.messageToCardMap[messageId] = {
              itemId: itemId,
              itemName: item.name,
              itemType: itemType
            };
            
            // Сохраняем в базу данных для доступа из обработчика реакций
            await prisma.merchTgUserStats.create({
              data: {
                userId: tgUser.id,
                action: 'card_sent',
                details: JSON.stringify({
                  messageId,
                  chatId,
                  itemId,
                  itemName: item.name,
                  itemType,
                  messageText: '' // Для фото сообщения текст пустой
                })
              }
            });
          }
          await new Promise(resolve => setTimeout(resolve, 500)); // Задержка между фото
        } catch (error) {
          console.error(`❌ Ошибка отправки изображения ${photoPath}:`, error);
          if (error instanceof Error) {
            console.error(`❌ Error message: ${error.message}`);
            console.error(`❌ Error stack: ${error.stack}`);
          }
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
          
          const sentMessage = await ctx.api.sendMessage(ctx.chat.id, formattedText, {
            parse_mode: 'HTML'
          } as any);
          
          // Сохраняем связь между messageId и карточкой
          if (sentMessage && 'message_id' in sentMessage && tgUser) {
            const messageId = sentMessage.message_id as number;
            const chatId = ctx.chat.id;
            
            // Сохраняем в сессию
            ctx.session.messageToCardMap[messageId] = {
              itemId: itemId,
              itemName: item.name,
              itemType: itemType
            };
            
            // Сохраняем в базу данных с текстом сообщения
            await prisma.merchTgUserStats.create({
              data: {
                userId: tgUser.id,
                action: 'card_sent',
                details: JSON.stringify({
                  messageId,
                  chatId,
                  itemId,
                  itemName: item.name,
                  itemType,
                  messageText: formattedText
                })
              }
            });
          }
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
          const sentMessage = await ctx.reply(plainText);
          
          // Сохраняем связь даже для сообщения без форматирования
          if (sentMessage && 'message_id' in sentMessage && tgUser && ctx.chat) {
            const messageId = sentMessage.message_id as number;
            const chatId = ctx.chat.id;
            
            ctx.session.messageToCardMap[messageId] = {
              itemId: itemId,
              itemName: item.name,
              itemType: itemType
            };
            
            await prisma.merchTgUserStats.create({
              data: {
                userId: tgUser.id,
                action: 'card_sent',
                details: JSON.stringify({
                  messageId,
                  chatId,
                  itemId,
                  itemName: item.name,
                  itemType,
                  messageText: '' // Для фото сообщения текст пустой
                })
              }
            });
          }
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

    // Удаляем текущий элемент из истории
    ctx.session.userChoiceHistory.pop();
    
    // Если после удаления история пуста, возвращаемся в главное меню
    if (ctx.session.userChoiceHistory.length === 0) {
      await this.showMainMenu(ctx);
      return;
    }
    
    // Получаем предыдущий элемент из истории
    const currentMenuId = ctx.session.userChoiceHistory[ctx.session.userChoiceHistory.length - 1];
    
    const buttonsHierarchy = await this.getButtonsHierarchy();
    const children = buttonsHierarchy[currentMenuId] || [];
    
    if (currentMenuId === '0') {
      // Возвращаемся в главное меню
      await this.showMainMenu(ctx);
    } else if (children.length > 0) {
      // Показываем подменю с дочерними элементами
      await this.showSubMenu(ctx, children);
    } else {
      // Нет дочерних элементов (конечная категория), возвращаемся еще на уровень выше
      // Удаляем еще один элемент из истории и повторяем логику
      if (ctx.session.userChoiceHistory.length > 0) {
        ctx.session.userChoiceHistory.pop();
        const parentMenuId = ctx.session.userChoiceHistory[ctx.session.userChoiceHistory.length - 1] || '0';
        const parentChildren = buttonsHierarchy[parentMenuId] || [];
        
        if (parentMenuId === '0') {
          await this.showMainMenu(ctx);
        } else if (parentChildren.length > 0) {
          await this.showSubMenu(ctx, parentChildren);
        } else {
          await this.showMainMenu(ctx);
        }
      } else {
        await this.showMainMenu(ctx);
      }
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
    if (!ctx.message || !ctx.message.text || !ctx.from) return;
    const text = ctx.message.text;
    
    // Обработка специальных кнопок (даже в режиме поиска/обратной связи)
    if (text === '🏠 Главная') {
      ctx.session.searchState = false;
      ctx.session.feedbackState = undefined;
      await this.updateStats(ctx.from.id, 'button_click', 'main_menu');
      await this.showMainMenu(ctx);
      return;
    }

    if (text === '◀️ Назад') {
      await this.updateStats(ctx.from.id, 'button_click', 'back');
      // Если в режиме поиска или обратной связи, выходим из режима
      if (ctx.session.searchState) {
        ctx.session.searchState = false;
        await this.showMainMenu(ctx);
        return;
      }
      if (ctx.session.feedbackState) {
        ctx.session.feedbackState = undefined;
        await this.showMainMenu(ctx);
        return;
      }
      // Обычная навигация назад
      await this.goBack(ctx);
      return;
    }

    if (text === '🔍 Поиск') {
      ctx.session.feedbackState = undefined;
      await this.updateStats(ctx.from.id, 'button_click', 'search');
      await this.startSearch(ctx);
      return;
    }

    if (text === '📩 Обратная связь') {
      ctx.session.searchState = false;
      await this.updateStats(ctx.from.id, 'button_click', 'feedback');
      await this.startFeedback(ctx);
      return;
    }
    
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
          feedback.email = text.toLowerCase().trim();
          feedback.step = 'text';
          await ctx.reply('📝 Теперь введите текст вашего сообщения:');
        } else {
          await ctx.reply('❌ Неверный формат email или email не является корпоративным. Пожалуйста, используйте корпоративный email (@dns-shop.ru или @dns-loc.ru):');
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
    
    let file;
    let fileUrl: string | undefined;
    
    try {
      // Получаем информацию о файле с retry механизмом
      // Иногда файл может быть еще не обработан Telegram серверами
      let retries = 3;
      let lastError: any = null;
      
      while (retries > 0) {
        try {
          file = await ctx.api.getFile(photo.file_id);
          if (file.file_path) {
            break; // Успешно получили файл
          }
        } catch (getFileError: any) {
          lastError = getFileError;
          retries--;
          if (retries > 0) {
            // Ждем перед повторной попыткой (файл может быть еще не обработан)
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log(`🔄 Повторная попытка получить файл (осталось попыток: ${retries})`);
          }
        }
      }
      
      if (!file || !file.file_path) {
        console.error('❌ Не удалось получить информацию о файле после всех попыток:', lastError);
        await ctx.reply('❌ Ошибка получения информации о фотографии. Пожалуйста, отправьте фотографию заново или напишите "готово":');
        return;
      }
      
      // Скачиваем файл из Telegram с retry механизмом
      // ВАЖНО: используем тот же токен, что и для Merch бота (MERCH_BOT_TOKEN),
      // иначе Telegram вернет 404 (чужой бот не имеет доступа к файлу)
      const merchBotToken = process.env.MERCH_BOT_TOKEN;
      if (!merchBotToken) {
        throw new Error('MERCH_BOT_TOKEN is not defined in environment variables');
      }
      fileUrl = `https://api.telegram.org/file/bot${merchBotToken}/${file.file_path}`;
      let response;
      let downloadRetries = 3;
      let downloadError: any = null;
      
      while (downloadRetries > 0) {
        try {
          response = await axios.get(fileUrl, {
            responseType: 'arraybuffer',
            timeout: 30000, // 30 секунд таймаут
            validateStatus: (status) => status >= 200 && status < 300, // Принимаем только успешные статусы
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0)'
            }
          });
          
          if (response && response.data) {
            break; // Успешно скачали файл
          }
        } catch (axiosError: any) {
          downloadError = axiosError;
          
          // Проверяем, является ли это ошибкой 404
          if (axiosError.response?.status === 404) {
            downloadRetries--;
            if (downloadRetries > 0) {
              // Ждем перед повторной попыткой (файл может быть еще не доступен)
              console.log(`🔄 Файл временно недоступен, повторная попытка через 2 секунды (осталось попыток: ${downloadRetries})`);
              await new Promise(resolve => setTimeout(resolve, 2000));
              continue;
            } else {
              // Все попытки исчерпаны
              console.warn(`⚠️ Файл не найден в Telegram после всех попыток: ${file.file_path}. Возможно, файл был удален или недоступен.`);
              await ctx.reply('❌ Фотография недоступна в Telegram (файл не найден). Пожалуйста, отправьте фотографию заново или напишите "готово":');
              return;
            }
          }
          
          // Для других ошибок пробуем повторить
          downloadRetries--;
          if (downloadRetries > 0) {
            console.log(`🔄 Ошибка загрузки файла, повторная попытка через 1 секунду (осталось попыток: ${downloadRetries}):`, axiosError.message);
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          } else {
            // Все попытки исчерпаны, пробрасываем ошибку дальше
            throw axiosError;
          }
        }
      }
      
      if (!response || !response.data) {
        throw new Error('Не удалось скачать файл после всех попыток');
      }
      
      if (!response || !response.data) {
        throw new Error('Пустой ответ от Telegram API');
      }
      
      const buffer = Buffer.from(response.data);
      
      // Проверяем, что buffer не пустой
      if (!buffer || buffer.length === 0) {
        throw new Error('Получен пустой буфер от Telegram API');
      }
      
      console.log(`📥 Получен файл из Telegram: ${file.file_path}, размер: ${buffer.length} байт`);
      
      // Создаем директорию для feedback фотографий, если её нет
      const feedbackDir = path.join(process.cwd(), 'public', 'feedback');
      if (!fs.existsSync(feedbackDir)) {
        console.log(`📁 Создаем директорию для фотографий: ${feedbackDir}`);
        fs.mkdirSync(feedbackDir, { recursive: true });
      }
      
      // Генерируем уникальное имя файла
      const fileExtension = path.extname(file.file_path) || '.jpg';
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const fileName = `feedback-${uniqueSuffix}${fileExtension}`;
      const filePath = path.join(feedbackDir, fileName);
      
      // Сохраняем файл
      try {
        fs.writeFileSync(filePath, buffer);
        console.log(`✅ Фотография успешно сохранена на сервер: ${filePath}`);
        
        // Проверяем, что файл действительно сохранен
        if (!fs.existsSync(filePath)) {
          throw new Error(`Файл не был сохранен: ${filePath}`);
        }
        
        const stats = fs.statSync(filePath);
        console.log(`📊 Размер сохраненного файла: ${stats.size} байт`);
        
        if (stats.size === 0) {
          throw new Error(`Сохраненный файл пустой: ${filePath}`);
        }
      } catch (writeError: any) {
        console.error(`❌ Ошибка записи файла на диск:`, writeError);
        throw new Error(`Не удалось сохранить файл на сервер: ${writeError.message}`);
      }
      
      // Сохраняем имя файла в сессии
      feedback.photos.push(fileName);
      console.log(`💾 Фотография добавлена в сессию. Всего фотографий: ${feedback.photos.length}`);
      
      const remaining = MAX_PHOTOS - feedback.photos.length;
      if (remaining > 0) {
        await ctx.reply(`✅ Фотография сохранена! Вы можете отправить еще ${remaining} фотографий или напишите "готово":`);
      } else {
        await ctx.reply('✅ Фотография сохранена! Достигнуто максимальное количество фотографий. Напишите "готово" для завершения:');
      }
    } catch (error: any) {
      // Более детальная обработка ошибок
      // Проверяем, является ли это ошибкой 404 (может попасть сюда, если не была обработана в первом catch)
      const errorUrl = error.config?.url || fileUrl || 'unknown';
      
      // Если ошибка уже была обработана выше (404), не обрабатываем повторно
      if (error.response?.status === 404 || error.status === 404 || (error.message && error.message.includes('404'))) {
        // Проверяем, не было ли уже отправлено сообщение пользователю
        if (!error.handled) {
          console.warn(`⚠️ Файл не найден в Telegram API: ${errorUrl}. Файл мог быть удален или недоступен.`);
          await ctx.reply('❌ Фотография недоступна в Telegram (файл не найден). Пожалуйста, отправьте фотографию заново или напишите "готово":');
        }
        return; // Выходим, чтобы не логировать как ошибку
      } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        console.error('⏱️ Таймаут при загрузке фотографии из Telegram:', error.message);
        await ctx.reply('❌ Превышено время ожидания при загрузке фотографии. Пожалуйста, попробуйте еще раз или напишите "готово":');
      } else if (error.response?.status >= 500) {
        console.error('🔴 Ошибка сервера Telegram при загрузке фотографии:', error.response?.status, error.message);
        await ctx.reply('❌ Временная ошибка сервера Telegram. Пожалуйста, попробуйте еще раз позже или напишите "готово":');
      } else if (error.message?.includes('Не удалось получить информацию') || error.message?.includes('Не удалось скачать файл')) {
        // Эти ошибки уже обработаны выше
        return;
      } else {
        // Логируем только если это не 404 и не обработанная ошибка
        console.error('❌ Ошибка обработки фотографии:', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url,
          stack: error.stack
        });
        await ctx.reply('❌ Ошибка сохранения фотографии. Пожалуйста, попробуйте еще раз или напишите "готово":');
      }
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
      // Получаем или создаем пользователя и помечаем его как активного
      const fromId = ctx.from?.id || 0;
      let tgUser = await prisma.merchTgUser.findUnique({
        where: { userId: fromId }
      });

      if (!tgUser) {
        tgUser = await prisma.merchTgUser.create({
          data: {
            userId: fromId,
            username: ctx.from?.username || null,
            firstName: ctx.from?.first_name || null,
            lastName: ctx.from?.last_name || null,
            isActive: true
          }
        });
      } else {
        tgUser = await prisma.merchTgUser.update({
          where: { userId: fromId },
          data: {
            username: ctx.from?.username || tgUser.username,
            firstName: ctx.from?.first_name || tgUser.firstName,
            lastName: ctx.from?.last_name || tgUser.lastName,
            isActive: true
          }
        });
      }

      // Сохраняем обратную связь в универсальную таблицу с указанием инструмента
      const savedFeedback = await (prisma as any).feedback.create({
        data: {
          tool: 'merch',
          userId: tgUser.id,
          email: feedback.email,
          text: feedback.text,
          photos: feedback.photos || [],
          metadata: {
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username,
            firstName: ctx.from?.first_name,
            lastName: ctx.from?.last_name
          }
        }
      });

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
      console.log('Feedback saved with ID:', savedFeedback.id);
      
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

  // Получение локальных путей к изображениям
  private async getPhotoPaths(itemId: string): Promise<string[]> {
    try {
      console.log(`🔍 Ищем изображения для элемента ${itemId}`);
      const item = await prisma.merch.findUnique({
        where: { id: itemId },
        select: {
          id: true,
          name: true,
          isActive: true,
          attachments: {
            where: { type: 'image' },
            orderBy: { sortOrder: 'asc' },
            select: {
              source: true
            }
          }
        }
      });
      
      if (!item) {
        console.log(`❌ Элемент ${itemId} не найден в базе данных`);
        return [];
      }
      
      // Проверяем активность элемента
      if (!item.isActive) {
        console.log(`❌ Элемент ${itemId} неактивен, изображения не будут отправлены`);
        return [];
      }
      
      console.log(`📋 Найден элемент: ${item.name}, attachments: ${item.attachments.length}`);
      
      const paths: string[] = [];
      const addedFiles = new Set<string>(); // Для отслеживания уже добавленных файлов
      
      // Путь к директории с изображениями
      const merchDir = path.join(process.cwd(), 'public', 'add', 'merch');
      
      // Изображения из attachments
      for (const attachment of item.attachments) {
        if (!addedFiles.has(attachment.source)) { // Проверяем, не добавлен ли уже этот файл
          const filePath = path.join(merchDir, attachment.source);
          
          // Проверяем, существует ли файл
          if (fs.existsSync(filePath)) {
            paths.push(filePath);
          addedFiles.add(attachment.source);
            console.log(`📎 Добавлено изображение: ${filePath}`);
          } else {
            console.warn(`⚠️ Файл не найден: ${filePath}`);
          }
        } else {
          console.log(`⏭️ Пропущено дублирующее изображение: ${attachment.source}`);
        }
      }
      
      console.log(`📸 Итого найдено изображений: ${paths.length}`);
      return paths;
    } catch (error) {
      console.error('Error getting photo paths:', error);
      return [];
    }
  }

  // Поиск элемента по ID
  private async findItemById(itemId: string): Promise<{id: string, name: string, description: string, layer: number} | null> {
    try {
      console.log(`🔍 [findItemById] Ищем элемент с ID: ${itemId}`);
      const item = await prisma.merch.findUnique({
        where: { id: itemId },
        select: {
          id: true,
          name: true,
          description: true,
          layer: true,
          isActive: true
        }
      });
      
      if (!item) {
        console.log(`❌ [findItemById] Элемент ${itemId} не найден в БД`);
        return null;
      }
      
      // Проверяем активность элемента
      if (!item.isActive) {
        console.log(`❌ [findItemById] Элемент ${itemId} неактивен`);
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
        description: item.description || '',
        layer: item.layer
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
    if (!pattern.test(email)) {
      return false;
    }
    // Проверка на корпоративный домен
    const emailLower = email.toLowerCase().trim();
    const allowedDomains = ['@dns-shop.ru', '@dns-loc.ru'];
    return allowedDomains.some(domain => emailLower.endsWith(domain));
  }

  private formatDescription(description: string): string {
    if (!description) return '';
    
    // Description уже хранится в правильном формате HTML
    // Нужна только минимальная конвертация для Telegram:
    // - <strong> -> <b>, <em> -> <i>
    // - <p> -> перенос строки \n
    // - <br> -> перенос строки \n
    // - Удалить неподдерживаемые теги
    
    let html = description.trim();
    
    // Минимальная конвертация для Telegram:
    // 1. <strong> -> <b>, <em> -> <i>
    html = html.replace(/<strong>/gi, '<b>');
    html = html.replace(/<\/strong>/gi, '</b>');
    html = html.replace(/<em>/gi, '<i>');
    html = html.replace(/<\/em>/gi, '</i>');
    
    // 2. <p> -> перенос строки \n
    html = html.replace(/<\/p>/gi, '\n');
    html = html.replace(/<p[^>]*>/gi, '\n');
    
    // 3. <br> -> перенос строки \n
    html = html.replace(/<br\s*\/?>/gi, '\n');
    
    // 4. Удаляем неподдерживаемые теги (сохраняем содержимое)
    html = html.replace(/<\/?(?:div|span|h[1-6]|ul|ol|li|table|tr|td|th|thead|tbody|tfoot|article|section|header|footer|nav|aside)[^>]*>/gi, '');
    
    // 5. Убираем множественные переносы строк
    html = html.replace(/\n{3,}/g, '\n\n');
    
    // 6. Экранируем HTML-символы, но сохраняем разрешенные теги Telegram
    const telegramTagRegex = /<\/?(?:b|i|u|s|code|pre|a)(?:\s+[^>]*)?>/gi;
    const tagMatches: Array<{ start: number; end: number; tag: string }> = [];
    let match;
    
    telegramTagRegex.lastIndex = 0;
    while ((match = telegramTagRegex.exec(html)) !== null) {
      tagMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        tag: match[0]
      });
    }
    
    if (tagMatches.length === 0) {
      html = html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return html.trim();
    }
    
    // Защищаем теги при экранировании
    let result = '';
    let lastIndex = 0;
    const placeholders: Array<{ placeholder: string; tag: string }> = [];
    let placeholderIndex = 0;
    
    tagMatches.forEach(({ start, end, tag }) => {
      if (start > lastIndex) {
        const textBefore = html.substring(lastIndex, start);
        result += textBefore
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      }
      
      const placeholder = `__TG_PL${placeholderIndex++}__`;
      placeholders.push({ placeholder, tag });
      result += placeholder;
      lastIndex = end;
    });
    
    if (lastIndex < html.length) {
      const textAfter = html.substring(lastIndex);
      result += textAfter
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
    
    // Восстанавливаем теги
    placeholders.forEach(({ placeholder, tag }) => {
      result = result.replace(placeholder, tag);
    });
    
    return result.trim();
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
    
    // Убираем префикс "public/retail/merch/" если он есть
    if (fileName.startsWith('public/retail/merch/')) {
      fileName = fileName.replace('public/retail/merch/', '');
      console.log(`📁 [getImageUrl] Убран префикс public/retail/merch/: ${fileName}`);
    }
    
    // Убираем старый префикс "public/add/merch/" если он есть (для совместимости)
    if (fileName.startsWith('public/add/merch/')) {
      fileName = fileName.replace('public/add/merch/', '');
      console.log(`📁 [getImageUrl] Убран префикс public/add/merch/: ${fileName}`);
    }
    
    // Убираем префикс "retail/merch/" если он есть
    if (fileName.startsWith('retail/merch/')) {
      fileName = fileName.replace('retail/merch/', '');
      console.log(`📁 [getImageUrl] Убран префикс retail/merch/: ${fileName}`);
    }
    
    // Убираем старый префикс "add/merch/" если он есть (для совместимости)
    if (fileName.startsWith('add/merch/')) {
      fileName = fileName.replace('add/merch/', '');
      console.log(`📁 [getImageUrl] Убран префикс add/merch/: ${fileName}`);
    }
    
    // Формируем правильный URL (новый путь retail/merch)
    const url = `${API}/public/retail/merch/${fileName}`;
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
        allowed_updates: ['message', 'callback_query', 'message_reaction', 'message_reaction_count'],
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

  // Отправка сообщения пользователю по Telegram user ID
  public async sendMessageToUser(userId: number, message: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
    if (!this.bot) {
      console.error('[MerchBot] Bot not initialized');
      return false;
    }

    try {
      await this.bot.api.sendMessage(userId, message, {
        parse_mode: parseMode
      } as any);
      return true;
    } catch (error: any) {
      console.error(`[MerchBot] Error sending message to user ${userId}:`, error.message);

      // Если бот заблокирован или чат недоступен — помечаем пользователя как неактивного
      if (this.isBlockedError(error)) {
        try {
          await prisma.merchTgUser.updateMany({
            where: { userId },
            data: { isActive: false }
          });
          console.warn(`[MerchBot] User ${userId} marked as inactive due to blocked chat.`);
        } catch (updateError) {
          console.error(`[MerchBot] Failed to mark user ${userId} as inactive:`, (updateError as any)?.message);
        }
      }

      return false;
    }
  }

  // Массовая отправка сообщений пользователям (с поддержкой фото)
  public async broadcastMessage(
    userIds: number[],
    message: string,
    parseMode: 'HTML' | 'Markdown' = 'HTML',
    photoPath: string | null = null
  ): Promise<{ success: number; failed: number; errors: Array<{ userId: number; error: string }> }> {
    if (!this.bot) {
      console.error('[MerchBot] Bot not initialized');
      return { success: 0, failed: userIds.length, errors: userIds.map(id => ({ userId: id, error: 'Bot not initialized' })) };
    }

    let success = 0;
    let failed = 0;
    const errors: Array<{ userId: number; error: string }> = [];

    // Оставляем только активных пользователей
    const activeUsers = await prisma.merchTgUser.findMany({
      where: {
        userId: { in: userIds },
        isActive: true
      },
      select: { userId: true }
    });

    const activeIds = activeUsers.map(u => u.userId);

    const hasPhoto = photoPath && fs.existsSync(photoPath);

    // Для фото с caption лучше использовать plain text, так как Telegram часто имеет проблемы с HTML в caption
    // Санитизация сообщения перед отправкой
    let sanitizedMessage: string;
    let finalParseMode: 'HTML' | 'Markdown' | undefined;
    
    if (hasPhoto) {
      // Для фото всегда используем plain text в caption, чтобы избежать ошибок парсинга
      sanitizedMessage = this.sanitizeMessage(message, 'Plain');
      finalParseMode = undefined; // Не используем parse_mode для caption при отправке фото
      console.log(`[MerchBot] Photo message sanitized (Plain mode): ${sanitizedMessage.substring(0, 50)}...`);
    } else {
      sanitizedMessage = this.sanitizeMessage(message, parseMode);
      finalParseMode = parseMode;
      console.log(`[MerchBot] Text message sanitized (${parseMode} mode): ${sanitizedMessage.substring(0, 50)}...`);
    }
    
    // Дополнительная проверка: если после санитизации остались HTML теги, принудительно используем Plain
    if (/<[^>]+>/.test(sanitizedMessage)) {
      console.warn(`[MerchBot] HTML tags detected after sanitization, forcing Plain mode`);
      sanitizedMessage = this.sanitizeMessage(message, 'Plain');
      finalParseMode = undefined;
    }

    for (const userId of activeIds) {
      try {
        if (hasPhoto) {
          // Для фото НЕ используем parse_mode вообще - только plain text в caption
          await this.bot.api.sendPhoto(userId, new InputFile(photoPath as string), {
            caption: sanitizedMessage
          });
        } else {
          // Для текстовых сообщений используем parse_mode только если он указан
          const options: any = {};
          if (finalParseMode) {
            options.parse_mode = finalParseMode;
          }
          await this.bot.api.sendMessage(userId, sanitizedMessage, options);
        }
        success++;
      } catch (error: any) {
        console.error(`[MerchBot] Send error for user ${userId}:`, error.message);
        
        // Если ошибка парсинга, пытаемся отправить без форматирования
        if (this.isParseError(error)) {
          try {
            console.log(`[MerchBot] Parse error detected, retrying with Plain mode for user ${userId}`);
            const plainMessage = this.sanitizeMessage(message, 'Plain');
            
            // Убеждаемся, что plainMessage не содержит HTML тегов
            const finalPlainMessage = plainMessage.replace(/<[^>]+>/g, '');
            
            if (hasPhoto) {
              await this.bot.api.sendPhoto(userId, new InputFile(photoPath as string), {
                caption: finalPlainMessage
              });
            } else {
              await this.bot.api.sendMessage(userId, finalPlainMessage);
            }
            success++;
            console.log(`[MerchBot] Successfully sent plain message to user ${userId}`);
            continue; // Переходим к следующему пользователю
          } catch (retryError: any) {
            console.error(`[MerchBot] Retry send failed for user ${userId}:`, retryError.message);
          }
        }

        failed++;
        errors.push({ userId, error: error.message || 'Unknown error' });
        console.error(`[MerchBot] Failed to send message to user ${userId}:`, error.message);

        // Если бот заблокирован или чат недоступен — помечаем пользователя как неактивного
        if (this.isBlockedError(error)) {
          try {
            await prisma.merchTgUser.updateMany({
              where: { userId },
              data: { isActive: false }
            });
            console.warn(`[MerchBot] User ${userId} marked as inactive due to blocked chat (broadcast).`);
          } catch (updateError) {
            console.error(`[MerchBot] Failed to mark user ${userId} as inactive (broadcast):`, (updateError as any)?.message);
          }
        }
      }
    }

    return { success, failed, errors };
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
      text.includes('bot was kicked')
    );
  }

  // Определяем, что ошибка связана с парсингом сообщения
  private isParseError(error: any): boolean {
    const message: string = (error?.message || '').toString().toLowerCase();
    const description: string = (error?.description || '').toString().toLowerCase();
    const text = `${message} ${description}`;

    return (
      text.includes('can\'t parse entities') ||
      text.includes('parse error') ||
      text.includes('bad request') ||
      text.includes('unsupported') ||
      text.includes('invalid')
    );
  }

  // Санитизация сообщения для Telegram
  private sanitizeMessage(message: string, parseMode: 'HTML' | 'Markdown' | 'Plain'): string {
    if (parseMode === 'Plain') {
      // Убираем все HTML теги и заменяем на переносы строк
      // Важно: сначала заменяем теги на переносы, потом удаляем остальные теги
      let sanitized = message
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<p[^>]*>/gi, '')
        .replace(/<\/?div[^>]*>/gi, '\n')
        .replace(/<\/?span[^>]*>/gi, '')
        .replace(/<\/?[^>]+>/gi, '') // Удаляем все остальные HTML теги
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'")
        .replace(/\n{3,}/g, '\n\n') // Убираем множественные переносы строк
        .trim();
      
      // Убеждаемся, что не осталось никаких HTML тегов
      if (/<[^>]+>/.test(sanitized)) {
        console.warn('[MerchBot] Warning: HTML tags still present after sanitization:', sanitized);
        sanitized = sanitized.replace(/<[^>]+>/g, '');
      }
      
      return sanitized;
    }

    if (parseMode === 'HTML') {
      // Убираем теги <p> (Telegram не поддерживает их)
      let sanitized = message.replace(/<\/p>/gi, '<br>');
      sanitized = sanitized.replace(/<p[^>]*>/gi, '');
      // Убираем другие не поддерживаемые теги
      sanitized = sanitized.replace(/<\/?div[^>]*>/gi, '');
      sanitized = sanitized.replace(/<\/?span[^>]*>/gi, '');
      // Нормализуем <br> (Telegram поддерживает только <br> без самозакрытия)
      sanitized = sanitized.replace(/<br\s*\/?>/gi, '<br>');
      // Убираем множественные <br> подряд (максимум 2 подряд)
      sanitized = sanitized.replace(/(<br>\s*){3,}/gi, '<br><br>');
      // Убираем HTML entities
      sanitized = sanitized.replace(/&nbsp;/gi, ' ');
      sanitized = sanitized.replace(/&amp;/gi, '&');
      sanitized = sanitized.replace(/&lt;/gi, '<');
      sanitized = sanitized.replace(/&gt;/gi, '>');
      sanitized = sanitized.replace(/&quot;/gi, '"');
      return sanitized.trim();
    }

    // Для Markdown/MarkdownV2
    // Превращаем <br> в перенос строки и убираем остальные теги
    let sanitized = message.replace(/<br\s*\/?>/gi, '\n');
    sanitized = sanitized.replace(/<\/p>/gi, '\n');
    sanitized = sanitized.replace(/<p[^>]*>/gi, '');
    // Удаляем все прочие HTML-теги
    sanitized = sanitized.replace(/<\/?[^>]+>/gi, '');
    sanitized = sanitized.replace(/&nbsp;/gi, ' ');
    sanitized = sanitized.replace(/&amp;/gi, '&');
    sanitized = sanitized.replace(/&lt;/gi, '<');
    sanitized = sanitized.replace(/&gt;/gi, '>');
    sanitized = sanitized.replace(/&quot;/gi, '"');
    return sanitized.trim();
  }
}

// Экспорт синглтона
export const merchBotService = MerchBotService.getInstance();
