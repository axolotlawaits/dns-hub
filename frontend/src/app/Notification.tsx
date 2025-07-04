import { useState, useEffect } from 'react';
import { API } from '../config/constants';
import { Box, Title, Text, Group, LoadingOverlay, List, Badge, ThemeIcon, ScrollArea } from '@mantine/core';
import dayjs from 'dayjs';
import { IconBell, IconClock, IconAlertCircle, IconInfoCircle } from '@tabler/icons-react';
import { useUserContext } from '../hooks/useUserContext';

type Notification = {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error';
  createdAt: string;
  read: boolean;
};

const getNotificationDetails = (type: string) => {
  const icon = type === 'warning' || type === 'error' ? <IconAlertCircle size={16} /> : <IconInfoCircle size={16} />;
  const color = type === 'warning' ? 'orange' : type === 'error' ? 'red' : 'blue';
  return { icon, color };
};

export default function Notifications() {
  const { user } = useUserContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!user?.email) {
        setError('Пользователь не авторизован');
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`${API}/notification/`);
        if (!response.ok) throw new Error(`Ошибка загрузки уведомлений: ${response.status}`);
        const data = await response.json();
        setNotifications(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
        console.error('Ошибка:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchNotifications();
  }, [user?.email]);

  if (loading) return <LoadingOverlay visible />;
  if (error) return <Box p="md"><Text c="red">Ошибка: {error}</Text></Box>;

  return (
    <Box p="md" style={{ width: '400px' }}>
      <Group mb="md" gap="xs">
        <ThemeIcon variant="light" color="gray" size="lg" radius="xl">
          <IconBell size={18} />
        </ThemeIcon>
        <Title order={2}>Последние уведомления</Title>
      </Group>
      <Text c="dimmed" mb="lg">Новые и непрочитанные</Text>
      {notifications.length === 0 ? (
        <Text c="dimmed">Нет новых уведомлений</Text>
      ) : (
        <ScrollArea.Autosize mah={notifications.length > 4 ? 400 : undefined} type="scroll" offsetScrollbars style={{ width: '100%' }}>
          <List spacing="md" size="lg" center icon={<ThemeIcon color="gray" variant="light" radius="xl" size={24}><IconClock size={14} /></ThemeIcon>}>
            {notifications.map((n) => {
              const { icon, color } = getNotificationDetails(n.type);
              return (
                <List.Item key={n.id} icon={<ThemeIcon color={color} variant="light" radius="xl" size={40}>{icon}</ThemeIcon>}>
                  <Group justify="space-between">
                    <Box>
                      <Text fw={500}>{n.title}</Text>
                      <Text size="sm" c="dimmed">{n.message}</Text>
                    </Box>
                    <Group gap="xs">
                      <Badge variant="light" size="sm" color={n.read ? 'gray' : 'blue'}>
                        {n.read ? 'Прочитано' : 'Новое'}
                      </Badge>
                      <Text size="sm" c="dimmed">{dayjs(n.createdAt).format('D MMMM HH:mm')}</Text>
                    </Group>
                  </Group>
                </List.Item>
              );
            })}
          </List>
        </ScrollArea.Autosize>
      )}
    </Box>
  );
}