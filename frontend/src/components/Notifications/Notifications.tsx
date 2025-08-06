import { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Title, Text, Group, LoadingOverlay, Divider, Badge,  ThemeIcon, ScrollArea, ActionIcon, Button, Stack, Paper,  useMantineTheme,  Indicator } from '@mantine/core';
import { useColorScheme } from '@mantine/hooks';
import dayjs from 'dayjs';
import { IconBell, IconAlertCircle, IconInfoCircle, IconCheck, IconMail, IconX, IconCircleCheck, IconCircleCheckFilled } from '@tabler/icons-react';
import { useUserContext } from '../../hooks/useUserContext';
import { showNotification } from '@mantine/notifications';
import { useSocketIO } from '../../hooks/useSocketIO'; // Измененный импорт
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

export function Notifications() {
  const { user } = useUserContext();
  const theme = useMantineTheme();
  const colorScheme = useColorScheme();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('unread');

  const { lastNotification } = useSocketIO(); // Изменено на useSocketIO

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '20',
        userId: user.id,
        ...(activeTab === 'unread' && { unreadOnly: 'true' })
      });

      const response = await fetch(`${API}/notifications?${params}`, {
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Не удалось загрузить уведомления');

      const { data } = await response.json();
      setNotifications(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(errorMessage);
      showNotification({
        title: 'Ошибка',
        message: 'Не удалось загрузить уведомления',
        color: 'red',
      });
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, activeTab]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${API}/notifications/read/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id }),
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Не удалось отметить как прочитанное');

      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
    } catch (err) {
      showNotification({
        title: 'Ошибка',
        message: 'Не удалось отметить уведомление как прочитанное',
        color: 'red',
      });
    }
  }, [user?.id]);

  const markAllAsRead = useCallback(async () => {
    try {
      const response = await fetch(`${API}/notifications/read-all`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id }),
        credentials: 'include'
      });

      const data = await response.json();
      if (data.success) {
        showNotification({
          title: 'Успех',
          message: `Отмечено ${data.count} уведомлений как прочитанных`,
          color: 'green',
        });
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      }
    } catch (err) {
      showNotification({
        title: 'Ошибка',
        message: 'Не удалось отметить все уведомления как прочитанные',
        color: 'red',
      });
    }
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!lastNotification) return;
    
    setNotifications(prev => {
      const newNotification = lastNotification;
      const exists = prev.some(n => n.id === newNotification.id);

      return exists
        ? prev.map(n => n.id === newNotification.id ? newNotification : n)
        : [newNotification, ...prev].slice(0, 20);
    });
  }, [lastNotification]); // Изменено на lastNotification

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);
  const filteredNotifications = useMemo(() =>
    activeTab === 'unread'
      ? notifications.filter(n => !n.read)
      : notifications
  , [notifications, activeTab]);

  if (isLoading) return <LoadingOverlay visible />;
  if (error) return <Box p="md"><Text c="red">{error}</Text></Box>;


  return (
    <Box className="notifications-container">
      <Group mb="md" justify="space-between">
        <Group gap="xs">
          <Indicator label={unreadCount} size={18} disabled={unreadCount === 0} color="red">
            <ThemeIcon variant="light" color="blue" size="lg" radius="xl">
              <IconBell size={18} />
            </ThemeIcon>
          </Indicator>
          <Title order={3}>Уведомления</Title>
        </Group>

        <Group>
          <Button.Group>
            <Button
              variant={activeTab === 'unread' ? 'light' : 'subtle'}
              size="sm"
              onClick={() => setActiveTab('unread')}
            >
              Непрочитанные
            </Button>
            <Button
              variant={activeTab === 'all' ? 'light' : 'subtle'}
              size="sm"
              onClick={() => setActiveTab('all')}
            >
              Все
            </Button>
          </Button.Group>

          {unreadCount > 0 && (
            <Button
              variant="subtle"
              size="sm"
              leftSection={<IconCircleCheckFilled size={16} />}
              onClick={markAllAsRead}
            >
              Прочитать все
            </Button>
          )}
        </Group>
      </Group>

      <Divider mb="md" />

      <ScrollArea.Autosize mah={500}>
        {filteredNotifications.length === 0 ? (
          <Box py="xl" ta="center">
            <ThemeIcon variant="light" color="gray" size={50} radius="xl" mb="sm">
              <IconCheck size={30} />
            </ThemeIcon>
            <Text c="dimmed" fw={500}>Нет уведомлений</Text>
            {activeTab === 'unread' && (
              <Text size="sm" c="dimmed" mt="xs">Все уведомления прочитаны</Text>
            )}
          </Box>
        ) : (
          <Stack gap="sm">
            {filteredNotifications.map((notification) => {
              const Icon = NOTIFICATION_ICONS[notification.type];
              const color = NOTIFICATION_COLORS[notification.type];
              const isUnread = !notification.read;

              const colorIndex = colorScheme === 'dark' ? 4 : 5;
              const rgbColor = hexToRgb(theme.colors[color][colorIndex]);

              return (
                <Paper
                  key={notification.id}
                  withBorder
                  p="sm"
                  radius="sm"
                  className={`notification-paper ${isUnread ? 'unread' : ''}`}
                  style={{
                    borderLeftColor: theme.colors[color][colorIndex],
                    '--notification-color': theme.colors[color][colorIndex],
                    '--notification-color-rgb': rgbColor
                  }}
                  onClick={() => !isUnread && markAsRead(notification.id)}
                >
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Group align="flex-start" gap="sm" wrap="nowrap">
                      <ThemeIcon color={color} variant="light" size={40} radius="xl" className="notification-icon">
                        <Icon size={18} />
                      </ThemeIcon>

                      <Stack gap={4} style={{ flex: 1 }}>
                        <Group justify="space-between" wrap="nowrap">
                          <Text fw={isUnread ? 600 : 500} lineClamp={1} className={`notification-title ${isUnread ? '' : 'read'}`}>
                            {notification.title}
                          </Text>
                          <Text size="xs" className="notification-time">
                            {dayjs(notification.createdAt).format('D MMM HH:mm')}
                          </Text>
                        </Group>

                        <Text size="sm" c="dimmed" lineClamp={2} className="notification-message">
                          {notification.message}
                        </Text>

                        <Group gap="xs" mt={4}>
                          {notification.tool && (
                            <Badge
                              variant="light"
                              color="gray"
                              className="notification-badge"
                              leftSection={notification.tool.icon && (
                                <img
                                  src={notification.tool.icon}
                                  width={12}
                                  height={12}
                                  alt=""
                                />
                              )}
                            >
                              {notification.tool.name}
                            </Badge>
                          )}

                          {notification.channel?.includes('EMAIL') && (
                            <Badge variant="light" color="blue" leftSection={<IconMail size={12} />} className="notification-badge">
                              Email
                            </Badge>
                          )}
                        </Group>
                      </Stack>
                    </Group>

                    {isUnread ? (
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(notification.id);
                        }}
                        aria-label="Отметить как прочитанное"
                      >
                        <IconCircleCheck size={18} />
                      </ActionIcon>
                    ) : (
                      <ThemeIcon variant="transparent" color="green" size="sm">
                        <IconCircleCheckFilled size={16} />
                      </ThemeIcon>
                    )}
                  </Group>
                </Paper>
              );
            })}
          </Stack>
        )}
      </ScrollArea.Autosize>
    </Box>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

export default Notifications;