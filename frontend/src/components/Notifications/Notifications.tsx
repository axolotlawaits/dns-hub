import { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Text, 
  Group, 
  LoadingOverlay, 
  Badge, 
  ThemeIcon, 
  ActionIcon, 
  Stack, 
  Card,
  Button
} from '@mantine/core';
import dayjs from 'dayjs';
import { 
  IconBell, 
  IconAlertCircle, 
  IconInfoCircle, 
  IconCheck, 
  IconX
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useUserContext } from '../../hooks/useUserContext';
import { API } from '../../config/constants';
import './Notifications.css';

interface Notification {
  id: string;
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' | 'ALERT' | 'SYSTEM' | 'EVENT';
  channel: ('IN_APP' | 'EMAIL' | 'PUSH')[];
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  sender?: { name: string; avatar?: string };
  tool?: { name: string; icon?: string };
  action?: Record<string, unknown>;
}

const NOTIFICATION_ICONS = {
  WARNING: IconAlertCircle,
  ERROR: IconX,
  SUCCESS: IconCheck,
  INFO: IconInfoCircle,
  ALERT: IconAlertCircle,
  SYSTEM: IconInfoCircle,
  EVENT: IconInfoCircle,
};

const NOTIFICATION_COLORS = {
  WARNING: 'orange',
  ERROR: 'red',
  SUCCESS: 'teal',
  INFO: 'blue',
  ALERT: 'yellow',
  SYSTEM: 'gray',
  EVENT: 'violet',
};

function NotificationsList() {
  const { user } = useUserContext();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const response = await fetch(`${API}/notifications?userId=${user.id}&limit=20`);
      if (!response.ok) {
        throw new Error('Ошибка загрузки уведомлений');
      }
      const data = await response.json();
      setNotifications(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const markAsRead = useCallback(async (notificationId: string | undefined) => {
    if (!notificationId) {
      console.warn('[Notifications] markAsRead called with undefined notificationId');
      return;
    }
    try {
      const response = await fetch(`${API}/notifications/read/${notificationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id }),
      });
      if (!response.ok) {
        throw new Error('Ошибка обновления уведомления');
      }
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
    } catch (err) {
      console.error('Ошибка обновления уведомления:', err);
    }
  }, [user?.id]);



  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    // Socket functionality will be implemented later
    // For now, we'll just show a placeholder
  }, []);

  const getNotificationIcon = (type: string) => {
    const IconComponent = NOTIFICATION_ICONS[type as keyof typeof NOTIFICATION_ICONS] || IconInfoCircle;
    return <IconComponent size={16} />;
  };

  const getNotificationColor = (type: string) => {
    return NOTIFICATION_COLORS[type as keyof typeof NOTIFICATION_COLORS] || 'blue';
  };

  const formatTime = (dateString: string) => {
    const date = dayjs(dateString);
    const now = dayjs();
    const diffInMinutes = now.diff(date, 'minute');
    
    if (diffInMinutes < 1) return 'только что';
    if (diffInMinutes < 60) return `${diffInMinutes} мин назад`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} ч назад`;
    return date.format('DD.MM.YYYY');
  };

  if (loading) {
    return (
      <Box className="notifications-container">
        <LoadingOverlay visible={loading} />
      </Box>
    );
  }

  if (error) {
  return (
    <Box className="notifications-container">
        <Card shadow="sm" radius="md" padding="md">
          <Group gap="sm">
            <ThemeIcon size="sm" color="red" variant="light">
              <IconX size={16} />
            </ThemeIcon>
            <Text size="sm" c="var(--theme-text-secondary)">
              Ошибка загрузки уведомлений
            </Text>
        </Group>
        </Card>
      </Box>
    );
  }

  if (!Array.isArray(notifications) || notifications.length === 0) {
    return (
      <Box className="notifications-container">
        <Card shadow="none" radius="md" padding="md" className="notifications-empty">
          <Stack gap="md" align="center">
            <ThemeIcon size="xl" color="gray" variant="light">
              <IconBell size={32} />
            </ThemeIcon>
            <Text size="sm" c="var(--theme-text-secondary)" ta="center">
              Нет новых уведомлений
            </Text>
          </Stack>
        </Card>
      </Box>
    );
  }

  const unreadNotifications = notifications.filter(n => !n.read);
  const allNotifications = notifications;
  const visibleNotifications = showAll ? allNotifications : unreadNotifications;

  return (
    <Box style={{ padding: '0 12px 12px 0', width: '100%' }}>
      <Box className="notifications-widget">
        <Group justify="space-between" mb="md">
        <Group gap="sm">
          <ThemeIcon size="md" color="blue" variant="light">
            <IconBell size={20} />
          </ThemeIcon>
          <Text size="lg" fw={600}>
            Уведомления
          </Text>
        </Group>
        <Button
          variant="subtle"
          size="xs"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Непрочитанные' : 'Все'}
        </Button>
      </Group>

      <div className="notifications-list">
        {visibleNotifications.length === 0 ? (
          <div className="notifications-empty">
            <div className="notifications-empty-content">
              <div className="notifications-empty-icon">
                <IconBell size={32} />
              </div>
              <Text size="sm" c="var(--theme-text-secondary)" ta="center">
                {showAll ? 'Нет уведомлений' : 'Нет непрочитанных уведомлений'}
              </Text>
            </div>
          </div>
        ) : (
          visibleNotifications.map((notification) => {
          const color = getNotificationColor(notification.type);
              const isUnread = !notification.read;

              return (
            <div
                  key={notification.id}
              className={`notification-item ${isUnread ? 'notification-unread' : ''}`}
              onClick={() => {
                // Обрабатываем клик по уведомлению
                if (notification.action && typeof notification.action === 'object') {
                  const action = notification.action as any;
                  if (action.type === 'NAVIGATE' && action.url) {
                    // Переходим по URL из action
                    navigate(action.url);
                    // Отмечаем как прочитанное при клике
                    if (isUnread && notification.id) {
                      markAsRead(notification.id);
                    }
                  }
                }
              }}
              style={{ cursor: notification.action ? 'pointer' : 'default' }}
            >
              <div className="notification-content">
                <div className="notification-icon">
                  <ThemeIcon size="sm" color={color} variant="light">
                    {getNotificationIcon(notification.type)}
                      </ThemeIcon>
                </div>
                <div className="notification-text">
                  <Text size="sm" fw={isUnread ? 600 : 500} c="var(--theme-text-primary)" mb={4}>
                            {notification.title}
                          </Text>
                  <Text size="xs" c="var(--theme-text-secondary)" mb="xs">
                          {notification.message}
                        </Text>
                  <div className="notification-meta">
                    <div className="notification-badges">
                      {notification.sender && (
                        <Badge size="xs" variant="light" color="gray">
                          {notification.sender.name}
                        </Badge>
                      )}
                          {notification.tool && (
                        <Badge size="xs" variant="light" color="blue">
                              {notification.tool.name}
                            </Badge>
                          )}
                    </div>
                    <Text size="xs" c="var(--theme-text-tertiary)">
                      {formatTime(notification.createdAt)}
                    </Text>
                  </div>
                </div>
                
                {isUnread && (
                      <ActionIcon
                        variant="subtle"
                    size="sm"
                    color="blue"
                    onClick={() => {
                      if (notification.id) {
                        markAsRead(notification.id);
                      }
                    }}
                    title="Отметить как прочитанное"
                    className="notification-action"
                  >
                    <IconCheck size={14} />
                      </ActionIcon>
                    )}
              </div>
            </div>
              );
          })
        )}
      </div>
      </Box>
    </Box>
  );
}

export default NotificationsList;