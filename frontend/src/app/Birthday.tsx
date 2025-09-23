import { useState, useEffect } from 'react';
import { API } from '../config/constants';
import { 
  Box, 
  Text, 
  Group, 
  LoadingOverlay, 
  Badge, 
  ThemeIcon, 
  Avatar, 
  ScrollArea, 
  Alert,
  Card,
  Stack
} from '@mantine/core';
import dayjs from 'dayjs';
import { IconCalendar, IconGift, IconAlertCircle, IconClock, IconCake } from '@tabler/icons-react';
import { useUserContext } from '../hooks/useUserContext';

type UserData = {
  id: string;
  fio: string;
  birthday: string;
  email: string;
  image?: string;
  daysUntil: number;
  isWeekendBirthday?: boolean;
  weekendDayName?: string;
  daysSince?: number;
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
        console.error('Ошибка загрузки дней рождения:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUpcomingBirthdays();
  }, [user?.email]);

  const getBirthdayStatus = (userData: UserData) => {
    if (userData.daysUntil === 0) {
      return { text: 'Сегодня!', color: 'red', variant: 'filled' as const };
    } else if (userData.daysUntil === 1) {
      return { text: 'Завтра', color: 'orange', variant: 'light' as const };
    } else if (userData.daysUntil <= 7) {
      return { text: `Через ${userData.daysUntil} дн.`, color: 'yellow', variant: 'light' as const };
    } else if (userData.isWeekendBirthday) {
      // Для дней рождения в выходные показываем напоминание о поздравлении
      if (userData.daysSince !== undefined && userData.daysSince <= 3) {
        return { 
          text: `Не забудьте поздравить! Было в ${userData.weekendDayName}`, 
          color: 'blue', 
          variant: 'light' as const 
        };
      } else {
        return { text: `Выходной (${userData.weekendDayName})`, color: 'blue', variant: 'light' as const };
      }
    } else if (userData.daysSince !== undefined && userData.daysSince > 0) {
      return { text: `Прошло ${userData.daysSince} дн.`, color: 'gray', variant: 'light' as const };
    } else {
      return { text: `Через ${userData.daysUntil} дн.`, color: 'green', variant: 'light' as const };
    }
  };

  if (loading) {
    return (
      <Box className="birthday-container">
        <LoadingOverlay visible={loading} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box className="birthday-container">
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Ошибка загрузки"
          color="red"
          variant="light"
        >
          {error}
        </Alert>
      </Box>
    );
  }

  if (usersData.length === 0) {
    return (
      <Box className="birthday-container">
        <Card shadow="sm" radius="md" padding="md" className="birthday-empty">
          <Stack gap="md" align="center">
            <ThemeIcon size="xl" color="gray" variant="light">
              <IconCake size={32} />
            </ThemeIcon>
            <Text size="sm" c="var(--theme-text-secondary)" ta="center">
              Нет предстоящих дней рождения
            </Text>
          </Stack>
        </Card>
      </Box>
    );
  }

  return (
    <Box className="birthday-widget">
      <Group gap="sm" mb="md">
        <ThemeIcon size="md" color="green" variant="light">
          <IconCalendar size={20} />
        </ThemeIcon>
        <Text size="lg" fw={600}>
          Дни рождения
        </Text>
      </Group>

      <ScrollArea h="100%">
        <Stack gap="md">
          {usersData.map((userData) => {
            const status = getBirthdayStatus(userData);
            const isToday = userData.daysUntil === 0;
            const isTomorrow = userData.daysUntil === 1;

            return (
              <Card
                key={userData.id}
                className={`birthday-card ${isToday ? 'birthday-today' : ''}`}
                shadow="sm"
                radius="md"
                padding="md"
              >
                <Group justify="space-between" align="flex-start">
                  <Group gap="sm" style={{ flex: 1 }}>
                    <Avatar
                      size="md"
                      src={userData.image}
                      name={userData.fio}
                      radius="md"
                    />
                    <Box style={{ flex: 1 }}>
                      <Text size="sm" fw={600} c="var(--theme-text-primary)" mb={4}>
                        {userData.fio}
                      </Text>
                      <Text size="xs" c="var(--theme-text-secondary)" mb="xs">
                        {dayjs(userData.birthday).format('DD MMMM')}
                      </Text>
                      <Group gap="xs" mb="xs">
                        <Badge
                          size="sm"
                          color={status.color}
                          variant={status.variant}
                          leftSection={
                            isToday ? <IconGift size={12} /> : 
                            isTomorrow ? <IconClock size={12} /> : 
                            <IconCalendar size={12} />
                          }
                        >
                          {status.text}
                        </Badge>
                      </Group>
                    </Box>
                  </Group>
                  
                  {isToday && (
                    <ThemeIcon size="lg" color="red" variant="light">
                      <IconGift size={20} />
                    </ThemeIcon>
                  )}
                </Group>
              </Card>
            );
          })}
        </Stack>
      </ScrollArea>
    </Box>
  );
}