import { Telegraf } from 'telegraf';
import { prisma } from '../../server.js';
import axios from 'axios';
import { API } from '../../server.js';

let botInstance: Telegraf | null = null;
let isBotRunning = false;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 5;

const createBot = () => {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not defined');
  }

  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
  setupCommands(bot);
  return bot;
};

const getBotInstance = () => {
  if (!botInstance) {
    botInstance = createBot();
  }
  return botInstance;
};

const launchBot = async () => {
  if (!botInstance) return;
  
  if (isBotRunning) {
    console.log('Bot is already running, stopping current instance...');
    await stopBot();
  }

  try {
    await botInstance.launch();
    isBotRunning = true;
    restartAttempts = 0;
    console.log('Telegram bot started successfully');
  } catch (error) {
    console.error('Failed to start Telegram bot:', error);
    
    if (restartAttempts < MAX_RESTART_ATTEMPTS) {
      restartAttempts++;
      const delay = Math.min(5000 * restartAttempts, 30000); // Exponential backoff with max 30s
      console.log(`Retrying in ${delay}ms (attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})`);
      setTimeout(() => launchBot(), delay);
    } else {
      console.error('Max restart attempts reached, giving up');
    }
  }
};

const setupCommands = (bot: Telegraf) => {
  bot.command('start', async (ctx) => {
    const token = ctx.message.text.split(' ')[1]?.trim();
    if (!token) {
      return ctx.reply('Для привязки аккаунта используйте ссылку из приложения');
    }
    try {
      const user = await prisma.user.findFirst({
        where: {
          telegramLinkToken: token,
        }
      });

      if (!user) {
        return ctx.reply('❌ Ссылка недействительна или истекла');
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          telegramChatId: ctx.chat.id.toString(),
          telegramLinkToken: null,
        }
      });

      await sendConfirmationToFrontend(user.id);
      ctx.reply(`✅ Аккаунт привязан!\nДобро пожаловать, ${user.name}!`);
    } catch (error) {
      console.error('Link error:', error);
      ctx.reply('❌ Ошибка привязки. Пожалуйста, попробуйте снова');
    }
  });
};

const stopBot = async () => {
  if (!isBotRunning || !botInstance) return;

  try {
    await botInstance.stop();
    isBotRunning = false;
    console.log('Telegram bot stopped successfully');
  } catch (error) {
    console.error('Error stopping bot:', error);
  }
};

const sendConfirmationToFrontend = async (userId: string) => {
  try {
    const frontendEndpoint = `${API}/telegram/status/${userId}`;
    await axios.post(frontendEndpoint, { userId });
    console.log(`Confirmation sent to frontend for user ${userId}`);
  } catch (error) {
    console.error('Failed to send confirmation to frontend:', error);
  }
};

const getBot = () => {
  return botInstance;
};

export const TelegramController = {
  getInstance: getBotInstance,
  launchBot,
  stopBot,
  getBot,
  isRunning: () => isBotRunning,
};