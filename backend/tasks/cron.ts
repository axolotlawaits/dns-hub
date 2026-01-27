import schedule from 'node-schedule'
import { scheduleRouteDay } from '../controllers/supply/routeDay.js'
import { dailyRKJob } from '../controllers/add/rk.js';
import { weeklyRocDocSync } from '../controllers/accounting/roc.js';
import { cleanupOldMusicFolders, preloadNextMonthMusic } from '../controllers/app/radio.js';
import { SocketIOService } from '../socketio.js';
import { prisma } from '../server.js';

export const initToolsCron = () => {
  schedule.scheduleJob('0 0 * * *', async () => {
    try {
      console.log('running scheduled tools tasks...')
      await scheduleRouteDay();
      await dailyRKJob();
    } catch (e) {
      console.error('Daily cron error', e);
    }
  })
  
  schedule.scheduleJob('0 3 * * 0', async () => {
    try {
      await weeklyRocDocSync();
    } catch (e) {
      console.error('Weekly ROC->Doc sync error', e);
    }
  });

  // Очистка старых папок с музыкой каждый 1 числа в 02:00
  schedule.scheduleJob('0 2 1 * *', async () => {
    try {
      console.log('running music cleanup task...');
      await cleanupOldMusicFolders();
    } catch (e) {
      console.error('Music cleanup error', e);
    }
  });

  // Предзагрузка папки музыки следующего месяца: ежедневно в 02:15
  // Условие: осталось 5 дней или меньше до 1-го числа следующего месяца
  schedule.scheduleJob('15 2 * * *', async () => {
    try {
      const now = new Date();
      const firstNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysLeft = Math.ceil((firstNext.getTime() - now.getTime()) / msPerDay);
      if (daysLeft <= 5) {
        console.log(`[Radio] Running monthly preload (daysLeft=${daysLeft})...`);
        await preloadNextMonthMusic();
      }
    } catch (e) {
      console.error('Monthly music preload error', e);
    }
  });

  // Очистка истекших временных доступов: каждый час
  schedule.scheduleJob('0 * * * *', async () => {
    try {
      console.log('[Access] Running expired temporary access cleanup...');
      const now = new Date();
      // Временная реализация до миграции Prisma
      // После миграции раскомментировать и использовать правильные типы
      const allAccesses = await prisma.userToolAccess.findMany({
        include: {
          user: {
            select: { id: true, email: true, name: true }
          },
          tool: {
            select: { id: true, name: true, link: true }
          }
        }
      });
      
      // Фильтруем вручную до миграции (после миграции использовать where)
      const expiredAccesses = allAccesses.filter((access: any) => {
        return access.isTemporary === true && 
               access.validUntil && 
               new Date(access.validUntil) <= now;
      });

      if (expiredAccesses.length > 0) {
        console.log(`[Access] Found ${expiredAccesses.length} expired temporary accesses`);
        
        // Отправляем уведомления пользователям
        const { NotificationController } = await import('../controllers/app/notification.js');
        const socketService = SocketIOService.getInstance();
        
        for (const access of expiredAccesses) {
          const accessAny = access as any;
          // Уведомление пользователю
          try {
            await NotificationController.create({
              type: 'WARNING',
              channels: ['IN_APP'],
              title: `Временный доступ истек: ${accessAny.tool?.name || 'Инструмент'}`,
              message: `Ваш временный доступ к инструменту "${accessAny.tool?.name || 'Инструмент'}" истек`,
              senderId: 'system',
              receiverId: access.userId,
              toolId: access.toolId,
              priority: 'MEDIUM'
            });
          } catch (notifError) {
            console.error(`[Access] Failed to send expiration notification to ${accessAny.user?.email || access.userId}:`, notifError);
          }

          // Socket.IO событие
          try {
            socketService.sendEventToUser(access.userId, 'access_updated', {
              toolId: access.toolId,
              accessLevel: null,
              toolName: accessAny.tool?.name || 'Инструмент',
              toolLink: accessAny.tool?.link || '',
              expired: true
            });
          } catch (socketError) {
            console.error(`[Access] Failed to send expiration socket event to ${accessAny.user?.email || access.userId}:`, socketError);
          }
        }

        // Удаляем истекшие доступы (после миграции использовать where)
        const idsToDelete = expiredAccesses.map((a: any) => a.id);
        const deleted = await prisma.userToolAccess.deleteMany({
          where: {
            id: { in: idsToDelete }
          }
        });

        console.log(`[Access] Deleted ${deleted.count} expired temporary accesses`);
      }
    } catch (e) {
      console.error('[Access] Expired access cleanup error', e);
    }
  });

  // Уведомления о скором истечении временных доступов: ежедневно в 09:00
  schedule.scheduleJob('0 9 * * *', async () => {
    try {
      console.log('[Access] Checking for soon-to-expire temporary accesses...');
      const now = new Date();
      const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      // Временная реализация до миграции Prisma
      const allTemporaryAccesses = await prisma.userToolAccess.findMany({
        include: {
          user: {
            select: { id: true, email: true, name: true }
          },
          tool: {
            select: { id: true, name: true, link: true }
          }
        }
      });
      
      // Фильтруем вручную до миграции (после миграции использовать where)
      const soonToExpire = allTemporaryAccesses.filter((access: any) => {
        if (!access.isTemporary || !access.validUntil) return false;
        const validUntil = new Date(access.validUntil);
        return validUntil >= now && validUntil <= sevenDaysLater;
      });

      if (soonToExpire.length > 0) {
        console.log(`[Access] Found ${soonToExpire.length} soon-to-expire temporary accesses`);
        const { NotificationController } = await import('../controllers/app/notification.js');
        
        for (const access of soonToExpire) {
          const accessAny = access as any;
          const validUntil = accessAny.validUntil;
          if (!validUntil) continue;
          const daysLeft = Math.ceil((new Date(validUntil).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
          try {
            await NotificationController.create({
              type: 'INFO',
              channels: ['IN_APP'],
              title: `Временный доступ истекает: ${accessAny.tool?.name || 'Инструмент'}`,
              message: `Ваш временный доступ к инструменту "${accessAny.tool?.name || 'Инструмент'}" истечет через ${daysLeft} ${daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'}`,
              senderId: 'system',
              receiverId: access.userId,
              toolId: access.toolId,
              priority: 'LOW'
            });
          } catch (notifError) {
            console.error(`[Access] Failed to send expiration warning to ${accessAny.user?.email || access.userId}:`, notifError);
          }
        }
      }
    } catch (e) {
      console.error('[Access] Expiration warning error', e);
    }
  });

}