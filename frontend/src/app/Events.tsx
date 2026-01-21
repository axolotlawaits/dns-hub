import { useState, useEffect, useCallback } from 'react';
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
  Stack,
  Title} from '@mantine/core';
import { 
  IconCalendar, 
  IconGift, 
  IconAlertCircle, 
  IconClock,
} from '@tabler/icons-react';
import { useUserContext } from '../hooks/useUserContext';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);
dayjs.locale('ru');

type UserData = {
  uuid: string;
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
    name?: string;
  };
};


export default function Events() {
  const { user } = useUserContext();
  const [usersData, setUsersData] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  
  // Load birthdays
  const fetchUpcomingBirthdays = useCallback(async () => {
    if (!user?.email) {
      setError('Пользователь не авторизован');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API}/events/upcoming-birthdays/${user.email}`);
      
      if (!response.ok) {
        throw new Error(`Ошибка загрузки данных: ${response.status}`);
      }

      const data = await response.json();
      setUsersData(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      setUsersData([]);
    } finally {
      setLoading(false);
    }
  }, [user?.email]);



  useEffect(() => {
    // Проверяем user из контекста или localStorage
    const currentUser = user || (() => {
      const storedUser = localStorage.getItem('user');
      return storedUser ? JSON.parse(storedUser) : null;
    })();
    
    // Загружаем дни рождения только если пользователь авторизован
    if (!currentUser?.email) {
      return;
    }
    
    fetchUpcomingBirthdays();
  }, [user?.id, fetchUpcomingBirthdays]);

  const getBirthdayStatus = useCallback((userData: UserData) => {
    if (userData.daysUntil === 0) {
      return { text: 'Сегодня!', color: 'red', variant: 'filled' as const };
    } else if (userData.daysUntil === 1) {
      return { text: 'Завтра', color: 'orange', variant: 'light' as const };
    } else if (userData.daysUntil > 1 && userData.daysUntil <= 7) {
      return { text: `Через ${userData.daysUntil} дн.`, color: 'yellow', variant: 'light' as const };
    } else if (userData.isWeekendBirthday) {
      if (
        userData.daysSince !== undefined &&
        (userData.daysSince === 1 || userData.daysSince === 0)
      ) {
        return {
          text: 'Вчера (выходной)',
          color: 'blue',
          variant: 'light' as const,
        };
      } else if (
        userData.daysSince !== undefined &&
        userData.daysSince <= 3 &&
        userData.daysSince > 1
      ) {
        return {
          text: `Не забудьте поздравить! Было в ${userData.weekendDayName}`,
          color: 'blue',
          variant: 'light' as const,
        };
      } else {
        return { text: `Выходной (${userData.weekendDayName})`, color: 'blue', variant: 'light' as const };
      }
    } else if (userData.daysSince !== undefined && userData.daysSince === 1) {
      return { text: `Вчера`, color: 'gray', variant: 'light' as const };
    } else if (userData.daysSince !== undefined && userData.daysSince > 1) {
      return { text: `Прошло ${userData.daysSince} дн.`, color: 'gray', variant: 'light' as const };
    } else {
      return { text: `Через ${userData.daysUntil} дн.`, color: 'green', variant: 'light' as const };
    }
  }, []);

    // Получаем список дней рождения
    const getAllEvents = useCallback(() => {
      const today = dayjs().startOf('day');
      
      const allEvents: Array<{
        type: 'birthday';
        date: Date;
        daysUntil: number; // Количество дней до события
        data: UserData;
      }> = [];

      // Добавляем дни рождения
      usersData.forEach((userData) => {
        const birthDate = dayjs(userData.birthday).startOf('day');
        let nextBirthday = birthDate.year(today.year());
        
        if (nextBirthday.isBefore(today, 'day')) {
          nextBirthday = nextBirthday.add(1, 'year');
        }
        
        // Всегда вычисляем daysUntil на фронтенде для единообразия
        // Для дней рождения в выходные используем daysSince из данных
        let daysUntil: number;
        if (userData.isWeekendBirthday && userData.daysSince !== undefined) {
          // Для прошедших дней рождения в выходные используем большое число + daysSince
          daysUntil = 1000 + userData.daysSince;
        } else {
          // Для будущих дней рождения вычисляем разницу
          daysUntil = nextBirthday.diff(today, 'day');
        }
        
        allEvents.push({
          type: 'birthday',
          date: nextBirthday.startOf('day').toDate(),
          daysUntil: daysUntil,
          data: userData
        });
      });

      // Сортируем по количеству дней до события (daysUntil)
      const sorted = allEvents.sort((a, b) => {
        if (a.daysUntil !== b.daysUntil) {
          return a.daysUntil - b.daysUntil;
        }
        return a.date.getTime() - b.date.getTime();
      });
      
      return sorted;
    }, [usersData]);

  const allEvents = getAllEvents();

  if (loading) {
    return (
      <Box style={{ padding: '0 12px 12px 0', width: '100%' }}>
        <LoadingOverlay visible={loading} />
      </Box>
    );
  }

  return (
    <Box style={{ padding: '0 12px 12px 0', width: '100%' }}>
      {error && (
        <Alert icon={<IconAlertCircle size={16} />} title="Ошибка" color="red" mb="md">
          {error}
        </Alert>
      )}

      <Group justify="space-between" mb="md">
        <Title order={2}>События</Title>
      </Group>

      {/* Список дней рождения */}
      <Box>
        {loading ? (
          <LoadingOverlay visible={loading} />
        ) : allEvents.length === 0 ? (
          <Alert icon={<IconCalendar size={16} />} title="Нет событий" color="blue">
            Нет предстоящих дней рождения.
          </Alert>
        ) : (
          <ScrollArea.Autosize mah={600}>
            <Stack gap="md">
              {allEvents.map((item, index) => {
                const userData = item.data as UserData;
                const status = getBirthdayStatus(userData);
                const isToday = userData.daysUntil === 0;
                const isTomorrow = userData.daysUntil === 1;
                const branchName =
                  userData.branch && 'name' in userData.branch
                    ? (userData.branch.name as string)
                    : '';

                return (
                  <Card
                    key={`birthday-${userData.uuid || userData.email || index}`}
                    shadow="sm"
                    radius="md"
                    padding="md"
                    style={{ position: 'relative' }}
                  >
                    <Group justify="space-between" align="flex-start">
                      <Group gap="sm" style={{ flex: 1 }}>
                        <Avatar
                          size="md"
                          src={userData.image}
                          name={userData.fio}
                          radius="md"
                        />
                        <Box style={{ flex: 1}}>
                          <Text size="sm" fw={600} mb={4}>
                            {userData.fio}
                          </Text>
                          <Group gap="xs">
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
                    {branchName && (
                      <Box
                        mt={4}
                        style={{
                          width: '100%',
                        }}
                      >
                        <Text size="xs" fw={700} style={{ textAlign: 'right', wordBreak: 'break-word', lineHeight: 1.4 }}>
                          {branchName}
                        </Text>
                      </Box>
                    )}
                  </Card>
                );
              })}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Box>
    </Box>
  );
}

