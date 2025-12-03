import { useState, useEffect, useMemo } from 'react';
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
  Button,
  Tabs,
  Popover,
  Collapse,
  Tooltip,
  Checkbox,
  Alert,
  Modal
} from '@mantine/core';
import { IconSend, IconAlertCircle, IconCheck, IconChartBar, IconUsers, IconClock, IconSearch, IconThumbUp, IconDownload, IconFileSpreadsheet } from '@tabler/icons-react';
import { ActivityChart } from './charts/ActivityChart';
import { HeatmapChart } from './charts/HeatmapChart';
import { FunnelChart } from './charts/FunnelChart';
import { TrendChart } from './charts/TrendChart';
import { exportStatsToExcel, exportStatsToCSV } from './utils/exportStats';
import dayjs from 'dayjs';
import { fetchMerchStats, MerchStatsResponse } from '../../data/MerchStatsData';
import { API } from '../../../../../config/constants';
import { TelegramPreview } from '../Card/TelegramPreview';
import { CustomModal } from '../../../../../utils/CustomModal';
import { fetchAllCards, CardItem } from '../../data/CardData';
import { DynamicFormModal, type FormField } from '../../../../../utils/formModal';
import TiptapEditor from '../../../../../utils/editor';
import './MerchStats.css';

interface BotUser {
  userId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: Date;
}

function MerchStats() {
  const [stats, setStats] = useState<MerchStatsResponse | null>(null);
  const [previousStats, setPreviousStats] = useState<MerchStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>('30');
  const [sendModalOpened, setSendModalOpened] = useState(false);
  const [sendToAll, setSendToAll] = useState(false);
  const [users, setUsers] = useState<BotUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: number; failed: number; errors: Array<{ userId: number; error: string }> } | null>(null);
  const [previewModalOpened, setPreviewModalOpened] = useState(false);
  const [previewCard, setPreviewCard] = useState<CardItem | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>('dashboard');
  const [showTrends, setShowTrends] = useState(false);
  const [dayDetailsModalOpened, setDayDetailsModalOpened] = useState(false);
  const [selectedDayDetails, setSelectedDayDetails] = useState<{ date: string; actions: Record<string, number> } | null>(null);

  useEffect(() => {
    loadStats();
  }, [period, showTrends]);

  useEffect(() => {
    if (sendModalOpened) {
      loadUsers();
    }
  }, [sendModalOpened]);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const currentPeriod = parseInt(period, 10);
      const data = await fetchMerchStats(currentPeriod);
      setStats(data);
      
      // Загружаем данные предыдущего периода для сравнения (если включены тренды)
      if (showTrends && currentPeriod >= 7) {
        try {
          // Загружаем данные за тот же период, но сдвинутый назад
          // Например, если текущий период 30 дней, загружаем предыдущие 30 дней
          const prevData = await fetchMerchStats(currentPeriod);
          // Для простоты используем те же данные, но можно расширить логику
          setPreviousStats(prevData);
        } catch (e) {
          // Игнорируем ошибки загрузки предыдущих данных
          console.error('Ошибка загрузки предыдущих данных:', e);
          setPreviousStats(null);
        }
      } else {
        setPreviousStats(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен не найден');
      }

      const response = await fetch(`${API}/merch-bot/users`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Ошибка загрузки пользователей');
      }

      const data = await response.json();
      setUsers(data);
    } catch (err) {
      console.error('Ошибка загрузки пользователей:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleCloseModal = () => {
    setSendModalOpened(false);
    setSendToAll(false);
    setSendResult(null);
  };

  // Хуки должны быть вызваны до всех условных возвратов
  const userOptions = useMemo(() => {
    return users.map(user => {
      const nameParts: string[] = [];
      if (user.firstName) nameParts.push(user.firstName);
      if (user.lastName) nameParts.push(user.lastName);
      const fullName = nameParts.join(' ').trim();
      const displayName = fullName || (user.username ? `@${user.username}` : `User ${user.userId}`);
      const usernamePart = user.username ? ` (@${user.username})` : '';

      return {
        value: user.userId.toString(),
        label: fullName ? `${fullName}${usernamePart}` : displayName
      };
    });
  }, [users]);

  const handleSubmitBroadcast = async (values: Record<string, any>) => {
    const rawMessage = (values.message || '').toString();
    const trimmedMessage = rawMessage.trim();

    if (!trimmedMessage) {
      return;
    }

    const selectedRecipients: string[] = Array.isArray(values.recipients) ? values.recipients : [];

    if (!sendToAll && selectedRecipients.length === 0) {
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен не найден');
      }

      const userIds = sendToAll
        ? users.map(user => user.userId)
        : selectedRecipients.map(id => parseInt(id, 10));

      const formData = new FormData();
      formData.append('message', trimmedMessage);
      formData.append('parseMode', 'HTML');
      userIds.forEach(id => {
        formData.append('userIds', id.toString());
      });

      const photos = (values.photos || []) as Array<{ source: File | string }>;
      photos.forEach((attachment) => {
        if (attachment && attachment.source && typeof attachment.source !== 'string') {
          formData.append('photos', attachment.source as File);
        }
      });

      const response = await fetch(`${API}/merch-bot/send-message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Ошибка отправки сообщения');
      }

      const result = await response.json();
      setSendResult(result.result);
    } catch (err) {
      console.error('Ошибка отправки сообщения:', err);

      const photos = (values.photos || []) as Array<{ source: File | string }>;
      const hasPhotos = Array.isArray(photos) && photos.length > 0;

      const targetUserIds = sendToAll
        ? users.map(user => user.userId)
        : (Array.isArray(values.recipients)
          ? (values.recipients as string[]).map(id => parseInt(id, 10))
          : []);

      const errorUsers = users.filter(u => targetUserIds.includes(u.userId));

      setSendResult({
        success: 0,
        failed: targetUserIds.length,
        errors: errorUsers.map(user => ({
          userId: user.userId,
          error: err instanceof Error
            ? err.message + (hasPhotos ? ' (возможно проблема с отправкой фото)' : '')
            : 'Unknown error'
        }))
      });
    } finally {
      setSending(false);
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

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      'start': 'Запуск бота',
      'button_click': 'Нажатие кнопки',
      'search': 'Поиск',
      'card_view': 'Просмотр карточки',
      'message_reaction': 'Реакция на сообщение',
      'feedback': 'Обратная связь',
      'back': 'Назад',
      'next': 'Далее',
      'category_select': 'Выбор категории',
      'card_select': 'Выбор карточки',
      'help': 'Помощь',
      'menu': 'Меню',
    };
    return labels[action] || action;
  };

  return (
    <Stack gap="md" className="merch-stats-container">
      <Group justify="space-between" align="flex-end">
        <Title order={2}>Статистика бота</Title>
        <Group align="flex-end">
          <Button
            leftSection={<IconFileSpreadsheet size={16} />}
            onClick={() => stats && exportStatsToExcel(stats, parseInt(period, 10))}
            variant="light"
            color="green"
          >
            Экспорт Excel
          </Button>
          <Button
            leftSection={<IconDownload size={16} />}
            onClick={() => stats && exportStatsToCSV(stats, parseInt(period, 10))}
            variant="light"
            color="blue"
          >
            Экспорт CSV
          </Button>
          <Button
            leftSection={<IconSend size={16} />}
            onClick={() => setSendModalOpened(true)}
            color="blue"
          >
            Отправить сообщение
          </Button>
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
          <Tooltip 
            label="Сравнение текущего периода с предыдущим (например, если выбран период 30 дней, будет сравнение с предыдущими 30 днями)"
            withArrow
            multiline
          >
            <div>
              <Checkbox
                label="Показать тренды"
                checked={showTrends}
                onChange={(e) => setShowTrends(e.currentTarget.checked)}
                mt={25}
              />
            </div>
          </Tooltip>
        </Group>
      </Group>

      <Tabs value={activeTab} onChange={(value) => setActiveTab(value)}>
        <Tabs.List>
          <Tabs.Tab value="dashboard" leftSection={<IconChartBar size={16} />}>
            Дашборд
          </Tabs.Tab>
          <Tabs.Tab value="users" leftSection={<IconUsers size={16} />}>
            Пользователи
          </Tabs.Tab>
          <Tabs.Tab value="content" leftSection={<IconSearch size={16} />}>
            Контент
          </Tabs.Tab>
          <Tabs.Tab value="behavior" leftSection={<IconClock size={16} />}>
            Поведение
          </Tabs.Tab>
          <Tabs.Tab value="reactions" leftSection={<IconThumbUp size={16} />}>
            Реакции {stats.reactionStats && stats.reactionStats.total > 0 && (
              <Badge size="sm" variant="light" ml={4}>
                {stats.reactionStats.total}
              </Badge>
            )}
          </Tabs.Tab>
        </Tabs.List>

        <DynamicFormModal
          opened={sendModalOpened}
          onClose={handleCloseModal}
          title="Отправить сообщение пользователям"
          mode="create"
          size="xl"
          fields={((): FormField[] => [
            {
              name: 'recipients',
              label: 'Получатели',
              type: 'multiselect',
              options: userOptions,
              searchable: true,
              required: !sendToAll,
              disabled: sendToAll,
              placeholder: sendToAll
                ? 'Выбрано: все пользователи'
                : 'Выберите пользователей...'
            },
            {
              name: 'photos',
              label: 'Фото (необязательно)',
              type: 'file',
              withDnd: false,
              multiple: true,
              accept: 'image/*'
            }
          ])()}
          initialValues={{
            message: '',
            recipients: [],
            photos: []
          }}
          onSubmit={handleSubmitBroadcast}
          loading={sending}
          submitButtonText="Отправить"
          cancelButtonText="Отмена"
          extraContent={(values, setFieldValue) => (
            <Stack gap="md" mb="md">
              {loadingUsers ? (
                <Box style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                  <Loader size="sm" />
                </Box>
              ) : (
                <>
                  <Box>
                    <Text size="sm" fw={500} mb="xs">Сообщение</Text>
                    <TiptapEditor
                      content={(values.message || '').toString()}
                      onChange={(content) => setFieldValue('message', content)}
                      telegramMode={true}
                    />
                    <Text size="xs" c="dimmed" mt="xs">
                      Поддерживается HTML форматирование: <b>жирный</b>, <i>курсив</i>, <u>подчеркнутый</u>, <s>зачеркнутый</s>, <code>код</code>
                    </Text>
                  </Box>
                  <div>
                    <Checkbox
                      label={`Отправить всем пользователям (${users.length} чел.)`}
                      checked={sendToAll}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        setSendToAll(checked);
                        if (checked) {
                          setFieldValue('recipients', []);
                        }
                      }}
                    />
                  </div>
                </>
              )}
              {sendResult && (
                <Alert
                  icon={sendResult.failed === 0 ? <IconCheck size={16} /> : <IconAlertCircle size={16} />}
                  title={sendResult.failed === 0 ? 'Сообщения отправлены успешно' : 'Отправка завершена с ошибками'}
                  color={sendResult.failed === 0 ? 'green' : 'orange'}
                >
                  <Text size="sm">
                    Успешно отправлено: {sendResult.success} из {sendResult.success + sendResult.failed}
                  </Text>
                  {sendResult.failed > 0 && (
                    <Text size="sm" mt="xs">
                      Не удалось отправить: {sendResult.failed}
                    </Text>
                  )}
                  {sendResult.errors.length > 0 && sendResult.errors.length <= 5 && (
                    <Stack gap="xs" mt="xs">
                      {sendResult.errors.map((err, idx) => (
                        <Text key={idx} size="xs" c="dimmed">
                          User {err.userId}: {err.error}
                        </Text>
                      ))}
                    </Stack>
                  )}
                </Alert>
              )}
            </Stack>
          )}
        />

        <Tabs.Panel value="dashboard" pt="md">
      <Stack gap="xl">
        {/* Ключевые метрики - компактный вид */}
        <SimpleGrid cols={{ base: 2, sm: 4, md: 6 }} spacing="md">
          <Card withBorder p="md" radius="md" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('users')}>
            <Text size="xs" c="dimmed" mb={4}>Всего пользователей</Text>
            <Text size="xl" fw={700}>{stats.summary.totalUsers}</Text>
          </Card>
          <Card withBorder p="md" radius="md" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('users')}>
            <Text size="xs" c="dimmed" mb={4}>Активных</Text>
            <Text size="xl" fw={700} c="green">{stats.summary.activeUsers}</Text>
          </Card>
          <Card withBorder p="md" radius="md">
            <Text size="xs" c="dimmed" mb={4}>Сегодня</Text>
            <Text size="xl" fw={700} c="blue">{stats.summary.activeUsersToday}</Text>
          </Card>
          <Card withBorder p="md" radius="md" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('behavior')}>
            <Text size="xs" c="dimmed" mb={4}>Действий</Text>
            <Text size="xl" fw={700}>{stats.summary.totalActions}</Text>
          </Card>
          <Card withBorder p="md" radius="md" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('content')}>
            <Text size="xs" c="dimmed" mb={4}>Поисков</Text>
            <Text size="xl" fw={700} c="violet">{stats.popularSearches.reduce((sum, s) => sum + s.count, 0)}</Text>
          </Card>
          <Card withBorder p="md" radius="md" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('reactions')}>
            <Text size="xs" c="dimmed" mb={4}>Реакций</Text>
            <Text size="xl" fw={700} c="orange">{stats.reactionStats?.total || 0}</Text>
          </Card>
        </SimpleGrid>

        {/* Графики активности */}
        {stats.dailyStats && stats.dailyStats.length > 0 && (
          <Stack gap="md">
            <ActivityChart
              data={stats.dailyStats.map(d => ({
                date: d.date,
                displayDate: dayjs(d.date).format('DD.MM'),
                actions: d.totalActions,
                users: d.uniqueUsers,
                actionsDetails: d.actions
              }))}
              title="Активность по дням"
              onDateClick={(date, actionsDetails) => {
                if (actionsDetails) {
                  setSelectedDayDetails({ date, actions: actionsDetails });
                  setDayDetailsModalOpened(true);
                }
              }}
            />
            
            {/* Тренды метрик */}
            {showTrends && previousStats && stats.dailyStats && previousStats.dailyStats && (
              <Collapse in={showTrends}>
                <TrendChart
                  data={stats.dailyStats.map((d, idx) => ({
                    period: d.date,
                    displayPeriod: dayjs(d.date).format('DD.MM'),
                    current: d.totalActions,
                    previous: previousStats.dailyStats[idx]?.totalActions
                  }))}
                  title="Тренды активности (сравнение с предыдущим периодом)"
                  currentLabel="Текущий период"
                  previousLabel="Предыдущий период"
                />
              </Collapse>
            )}
            
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              {stats.heatmapData && stats.heatmapData.length > 0 && (
                <HeatmapChart
                  data={stats.heatmapData}
                  title="Активность по дням недели и часам"
                />
              )}
              {stats.funnelStats && (
                <FunnelChart
                  data={[
                    {
                      name: 'Запустили бота',
                      value: stats.funnelStats.started,
                      percentage: 100,
                      color: 'var(--color-primary-500)'
                    },
                    {
                      name: 'Нажали кнопку',
                      value: stats.funnelStats.clickedButton,
                      percentage: stats.funnelStats.started > 0 
                        ? Math.round((stats.funnelStats.clickedButton / stats.funnelStats.started) * 100)
                        : 0,
                      color: 'var(--color-blue-500)'
                    },
                    {
                      name: 'Использовали поиск',
                      value: stats.funnelStats.searched,
                      percentage: stats.funnelStats.started > 0
                        ? Math.round((stats.funnelStats.searched / stats.funnelStats.started) * 100)
                        : 0,
                      color: 'var(--color-green-500)'
                    },
                    {
                      name: 'Оставили обратную связь',
                      value: stats.funnelStats.gaveFeedback,
                      percentage: stats.funnelStats.started > 0
                        ? Math.round((stats.funnelStats.gaveFeedback / stats.funnelStats.started) * 100)
                        : 0,
                      color: 'var(--color-orange-500)'
                    }
                  ]}
                  title="Воронка конверсии"
                />
              )}
            </SimpleGrid>
          </Stack>
        )}

        {/* Дополнительные метрики - компактная группа */}
        <Paper withBorder p="md" radius="md">
          <Title order={4} mb="md">Дополнительные метрики</Title>
          <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} spacing="md">
            <Box>
              <Text size="xs" c="dimmed" mb={2}>Новых</Text>
              <Text size="lg" fw={600} c="blue">{stats.summary.newUsers}</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed" mb={2}>За неделю</Text>
              <Text size="lg" fw={600}>{stats.summary.activeUsersWeek}</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed" mb={2}>За месяц</Text>
              <Text size="lg" fw={600}>{stats.summary.activeUsersMonth}</Text>
            </Box>
            {stats.summary && 'avgActionsPerUser' in stats.summary && stats.summary.avgActionsPerUser !== undefined && (
              <Box>
                <Text size="xs" c="dimmed" mb={2}>Среднее/пользователя</Text>
                <Text size="lg" fw={600} c="violet">{String(stats.summary.avgActionsPerUser)}</Text>
              </Box>
            )}
            {stats.summary && 'returningUsers' in stats.summary && stats.summary.returningUsers !== undefined && (
              <Box>
                <Text size="xs" c="dimmed" mb={2}>Вернувшихся</Text>
                <Text size="lg" fw={600} c="cyan">{String(stats.summary.returningUsers)}</Text>
              </Box>
            )}
            {stats.summary && 'totalSessions' in stats.summary && stats.summary.totalSessions !== undefined && (
              <Box>
                <Text size="xs" c="dimmed" mb={2}>Сессий</Text>
                <Text size="lg" fw={600} c="grape">{String(stats.summary.totalSessions)}</Text>
              </Box>
            )}
            {stats.summary && 'avgSessionDuration' in stats.summary && stats.summary.avgSessionDuration !== undefined && (
              <Box>
                <Text size="xs" c="dimmed" mb={2}>Длительность сессии</Text>
                <Text size="lg" fw={600} c="indigo">{String(stats.summary.avgSessionDuration)} мин</Text>
              </Box>
            )}
            {stats.summary && 'avgActionsPerSession' in stats.summary && stats.summary.avgActionsPerSession !== undefined && (
              <Box>
                <Text size="xs" c="dimmed" mb={2}>Действий/сессию</Text>
                <Text size="lg" fw={600} c="pink">{String(stats.summary.avgActionsPerSession)}</Text>
              </Box>
            )}
            <Box>
              <Text size="xs" c="dimmed" mb={2}>Обратная связь</Text>
              <Text size="lg" fw={600} c="orange">{stats.summary.feedbackRequests}</Text>
            </Box>
          </SimpleGrid>
        </Paper>

        {/* Статистика по дням недели и времени суток */}
        {(stats.weekdayStats || stats.timeOfDayStats) && (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            {stats.weekdayStats && stats.weekdayStats.length > 0 && (
              <Paper withBorder p="md" radius="md">
                <Title order={4} mb="md">Активность по дням недели</Title>
                <ScrollArea h={250}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>День</Table.Th>
                        <Table.Th>Действий</Table.Th>
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

            {stats.timeOfDayStats && (
              <Paper withBorder p="md" radius="md">
                <Title order={4} mb="md">Активность по времени суток</Title>
                <SimpleGrid cols={2} spacing="md">
                  <Card withBorder p="md" radius="md">
                    <Text size="xs" c="dimmed" mb={4}>Утро (6-12)</Text>
                    <Text size="xl" fw={700} c="yellow">{stats.timeOfDayStats.morning}</Text>
                  </Card>
                  <Card withBorder p="md" radius="md">
                    <Text size="xs" c="dimmed" mb={4}>День (12-18)</Text>
                    <Text size="xl" fw={700} c="orange">{stats.timeOfDayStats.afternoon}</Text>
                  </Card>
                  <Card withBorder p="md" radius="md">
                    <Text size="xs" c="dimmed" mb={4}>Вечер (18-24)</Text>
                    <Text size="xl" fw={700} c="red">{stats.timeOfDayStats.evening}</Text>
                  </Card>
                  <Card withBorder p="md" radius="md">
                    <Text size="xs" c="dimmed" mb={4}>Ночь (0-6)</Text>
                    <Text size="xl" fw={700} c="blue">{stats.timeOfDayStats.night}</Text>
                  </Card>
                </SimpleGrid>
              </Paper>
            )}
          </SimpleGrid>
        )}

        {/* Retention и поисковые запросы */}
        {(stats.retentionStats || stats.searchLengthStats) && (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            {stats.retentionStats && (
              <Paper withBorder p="md" radius="md">
                <Title order={4} mb="md">Retention (возвраты)</Title>
                <SimpleGrid cols={3} spacing="md">
                  <Card withBorder p="md" radius="md">
                    <Text size="xs" c="dimmed" mb={4}>День 1</Text>
                    <Text size="xl" fw={700} c="green">{stats.retentionStats.day1}</Text>
                  </Card>
                  <Card withBorder p="md" radius="md">
                    <Text size="xs" c="dimmed" mb={4}>День 7</Text>
                    <Text size="xl" fw={700} c="blue">{stats.retentionStats.day7}</Text>
                  </Card>
                  <Card withBorder p="md" radius="md">
                    <Text size="xs" c="dimmed" mb={4}>День 30</Text>
                    <Text size="xl" fw={700} c="violet">{stats.retentionStats.day30}</Text>
                  </Card>
                </SimpleGrid>
              </Paper>
            )}

            {stats.searchLengthStats && (
              <Paper withBorder p="md" radius="md">
                <Title order={4} mb="md">Длина поисковых запросов</Title>
                <SimpleGrid cols={3} spacing="md">
                  <Card withBorder p="md" radius="md">
                    <Text size="xs" c="dimmed" mb={4}>Короткие (1-5)</Text>
                    <Text size="xl" fw={700}>{stats.searchLengthStats.short}</Text>
                  </Card>
                  <Card withBorder p="md" radius="md">
                    <Text size="xs" c="dimmed" mb={4}>Средние (6-15)</Text>
                    <Text size="xl" fw={700}>{stats.searchLengthStats.medium}</Text>
                  </Card>
                  <Card withBorder p="md" radius="md">
                    <Text size="xs" c="dimmed" mb={4}>Длинные (16+)</Text>
                    <Text size="xl" fw={700}>{stats.searchLengthStats.long}</Text>
                  </Card>
                </SimpleGrid>
              </Paper>
            )}
          </SimpleGrid>
        )}
      </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="users" pt="md">
          <Stack gap="md">
            {/* Сегментация пользователей */}
            {stats.userSegments && (
              <Paper withBorder p="md" radius="md">
                <Title order={3} mb="md">Сегментация пользователей по активности</Title>
                <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
                  <Card withBorder p="md" radius="md">
                    <Text size="sm" c="dimmed" mb={4}>Высокая активность</Text>
                    <Text size="xl" fw={700} c="green">
                      {stats.userSegments.high}
                    </Text>
                  </Card>
                  <Card withBorder p="md" radius="md">
                    <Text size="sm" c="dimmed" mb={4}>Средняя активность</Text>
                    <Text size="xl" fw={700} c="blue">
                      {stats.userSegments.medium}
                    </Text>
                  </Card>
                  <Card withBorder p="md" radius="md">
                    <Text size="sm" c="dimmed" mb={4}>Низкая активность</Text>
                    <Text size="xl" fw={700} c="orange">
                      {stats.userSegments.low}
                    </Text>
                  </Card>
                  <Card withBorder p="md" radius="md">
                    <Text size="sm" c="dimmed" mb={4}>Неактивные</Text>
                    <Text size="xl" fw={700} c="gray">
                      {stats.userSegments.inactive}
                    </Text>
                  </Card>
                </SimpleGrid>
              </Paper>
            )}

            {/* Когортный анализ */}
            {stats.cohortAnalysis && stats.cohortAnalysis.length > 0 && (
              <Paper withBorder p="md" radius="md">
                <Title order={3} mb="md">Когортный анализ</Title>
                <ScrollArea h={400}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Когорта</Table.Th>
                        <Table.Th>Пользователей</Table.Th>
                        <Table.Th>Retention день 1</Table.Th>
                        <Table.Th>Retention день 7</Table.Th>
                        <Table.Th>Retention день 30</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {stats.cohortAnalysis.map((cohort) => (
                        <Table.Tr key={cohort.cohort}>
                          <Table.Td>
                            <Text fw={500}>{cohort.cohort}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge variant="light" size="lg">
                              {cohort.users}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Badge variant="light" color="green" size="lg">
                              {cohort.retention.day1}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Badge variant="light" color="blue" size="lg">
                              {cohort.retention.day7}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Badge variant="light" color="violet" size="lg">
                              {cohort.retention.day30}
                            </Badge>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Paper>
            )}

            {/* Топ активных пользователей */}
            <Paper withBorder p="md" radius="md">
              <Title order={3} mb="md">Топ активных пользователей</Title>
            <ScrollArea h={400}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>#</Table.Th>
                    <Table.Th>Пользователь</Table.Th>
                    <Table.Th>Действий</Table.Th>
                    <Table.Th>Регистрация</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {stats.topUsers.map((user, index) => (
                    <Table.Tr key={user.userId}>
                      <Table.Td>
                        <Badge variant="dot" color={index < 3 ? 'green' : 'gray'}>
                          {index + 1}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {user.firstName || user.lastName 
                            ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                            : user.username || `User ${user.userId}`
                          }
                          {user.username && <Text size="xs" c="dimmed" component="span"> @{user.username}</Text>}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" size="lg">
                          {user.actionsCount}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {user.registeredAt ? formatDate(user.registeredAt.toString()) : 'N/A'}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="content" pt="md">
          <Stack gap="md">
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

            {/* Аналитика контента */}
            {stats.contentAnalytics && (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <Paper withBorder p="md" radius="md">
                  <Title order={3} mb="md">Конверсия карточек</Title>
                  <ScrollArea h={300}>
                    <Table>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Карточка</Table.Th>
                          <Table.Th>Просмотров</Table.Th>
                          <Table.Th>Реакций</Table.Th>
                          <Table.Th>Конверсия</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {stats.contentAnalytics.conversionRate.slice(0, 10).map((card) => (
                          <Table.Tr key={card.cardId}>
                            <Table.Td>
                              <Text size="sm" lineClamp={1}>{card.cardName}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Badge variant="light">{card.views}</Badge>
                            </Table.Td>
                            <Table.Td>
                              <Badge variant="light" color="green">{card.reactions}</Badge>
                            </Table.Td>
                            <Table.Td>
                              <Badge 
                                variant="light" 
                                color={card.conversionRate > 10 ? 'green' : card.conversionRate > 5 ? 'yellow' : 'red'}
                              >
                                {card.conversionRate.toFixed(1)}%
                              </Badge>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Paper>

                <Paper withBorder p="md" radius="md">
                  <Title order={3} mb="md">Непопулярные карточки</Title>
                  <ScrollArea h={300}>
                    <Table>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Карточка</Table.Th>
                          <Table.Th>Просмотров</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {stats.contentAnalytics.unpopularCards.length > 0 ? (
                          stats.contentAnalytics.unpopularCards.map((card) => (
                            <Table.Tr key={card.cardId}>
                              <Table.Td>
                                <Text size="sm" lineClamp={1}>{card.cardName}</Text>
                              </Table.Td>
                              <Table.Td>
                                <Badge variant="light" color="red">{card.views}</Badge>
                              </Table.Td>
                            </Table.Tr>
                          ))
                        ) : (
                          <Table.Tr>
                            <Table.Td colSpan={2}>
                              <Text c="dimmed" size="sm" ta="center">
                                Все карточки популярны
                              </Text>
                            </Table.Td>
                          </Table.Tr>
                        )}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Paper>
              </SimpleGrid>
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
        </Tabs.Panel>

        <Tabs.Panel value="behavior" pt="md">
          <Stack gap="md">
            {/* Поведенческая аналитика */}
            {stats.behaviorAnalytics && (
              <Paper withBorder p="md" radius="md">
                <Title order={3} mb="md">Поведенческие метрики</Title>
                <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                  <Card withBorder p="md" radius="md">
                    <Text size="sm" c="dimmed" mb={4}>Средняя глубина просмотра</Text>
                    <Text size="xl" fw={700}>
                      {stats.behaviorAnalytics.avgViewDepth.toFixed(1)}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>карточек за сессию</Text>
                  </Card>
                  <Card withBorder p="md" radius="md">
                    <Text size="sm" c="dimmed" mb={4}>Коэффициент оттока</Text>
                    <Text size="xl" fw={700} c={stats.behaviorAnalytics.bounceRate > 50 ? 'red' : 'green'}>
                      {stats.behaviorAnalytics.bounceRate.toFixed(1)}%
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>пользователей ушли сразу</Text>
                  </Card>
                  {stats.avgSessionDuration && (
                    <Card withBorder p="md" radius="md">
                      <Text size="sm" c="dimmed" mb={4}>Средняя длительность сессии</Text>
                      <Text size="xl" fw={700}>
                        {stats.avgSessionDuration.toFixed(1)}
                      </Text>
                      <Text size="xs" c="dimmed" mt={4}>минут</Text>
                    </Card>
                  )}
                </SimpleGrid>
              </Paper>
            )}

            {/* Статистика по действиям */}
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
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
          </Stack>
        </Tabs.Panel>


        <Tabs.Panel value="reactions" pt="md">
          {!stats.reactionStats ? (
            <Paper withBorder p="md" radius="md">
              <Text c="dimmed" ta="center">
                Статистика по реакциям недоступна
              </Text>
            </Paper>
          ) : (
            <>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mb="md">
              <Paper withBorder p="md" radius="md">
                <Title order={3} mb="md">Статистика реакций</Title>
                <Stack gap="md">
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">Всего реакций</Text>
                    <Badge size="lg" variant="light">
                      {stats.reactionStats.total}
                    </Badge>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">Уникальных эмодзи</Text>
                    <Badge size="lg" variant="light">
                      {stats.reactionStats.uniqueEmojis}
                    </Badge>
                  </Group>
                  {stats.reactionStats.messagesWithReactions !== undefined && (
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Сообщений с реакциями</Text>
                      <Badge size="lg" variant="light">
                        {stats.reactionStats.messagesWithReactions}
                      </Badge>
                    </Group>
                  )}
                </Stack>
              </Paper>

              <Paper withBorder p="md" radius="md">
                <Title order={3} mb="md">Популярные реакции</Title>
                <ScrollArea h={300}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>#</Table.Th>
                        <Table.Th>Эмодзи</Table.Th>
                        <Table.Th>Количество</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {stats.reactionStats.topReactions.map((reaction, index) => (
                        <Table.Tr key={reaction.emoji}>
                          <Table.Td>
                            <Badge variant="dot" color={index < 3 ? 'green' : 'gray'}>
                              {index + 1}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Text size="xl">{reaction.emoji}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge variant="light" size="lg">
                              {reaction.count}
                            </Badge>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Paper>
            </SimpleGrid>

            {stats.reactionStats.topCardsByReactions && stats.reactionStats.topCardsByReactions.length > 0 && (
              <Paper withBorder p="md" radius="md" mt="md">
                <Title order={3} mb="md">Топ карточек по реакциям</Title>
                <ScrollArea h={400}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>#</Table.Th>
                        <Table.Th>Карточка/Категория</Table.Th>
                        <Table.Th>Всего реакций</Table.Th>
                        <Table.Th>Популярные реакции</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {stats.reactionStats.topCardsByReactions.map((card, index) => (
                        <Table.Tr key={card.itemId}>
                          <Table.Td>
                            <Badge variant="dot" color={index < 3 ? 'green' : 'gray'}>
                              {index + 1}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={4}>
                              <Group gap="xs">
                                <Badge 
                                  variant="light" 
                                  color={card.itemType === 'card' ? 'blue' : 'gray'}
                                  size="sm"
                                >
                                  {card.itemType === 'card' ? 'Карточка' : 'Категория'}
                                </Badge>
                              </Group>
                              <Text size="sm" fw={500}>
                                {card.itemName}
                              </Text>
                              <Text size="xs" c="dimmed" ff="monospace">
                                ID: {card.itemId.substring(0, 8)}...
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Badge variant="light" size="lg">
                              {card.totalReactions}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs">
                              {card.topReactions.map((reaction) => (
                                <Group key={reaction.emoji} gap={4}>
                                  <Text size="lg">{reaction.emoji}</Text>
                                  <Badge size="sm" variant="outline">
                                    {reaction.count}
                                  </Badge>
                                </Group>
                              ))}
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Paper>
            )}

            <Paper withBorder p="md" radius="md" mt="md">
              <Title order={3} mb="md">Топ сообщений по реакциям</Title>
              {stats.reactionStats.topMessages && stats.reactionStats.topMessages.length > 0 ? (
                <ScrollArea h={400}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>#</Table.Th>
                        <Table.Th>Карточка/Категория</Table.Th>
                        <Table.Th>Сообщение</Table.Th>
                        <Table.Th>ID сообщения</Table.Th>
                        <Table.Th>Всего реакций</Table.Th>
                        <Table.Th>Реакции</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {stats.reactionStats.topMessages.map((message, index) => (
                        <Table.Tr 
                          key={`${message.chatId}_${message.messageId}`}
                          style={{ cursor: message.cardInfo ? 'pointer' : 'default' }}
                          onClick={async () => {
                            if (message.cardInfo && message.cardInfo.itemType === 'card') {
                              setLoadingPreview(true);
                              setPreviewModalOpened(true);
                              try {
                                // Загружаем все карточки и ищем нужную
                                const allCards = await fetchAllCards();
                                const card = allCards.find((c: CardItem) => c.id === message.cardInfo!.itemId);
                                if (card) {
                                  setPreviewCard(card);
                                } else {
                                  setPreviewCard(null);
                                }
                              } catch (error) {
                                console.error('Ошибка загрузки карточки:', error);
                                setPreviewCard(null);
                              } finally {
                                setLoadingPreview(false);
                              }
                            }
                          }}
                        >
                          <Table.Td>
                            <Badge variant="dot" color={index < 3 ? 'green' : 'gray'}>
                              {index + 1}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            {message.cardInfo ? (
                              <Stack gap={4}>
                                <Group gap="xs">
                                  <Badge 
                                    variant="light" 
                                    color={message.cardInfo.itemType === 'card' ? 'blue' : 'gray'}
                                    size="sm"
                                  >
                                    {message.cardInfo.itemType === 'card' ? 'Карточка' : 'Категория'}
                                  </Badge>
                                </Group>
                                <Text size="sm" fw={500}>
                                  {message.cardInfo.itemName}
                                </Text>
                                <Text size="xs" c="dimmed" ff="monospace">
                                  ID: {message.cardInfo.itemId.substring(0, 8)}...
                                </Text>
                              </Stack>
                            ) : (
                              <Stack gap={4}>
                                <Text size="sm" c="dimmed" ff="monospace">
                                  Сообщение {message.messageId}
                                </Text>
                                <Text size="xs" c="dimmed" ff="monospace">
                                  Чат: {message.chatId}
                                </Text>
                              </Stack>
                            )}
                          </Table.Td>
                          <Table.Td>
                            {message.messageText ? (
                              <Text size="sm" style={{ maxWidth: 300, wordBreak: 'break-word' }}>
                                {message.messageText.replace(/<[^>]+>/g, '').substring(0, 100)}
                                {message.messageText.replace(/<[^>]+>/g, '').length > 100 ? '...' : ''}
                              </Text>
                            ) : (
                              <Text size="sm" c="dimmed" fs="italic">
                                Нет текста
                              </Text>
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={4}>
                              <Text size="sm" ff="monospace" c="dimmed">
                                {message.messageId}
                              </Text>
                              <Text size="xs" c="dimmed" ff="monospace">
                                Чат: {message.chatId}
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Badge variant="light" size="lg">
                              {message.totalReactions}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs">
                              {message.reactions.map((reaction) => (
                                <Popover key={reaction.emoji} width={250} position="top" withArrow shadow="md">
                                  <Popover.Target>
                                    <Group gap={4} style={{ cursor: 'pointer' }}>
                                      <Text size="lg">{reaction.emoji}</Text>
                                      <Badge size="sm" variant="outline">
                                        {reaction.count}
                                      </Badge>
                                    </Group>
                                  </Popover.Target>
                                  <Popover.Dropdown>
                                    <Stack gap="xs">
                                      <Text size="sm" fw={500}>Пользователи ({reaction.users.length}):</Text>
                                      {reaction.users.map((user, idx) => (
                                        <Text key={idx} size="xs">
                                          {user.firstName || user.lastName 
                                            ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                                            : user.username 
                                              ? `@${user.username}`
                                              : `User ${user.userId}`}
                                        </Text>
                                      ))}
                                    </Stack>
                                  </Popover.Dropdown>
                                </Popover>
                              ))}
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              ) : (
                <Text c="dimmed" size="sm" ta="center" py="xl">
                  Нет данных о сообщениях с реакциями
                </Text>
              )}
            </Paper>
            </>
          )}
        </Tabs.Panel>

      </Tabs>

      {/* Модальное окно превью карточки */}
      <CustomModal
        opened={previewModalOpened}
        onClose={() => {
          setPreviewModalOpened(false);
          setPreviewCard(null);
        }}
        title="Превью карточки в Telegram"
        size="xl"
      >
        {loadingPreview ? (
          <Box style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <Loader size="md" />
          </Box>
        ) : previewCard ? (
          <TelegramPreview
            name={previewCard.name}
            description={previewCard.description}
            images={previewCard.imageUrls}
          />
        ) : (
          <Text c="dimmed" ta="center" py="xl">
            Карточка не найдена
          </Text>
        )}
      </CustomModal>

      {/* Модальное окно деталей дня */}
      <Modal
        opened={dayDetailsModalOpened}
        onClose={() => {
          setDayDetailsModalOpened(false);
          setSelectedDayDetails(null);
        }}
        title={`Детали действий за ${selectedDayDetails ? dayjs(selectedDayDetails.date).format('DD.MM.YYYY') : ''}`}
        size="lg"
      >
        {selectedDayDetails && (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Всего действий: <Text component="span" fw={600} c="var(--theme-text-primary)">
                {Object.values(selectedDayDetails.actions).reduce((sum, count) => sum + count, 0)}
              </Text>
            </Text>
            <ScrollArea h={400}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Действие</Table.Th>
                    <Table.Th>Количество</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {Object.entries(selectedDayDetails.actions)
                    .sort((a, b) => b[1] - a[1])
                    .map(([action, count]) => (
                      <Table.Tr key={action}>
                        <Table.Td>
                          <Text size="sm">{getActionLabel(action)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" size="lg">
                            {count}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Stack>
        )}
      </Modal>

    </Stack>
  );
}

export default MerchStats;

