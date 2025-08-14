import { showNotification } from '@mantine/notifications';
import { IconBell } from '@tabler/icons-react';

export type NotificationType = 'info' | 'error' | 'warning' | 'success';

export interface INotification {
  id: number;
  title: string;
  message: string;
  type: NotificationType;
}

export interface INotificationSystem {
  addNotification: (title: string, message: string, type?: NotificationType) => number;
  dismissNotification: (id: number) => void;
  subscribe: (callback: (notifications: INotification[]) => void) => () => void;
}

class NotificationSystem implements INotificationSystem {
  private subscribers: Array<(notifications: INotification[]) => void> = [];
  private notifications: INotification[] = [];
  private nextId = 1;

  constructor() {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      this.initializePushNotifications();
    }
  }

  private async initializePushNotifications() {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.VITE_VAPID_PUBLIC_KEY
        });
        console.log('Push subscription:', subscription);
      }
    } catch (error) {
      console.error('Push notification error:', error);
    }
  }

  addNotification(title: string, message: string, type: NotificationType = 'info'): number {
    const id = this.nextId++;
    const notification: INotification = { id, title, message, type };
    
    this.notifications = [...this.notifications, notification];
    this.notifySubscribers();
    
    showNotification({
      title,
      message,
      color: type === 'error' ? 'red' : 'blue',
      icon: <IconBell size="1.1rem" />,
    });
    
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'Notification' in window) {
      try {
        if (Notification.permission === 'granted') {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(title, {
              body: message,
              icon: '/notification-icon.png',
            });
          });
        }
      } catch (e) {
        console.error('Browser notification error:', e);
      }
    }
    
    return id;
  }

  dismissNotification(id: number): void {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.notifySubscribers();
  }

  subscribe(callback: (notifications: INotification[]) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(sub => sub !== callback);
    };
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(callback => callback([...this.notifications]));
  }
}

export const notificationSystem = new NotificationSystem();