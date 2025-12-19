import { useState, useEffect } from 'react';
import useAuthFetch from '../../../hooks/useAuthFetch';
import {
  Container, Paper, Text, Button, Group,
  LoadingOverlay, Tabs, Table, Card, SimpleGrid,
  SegmentedControl, Select, Progress, Stack, Title, Modal, Badge
} from '@mantine/core';
import {
  IconDoor, IconChartBar, IconLockOpen, IconRefresh, IconClock, IconUsers
} from '@tabler/icons-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line
} from 'recharts';
import { notificationSystem } from '../../../utils/Push';
import { API } from '../../../config/constants';
import './Trassir.css';

interface Door {
  id: number;
  name: string;
}

interface DoorLog {
  id: string;
  doorId: number;
  doorName: string | null;
  personName: string | null;
  tgId: number | null;
  openedAt: string;
}

interface AggregatedStats {
  total: number;
  topDoors: { name: string; count: number }[];
  topUsers: { name: string; count: number }[];
  hourlyData: { hour: number; count: number }[];
  dailyData: { date: string; count: number }[];
}

interface AccessPoint {
  id: number;
  name: string;
  originalName?: string; // Оригинальное имя для проверки статуса
  device_id?: number;
  type?: string;
}

interface ConnectedUser {
  id: string;
  name: string;
  email: string;
  telegramUsername: string | null;
  role: string;
  position: string | null;
  group: string | null;
}

// Маппинг ID дверей на русские названия
const DOOR_NAME_MAPPING: Record<number, string> = {
  13: '3 Этаж',
  14: '4 Этаж',
  15: '5 Этаж',
  16: '6 Этаж',
  21: 'Лифт 2 Этаж',
  22: 'Чёрный вход',
  23: 'Задняя лестница 2 этаж',
  25: 'Главный вход',
  26: 'Фойе лифта 1 этаж'
};

// ID дверей для подменю "3-6 Этаж"
const FLOORS_SUBMENU_DOORS = [13, 14, 15, 16];

// ID дверей, которые нужно скрыть
const HIDDEN_DOORS = [17, 18, 19, 20, 24, 27, 28];

function Trassir() {
  const authFetch = useAuthFetch();
  const [doors, setDoors] = useState<Door[]>([]);
  const [logs, setLogs] = useState<DoorLog[]>([]);
  const [aggregated, setAggregated] = useState<AggregatedStats | null>(null);
  const [allAccessPoints, setAllAccessPoints] = useState<AccessPoint[]>([]);
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string | null>('doors');
  const [period, setPeriod] = useState('month');
  const [doorFilter, setDoorFilter] = useState<string | null>(null);
  const [showAllPoints, setShowAllPoints] = useState(false);
  const [showFloorsSubmenu, setShowFloorsSubmenu] = useState(false);

  const fetchDoors = async () => {
    try {
      const response = await authFetch(`${API}/trassir/doors`);
      if (response) {
        const data = await response.json();
        // Применяем переименования и фильтруем скрытые двери
        const renamedDoors = data
          .filter((door: Door) => !HIDDEN_DOORS.includes(door.id))
          .map((door: Door) => ({
            ...door,
            name: DOOR_NAME_MAPPING[door.id] || door.name
          }));
        setDoors(renamedDoors);
      }
    } catch (error) {
      notificationSystem.addNotification('Ошибка', 'Ошибка загрузки дверей', 'error');
    }
  };

  const fetchStats = async () => {
    try {
      const params = new URLSearchParams();
      params.append('period', period);
      if (doorFilter) params.append('door', doorFilter);
      
      const [logsRes, aggRes] = await Promise.all([
        authFetch(`${API}/trassir/stats?${params}`),
        authFetch(`${API}/trassir/stats/aggregated?period=${period}`)
      ]);
      if (logsRes) {
        const logsData = await logsRes.json();
        setLogs(logsData);
      }
      if (aggRes) {
        const aggData = await aggRes.json();
        setAggregated(aggData);
      }
    } catch (error) {
      // Статистика может быть недоступна
    }
  };

  const fetchAllAccessPoints = async () => {
    try {
      const response = await authFetch(`${API}/trassir/all-access-points`);
      if (response) {
        const data = await response.json();
        // Применяем переименования, сохраняя оригинальное имя
        const renamedPoints = data.map((point: AccessPoint) => ({
          ...point,
          originalName: point.name,
          name: DOOR_NAME_MAPPING[point.id] || point.name
        }));
        setAllAccessPoints(renamedPoints);
      }
    } catch (error) {
      notificationSystem.addNotification('Ошибка', 'Ошибка загрузки точек доступа', 'error');
    }
  };

  const fetchConnectedUsers = async () => {
    try {
      const response = await authFetch(`${API}/trassir/connected-users`);
      if (response) {
        const data = await response.json();
        setConnectedUsers(data);
      }
    } catch (error) {
      // Может быть недоступно
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchDoors(), fetchStats(), fetchConnectedUsers()]);
      setLoading(false);
    };
    loadData();
  }, []);

  useEffect(() => {
    fetchStats();
  }, [period, doorFilter]);

  const handleOpenDoor = async (doorId: number) => {
    try {
      const response = await authFetch(`${API}/trassir/doors/${doorId}/open`, {
        method: 'POST'
      });
      if (response) {
        const data = await response.json();
        if (data.opened) {
          notificationSystem.addNotification('Успешно', 'Дверь открыта', 'success');
          fetchStats();
        } else {
          notificationSystem.addNotification('Ошибка', 'Не удалось открыть дверь', 'error');
        }
      }
    } catch (error) {
      notificationSystem.addNotification('Ошибка', 'Ошибка открытия двери', 'error');
    }
  };

  const maxDoorCount = aggregated?.topDoors[0]?.count || 1;
  const maxUserCount = aggregated?.topUsers[0]?.count || 1;

  const doorOptions = doors.map(d => ({ value: d.name, label: d.name }));

  // Разделяем двери на обычные и для подменю "3-6 Этаж"
  const regularDoors = doors.filter(d => !FLOORS_SUBMENU_DOORS.includes(d.id));
  const floorsSubmenuDoors = doors.filter(d => FLOORS_SUBMENU_DOORS.includes(d.id));

  return (
    <Container size="xl" py="md">
      <LoadingOverlay visible={loading} />

      {/* Карточки статистики */}
      <SimpleGrid cols={{ base: 2, md: 4 }} mb="lg">
        <Card shadow="sm" p="md" radius="md" withBorder>
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed">Всего дверей</Text>
              <Text size="xl" fw={700}>{doors.length}</Text>
            </div>
            <IconDoor size={32} color="var(--mantine-color-blue-6)" />
          </Group>
        </Card>
        <Card shadow="sm" p="md" radius="md" withBorder>
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed">Пользователей</Text>
              <Text size="xl" fw={700} c="cyan">{connectedUsers.length}</Text>
            </div>
            <IconUsers size={32} color="var(--mantine-color-cyan-6)" />
          </Group>
        </Card>
        <Card shadow="sm" p="md" radius="md" withBorder>
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed">Открытий сегодня</Text>
              <Text size="xl" fw={700} c="green">
                {logs.filter(l => new Date(l.openedAt).toDateString() === new Date().toDateString()).length}
              </Text>
            </div>
            <IconLockOpen size={32} color="var(--mantine-color-green-6)" />
          </Group>
        </Card>
        <Card shadow="sm" p="md" radius="md" withBorder>
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed">За период</Text>
              <Text size="xl" fw={700}>{aggregated?.total || 0}</Text>
            </div>
            <IconChartBar size={32} color="var(--mantine-color-violet-6)" />
          </Group>
        </Card>
      </SimpleGrid>

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List mb="md">
          <Tabs.Tab value="doors" leftSection={<IconDoor size={16} />}>
            Двери
          </Tabs.Tab>
          <Tabs.Tab value="users" leftSection={<IconUsers size={16} />}>
            Пользователи ({connectedUsers.length})
          </Tabs.Tab>
          <Tabs.Tab value="stats" leftSection={<IconChartBar size={16} />}>
            Статистика
          </Tabs.Tab>
          <Tabs.Tab value="charts" leftSection={<IconClock size={16} />}>
            Графики
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="doors">
          <Group mb="md">
            <Button 
              variant="light" 
              onClick={() => { fetchAllAccessPoints(); setShowAllPoints(true); }}
            >
              Показать все точки доступа Trassir
            </Button>
          </Group>
          {/* Подменю "3-6 Этаж" */}
          {floorsSubmenuDoors.length > 0 && (
            <Card shadow="sm" p="md" radius="md" withBorder mb="md">
              <Group justify="space-between" mb="md">
                <Text fw={600} size="lg">🏢 3-6 Этаж</Text>
                <Button
                  variant="light"
                  size="sm"
                  onClick={() => setShowFloorsSubmenu(!showFloorsSubmenu)}
                >
                  {showFloorsSubmenu ? 'Скрыть' : 'Показать'}
                </Button>
              </Group>
              {showFloorsSubmenu && (
                <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} mt="md">
                  {floorsSubmenuDoors.map((door) => (
                    <Card key={door.id} shadow="sm" p="lg" radius="md" withBorder>
                      <Group justify="space-between" mb="xs">
                        <Text fw={500}>{door.name}</Text>
                        <IconDoor size={24} />
                      </Group>
                      <Text size="sm" c="dimmed" mb="md">ID: {door.id}</Text>
                      <Button
                        fullWidth
                        color="green"
                        leftSection={<IconLockOpen size={16} />}
                        onClick={() => handleOpenDoor(door.id)}
                      >
                        Открыть
                      </Button>
                    </Card>
                  ))}
                </SimpleGrid>
              )}
            </Card>
          )}

          {/* Остальные двери */}
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
            {regularDoors.map((door) => (
              <Card key={door.id} shadow="sm" p="lg" radius="md" withBorder>
                <Group justify="space-between" mb="xs">
                  <Text fw={500}>{door.name}</Text>
                  <IconDoor size={24} />
                </Group>
                <Text size="sm" c="dimmed" mb="md">ID: {door.id}</Text>
                <Button
                  fullWidth
                  color="green"
                  leftSection={<IconLockOpen size={16} />}
                  onClick={() => handleOpenDoor(door.id)}
                >
                  Открыть
                </Button>
              </Card>
            ))}
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="users">
          <Group mb="md">
            <Button 
              variant="light" 
              leftSection={<IconRefresh size={16} />}
              onClick={fetchConnectedUsers}
            >
              Обновить список
            </Button>
            <Text size="sm" c="dimmed">
              Пользователи с привязанным Telegram ботом
            </Text>
          </Group>
          
          {connectedUsers.length > 0 ? (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Имя</Table.Th>
                  <Table.Th>Email</Table.Th>
                  <Table.Th>Telegram</Table.Th>
                  <Table.Th>Роль</Table.Th>
                  <Table.Th>Должность</Table.Th>
                  <Table.Th>Филиал</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {connectedUsers.map((user) => (
                  <Table.Tr key={user.id}>
                    <Table.Td>{user.name}</Table.Td>
                    <Table.Td>{user.email}</Table.Td>
                    <Table.Td>
                      {user.telegramUsername ? (
                        <Badge color="blue" variant="light">@{user.telegramUsername}</Badge>
                      ) : (
                        <Badge color="gray" variant="light">—</Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge 
                        color={user.role === 'DEVELOPER' ? 'violet' : user.role === 'ADMIN' ? 'red' : 'gray'}
                        variant="light"
                      >
                        {user.role}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{user.position || '—'}</Table.Td>
                    <Table.Td>{user.group || '—'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Paper p="xl" withBorder ta="center">
              <Text c="dimmed">Нет подключенных пользователей</Text>
            </Paper>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="stats">
          <Paper shadow="sm" p="md" radius="md" withBorder>
            <Group justify="space-between" mb="md">
              <Group>
                <SegmentedControl
                  value={period}
                  onChange={setPeriod}
                  data={[
                    { label: 'Сегодня', value: 'today' },
                    { label: 'Неделя', value: 'week' },
                    { label: 'Месяц', value: 'month' },
                  ]}
                />
                <Select
                  placeholder="Все двери"
                  data={doorOptions}
                  value={doorFilter}
                  onChange={setDoorFilter}
                  clearable
                  w={200}
                />
              </Group>
              <Button leftSection={<IconRefresh size={16} />} variant="light" onClick={fetchStats}>
                Обновить
              </Button>
            </Group>

            {/* Топы */}
            <SimpleGrid cols={{ base: 1, md: 2 }} mb="lg">
              <Card withBorder p="md">
                <Title order={5} mb="sm">🚪 Топ дверей</Title>
                <Stack gap="xs">
                  {aggregated?.topDoors.map((d, i) => (
                    <div key={d.name}>
                      <Group justify="space-between" mb={4}>
                        <Text size="sm">{i + 1}. {d.name}</Text>
                        <Text size="sm" fw={500}>{d.count}</Text>
                      </Group>
                      <Progress value={(d.count / maxDoorCount) * 100} size="sm" color="blue" />
                    </div>
                  ))}
                  {!aggregated?.topDoors.length && <Text c="dimmed" size="sm">Нет данных</Text>}
                </Stack>
              </Card>
              <Card withBorder p="md">
                <Title order={5} mb="sm">👤 Топ пользователей</Title>
                <Stack gap="xs">
                  {aggregated?.topUsers.map((u, i) => (
                    <div key={u.name}>
                      <Group justify="space-between" mb={4}>
                        <Text size="sm">{i + 1}. {u.name}</Text>
                        <Text size="sm" fw={500}>{u.count}</Text>
                      </Group>
                      <Progress value={(u.count / maxUserCount) * 100} size="sm" color="orange" />
                    </div>
                  ))}
                  {!aggregated?.topUsers.length && <Text c="dimmed" size="sm">Нет данных</Text>}
                </Stack>
              </Card>
            </SimpleGrid>

            {/* Таблица логов */}
            <Title order={5} mb="sm">История открытий</Title>
            {logs.length > 0 ? (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Дата/Время</Table.Th>
                    <Table.Th>Пользователь</Table.Th>
                    <Table.Th>Дверь</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {logs.slice(0, 50).map((log) => (
                    <Table.Tr key={log.id}>
                      <Table.Td>{new Date(log.openedAt).toLocaleString('ru-RU')}</Table.Td>
                      <Table.Td>{log.personName || 'Неизвестно'}</Table.Td>
                      <Table.Td>{log.doorName || `ID: ${log.doorId}`}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Text c="dimmed" ta="center" py="xl">
                Нет данных за выбранный период
              </Text>
            )}
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="charts">
          <Paper shadow="sm" p="md" radius="md" withBorder>
            <Group justify="space-between" mb="md">
              <Title order={4}>Аналитика</Title>
              <SegmentedControl
                value={period}
                onChange={setPeriod}
                data={[
                  { label: 'Сегодня', value: 'today' },
                  { label: 'Неделя', value: 'week' },
                  { label: 'Месяц', value: 'month' },
                ]}
              />
            </Group>

            <SimpleGrid cols={{ base: 1, lg: 2 }} mb="lg">
              {/* График по часам */}
              <Card withBorder p="md">
                <Title order={5} mb="md">⏰ Открытия по часам</Title>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={aggregated?.hourlyData || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} />
                    <YAxis />
                    <Tooltip labelFormatter={(h) => `${h}:00 - ${h}:59`} />
                    <Bar dataKey="count" fill="#228be6" name="Открытий" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              {/* График по дням */}
              <Card withBorder p="md">
                <Title order={5} mb="md">📅 Открытия по дням</Title>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={aggregated?.dailyData || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(d) => new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} 
                    />
                    <YAxis />
                    <Tooltip labelFormatter={(d) => new Date(d).toLocaleDateString('ru-RU')} />
                    <Line type="monotone" dataKey="count" stroke="#40c057" strokeWidth={2} name="Открытий" />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </SimpleGrid>

            {/* Топ дверей - горизонтальный бар */}
            <Card withBorder p="md">
              <Title order={5} mb="md">🚪 Популярность дверей</Title>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={aggregated?.topDoors || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={150} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#7950f2" name="Открытий" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Paper>
        </Tabs.Panel>
      </Tabs>

      {/* Модалка со всеми точками доступа */}
      <Modal
        opened={showAllPoints}
        onClose={() => setShowAllPoints(false)}
        title="Все точки доступа Trassir"
        size="lg"
      >
        <Text size="sm" c="dimmed" mb="md">
          Всего точек: {allAccessPoints.length}. В боте используются только те, что начинаются с "_".
        </Text>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Название</Table.Th>
              <Table.Th>Статус</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {allAccessPoints.map((point) => (
              <Table.Tr key={point.id}>
                <Table.Td>{point.id}</Table.Td>
                <Table.Td>{point.name}</Table.Td>
                <Table.Td>
                  {HIDDEN_DOORS.includes(point.id) ? (
                    <Badge color="red">Скрыта</Badge>
                  ) : point.originalName?.startsWith('_') || doors.some(d => d.id === point.id) ? (
                    <Badge color="green">В боте</Badge>
                  ) : (
                    <Badge color="gray">Скрыта</Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Modal>
    </Container>
  );
}

export default Trassir;
