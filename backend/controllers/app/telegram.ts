import { Telegraf } from 'telegraf';
import { Notifications } from '@prisma/client';
import axios from 'axios';
import { prisma, API } from '../../server.js';

// Состояние бота
let botInstance: Telegraf | null = null;
let isBotRunning = false;

// Инициализация бота
const initializeBot = () => {
  if (botInstance) return botInstance;
  
  botInstance = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
  setupCommands(botInstance);
  return botInstance;
};

// Запуск бота
const launchBot = async () => {
  if (isBotRunning) {
    console.log('Bot is already running');
    return;
  }

  const bot = initializeBot();

  try {
    await bot.launch();
    isBotRunning = true;
    console.log('Telegram bot started');
    console.log(`Bot username: @${process.env.TELEGRAM_BOT_NAME}`);
    
    // Обработка graceful shutdown
    process.once('SIGINT', () => stopBot('SIGINT'));
    process.once('SIGTERM', () => stopBot('SIGTERM'));
  } catch (error) {
    console.error('Failed to start bot:', error);
    throw error;
  }
};

// Остановка бота
const stopBot = async (signal?: string) => {
  if (!isBotRunning || !botInstance) return;
  
  try {
    if (signal) {
      console.log(`Received ${signal}, stopping bot...`);
    }
    await botInstance.stop();
    isBotRunning = false;
    console.log('Bot stopped successfully');
  } catch (error) {
    console.error('Error stopping bot:', error);
  }
};

// Отправка уведомления
const sendNotification = async (notification: Notifications, chatId: string): Promise<boolean> => {
  if (!isBotRunning || !botInstance) {
    console.error('Bot is not running, cannot send notification');
    return false;
  }

  try {
    await botInstance.telegram.sendMessage(
      chatId,
      `🔔 ${notification.title}\n\n${notification.message}`,
      { parse_mode: 'Markdown' }
    );
    return true;
  } catch (error) {
    console.error('Send error:', error);
    if (error instanceof Error && error.message.includes('chat not found')) {
      await handleInvalidChat(chatId);
    }
    return false;
  }
};

// Обработка невалидного чата
const handleInvalidChat = async (chatId: string) => {
  await prisma.user.updateMany({
    where: { telegramChatId: chatId },
    data: { telegramChatId: null }
  });
};

// Настройка команд бота
const setupCommands = (bot: Telegraf) => {
  bot.command('start', async (ctx) => {
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

      await notifyFrontend(user.id);
      ctx.reply(`✅ Аккаунт привязан!\nДобро пожаловать, ${user.name}!`);
    } catch (error) {
      console.error('Link error:', error);
      ctx.reply('❌ Ошибка привязки. Пожалуйста, попробуйте снова');
    }
  });
};

// Уведомление фронтенда
const notifyFrontend = async (userId: string) => {
  try {
    await axios.post(`${API}/telegram/status/${userId}`, { userId });
  } catch (error) {
    console.error('Frontend notify error:', error);
  }
};

// Экспорт функций
export const telegramService = {
  launch: launchBot,
  stop: stopBot,
  sendNotification,
  get isRunning() {
    return isBotRunning;
  }
};

// Инициализация при импорте
initializeBot();