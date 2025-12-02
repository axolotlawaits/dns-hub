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
  Modal,
  MultiSelect,
  Alert,
  Checkbox,
  Tabs
} from '@mantine/core';
import { IconSend, IconAlertCircle, IconCheck, IconChartBar, IconUsers, IconClock, IconSearch, IconThumbUp } from '@tabler/icons-react';
import { fetchMerchStats, MerchStatsResponse } from '../../data/MerchStatsData';
import { API } from '../../../../../config/constants';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>('30');
  const [sendModalOpened, setSendModalOpened] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [sendToAll, setSendToAll] = useState(false);
  const [users, setUsers] = useState<BotUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: number; failed: number; errors: Array<{ userId: number; error: string }> } | null>(null);

  useEffect(() => {
    loadStats();
  }, [period]);

  useEffect(() => {
    if (sendModalOpened) {
      loadUsers();
    }
  }, [sendModalOpened]);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMerchStats(parseInt(period, 10));
      console.log('📊 [MerchStats] Загружена статистика:', {
        hasReactionStats: !!data.reactionStats,
        topMessagesCount: data.reactionStats?.topMessages?.length || 0,
        topCardsCount: data.reactionStats?.topCardsByReactions?.length || 0,
        reactionStats: data.reactionStats
      });
      setStats(data);
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

  const handleSendMessage = async () => {
    if (!message.trim()) {
      return;
    }

    if (!sendToAll && selectedUsers.length === 0) {
      return;
    }

    setSending(true);
    setSendResult(null);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен не найден');
      }

      // Если выбрано "отправить всем", используем всех пользователей
      const userIds = sendToAll 
        ? users.map(user => user.userId)
        : selectedUsers.map(id => parseInt(id, 10));

      const response = await fetch(`${API}/merch-bot/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: message.trim(),
          userIds,
          parseMode: 'HTML'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка отправки сообщения');
      }

      const result = await response.json();
      setSendResult(result.result);
    } catch (err) {
      console.error('Ошибка отправки сообщения:', err);
      const totalUsers = sendToAll ? users.length : selectedUsers.length;
      const errorUsers = sendToAll 
        ? users 
        : selectedUsers
            .map(id => users.find(u => u.userId.toString() === id))
            .filter((user): user is BotUser => user !== undefined);
      
      setSendResult({
        success: 0,
        failed: totalUsers,
        errors: errorUsers.map(user => ({ 
          userId: user.userId, 
          error: err instanceof Error ? err.message : 'Unknown error' 
        }))
      });
    } finally {
      setSending(false);
    }
  };

  const handleCloseModal = () => {
    setSendModalOpened(false);
    setMessage('');
    setSelectedUsers([]);
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
      'feedback': 'Обратная связь'
    };
    return labels[action] || action;
  };

  return (
    <Stack gap="md" className="merch-stats-container">
      <Group justify="space-between" align="center">
        <Title order={2}>Статистика бота</Title>
        <Group>
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
        </Group>
      </Group>

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview" leftSection={<IconChartBar size={16} />}>
            Обзор
          </Tabs.Tab>
          <Tabs.Tab value="users" leftSection={<IconUsers size={16} />}>
            Пользователи
          </Tabs.Tab>
          <Tabs.Tab value="actions" leftSection={<IconClock size={16} />}>
            Действия
          </Tabs.Tab>
          <Tabs.Tab value="search" leftSection={<IconSearch size={16} />}>
            Поиск
          </Tabs.Tab>
          <Tabs.Tab value="reactions" leftSection={<IconThumbUp size={16} />}>
            Реакции {stats.reactionStats && stats.reactionStats.total > 0 && (
              <Badge size="sm" variant="light" ml={4}>
                {stats.reactionStats.total}
              </Badge>
            )}
          </Tabs.Tab>
        </Tabs.List>

      <Modal
        opened={sendModalOpened}
        onClose={handleCloseModal}
        title="Отправить сообщение пользователям"
        size="xl"
      >
        <Stack gap="md">
          {loadingUsers ? (
            <Box style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <Loader size="sm" />
            </Box>
          ) : (
            <>
              <Box>
                <Text size="sm" fw={500} mb="xs">Сообщение</Text>
                <TiptapEditor
                  content={message}
                  onChange={setMessage}
                  telegramMode={true}
                />
                <Text size="xs" c="dimmed" mt="xs">
                  Поддерживается HTML форматирование: <b>жирный</b>, <i>курсив</i>, <u>подчеркнутый</u>, <s>зачеркнутый</s>, <code>код</code>
                </Text>
              </Box>
              <Checkbox
                label={`Отправить всем пользователям (${users.length} чел.)`}
                checked={sendToAll}
                onChange={(e) => {
                  setSendToAll(e.currentTarget.checked);
                  if (e.currentTarget.checked) {
                    setSelectedUsers([]);
                  }
                }}
              />
              <MultiSelect
                label="Получатели"
                placeholder={sendToAll ? "Выбрано: все пользователи" : "Выберите пользователей..."}
                data={userOptions}
                value={selectedUsers}
                onChange={setSelectedUsers}
                searchable
                clearable
                disabled={sendToAll}
                required={!sendToAll}
              />
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
          <Group justify="flex-end">
            <Button variant="subtle" onClick={handleCloseModal}>
              Отмена
            </Button>
            <Button
              onClick={handleSendMessage}
              loading={sending}
              disabled={!message.trim() || (!sendToAll && selectedUsers.length === 0)}
              leftSection={<IconSend size={16} />}
            >
              Отправить {sendToAll ? `всем (${users.length})` : `(${selectedUsers.length})`}
            </Button>
          </Group>
        </Stack>
      </Modal>

        <Tabs.Panel value="overview" pt="md">
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
        {stats.summary && 'avgActionsPerUser' in stats.summary && stats.summary.avgActionsPerUser !== undefined && (
          <Card withBorder p="md" radius="md">
            <Text size="sm" c="dimmed" mb={4}>
              Среднее действий на пользователя
            </Text>
            <Text size="xl" fw={700} c="violet">
              {String(stats.summary.avgActionsPerUser)}
            </Text>
          </Card>
        )}
        {stats.summary && 'returningUsers' in stats.summary && stats.summary.returningUsers !== undefined && (
          <Card withBorder p="md" radius="md">
            <Text size="sm" c="dimmed" mb={4}>
              Вернувшихся пользователей
            </Text>
            <Text size="xl" fw={700} c="cyan">
              {String(stats.summary.returningUsers)}
            </Text>
          </Card>
        )}
        {stats.summary && 'totalSessions' in stats.summary && stats.summary.totalSessions !== undefined && (
          <Card withBorder p="md" radius="md">
            <Text size="sm" c="dimmed" mb={4}>
              Всего сессий
            </Text>
            <Text size="xl" fw={700} c="grape">
              {String(stats.summary.totalSessions)}
            </Text>
          </Card>
        )}
        {stats.summary && 'avgSessionDuration' in stats.summary && stats.summary.avgSessionDuration !== undefined && (
          <Card withBorder p="md" radius="md">
            <Text size="sm" c="dimmed" mb={4}>
              Средняя длительность сессии (мин)
            </Text>
            <Text size="xl" fw={700} c="indigo">
              {String(stats.summary.avgSessionDuration)}
            </Text>
          </Card>
        )}
        {stats.summary && 'avgActionsPerSession' in stats.summary && stats.summary.avgActionsPerSession !== undefined && (
          <Card withBorder p="md" radius="md">
            <Text size="sm" c="dimmed" mb={4}>
              Среднее действий в сессии
            </Text>
            <Text size="xl" fw={700} c="pink">
              {String(stats.summary.avgActionsPerSession)}
            </Text>
          </Card>
        )}
      </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="users" pt="md">
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
        </Tabs.Panel>

        <Tabs.Panel value="actions" pt="md">
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
        </Tabs.Panel>

        <Tabs.Panel value="search" pt="md">
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
                        <Table.Th>ID сообщения</Table.Th>
                        <Table.Th>Всего реакций</Table.Th>
                        <Table.Th>Реакции</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {stats.reactionStats.topMessages.map((message, index) => (
                        <Table.Tr key={`${message.chatId}_${message.messageId}`}>
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

      {/* Дополнительная статистика (всегда видна) */}
      {/* Статистика по дням недели */}
      {stats && stats.weekdayStats && stats.weekdayStats.length > 0 && (
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
      {stats && stats.timeOfDayStats && (
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
      {stats && stats.searchLengthStats && (
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
      {stats && stats.funnelStats && (
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
      {stats && stats.retentionStats && (
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
      {stats && stats.popularCards && stats.popularCards.length > 0 && (
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

