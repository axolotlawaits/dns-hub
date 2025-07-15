import { Telegraf } from 'telegraf';
import { prisma } from '../../server.js';
import axios from 'axios';
import { API } from '../../../frontend/src/config/constants.js';

export class TelegramController {
  private static instance: TelegramController;
  private bot: Telegraf;

  private constructor() {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined');
    }

    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    this.setupCommands();
  }

  public static getInstance(): TelegramController {
    if (!TelegramController.instance) {
      TelegramController.instance = new TelegramController();
      TelegramController.instance.launchBot();
    }
    return TelegramController.instance;
  }

  private launchBot() {
    this.bot.launch()
      .then(() => console.log('Telegram bot started'))
      .catch((error) => {
        console.error('Failed to start Telegram bot:', error);
        process.exit(1);
      });
  }

  private setupCommands() {
    this.bot.command('start', async (ctx) => {
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

        await this.sendConfirmationToFrontend(user.id);
        ctx.reply(`✅ Аккаунт привязан!\nДобро пожаловать, ${user.name}!`);
      } catch (error) {
        console.error('Link error:', error);
        ctx.reply('❌ Ошибка привязки. Пожалуйста, попробуйте снова');
      }
    });
  }
public async stopBot() {
  await this.bot.stop();
}
  private async sendConfirmationToFrontend(userId: string) {
    try {
      const frontendEndpoint = `${API}/telegram/status/${userId}`;
      await axios.post(frontendEndpoint, { userId });
      console.log(`Confirmation sent to frontend for user ${userId}`);
    } catch (error) {
      console.error('Failed to send confirmation to frontend:', error);
    }
  }

  public getBot(): Telegraf {
    return this.bot;
  }
}
