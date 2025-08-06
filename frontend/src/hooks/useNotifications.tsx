import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { useWebSocket } from './useSocketIO';
import { IconCheck, IconX, IconInfoCircle } from '@tabler/icons-react';

type NotificationType = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' | 'ALERT' | 'SYSTEM' | 'EVENT';

export const useNotifications = (userId: string) => {
  const { lastMessage } = useWebSocket(`?userId=${userId}`);

  useEffect(() => {
    if (!lastMessage) return;

    const handleNotification = (data: {
      id: string;
      type: NotificationType;
      title: string;
      message: string;
      action?: {
        redirectTo?: string;
        [key: string]: unknown;
      };
    }) => {
      const { type, title, message } = data;

      const notificationConfig = {
        title,
        message,
        withCloseButton: true,
        autoClose: 5000,
      };

      switch (type) {
        case 'SUCCESS':
          notifications.show({
            ...notificationConfig,
            color: 'teal',
            icon: <IconCheck size="1.1rem" />,
          });
          break;
        case 'ERROR':
          notifications.show({
            ...notificationConfig,
            color: 'red',
            icon: <IconX size="1.1rem" />,
          });
          break;
        default:
          notifications.show({
            ...notificationConfig,
            color: 'blue',
            icon: <IconInfoCircle size="1.1rem" />,
          });
      }
    };

    if (lastMessage.event === 'notification') {
      handleNotification(lastMessage.data);
    }

    if (lastMessage.event === 'browser_push') {
      handleNotification({
        id: lastMessage.data.id,
        type: lastMessage.data.type,
        title: lastMessage.data.title,
        message: lastMessage.data.body,
        action: lastMessage.data.data,
      });
    }
  }, [lastMessage]);
};