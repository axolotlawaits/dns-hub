import { z } from 'zod';
import { prisma } from '../../server.js';
import { SocketIOService } from '../../socketio.js';
import { emailService } from '../../services/email.js';
import { telegramService } from '../../controllers/app/telegram.js';
import { Notifications, NotificationType, NotificationChannel, NotificationPriority } from '@prisma/client';

export type NotificationWithRelations = Notifications & {
  sender: {
    id: string;
    name: string;
    email: string | null;
    telegramChatId: string | null;
  } | null;
  receiver: {
    id: string;
    name: string;
    email: string | null;
    telegramChatId: string | null;
  } | null;
  tool: {
    id: string;
    name: string;
    icon: string | null;
  } | null;
};

const createNotificationSchema = z.object({
  type: z.nativeEnum(NotificationType),
  channels: z.array(z.nativeEnum(NotificationChannel)).min(1, { message: "At least one channel is required" }),
  action: z.any().optional(),
  title: z.string().min(1, { message: "Title is required" }).max(100, { message: "Title too long (max 100 chars)" }),
  message: z.string().min(1, { message: "Message is required" }).max(500, { message: "Message too long (max 500 chars)" }),
  senderId: z.string().uuid({ message: "Invalid sender UUID" }),
  receiverId: z.string().uuid({ message: "Invalid receiver UUID" }),
  toolId: z.string().uuid().optional(),
  priority: z.nativeEnum(NotificationPriority).optional().default('MEDIUM'),
  expiresAt: z.date().optional(),
});

const markAsReadSchema = z.object({
  notificationId: z.string().uuid(),
  userId: z.string().uuid(),
});

const getNotificationsSchema = z.object({
  userId: z.string().uuid(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
  read: z.boolean().optional(),
  include: z.array(z.enum(['sender', 'receiver', 'tool'])).optional(),
});

// Initialize services
const socketService = SocketIOService.getInstance();

const buildIncludeOptions = (include?: string[]) => {
  return {
    sender: include?.includes('sender') ? {
      select: {
        id: true,
        name: true,
        email: true,
        telegramChatId: true
      }
    } : false,
    receiver: include?.includes('receiver') ? {
      select: {
        id: true,
        name: true,
        email: true,
        telegramChatId: true
      }
    } : false,
    tool: include?.includes('tool') ? {
      select: {
        id: true,
        name: true,
        icon: true
      }
    } : false,
  };
};

const dispatchNotification = async (notification: NotificationWithRelations) => {
  console.log(`[Notification] Dispatching notification ${notification.id} to ${notification.receiverId}`);
  console.log(`[Notification] Channels: ${notification.channel.join(', ')}`);
  
  const userSettings = await prisma.userSettings.findUnique({
    where: {
      userId_parameter: {
        userId: notification.receiverId,
        parameter: 'notifications.email',
      },
    },
  });

  const shouldSendInApp = notification.channel.includes('IN_APP');
  const wantsEmail = userSettings ? userSettings.value === 'true' : true;

  console.log(`[Notification] IN_APP: ${shouldSendInApp}, EMAIL enabled: ${wantsEmail}, TELEGRAM: ${notification.channel.includes('TELEGRAM') && !!notification.receiver?.telegramChatId}`);

  if (shouldSendInApp) {
    try {
      const receiverId = notification.receiver?.id || notification.receiverId;
      socketService.sendToUser(receiverId, {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt.toISOString(),
        read: notification.read,
        sender: notification.sender || undefined,
        tool: notification.tool,
        action: notification.action,
      });
      console.log(`[Notification] ✅ IN_APP sent to ${receiverId}`);
    } catch (error) {
      console.error(`[Notification] ❌ Failed to send IN_APP to ${notification.receiverId}:`, error);
    }
  }

  if (notification.channel.includes('EMAIL') && wantsEmail) {
    try {
      await emailService.send(notification);
      console.log(`[Notification] ✅ EMAIL sent to ${notification.receiver?.email || 'unknown'}`);
    } catch (error) {
      console.error(`[Notification] ❌ Failed to send EMAIL:`, error);
    }
  }

  if (notification.channel.includes('TELEGRAM') && notification.receiver?.telegramChatId) {
    try {
      const sent = await telegramService.sendNotification(notification as any, notification.receiver.telegramChatId);
      if (sent) {
        console.log(`[Notification] ✅ TELEGRAM sent to ${notification.receiver.telegramChatId}`);
      } else {
        console.warn(`[Notification] ⚠️ TELEGRAM send returned false for ${notification.receiver.telegramChatId}`);
      }
    } catch (error) {
      console.error(`[Notification] ❌ Failed to send TELEGRAM:`, error);
    }
  }
};

const createNotification = async (data: z.infer<typeof createNotificationSchema>) => {
  console.log(`[NotificationController] Creating notification:`, {
    type: data.type,
    channels: data.channels,
    title: data.title,
    senderId: data.senderId,
    receiverId: data.receiverId
  });

  // Создаем уведомление
  const notification = await prisma.notifications.create({
    data: {
      type: data.type,
      channel: data.channels,
      action: data.action as any,
      title: data.title,
      message: data.message,
      senderId: data.senderId,
      receiverId: data.receiverId,
      toolId: data.toolId,
      priority: data.priority,
      expiresAt: data.expiresAt,
    },
  });

  console.log(`[NotificationController] Notification created with ID: ${notification.id}`);

  // Получаем полные данные с отношениями
  const notificationWithRelations = await prisma.notifications.findUnique({
    where: { id: notification.id },
    include: {
      sender: { select: { id: true, name: true, email: true, telegramChatId: true } },
      receiver: { select: { id: true, name: true, email: true, telegramChatId: true } },
      tool: { select: { id: true, name: true, icon: true } },
    },
  });

  if (!notificationWithRelations) {
    throw new Error(`Failed to retrieve created notification ${notification.id}`);
  }

  console.log(`[NotificationController] Receiver data:`, {
    id: notificationWithRelations.receiver?.id ?? notification.receiverId,
    email: notificationWithRelations.receiver?.email ?? null,
    telegramChatId: notificationWithRelations.receiver?.telegramChatId ?? null
  });

  await dispatchNotification(notificationWithRelations as NotificationWithRelations);
  return notificationWithRelations;
};

const markAsRead = async (params: z.infer<typeof markAsReadSchema>) => {
  return prisma.notifications.update({
    where: {
      id: params.notificationId,
      receiverId: params.userId
    },
    data: {
      read: true,
      updatedAt: new Date()
    },
  });
};

const getNotifications = async (params: z.infer<typeof getNotificationsSchema>) => {
  const where: any = { receiverId: params.userId };
  if (params.read !== undefined) {
    where.read = params.read;
  }

  const [notifications, total] = await Promise.all([
    prisma.notifications.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.limit,
      skip: params.offset,
      include: buildIncludeOptions(params.include),
    }),
    prisma.notifications.count({ where }),
  ]);

  return {
    data: notifications.map(n => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
      expiresAt: n.expiresAt?.toISOString(),
    })),
    meta: {
      total,
      hasMore: params.offset + notifications.length < total,
      limit: params.limit,
      offset: params.offset,
    },
  };
};

const getUnreadCount = async (userId: string) => {
  return prisma.notifications.count({
    where: { receiverId: userId, read: false },
  });
};

const markAllAsRead = async (userId: string) => {
  const result = await prisma.notifications.updateMany({
    where: {
      receiverId: userId,
      read: false
    },
    data: {
      read: true,
      updatedAt: new Date()
    },
  });
  
  return { count: result.count };
};

const cleanupExpiredNotifications = async () => {
  const result = await prisma.notifications.deleteMany({
    where: { expiresAt: { not: null, lte: new Date() } },
  });
  return { count: result.count };
};

const deleteNotification = async (notificationId: string) => {
  const result = await prisma.notifications.delete({
    where: { id: notificationId },
  });
  return result;
};

export const NotificationController = {
  create: createNotification,
  markAsRead,
  markAllAsRead,
  getNotifications,
  getUnreadCount,
  cleanupExpired: cleanupExpiredNotifications,
  delete: deleteNotification,
};