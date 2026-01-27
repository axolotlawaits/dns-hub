import { useState, useEffect } from 'react';
import {
  Paper,
  Title,
  Group,
  Badge,
  Stack,
  Box,
  LoadingOverlay,
  Alert,
  Text,
  Card,
  SimpleGrid,
} from '@mantine/core';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import useAuthFetch from '../../../hooks/useAuthFetch';
import { API } from '../../../config/constants';

interface AccessAnalytics {
  accessLevelDistribution: Array<{
    level: string;
    count: number;
  }>;
  topUsers: Array<{
    userId: string;
    userName: string;
    userEmail: string;
    userRole: string;
    accessCount: number;
  }>;
  topTools: Array<{
    toolId: string;
    toolName: string;
    toolLink: string;
    userCount: number;
  }>;
  entityDistribution: {
    user: number;
    group: number;
    position: number;
    total: number;
  };
  temporaryAccesses: {
    total: number;
    active: number;
    expired: number;
  };
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

const ACCESS_LEVEL_LABELS: Record<string, string> = {
  READONLY: 'Чтение',
  CONTRIBUTOR: 'Без удаления',
  FULL: 'Полный',
};

export default function AccessDashboard() {
  const [data, setData] = useState<AccessAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authFetch = useAuthFetch();

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await authFetch(`${API}/access/analytics`);
      if (response && response.ok) {
        const analyticsData = await response.json();
        setData(analyticsData);
      } else {
        setError('Ошибка загрузки аналитики');
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError('Ошибка загрузки аналитики');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Paper p="xl" style={{ position: 'relative', minHeight: 400 }}>
        <LoadingOverlay visible />
      </Paper>
    );
  }

  if (error) {
    return (
      <Alert color="red" title="Ошибка">
        {error}
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert color="blue" title="Нет данных">
        Аналитика недоступна
      </Alert>
    );
  }

  const pieData = data.entityDistribution
    ? [
        { name: 'Пользователи', value: data.entityDistribution.user },
        { name: 'Группы', value: data.entityDistribution.group },
        { name: 'Должности', value: data.entityDistribution.position },
      ].filter(item => item.value > 0)
    : [];

  return (
    <Stack gap="md">
      <Paper p="md" withBorder>
        <Title order={3} mb="md">Статистика доступа</Title>
      </Paper>

      {/* Общая статистика */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
        <Card shadow="sm" padding="md" radius="md" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Всего доступов
          </Text>
          <Text fw={700} size="xl">
            {data.entityDistribution.total}
          </Text>
        </Card>
        <Card shadow="sm" padding="md" radius="md" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Временные доступы
          </Text>
          <Text fw={700} size="xl">
            {data.temporaryAccesses.total}
          </Text>
          <Text size="xs" c="dimmed" mt="xs">
            Активных: {data.temporaryAccesses.active}
          </Text>
        </Card>
        <Card shadow="sm" padding="md" radius="md" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Пользователей
          </Text>
          <Text fw={700} size="xl">
            {data.entityDistribution.user}
          </Text>
        </Card>
        <Card shadow="sm" padding="md" radius="md" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Групп и должностей
          </Text>
          <Text fw={700} size="xl">
            {data.entityDistribution.group + data.entityDistribution.position}
          </Text>
        </Card>
      </SimpleGrid>

      {/* График распределения по уровням доступа */}
      <Paper p="md" withBorder>
        <Title order={4} mb="md">Распределение по уровням доступа</Title>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.accessLevelDistribution.map(item => ({
            level: ACCESS_LEVEL_LABELS[item.level] || item.level,
            count: item.count
          }))}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="level" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="count" fill="#228be6" />
          </BarChart>
        </ResponsiveContainer>
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {/* Распределение по типам сущностей */}
        <Paper p="md" withBorder>
          <Title order={4} mb="md">Распределение по типам сущностей</Title>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <Text c="dimmed" ta="center" py="xl">
              Нет данных
            </Text>
          )}
        </Paper>

        {/* Топ пользователей */}
        <Paper p="md" withBorder>
          <Title order={4} mb="md">Топ-10 пользователей по количеству доступов</Title>
          <Stack gap="xs">
            {data.topUsers.length > 0 ? (
              data.topUsers.map((user, idx) => (
                <Group key={user.userId} justify="space-between" p="xs" style={{ borderRadius: 4, backgroundColor: 'var(--mantine-color-gray-0)' }}>
                  <Group gap="xs">
                    <Badge size="sm" variant="light">{idx + 1}</Badge>
                    <Box>
                      <Text size="sm" fw={500}>{user.userName}</Text>
                      <Text size="xs" c="dimmed">{user.userEmail}</Text>
                    </Box>
                  </Group>
                  <Badge color="blue">{user.accessCount}</Badge>
                </Group>
              ))
            ) : (
              <Text c="dimmed" ta="center" py="xl">
                Нет данных
              </Text>
            )}
          </Stack>
        </Paper>
      </SimpleGrid>

      {/* Топ инструментов */}
      <Paper p="md" withBorder>
        <Title order={4} mb="md">Топ-10 инструментов по количеству пользователей</Title>
        <Stack gap="xs">
          {data.topTools.length > 0 ? (
            data.topTools.map((tool, idx) => (
              <Group key={tool.toolId} justify="space-between" p="xs" style={{ borderRadius: 4, backgroundColor: 'var(--mantine-color-gray-0)' }}>
                <Group gap="xs">
                  <Badge size="sm" variant="light">{idx + 1}</Badge>
                  <Text size="sm" fw={500}>{tool.toolName}</Text>
                </Group>
                <Badge color="green">{tool.userCount} пользователей</Badge>
              </Group>
            ))
          ) : (
            <Text c="dimmed" ta="center" py="xl">
              Нет данных
            </Text>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
