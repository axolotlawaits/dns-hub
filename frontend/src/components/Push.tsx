import { Paper, Text, Group, ActionIcon, Stack } from '@mantine/core';
import { IconCheck, IconX, IconAlertCircle, IconInfoCircle } from '@tabler/icons-react';
import { INotification } from '../utils/Push';

interface NotificationsProps {
  notifications: INotification[];
  onDismiss: (id: number) => void;
}

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'success':
      return <IconCheck size={20} />;
    case 'error':
      return <IconX size={20} />;
    case 'warning':
      return <IconAlertCircle size={20} />;
    default:
      return <IconInfoCircle size={20} />;
  }
};

const getNotificationColor = (type: string) => {
  switch (type) {
    case 'success':
      return 'var(--mantine-color-green-6)';
    case 'error':
      return 'var(--mantine-color-red-6)';
    case 'warning':
      return 'var(--mantine-color-yellow-6)';
    default:
      return 'var(--mantine-color-blue-6)';
  }
};

const getNotificationBackground = (type: string) => {
  switch (type) {
    case 'success':
      return 'linear-gradient(135deg, var(--mantine-color-green-0) 0%, var(--mantine-color-green-1) 100%)';
    case 'error':
      return 'linear-gradient(135deg, var(--mantine-color-red-0) 0%, var(--mantine-color-red-1) 100%)';
    case 'warning':
      return 'linear-gradient(135deg, var(--mantine-color-yellow-0) 0%, var(--mantine-color-yellow-1) 100%)';
    default:
      return 'linear-gradient(135deg, var(--mantine-color-blue-0) 0%, var(--mantine-color-blue-1) 100%)';
  }
};

export function Notifications({ notifications, onDismiss }: NotificationsProps) {
  return (
    <div style={{ 
      position: 'fixed',
      bottom: '80px', // Увеличиваем отступ снизу чтобы уведомления были над футером
      right: '20px',
      zIndex: 99999, // Увеличиваем z-index чтобы уведомления были поверх футера
      maxWidth: '400px',
      width: '100%',
      pointerEvents: 'none'
    }}>
      <Stack gap="md">
        {notifications.map((notification) => (
          <Paper
            key={notification.id}
            withBorder
            radius="md"
            p="md"
            style={{
              background: getNotificationBackground(notification.type),
              border: `1px solid ${getNotificationColor(notification.type)}20`,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
              backdropFilter: 'blur(10px)',
              pointerEvents: 'auto',
              animation: 'slideInUp 0.3s ease-out'
            }}
          >
            <Group justify="space-between" align="flex-start">
              <Group gap="sm" align="flex-start" style={{ flex: 1 }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: `${getNotificationColor(notification.type)}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: getNotificationColor(notification.type),
                    flexShrink: 0
                  }}
                >
                  {getNotificationIcon(notification.type)}
                </div>
                <Stack gap="xs" style={{ flex: 1 }}>
                  <Text size="sm" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
                    {notification.title}
                  </Text>
                  <Text size="xs" style={{ color: 'var(--theme-text-secondary)' }}>
                    {notification.message}
                  </Text>
                </Stack>
              </Group>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                onClick={() => onDismiss(notification.id)}
                style={{
                  flexShrink: 0,
                  opacity: 0.7,
                  transition: 'opacity 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
              >
                <IconX size={14} />
              </ActionIcon>
            </Group>
          </Paper>
        ))}
      </Stack>
      
      <style>{`
        @keyframes slideInUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}