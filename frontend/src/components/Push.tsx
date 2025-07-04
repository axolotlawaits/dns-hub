import { Notification } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import { INotification } from '../utils/Push';

interface NotificationsProps {
  notifications: INotification[];
  onDismiss: (id: number) => void;
}

export function Notifications({ notifications, onDismiss }: NotificationsProps) {
  return (
    <div style={{ marginTop: '20px' }}>
      {notifications.map((notification) => (
        <Notification
          key={notification.id}
          icon={<IconBell size="1.1rem" />}
          color={notification.type === 'error' ? 'red' : 'blue'}
          title={notification.title}
          onClose={() => onDismiss(notification.id)}
          mt="md"
        >
          {notification.message}
        </Notification>
      ))}
    </div>
  );
}