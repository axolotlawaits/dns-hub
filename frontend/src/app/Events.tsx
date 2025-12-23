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
import { usePageHeader } from '../contexts/PageHeaderContext';
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

interface CalendarEvent {
  id: string;
  subject: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName: string;
  };
  attendees?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
    type: string;
  }>;
  isAllDay?: boolean;
  body?: {
    content?: string;
    contentType?: string;
  };
}

export default function Events() {
  // Явный лог при каждом рендере
  console.log('[Events] 🎬 Component Events RENDERED');
  console.log('[Events] 🎬 Current URL:', window.location.href);
  console.log('[Events] 🎬 Current pathname:', window.location.pathname);
  
  const { user, token } = useUserContext();
  console.log('[Events] 🎬 User context:', { 
    hasUser: !!user, 
    hasToken: !!token,
    userEmail: user?.email 
  });
  const { setHeader } = usePageHeader();
  const [usersData, setUsersData] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Calendar state
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  
  // Логируем состояние events при каждом рендере
  useEffect(() => {
    console.log('[Events] 📊 Current events state:', {
      count: events.length,
      events: events,
      loading: loadingEvents,
      error: eventsError
    });
  }, [events, loadingEvents, eventsError]);
  
  // Диагностика токена
  useEffect(() => {
    const authToken = token || localStorage.getItem('token');
    console.log('[Events] 🔍 Token diagnostics:', {
      tokenFromContext: token ? 'present' : 'missing',
      tokenFromLocalStorage: localStorage.getItem('token') ? 'present' : 'missing',
      authToken: authToken ? 'present' : 'missing',
      user: user ? `${user.login} (${user.email})` : 'missing'
    });
  }, [token, user]);
  
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

      console.log('[Events] Loading birthdays for:', user.email);
      const response = await fetch(`${API}/events/upcoming-birthdays/${user.email}`);
      console.log('[Events] Birthdays response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Events] Birthdays error response:', errorText);
        throw new Error(`Ошибка загрузки данных: ${response.status}`);
      }

      const data = await response.json();
      console.log('[Events] Birthdays data received:', data?.length || 0, 'items');
      setUsersData(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[Events] Error loading birthdays:', err);
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      setUsersData([]);
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  // Load calendar events
  const loadCalendarEvents = useCallback(async () => {
    const authToken = token || localStorage.getItem('token');
    
    console.log('[Events] 🚀 loadCalendarEvents function called', {
      hasAuthToken: !!authToken,
      tokenFromContext: !!token,
      tokenFromStorage: !!localStorage.getItem('token'),
      authTokenPreview: authToken ? `${authToken.substring(0, 20)}...` : 'none'
    });
    
    if (!authToken) {
      console.log('[Events] ❌ No auth token, skipping calendar events load');
      setEventsError('Токен авторизации отсутствует');
      return;
    }
    
    console.log('[Events] 📅 Loading calendar events...');
    setLoadingEvents(true);
    setEventsError(null);
    try {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);
      
      const url = `${API}/exchange/calendar/events?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;
      console.log('[Events] 🌐 Making request:', {
        url,
        method: 'GET',
        hasAuthToken: !!authToken,
        authTokenLength: authToken?.length || 0,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });
      
      const startTime = Date.now();
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      const requestTime = Date.now() - startTime;
      console.log('[Events] ⏱️ Request completed in', requestTime, 'ms');
      
      console.log('[Events] Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Events] Error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: 'Failed to load calendar events' };
        }
        const errorMessage = errorData.error || errorData.message || `Ошибка загрузки событий: ${response.status}`;
        setEventsError(errorMessage);
        setEvents([]);
        return;
      }
      
      const data = await response.json();
      console.log('[Events] 📦 Calendar events response (full):', JSON.stringify(data, null, 2));
      console.log('[Events] 📦 Events count:', data.events?.length || 0);
      console.log('[Events] 📦 Events data:', data.events);
      console.log('[Events] 📦 Is array?', Array.isArray(data.events));
      console.log('[Events] 📦 Data keys:', Object.keys(data));
      
      if (data.events && Array.isArray(data.events)) {
        console.log('[Events] ✅ Setting events to state, count:', data.events.length);
        console.log('[Events] ✅ First event sample:', data.events[0]);
        console.log('[Events] ✅ Full events array:', JSON.stringify(data.events, null, 2));
        setEvents(data.events);
        setEventsError(null);
        console.log('[Events] ✅ Successfully set events:', data.events.length);
        // Проверяем, что события действительно установлены
      } else {
        console.warn('[Events] ⚠️ No events array in response');
        console.warn('[Events] ⚠️ Data structure:', data);
        console.warn('[Events] ⚠️ Setting empty array');
        setEvents([]);
        setEventsError(null);
      }
    } catch (err) {
      console.error('[Events] ❌ Error loading calendar events:', err);
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка при загрузке событий';
      setEventsError(errorMessage);
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, [token]);


  useEffect(() => {
    const authToken = token || localStorage.getItem('token');
    console.log('[Events] useEffect triggered, authToken:', authToken ? 'present' : 'missing');
    fetchUpcomingBirthdays();
    // Загружаем календарь вместе с днями рождения
    if (authToken) {
      console.log('[Events] 🔥 Calling loadCalendarEvents from useEffect');
      loadCalendarEvents().catch(err => {
        console.error('[Events] ❌ Error in loadCalendarEvents:', err);
      });
    } else {
      console.warn('[Events] ⚠️ No authToken, skipping loadCalendarEvents');
    }
  }, [fetchUpcomingBirthdays, token, loadCalendarEvents]);

  useEffect(() => {
    setHeader({
      title: 'События'
    });
    
    return () => {
      setHeader({});
    };
  }, [setHeader]);

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

    // Объединяем дни рождения и события календаря в один список
    const getAllEvents = useCallback(() => {
      console.log('[Events] 🔄 getAllEvents called:', {
        usersDataCount: usersData.length,
        eventsCount: events.length
      });
      
      const today = dayjs().startOf('day');
      console.log('[Events] 📅 Today:', today.format('YYYY-MM-DD HH:mm:ss'));
      
      const allEvents: Array<{
        type: 'birthday' | 'calendar';
        date: Date;
        daysUntil: number; // Количество дней до события
        data: any;
      }> = [];

      // Добавляем дни рождения
      usersData.forEach((userData, index) => {
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
        
        console.log(`[Events] 🎂 Birthday ${index}: ${userData.fio}, daysUntil: ${daysUntil}, date: ${nextBirthday.format('YYYY-MM-DD')}`);
        
        allEvents.push({
          type: 'birthday',
          date: nextBirthday.startOf('day').toDate(),
          daysUntil: daysUntil,
          data: userData
        });
      });

      // Добавляем события календаря
      console.log('[Events] 🔄 Processing calendar events, count:', events.length);
      events.forEach((event, index) => {
        console.log(`[Events] 🔄 Processing event ${index}:`, event);
        const startDate = typeof event.start === 'object' && event.start?.dateTime 
          ? event.start.dateTime 
          : typeof event.start === 'string' 
            ? event.start 
            : null;
        
        console.log(`[Events] 🔄 Event ${index} startDate:`, startDate);
        
        if (startDate) {
          // Парсим дату события
          // dayjs автоматически конвертирует UTC (с Z) в локальное время браузера
          const parsedDate = dayjs(startDate);
          
          // Используем только дату (без времени) для всех событий
          // Это гарантирует корректное сравнение независимо от часового пояса
          const eventDate = parsedDate.startOf('day');
          
          // Вычисляем разницу в днях между датой события и сегодняшней датой
          // Оба в локальном времени, начало дня
          const daysUntil = eventDate.diff(today, 'day');
          
          console.log(`[Events] 📅 Calendar event ${index}: ${event.subject}, daysUntil: ${daysUntil}, date: ${eventDate.format('YYYY-MM-DD HH:mm:ss Z')}, original: ${startDate}, parsed: ${parsedDate.format('YYYY-MM-DD HH:mm:ss Z')}, today: ${today.format('YYYY-MM-DD HH:mm:ss Z')}`);
          
          allEvents.push({
            type: 'calendar',
            date: eventDate.toDate(),
            daysUntil: daysUntil,
            data: event
          });
        } else {
          console.warn(`[Events] ⚠️ Event ${index} has no valid startDate:`, event);
        }
      });

      console.log('[Events] 🔄 Total allEvents count:', allEvents.length);
      console.log('[Events] 🔄 Birthday events:', allEvents.filter(e => e.type === 'birthday').length);
      console.log('[Events] 🔄 Calendar events:', allEvents.filter(e => e.type === 'calendar').length);

      // Сортируем по количеству дней до события (daysUntil)
      // Сначала события, которые происходят раньше (меньше daysUntil)
      const sorted = allEvents.sort((a, b) => {
        // Сначала сортируем по daysUntil
        // События с daysUntil >= 1000 (прошедшие дни рождения в выходные) идут в конец
        if (a.daysUntil !== b.daysUntil) {
          return a.daysUntil - b.daysUntil;
        }
        // Если daysUntil одинаковый, сортируем по типу (сначала дни рождения, потом события календаря)
        if (a.type !== b.type) {
          return a.type === 'birthday' ? -1 : 1;
        }
        // Если тип тоже одинаковый, сортируем по дате
        return a.date.getTime() - b.date.getTime();
      });
      
      console.log('[Events] 🔄 Sorted events:', sorted.map(e => ({
        type: e.type,
        daysUntil: e.daysUntil,
        date: e.date.toISOString(),
        subject: e.type === 'calendar' ? e.data.subject : e.data.fio
      })));
      
      return sorted;
    }, [usersData, events]);

  const allEvents = getAllEvents();
  
  // Логируем состояние для отладки
  useEffect(() => {
    console.log('[Events] 📊 Current state:', {
      usersDataCount: usersData.length,
      eventsCount: events.length,
      allEventsCount: allEvents.length,
      loading,
      loadingEvents,
      eventsError
    });
    if (events.length > 0) {
      console.log('[Events] 📊 First calendar event:', events[0]);
    }
    if (allEvents.length > 0) {
      console.log('[Events] 📊 All events sample:', allEvents.slice(0, 3));
    }
  }, [usersData, events, allEvents, loading, loadingEvents, eventsError]);

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

      {/* Объединенный список событий */}
      <Box>
        {eventsError && (
          <Alert icon={<IconAlertCircle size={16} />} title="Ошибка загрузки событий" color="red" mb="md">
            {eventsError}
            <Text size="xs" mt="xs" c="dimmed">
              Проверьте консоль браузера (F12) для деталей ошибки
            </Text>
          </Alert>
        )}

        {(loading || loadingEvents) ? (
          <LoadingOverlay visible={loading || loadingEvents} />
        ) : allEvents.length === 0 && !eventsError ? (
          <Alert icon={<IconCalendar size={16} />} title="Нет событий" color="blue">
            Нет предстоящих дней рождения и событий календаря.
          </Alert>
        ) : allEvents.length > 0 ? (
          <ScrollArea.Autosize mah={600}>
            <Stack gap="md">
              {allEvents.map((item, index) => {
                if (item.type === 'birthday') {
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
                } else {
                  const event = item.data as CalendarEvent;
                  // Используем daysUntil из уже отсортированного события (вычислено в getAllEvents)
                  // Это гарантирует правильное значение, так как там используется startOf('day')
                  const daysUntil = item.daysUntil;
                  const isToday = daysUntil === 0;
                  const isTomorrow = daysUntil === 1;
                  
                  return (
                    <Card
                      key={event.id || `event-${index}`}
                      shadow="sm"
                      radius="md"
                      padding="md"
                      style={{ position: 'relative' }}
                    >
                      <Group justify="space-between" align="flex-start">
                        <Group gap="sm" style={{ flex: 1 }}>
                          <Avatar
                            size="md"
                            radius="md"
                            color="blue"
                            style={{
                              backgroundColor: 'var(--mantine-color-blue-0)',
                              color: 'var(--mantine-color-blue-6)',
                            }}
                          >
                            <IconCalendar size={20} />
                          </Avatar>
                          <Box style={{ flex: 1 }}>
                            <Text size="sm" fw={600} mb={4}>
                              {event.subject}
                            </Text>
                            <Group gap="xs">
                              <Badge
                                size="sm"
                                color={isToday ? 'red' : isTomorrow ? 'orange' : 'blue'}
                                variant={isToday ? 'filled' : 'light'}
                                leftSection={
                                  isToday ? <IconGift size={12} /> :
                                    isTomorrow ? <IconClock size={12} /> :
                                      <IconCalendar size={12} />
                                }
                              >
                                {isToday ? 'Сегодня!' : 
                                  isTomorrow ? 'Завтра' : 
                                    daysUntil !== undefined && daysUntil > 1 ? `Через ${daysUntil} дн.` : 
                                    daysUntil === 1 ? 'Завтра' : 'Скоро'}
                              </Badge>
                            </Group>
                            {event.location && (
                              <Text size="xs" c="dimmed" mt={4}>
                                📍 {typeof event.location === 'string' 
                                  ? event.location 
                                  : (event.location as any)?.displayName || ''}
                              </Text>
                            )}
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
                }
              })}
            </Stack>
          </ScrollArea.Autosize>
        ) : null}
      </Box>
    </Box>
  );
}

