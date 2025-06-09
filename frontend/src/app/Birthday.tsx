import { useState, useEffect } from 'react';
import { API } from '../config/constants';
import { Box, Title, Text, Group, LoadingOverlay, List, Badge, ThemeIcon, Avatar, ScrollArea } from '@mantine/core';
import dayjs from 'dayjs';
import { IconCalendar, IconGift } from '@tabler/icons-react';
import { useUserContext } from '../hooks/useUserContext';

type UserData = {
  id: string;
  fio: string;
  birthday: string;
  email: string;
  image?: string;
  daysUntil: number;
  branch: {
    uuid: string;
    type: string;
  };
};

export default function BirthdayList() {
  const { user } = useUserContext();
  const [usersData, setUsersData] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUpcomingBirthdays = async () => {
      if (!user?.email) {
        setError('Пользователь не авторизован');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        console.log('Текущий пользователь:', user);
        
        const response = await fetch(`${API}/birthday/upcoming-birthdays/${user.email}`);
        if (!response.ok) {
          throw new Error(`Ошибка загрузки данных: ${response.status}`);
        }
        
        const data = await response.json();
        setUsersData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
        console.error('Ошибка:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUpcomingBirthdays();
  }, [user?.email]);

  const formatBirthday = (dateString: string) => {
    return dayjs(dateString).format('D MMMM');
  };

  const renderDaysText = (days: number) => {
    if (days === 0) {
      return <Badge variant="light" size="sm" color="green">сегодня</Badge>;
    }
    if (days === 1) {
      return <Badge variant="light" size="sm" color="orange">завтра</Badge>;
    }
    return (
      <Text c="dimmed" size="sm">
        {`через ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`}
      </Text>
    );
  };

  if (loading) {
    return <LoadingOverlay visible />;
  }

  if (error) {
    return (
      <Box p="md">
        <Text c="red">Ошибка: {error}</Text>
      </Box>
    );
  }

  return (
    <Box p="md">
      <Group mb="md" gap="xs">
        <ThemeIcon variant="light" color="pink" size="lg" radius="xl">
          <IconGift size={18} />
        </ThemeIcon>
        <Title order={2}>Ближайшие дни рождения</Title>
      </Group>

      <Text c="dimmed" mb="lg">В следующие 7 дней</Text>

      {usersData.length === 0 ? (
        <Text c="dimmed">Нет предстоящих дней рождения</Text>
      ) : (
        <ScrollArea.Autosize
          mah={usersData.length > 4 ? 400 : undefined}
          type="scroll"
          offsetScrollbars
        >
          <List
            spacing="md"
            size="lg"
            center
            icon={
              <ThemeIcon color="blue" variant="light" radius="xl" size={24}>
                <IconCalendar size={14} />
              </ThemeIcon>
            }
          >
            {usersData.map((user, index) => (
              <List.Item
                key={`${user.id}-${index}`}
                icon={
                  <Avatar
                    src={user.image}
                    alt={user.fio}
                    radius="xl"
                    size={40}
                  >
                    {user.fio.charAt(0)}
                  </Avatar>
                }
              >
                <Group justify="space-between">
                  <Box>
                    <Text fw={500}>{user.fio}</Text>
                    <Group gap="xs">
                      <Badge variant="light" size="sm">
                        {formatBirthday(user.birthday)}
                      </Badge>
                      {renderDaysText(user.daysUntil)}
                    </Group>
                  </Box>
                </Group>
              </List.Item>
            ))}
          </List>
        </ScrollArea.Autosize>
      )}
    </Box>
  );
}