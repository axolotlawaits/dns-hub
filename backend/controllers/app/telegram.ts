import { Telegraf } from 'telegraf';
import { Notifications } from '@prisma/client';
import axios from 'axios';
import { prisma, API } from '../../server.js';

let bot: Telegraf | null = null;
let isRunning = false;
let retryCount = 0;
const MAX_RETRIES = 3;

const createBotInstance = () => {
  if (bot) return bot;
  
  bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!, {
    handlerTimeout: 60000,
    telegram: { webhookReply: false }
  });
  
  setupCommands();
  return bot;
};

const setupCommands = () => {
  if (!bot) return;

  bot.command('start', async (ctx) => {
    const token = ctx.message.text.split(' ')[1]?.trim();
    if (!token) {
      return ctx.reply('Для привязки аккаунта используйте ссылку из приложения');
    }

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

const notifyFrontend = async (userId: string) => {
  try {
    await axios.post(`${API}/telegram/status/${userId}`, { userId });
  } catch (error) {
    console.error('Frontend notify error:', error);
  }
};

const launch = async (): Promise<boolean> => {
  if (isRunning) {
    console.log('Bot is already running');
    return true;
  }

  try {
    const botInstance = createBotInstance();
    
    // Удаляем вебхук и сбрасываем обновления
    await botInstance.telegram.deleteWebhook({ drop_pending_updates: true });
    
    await botInstance.launch({
      dropPendingUpdates: true,
      allowedUpdates: []
    });
    
    isRunning = true;
    retryCount = 0;
    console.log('Telegram bot started successfully');
    console.log(`Bot username: @${process.env.TELEGRAM_BOT_NAME}`);
    
    process.once('SIGINT', () => stop('SIGINT'));
    process.once('SIGTERM', () => stop('SIGTERM'));
    
    return true;
  } catch (error) {
    console.error('Failed to start bot:', error);
    
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      console.log(`Retrying to start bot (attempt ${retryCount}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return launch();
    }
    
    console.error('Max retries reached, giving up');
    return false;
  }
};

const stop = async (signal?: string): Promise<void> => {
  if (!isRunning || !bot) return;
  
  try {
    if (signal) {
      console.log(`Received ${signal}, stopping bot...`);
    }
    
    await bot.stop();
    isRunning = false;
    console.log('Bot stopped successfully');
  } catch (error) {
    console.error('Error stopping bot:', error);
  }
};

const sendNotification = async (notification: Notifications, chatId: string): Promise<boolean> => {
  if (!isRunning || !bot) {
    console.error('Bot is not running, cannot send notification');
    return false;
  }

  try {
    await bot.telegram.sendMessage(
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

const handleInvalidChat = async (chatId: string) => {
  await prisma.user.updateMany({
    where: { telegramChatId: chatId },
    data: { telegramChatId: null }
  });
};

export const telegramService = {
  launch,
  stop,
  sendNotification,
  get isRunning() { return isRunning; }
};

// Инициализация при импорте
createBotInstance();