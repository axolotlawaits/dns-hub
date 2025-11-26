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
    </Stack>
  );
}

export default MerchStats;

