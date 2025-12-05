import { useState, useEffect } from 'react';
import {
  Card,
  Title,
  Text,
  Group,
  Stack,
  Grid,
  Select,
  Tabs,
  Progress,
  Badge,
  Table,
  Paper,
  Box,
  LoadingOverlay
} from '@mantine/core';
import {
  IconUsers,
  IconBell,
  IconMessageCircle,
  IconBug,
  IconTrendingUp,
  IconBuilding,
  IconActivity
} from '@tabler/icons-react';
import useAuthFetch from '../../../hooks/useAuthFetch';
import { API } from '../../../config/constants';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface AnalyticsData {
  period: string;
  startDate: string;
  users: {
    total: number;
    active: number;
    byRole: Array<{ role: string; count: number }>;
  };
  notifications: {
    total: number;
    unread: number;
    byType: Array<{ type: string; count: number }>;
  };
  feedback: {
    total: number;
    byStatus: Array<{ status: string; count: number }>;
  };
  bugReports: {
    total: number;
    resolved: number;
    unresolved: number;
    bySeverity: Array<{ severity: string; count: number }>;
  };
  activity: {
    daily: Record<string, number>;
  };
  popularTools: Array<{
    toolId: string;
    toolName: string;
    toolLink: string;
    accessCount: number;
  }>;
  branches: {
    total: number;
    topByUsers: Array<{
      branchId: string;
      branchName: string;
      city: string;
      userCount: number;
    }>;
  };
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string>('7d');
  const authFetch = useAuthFetch();

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const response = await authFetch(`${API}/admin/analytics?period=${period}`);
      if (response && response.ok) {
        const analyticsData = await response.json();
        setData(analyticsData);
      }
    } catch (error) {
      console.error('Ошибка при загрузке аналитики:', error);
    } finally {
      setLoading(false);
    }
  };

  // Преобразуем данные активности для графика
  const activityChartData = data?.activity.daily
    ? Object.entries(data.activity.daily)
        .map(([date, count]) => ({
          date: new Date(date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
          count
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  if (loading) {
    return (
      <Box pos="relative" style={{ minHeight: 400 }}>
        <LoadingOverlay visible={loading} />
      </Box>
    );
  }

  if (!data) {
    return (
      <Paper p="xl" radius="md">
        <Text c="dimmed">Не удалось загрузить данные аналитики</Text>
      </Paper>
    );
  }

  return (
    <Stack gap="lg">
      {/* Заголовок и выбор периода */}
      <Group justify="space-between" align="center">
        <Title order={2}>Аналитика и статистика</Title>
        <Select
          value={period}
          onChange={(value) => value && setPeriod(value)}
          data={[
            { value: '7d', label: 'Последние 7 дней' },
            { value: '30d', label: 'Последние 30 дней' },
            { value: '90d', label: 'Последние 90 дней' },
            { value: '1y', label: 'Последний год' },
            { value: 'all', label: 'Все время' }
          ]}
          style={{ width: 200 }}
        />
      </Group>

      {/* Основные метрики */}
      <Grid>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Пользователи
                </Text>
                <Text fw={700} size="xl">
                  {data.users.total}
                </Text>
                <Text size="xs" c="dimmed">
                  Активных: {data.users.active}
                </Text>
              </div>
              <IconUsers size={40} style={{ color: 'var(--mantine-color-blue-6)' }} />
            </Group>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Уведомления
                </Text>
                <Text fw={700} size="xl">
                  {data.notifications.total}
                </Text>
                <Text size="xs" c="dimmed">
                  Непрочитанных: {data.notifications.unread}
                </Text>
              </div>
              <IconBell size={40} style={{ color: 'var(--mantine-color-yellow-6)' }} />
            </Group>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Обратная связь
                </Text>
                <Text fw={700} size="xl">
                  {data.feedback.total}
                </Text>
                <Text size="xs" c="dimmed">
                  За период
                </Text>
              </div>
              <IconMessageCircle size={40} style={{ color: 'var(--mantine-color-green-6)' }} />
            </Group>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Ошибки
                </Text>
                <Text fw={700} size="xl">
                  {data.bugReports.total}
                </Text>
                <Text size="xs" c="dimmed">
                  Решено: {data.bugReports.resolved}
                </Text>
              </div>
              <IconBug size={40} style={{ color: 'var(--mantine-color-red-6)' }} />
            </Group>
          </Card>
        </Grid.Col>
      </Grid>

      {/* Графики и детали */}
      <Tabs defaultValue="activity">
        <Tabs.List>
          <Tabs.Tab value="activity" leftSection={<IconActivity size={16} />}>
            Активность
          </Tabs.Tab>
          <Tabs.Tab value="users" leftSection={<IconUsers size={16} />}>
            Пользователи
          </Tabs.Tab>
          <Tabs.Tab value="tools" leftSection={<IconTrendingUp size={16} />}>
            Инструменты
          </Tabs.Tab>
          <Tabs.Tab value="branches" leftSection={<IconBuilding size={16} />}>
            Филиалы
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="activity" pt="md">
          <Grid>
            <Grid.Col span={{ base: 12, md: 8 }}>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={4} mb="md">
                  Активность пользователей
                </Title>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={activityChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="count" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 4 }}>
              <Stack gap="md">
                <Card shadow="sm" padding="lg" radius="md" withBorder>
                  <Title order={5} mb="md">
                    Уведомления по типам
                  </Title>
                  {data.notifications.byType.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={data.notifications.byType}
                          dataKey="count"
                          nameKey="type"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label
                        >
                          {data.notifications.byType.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <Text c="dimmed" size="sm">Нет данных</Text>
                  )}
                </Card>

                <Card shadow="sm" padding="lg" radius="md" withBorder>
                  <Title order={5} mb="md">
                    Ошибки по серьезности
                  </Title>
                  {data.bugReports.bySeverity.length > 0 ? (
                    <Stack gap="xs">
                      {data.bugReports.bySeverity.map((item) => (
                        <div key={item.severity}>
                          <Group justify="space-between" mb={4}>
                            <Text size="sm">{item.severity}</Text>
                            <Badge>{item.count}</Badge>
                          </Group>
                          <Progress
                            value={(item.count / data.bugReports.total) * 100}
                            color={
                              item.severity === 'CRITICAL'
                                ? 'red'
                                : item.severity === 'HIGH'
                                ? 'orange'
                                : item.severity === 'MEDIUM'
                                ? 'yellow'
                                : 'blue'
                            }
                          />
                        </div>
                      ))}
                    </Stack>
                  ) : (
                    <Text c="dimmed" size="sm">Нет данных</Text>
                  )}
                </Card>
              </Stack>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="users" pt="md">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Title order={4} mb="md">
              Распределение пользователей по ролям
            </Title>
            {data.users.byRole.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.users.byRole}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="role" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Text c="dimmed">Нет данных</Text>
            )}
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="tools" pt="md">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Title order={4} mb="md">
              Популярные инструменты
            </Title>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Инструмент</Table.Th>
                  <Table.Th>Ссылка</Table.Th>
                  <Table.Th>Количество доступов</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.popularTools.map((tool) => (
                  <Table.Tr key={tool.toolId}>
                    <Table.Td>{tool.toolName}</Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {tool.toolLink}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge>{tool.accessCount}</Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="branches" pt="md">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Title order={4} mb="md">
              Топ филиалов по количеству пользователей
            </Title>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Филиал</Table.Th>
                  <Table.Th>Город</Table.Th>
                  <Table.Th>Пользователей</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.branches.topByUsers.map((branch) => (
                  <Table.Tr key={branch.branchId}>
                    <Table.Td>{branch.branchName}</Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {branch.city}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge>{branch.userCount}</Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

