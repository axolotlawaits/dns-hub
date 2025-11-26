import { useState, useEffect } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  SimpleGrid,
  Select,
  Loader,
  Table,
  Badge,
  ScrollArea,
  Box,
  Card,
  Title,
  Divider
} from '@mantine/core';
import { fetchMerchStats, MerchStatsResponse } from '../../data/MerchStatsData';
import './MerchStats.css';

function MerchStats() {
  const [stats, setStats] = useState<MerchStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>('30');

  useEffect(() => {
    loadStats();
  }, [period]);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMerchStats(parseInt(period, 10));
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Loader size="lg" />
      </Box>
    );
  }

  if (error) {
    return (
      <Paper p="xl" withBorder>
        <Text c="red" size="lg" fw={600}>
          Ошибка загрузки статистики: {error}
        </Text>
      </Paper>
    );
  }

  if (!stats) {
    return null;
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatHour = (hour: number) => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      'start': 'Запуск бота',
      'button_click': 'Нажатие кнопки',
      'search': 'Поиск',
      'feedback': 'Обратная связь'
    };
    return labels[action] || action;
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>Статистика бота</Title>
        <Select
          label="Период"
          value={period}
          onChange={(value) => value && setPeriod(value)}
          data={[
            { value: '7', label: '7 дней' },
            { value: '30', label: '30 дней' },
            { value: '90', label: '90 дней' },
            { value: '180', label: '180 дней' },
            { value: '365', label: '1 год' }
          ]}
          style={{ width: 150 }}
        />
      </Group>

      {/* Сводная статистика */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
        <Card withBorder p="md" radius="md">
          <Text size="sm" c="dimmed" mb={4}>
            Всего пользователей
          </Text>
          <Text size="xl" fw={700}>
            {stats.summary.totalUsers}
          </Text>
        </Card>
        <Card withBorder p="md" radius="md">
          <Text size="sm" c="dimmed" mb={4}>
            Активных за период
          </Text>
          <Text size="xl" fw={700}>
            {stats.summary.activeUsers}
          </Text>
        </Card>
        <Card withBorder p="md" radius="md">
          <Text size="sm" c="dimmed" mb={4}>
            Активных сегодня
          </Text>
          <Text size="xl" fw={700} c="green">
            {stats.summary.activeUsersToday}
          </Text>
        </Card>
        <Card withBorder p="md" radius="md">
          <Text size="sm" c="dimmed" mb={4}>
            Всего действий
          </Text>
          <Text size="xl" fw={700}>
            {stats.summary.totalActions}
          </Text>
        </Card>
        <Card withBorder p="md" radius="md">
          <Text size="sm" c="dimmed" mb={4}>
            Новых пользователей
          </Text>
          <Text size="xl" fw={700} c="blue">
            {stats.summary.newUsers}
          </Text>
        </Card>
        <Card withBorder p="md" radius="md">
          <Text size="sm" c="dimmed" mb={4}>
            Запросов обратной связи
          </Text>
          <Text size="xl" fw={700} c="orange">
            {stats.summary.feedbackRequests}
          </Text>
        </Card>
        <Card withBorder p="md" radius="md">
          <Text size="sm" c="dimmed" mb={4}>
            Активных за неделю
          </Text>
          <Text size="xl" fw={700}>
            {stats.summary.activeUsersWeek}
          </Text>
        </Card>
        <Card withBorder p="md" radius="md">
          <Text size="sm" c="dimmed" mb={4}>
            Активных за месяц
          </Text>
          <Text size="xl" fw={700}>
            {stats.summary.activeUsersMonth}
          </Text>
        </Card>
        {stats.summary.avgActionsPerUser !== undefined && (
          <Card withBorder p="md" radius="md">
            <Text size="sm" c="dimmed" mb={4}>
              Среднее действий на пользователя
            </Text>
            <Text size="xl" fw={700} c="violet">
              {stats.summary.avgActionsPerUser}
            </Text>
          </Card>
        )}
        {stats.summary.returningUsers !== undefined && (
          <Card withBorder p="md" radius="md">
            <Text size="sm" c="dimmed" mb={4}>
              Вернувшихся пользователей
            </Text>
            <Text size="xl" fw={700} c="cyan">
              {stats.summary.returningUsers}
            </Text>
          </Card>
        )}
        {stats.summary.totalSessions !== undefined && (
          <Card withBorder p="md" radius="md">
            <Text size="sm" c="dimmed" mb={4}>
              Всего сессий
            </Text>
            <Text size="xl" fw={700} c="grape">
              {stats.summary.totalSessions}
            </Text>
          </Card>
        )}
        {stats.summary.avgSessionDuration !== undefined && (
          <Card withBorder p="md" radius="md">
            <Text size="sm" c="dimmed" mb={4}>
              Средняя длительность сессии (мин)
            </Text>
            <Text size="xl" fw={700} c="indigo">
              {stats.summary.avgSessionDuration}
            </Text>
          </Card>
        )}
        {stats.summary.avgActionsPerSession !== undefined && (
          <Card withBorder p="md" radius="md">
            <Text size="sm" c="dimmed" mb={4}>
              Среднее действий в сессии
            </Text>
            <Text size="xl" fw={700} c="pink">
              {stats.summary.avgActionsPerSession}
            </Text>
          </Card>
        )}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {/* Статистика по действиям */}
        <Paper withBorder p="md" radius="md">
          <Title order={3} mb="md">Статистика по действиям</Title>
          <ScrollArea h={300}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Действие</Table.Th>
                  <Table.Th>Количество</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {stats.actions.map((action) => (
                  <Table.Tr key={action.action}>
                    <Table.Td>{getActionLabel(action.action)}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" size="lg">
                        {action.count}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>

        {/* Популярные кнопки */}
        <Paper withBorder p="md" radius="md">
          <Title order={3} mb="md">Популярные кнопки</Title>
          <ScrollArea h={300}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Кнопка</Table.Th>
                  <Table.Th>Нажатий</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {stats.popularButtons.slice(0, 15).map((button, index) => (
                  <Table.Tr key={button.name}>
                    <Table.Td>
                      <Group gap="xs">
                        <Badge variant="dot" color={index < 3 ? 'green' : 'gray'}>
                          {index + 1}
                        </Badge>
                        <Text size="sm">{button.name}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" size="lg">
                        {button.count}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {/* Популярные поисковые запросы */}
        <Paper withBorder p="md" radius="md">
          <Title order={3} mb="md">Популярные поисковые запросы</Title>
          <ScrollArea h={300}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Запрос</Table.Th>
                  <Table.Th>Количество</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {stats.popularSearches.length > 0 ? (
                  stats.popularSearches.map((search, index) => (
                    <Table.Tr key={search.query}>
                      <Table.Td>
                        <Group gap="xs">
                          <Badge variant="dot" color={index < 3 ? 'blue' : 'gray'}>
                            {index + 1}
                          </Badge>
                          <Text size="sm">{search.query}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" size="lg">
                          {search.count}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))
                ) : (
                  <Table.Tr>
                    <Table.Td colSpan={2}>
                      <Text c="dimmed" size="sm" ta="center">
                        Нет данных о поисковых запросах
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>

        {/* Популярные категории */}
        <Paper withBorder p="md" radius="md">
          <Title order={3} mb="md">Популярные категории</Title>
          <ScrollArea h={300}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Категория</Table.Th>
                  <Table.Th>Переходов</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {stats.categoryClicks.length > 0 ? (
                  stats.categoryClicks.map((category, index) => (
                    <Table.Tr key={category.name}>
                      <Table.Td>
                        <Group gap="xs">
                          <Badge variant="dot" color={index < 3 ? 'violet' : 'gray'}>
                            {index + 1}
                          </Badge>
                          <Text size="sm">{category.name}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" size="lg">
                          {category.count}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))
                ) : (
                  <Table.Tr>
                    <Table.Td colSpan={2}>
                      <Text c="dimmed" size="sm" ta="center">
                        Нет данных о категориях
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      </SimpleGrid>

      {/* Статистика по дням */}
      <Paper withBorder p="md" radius="md">
        <Title order={3} mb="md">Статистика по дням</Title>
        <ScrollArea h={400}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Дата</Table.Th>
                <Table.Th>Действий</Table.Th>
                <Table.Th>Уникальных пользователей</Table.Th>
                <Table.Th>Детали</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {stats.dailyStats.map((day) => (
                <Table.Tr key={day.date}>
                  <Table.Td>
                    <Text fw={500}>{formatDate(day.date)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" size="lg">
                      {day.totalActions}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color="blue" size="lg">
                      {day.uniqueUsers}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      {Object.entries(day.actions).map(([action, count]) => (
                        <Badge key={action} variant="dot" size="sm">
                          {getActionLabel(action)}: {count}
                        </Badge>
                      ))}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      {/* Статистика по часам */}
      <Paper withBorder p="md" radius="md">
        <Title order={3} mb="md">Активность по часам</Title>
        <ScrollArea h={300}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Час</Table.Th>
                <Table.Th>Количество действий</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {stats.hourlyStats.map((hour) => (
                <Table.Tr key={hour.hour}>
                  <Table.Td>
                    <Text fw={500}>{formatHour(hour.hour)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" size="lg">
                      {hour.count}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      {/* Топ активных пользователей */}
      <Paper withBorder p="md" radius="md">
        <Title order={3} mb="md">Топ активных пользователей</Title>
        <ScrollArea h={400}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>#</Table.Th>
                <Table.Th>Пользователь</Table.Th>
                <Table.Th>Username</Table.Th>
                <Table.Th>Действий</Table.Th>
                <Table.Th>Регистрация</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {stats.topUsers.map((user, index) => (
                <Table.Tr key={user.userId}>
                  <Table.Td>
                    <Badge variant="dot" color={index < 3 ? 'gold' : 'gray'}>
                      {index + 1}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {user.firstName || ''} {user.lastName || ''}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      @{user.username || 'нет'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" size="lg">
                      {user.actionsCount}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {user.registeredAt
                        ? new Date(user.registeredAt).toLocaleDateString('ru-RU')
                        : '-'}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      {/* Статистика по дням недели */}
      {stats.weekdayStats && stats.weekdayStats.length > 0 && (
        <Paper withBorder p="md" radius="md">
          <Title order={3} mb="md">Активность по дням недели</Title>
          <ScrollArea h={300}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>День недели</Table.Th>
                  <Table.Th>Количество действий</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {stats.weekdayStats.map((day) => (
                  <Table.Tr key={day.day}>
                    <Table.Td>
                      <Text fw={500}>{day.dayName}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" size="lg">
                        {day.count}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      )}

      {/* Статистика по времени суток */}
      {stats.timeOfDayStats && (
        <Paper withBorder p="md" radius="md">
          <Title order={3} mb="md">Активность по времени суток</Title>
          <SimpleGrid cols={4} spacing="md">
            <Card withBorder p="md" radius="md">
              <Text size="sm" c="dimmed" mb={4}>
                Утро (6-12)
              </Text>
              <Text size="xl" fw={700} c="yellow">
                {stats.timeOfDayStats.morning}
              </Text>
            </Card>
            <Card withBorder p="md" radius="md">
              <Text size="sm" c="dimmed" mb={4}>
                День (12-18)
              </Text>
              <Text size="xl" fw={700} c="orange">
                {stats.timeOfDayStats.afternoon}
              </Text>
            </Card>
            <Card withBorder p="md" radius="md">
              <Text size="sm" c="dimmed" mb={4}>
                Вечер (18-24)
              </Text>
              <Text size="xl" fw={700} c="red">
                {stats.timeOfDayStats.evening}
              </Text>
            </Card>
            <Card withBorder p="md" radius="md">
              <Text size="sm" c="dimmed" mb={4}>
                Ночь (0-6)
              </Text>
              <Text size="xl" fw={700} c="blue">
                {stats.timeOfDayStats.night}
              </Text>
            </Card>
          </SimpleGrid>
        </Paper>
      )}

      {/* Статистика по длине поисковых запросов */}
      {stats.searchLengthStats && (
        <Paper withBorder p="md" radius="md">
          <Title order={3} mb="md">Длина поисковых запросов</Title>
          <SimpleGrid cols={3} spacing="md">
            <Card withBorder p="md" radius="md">
              <Text size="sm" c="dimmed" mb={4}>
                Короткие (1-5 символов)
              </Text>
              <Text size="xl" fw={700}>
                {stats.searchLengthStats.short}
              </Text>
            </Card>
            <Card withBorder p="md" radius="md">
              <Text size="sm" c="dimmed" mb={4}>
                Средние (6-15 символов)
              </Text>
              <Text size="xl" fw={700}>
                {stats.searchLengthStats.medium}
              </Text>
            </Card>
            <Card withBorder p="md" radius="md">
              <Text size="sm" c="dimmed" mb={4}>
                Длинные (16+ символов)
              </Text>
              <Text size="xl" fw={700}>
                {stats.searchLengthStats.long}
              </Text>
            </Card>
          </SimpleGrid>
        </Paper>
      )}

      {/* Воронка действий */}
      {stats.funnelStats && (
        <Paper withBorder p="md" radius="md">
          <Title order={3} mb="md">Воронка действий</Title>
          <Stack gap="md">
            <Group justify="space-between">
              <Text>Запустили бота</Text>
              <Badge size="lg" variant="light">
                {stats.funnelStats.started}
              </Badge>
            </Group>
            <Group justify="space-between">
              <Text>Нажали кнопку</Text>
              <Badge size="lg" variant="light" color="blue">
                {stats.funnelStats.clickedButton}
                {stats.funnelStats.started > 0 && (
                  <Text size="xs" c="dimmed" ml="xs" component="span">
                    ({Math.round((stats.funnelStats.clickedButton / stats.funnelStats.started) * 100)}%)
                  </Text>
                )}
              </Badge>
            </Group>
            <Group justify="space-between">
              <Text>Использовали поиск</Text>
              <Badge size="lg" variant="light" color="green">
                {stats.funnelStats.searched}
                {stats.funnelStats.started > 0 && (
                  <Text size="xs" c="dimmed" ml="xs" component="span">
                    ({Math.round((stats.funnelStats.searched / stats.funnelStats.started) * 100)}%)
                  </Text>
                )}
              </Badge>
            </Group>
            <Group justify="space-between">
              <Text>Оставили обратную связь</Text>
              <Badge size="lg" variant="light" color="orange">
                {stats.funnelStats.gaveFeedback}
                {stats.funnelStats.started > 0 && (
                  <Text size="xs" c="dimmed" ml="xs" component="span">
                    ({Math.round((stats.funnelStats.gaveFeedback / stats.funnelStats.started) * 100)}%)
                  </Text>
                )}
              </Badge>
            </Group>
          </Stack>
        </Paper>
      )}

      {/* Статистика по retention */}
      {stats.retentionStats && (
        <Paper withBorder p="md" radius="md">
          <Title order={3} mb="md">Retention (возвраты пользователей)</Title>
          <SimpleGrid cols={3} spacing="md">
            <Card withBorder p="md" radius="md">
              <Text size="sm" c="dimmed" mb={4}>
                Вернулись через 1 день
              </Text>
              <Text size="xl" fw={700} c="green">
                {stats.retentionStats.day1}
              </Text>
            </Card>
            <Card withBorder p="md" radius="md">
              <Text size="sm" c="dimmed" mb={4}>
                Вернулись через 7 дней
              </Text>
              <Text size="xl" fw={700} c="blue">
                {stats.retentionStats.day7}
              </Text>
            </Card>
            <Card withBorder p="md" radius="md">
              <Text size="sm" c="dimmed" mb={4}>
                Вернулись через 30 дней
              </Text>
              <Text size="xl" fw={700} c="violet">
                {stats.retentionStats.day30}
              </Text>
            </Card>
          </SimpleGrid>
        </Paper>
      )}

      {/* Популярные карточки */}
      {stats.popularCards && stats.popularCards.length > 0 && (
        <Paper withBorder p="md" radius="md">
          <Title order={3} mb="md">Популярные карточки</Title>
          <ScrollArea h={300}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Карточка</Table.Th>
                  <Table.Th>Просмотров</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {stats.popularCards.map((card, index) => (
                  <Table.Tr key={card.name}>
                    <Table.Td>
                      <Group gap="xs">
                        <Badge variant="dot" color={index < 3 ? 'violet' : 'gray'}>
                          {index + 1}
                        </Badge>
                        <Text size="sm">{card.name}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" size="lg">
                        {card.count}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      )}
    </Stack>
  );
}

export default MerchStats;

