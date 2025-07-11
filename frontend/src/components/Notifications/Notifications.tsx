import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Box, Title, Text, Group, LoadingOverlay, List, Badge, 
  ThemeIcon, ScrollArea, ActionIcon, Button, Stack 
} from '@mantine/core';
import dayjs from 'dayjs';
import { 
  IconBell, IconAlertCircle, IconInfoCircle, 
  IconCheck, IconMail, IconChecklist, IconX 
} from '@tabler/icons-react';
import { useUserContext } from '../../hooks/useUserContext';
import { showNotification } from '@mantine/notifications';
import { useWebSocket } from '../../hooks/useWebSocket';
import './Notifications.css';
import { API } from '../../config/constants';

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
  SUCCESS: 'green',
  INFO: 'blue',
  ALERT: 'yellow',
  SYSTEM: 'gray',
  EVENT: 'violet',
};

export function Notifications() {
  const { user } = useUserContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { lastMessage, isConnected } = useWebSocket();

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        unreadOnly: 'true',
        limit: '10',
        userId: user.id
      });
      
      const response = await fetch(`${API}/notifications?${params}`, {
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Failed to fetch notifications');
      
      const { data } = await response.json();
      setNotifications(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      showNotification({
        title: 'Error',
        message: 'Failed to load notifications',
        color: 'red',
      });
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${API}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user?.id }),
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Failed to mark as read');
      
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
    } catch (err) {
      showNotification({
        title: 'Error',
        message: 'Failed to mark notification as read',
        color: 'red',
      });
    }
  }, [user?.id]);

  const markAllAsRead = useCallback(async () => {
    try {
      const response = await fetch(`${API}/notifications/read-all`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user?.id }),
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Failed to mark all as read');
      
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      showNotification({
        title: 'Error',
        message: 'Failed to mark all notifications as read',
        color: 'red',
      });
    }
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

useEffect(() => {
  if (!lastMessage || lastMessage.event !== 'notification') return;

  setNotifications(prev => {
    const newNotification = lastMessage.data;
    const exists = prev.some(n => n.id === newNotification.id);
    
    return exists 
      ? prev.map(n => n.id === newNotification.id ? newNotification : n)
      : [newNotification, ...prev].slice(0, 10); // Лимит 10 уведомлений
  });

}, [lastMessage]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  if (isLoading) return <LoadingOverlay visible />;
  if (error) return <Box p="md"><Text c="red">{error}</Text></Box>;

  return (
    <Box className="notifications-container">
      <Group mb="md" justify="space-between">
        <Group gap="xs">
          <ThemeIcon variant="light" color="gray" size="lg" radius="xl">
            <IconBell size={18} />
          </ThemeIcon>
          <Title order={2}>Уведомления</Title>
          {unreadCount > 0 && <Badge variant="filled" color="red" circle>{unreadCount}</Badge>}
        </Group>
        
        {unreadCount > 0 && (
          <Button 
            variant="subtle" 
            size="sm" 
            leftSection={<IconChecklist size={16} />}
            onClick={markAllAsRead}
          >
            Отметить все как прочитанные
          </Button>
        )}
      </Group>
      
      <ScrollArea.Autosize mah={400}>
        {notifications.length === 0 ? (
          <Text c="dimmed" ta="center" py="md">Нет уведомлений</Text>
        ) : (
          <List spacing="md" size="sm">
            {notifications.map((notification) => {
              const Icon = NOTIFICATION_ICONS[notification.type];
              const color = NOTIFICATION_COLORS[notification.type];
              const isUnread = !notification.read;
              
              return (
                <List.Item 
                  key={notification.id}
                  className={isUnread ? "notification-item unread" : "notification-item"}
                  icon={
                    <ThemeIcon color={color} variant="light" size={40} radius="xl">
                      <Icon size={16} />
                    </ThemeIcon>
                  }
                >
                  <Stack gap={4}>
                    <Group justify="space-between">
                      <Text fw={isUnread ? 700 : 500}>{notification.title}</Text>
                      <Text size="xs" c="dimmed">
                        {dayjs(notification.createdAt).format('D MMM HH:mm')}
                      </Text>
                    </Group>
                    <Text size="sm" c="dimmed">{notification.message}</Text>
                    <Group gap="xs" justify="space-between">
                      {notification.tool && (
                        <Badge variant="outline" leftSection={
                          notification.tool.icon && (
                            <img src={notification.tool.icon} width={14} height={14} alt="" style={{ marginRight: 4 }} />
                          )
                        }>
                          {notification.tool.name}
                        </Badge>
                      )}
                      <Group gap={4}>
                        {notification.channel?.includes('EMAIL') && ( // Добавьте optional chaining
                          <ThemeIcon variant="subtle" size="sm">
                            <IconMail size={14} />
                          </ThemeIcon>
                        )}
                        {isUnread && (
                          <ActionIcon 
                            variant="subtle" 
                            onClick={() => markAsRead(notification.id)}
                            aria-label="Отметить как прочитанное"
                          >
                            <IconCheck size={16} />
                          </ActionIcon>
                        )}
                      </Group>
                    </Group>
                  </Stack>
                </List.Item>
              );
            })}
          </List>
        )}
      </ScrollArea.Autosize>
    </Box>
  );
}

export default Notifications;