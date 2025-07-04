import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import dayjs from 'dayjs';

type Notification = {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error';
  createdAt: string;
  read: boolean;
};

const mockNotifications: Notification[] = [
  {
    id: '1',
    title: 'Системное обновление',
    message: 'Запланировано обновление системы на 15:00. Возможны кратковременные перебои в работе.',
    type: 'info',
    createdAt: dayjs().subtract(2, 'hours').toISOString(),
    read: false
  },
  {
    id: '2',
    title: 'Новое сообщение',
    message: 'У вас 3 непрочитанных сообщения в чате поддержки.',
    type: 'info',
    createdAt: dayjs().subtract(5, 'hours').toISOString(),
    read: true
  },
  {
    id: '3',
    title: 'Предупреждение',
    message: 'Заканчивается место в хранилище документов. Осталось менее 10% свободного места.',
    type: 'warning',
    createdAt: dayjs().subtract(1, 'day').toISOString(),
    read: false
  },
  {
    id: '4',
    title: 'Ошибка синхронизации',
    message: 'Обнаружена ошибка при синхронизации с CRM системой. Требуется вмешательство администратора.',
    type: 'error',
    createdAt: dayjs().subtract(2, 'days').toISOString(),
    read: true
  },
];

export const getNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // В реальной реализации будет запрос к БД:
    // const notifications = await prisma.notification.findMany({...});
    
    // Моковые данные
    const notifications = mockNotifications;
    
    res.status(200).json(notifications);
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    
    // В реальной реализации:
    // await prisma.notification.update({ where: { id }, data: { read: true } });
    
    // Моковая реализация
    const notification = mockNotifications.find(n => n.id === id);
    if (notification) {
      notification.read = true;
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};