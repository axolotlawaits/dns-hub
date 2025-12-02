import { useState, useEffect } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  Badge,
  Table,
  ScrollArea,
  Loader,
  Box,
  Modal,
  Image,
  SimpleGrid,
  Pagination,
  Select,
  ActionIcon,
  Tooltip,
  Divider
} from '@mantine/core';
import {
  IconMail,
  IconCheck,
  IconX,
  IconPhoto,
  IconUser,
  IconCalendar,
  IconMailOpened,
  IconBrandTelegram,
  IconExternalLink
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import {
  fetchMerchFeedback,
  markFeedbackAsRead,
  fetchMerchFeedbackStats,
  MerchFeedback,
  MerchFeedbackStats,
  FeedbackPriority,
  FeedbackStatus,
  updateFeedbackPriority,
  updateFeedbackStatus
} from '../../data/MerchFeedbackData';
import { API } from '../../../../../config/constants';
import './MerchFeedback.css';

function MerchFeedbackComponent() {
  const navigate = useNavigate();
  const [feedbacks, setFeedbacks] = useState<MerchFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<MerchFeedbackStats | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [isReadFilter, setIsReadFilter] = useState<boolean | undefined>(undefined);
  const [selectedFeedback, setSelectedFeedback] = useState<MerchFeedback | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [updatingFeedbackId, setUpdatingFeedbackId] = useState<string | null>(null);

  useEffect(() => {
    loadFeedbacks();
    loadStats();
  }, [page, limit, isReadFilter]);

  const loadFeedbacks = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMerchFeedback({
        page,
        limit,
        isRead: isReadFilter
      });
      setFeedbacks(data.feedbacks);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(errorMessage);
      console.error('Ошибка загрузки обратной связи:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await fetchMerchFeedbackStats();
      setStats(statsData);
    } catch (err) {
      console.error('Ошибка загрузки статистики обратной связи:', err);
      // Не устанавливаем error, чтобы не блокировать основной интерфейс
    }
  };

  const handleMarkAsRead = async (feedback: MerchFeedback) => {
    if (feedback.isRead) return;
    
    try {
      const updated = await markFeedbackAsRead(feedback.id);
      setFeedbacks(prev => 
        prev.map(f => f.id === feedback.id ? updated : f)
      );
      loadStats();
    } catch (err) {
      console.error('Ошибка при отметке как прочитанного:', err);
    }
  };

  const handleOpenModal = (feedback: MerchFeedback) => {
    setSelectedFeedback(feedback);
    setModalOpened(true);
    if (!feedback.isRead) {
      handleMarkAsRead(feedback);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getUserName = (feedback: MerchFeedback) => {
    const { dbName, tgName, username, userId } = feedback.user;
    
    // Формируем части имени
    const nameParts: string[] = [];
    
    // Для мерча используем данные из Telegram, но если есть и ФИО из базы, показываем оба
    if (tgName) {
      if (dbName && dbName !== tgName) {
        nameParts.push(`${dbName} (${tgName})`);
      } else {
        nameParts.push(tgName);
      }
    } else if (dbName) {
      // Если нет данных из Telegram, используем ФИО из базы
      nameParts.push(dbName);
    }
    
    // Добавляем Telegram username, если есть
    if (username) {
      const usernamePart = `@${username}`;
      if (nameParts.length > 0) {
        nameParts.push(`(${usernamePart})`);
      } else {
        nameParts.push(usernamePart);
      }
    }
    
    // Если ничего не найдено, используем ID
    if (nameParts.length === 0) {
      return `ID: ${userId}`;
    }
    
    return nameParts.join(' ');
  };

  const getPriorityLabel = (priority?: FeedbackPriority) => {
    const p = priority || 'MEDIUM';
    const map: Record<FeedbackPriority, string> = {
      LOW: 'Низкий',
      MEDIUM: 'Средний',
      HIGH: 'Высокий',
      CRITICAL: 'Критический'
    };
    return map[p];
  };

  const getPriorityColor = (priority?: FeedbackPriority) => {
    const p = priority || 'MEDIUM';
    const map: Record<FeedbackPriority, string> = {
      LOW: 'gray',
      MEDIUM: 'blue',
      HIGH: 'orange',
      CRITICAL: 'red'
    };
    return map[p];
  };

  const getStatusLabel = (status?: FeedbackStatus) => {
    const s = status || 'NEW';
    const map: Record<FeedbackStatus, string> = {
      NEW: 'Новое',
      IN_PROGRESS: 'В работе',
      RESOLVED: 'Решено',
      REJECTED: 'Отклонено'
    };
    return map[s];
  };

  const getStatusColor = (status?: FeedbackStatus) => {
    const s = status || 'NEW';
    const map: Record<FeedbackStatus, string> = {
      NEW: 'blue',
      IN_PROGRESS: 'yellow',
      RESOLVED: 'green',
      REJECTED: 'red'
    };
    return map[s];
  };

  const handleChangePriority = async (feedback: MerchFeedback, value: string | null) => {
    if (!value) return;
    const priority = value as FeedbackPriority;
    try {
      setUpdatingFeedbackId(feedback.id);
      const updated = await updateFeedbackPriority(feedback.id, priority);
      setFeedbacks(prev => prev.map(f => f.id === feedback.id ? updated : f));
      setSelectedFeedback(prev => (prev && prev.id === feedback.id ? updated : prev));
    } catch (err) {
      console.error('Ошибка при обновлении приоритета:', err);
    } finally {
      setUpdatingFeedbackId(null);
    }
  };

  const handleChangeStatus = async (feedback: MerchFeedback, value: string | null) => {
    if (!value) return;
    const status = value as FeedbackStatus;
    try {
      setUpdatingFeedbackId(feedback.id);
      const updated = await updateFeedbackStatus(feedback.id, status);
      setFeedbacks(prev => prev.map(f => f.id === feedback.id ? updated : f));
      setSelectedFeedback(prev => (prev && prev.id === feedback.id ? updated : prev));
    } catch (err) {
      console.error('Ошибка при обновлении статуса:', err);
    } finally {
      setUpdatingFeedbackId(null);
    }
  };

  const handleOpenTelegram = (e: React.MouseEvent, feedback: MerchFeedback) => {
    e.stopPropagation();
    const { username, userId } = feedback.user;
    
    if (username) {
      // Если есть username, открываем профиль в Telegram
      window.open(`https://t.me/${username}`, '_blank');
    } else if (userId) {
      // Если нет username, но есть userId, пробуем открыть через tg://
      // Это работает только если пользователь уже в контактах
      window.open(`tg://user?id=${userId}`, '_blank');
    }
  };

  const handleOpenProfile = async (e: React.MouseEvent, feedback: MerchFeedback) => {
    e.stopPropagation();
    const { email } = feedback;
    
    if (!email) return;
    
    try {
      // Получаем uuid пользователя по email
      const response = await fetch(`${API}/profile/user-data-by-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ email })
      });
      
      if (response.ok) {
        const userData = await response.json();
        if (userData.uuid) {
          navigate(`/employee/${userData.uuid}`);
        } else {
          console.error('UUID не найден для пользователя');
        }
      } else {
        console.error('Ошибка при получении данных пользователя');
      }
    } catch (error) {
      console.error('Ошибка при переходе к профилю:', error);
    }
  };

  const handleSendEmail = (e: React.MouseEvent, email: string) => {
    e.stopPropagation();
    if (email) {
      window.location.href = `mailto:${email}`;
    }
  };

  if (loading && !feedbacks.length) {
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
          Ошибка загрузки обратной связи: {error}
        </Text>
      </Paper>
    );
  }

  return (
    <Stack gap="md" className="merch-feedback-container">
      {/* Статистика */}
      {stats && (
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="sm" c="dimmed" mb={4}>
                  Всего сообщений
                </Text>
                <Text size="xl" fw={700}>
                  {stats.total}
                </Text>
              </div>
              <IconMail size={32} color="var(--color-accent-80)" />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="sm" c="dimmed" mb={4}>
                  Непрочитанных
                </Text>
                <Text size="xl" fw={700} c="red">
                  {stats.unread}
                </Text>
              </div>
              <IconMail size={32} color="var(--mantine-color-red-6)" />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="sm" c="dimmed" mb={4}>
                  Прочитанных
                </Text>
                <Text size="xl" fw={700} c="green">
                  {stats.read}
                </Text>
              </div>
              <IconMailOpened size={32} color="var(--mantine-color-green-6)" />
            </Group>
          </Paper>
        </SimpleGrid>
      )}

      {/* Фильтры */}
      <Group justify="space-between">
        <Select
          label="Статус"
          value={isReadFilter === undefined ? 'all' : isReadFilter.toString()}
          onChange={(value) => {
            if (value === 'all') {
              setIsReadFilter(undefined);
            } else {
              setIsReadFilter(value === 'true');
            }
            setPage(1);
          }}
          data={[
            { value: 'all', label: 'Все' },
            { value: 'false', label: 'Непрочитанные' },
            { value: 'true', label: 'Прочитанные' }
          ]}
          style={{ width: 200 }}
        />
        <Select
          label="На странице"
          value={limit.toString()}
          onChange={(value) => {
            setLimit(parseInt(value || '50', 10));
            setPage(1);
          }}
          data={[
            { value: '20', label: '20' },
            { value: '50', label: '50' },
            { value: '100', label: '100' }
          ]}
          style={{ width: 150 }}
        />
      </Group>

      {/* Таблица */}
      <Paper withBorder p="md" radius="md">
        <ScrollArea>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ color: 'var(--mantine-color-text)' }}>Пользователь</Table.Th>
                <Table.Th style={{ color: 'var(--mantine-color-text)' }}>Email</Table.Th>
                <Table.Th style={{ color: 'var(--mantine-color-text)' }}>Сообщение</Table.Th>
                <Table.Th style={{ color: 'var(--mantine-color-text)' }}>Фото</Table.Th>
                <Table.Th style={{ color: 'var(--mantine-color-text)' }}>Дата</Table.Th>
                <Table.Th style={{ color: 'var(--mantine-color-text)' }}>Приоритет</Table.Th>
                <Table.Th style={{ color: 'var(--mantine-color-text)' }}>Статус</Table.Th>
                <Table.Th style={{ color: 'var(--mantine-color-text)' }}>Действия</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {feedbacks.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text c="dimmed" ta="center" py="xl">
                      Нет обратной связи
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                feedbacks.map((feedback) => (
                  <Table.Tr
                    key={feedback.id}
                    className={feedback.isRead ? undefined : 'feedback-unread-row'}
                    style={{
                      cursor: 'pointer'
                    }}
                    onClick={() => handleOpenModal(feedback)}
                  >
                    <Table.Td>
                      <Group gap="xs">
                        <IconUser size={16} />
                        <Text size="sm" fw={feedback.isRead ? 400 : 600} c="var(--mantine-color-text)">
                          {getUserName(feedback)}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="var(--mantine-color-text)">{feedback.email}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="var(--mantine-color-text)" lineClamp={2}>
                        {feedback.text}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {feedback.photos.length > 0 ? (
                        <Badge variant="light" color="blue" leftSection={<IconPhoto size={12} />}>
                          {feedback.photos.length}
                        </Badge>
                      ) : (
                        <Text size="sm" c="dimmed">-</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <IconCalendar size={14} />
                        <Text size="sm" c="dimmed">
                          {formatDate(feedback.createdAt)}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={getPriorityColor(feedback.priority)}
                        variant="light"
                      >
                        {getPriorityLabel(feedback.priority)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={getStatusColor(feedback.status)}
                        variant="light"
                      >
                        {getStatusLabel(feedback.status)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Tooltip label="Открыть">
                          <ActionIcon
                            variant="light"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenModal(feedback);
                            }}
                          >
                            <IconMail size={16} />
                          </ActionIcon>
                        </Tooltip>
                        {(feedback.user.username || feedback.user.userId) && (
                          <Tooltip label="Открыть в Telegram">
                            <ActionIcon
                              variant="light"
                              color="blue"
                              onClick={(e) => handleOpenTelegram(e, feedback)}
                            >
                              <IconBrandTelegram size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        {feedback.email && (
                          <Tooltip label="Написать на email">
                            <ActionIcon
                              variant="light"
                              color="grape"
                              onClick={(e) => handleSendEmail(e, feedback.email)}
                            >
                              <IconMail size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        {feedback.email && feedback.user.userId && (
                          <Tooltip label="Открыть профиль">
                            <ActionIcon
                              variant="light"
                              color="green"
                              onClick={(e) => handleOpenProfile(e, feedback)}
                            >
                              <IconExternalLink size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        {!feedback.isRead && (
                          <Tooltip label="Отметить как прочитанное">
                            <ActionIcon
                              variant="light"
                              color="green"
                              onClick={async (e) => {
                                e.stopPropagation();
                                await handleMarkAsRead(feedback);
                              }}
                            >
                              <IconCheck size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      {/* Пагинация */}
      {feedbacks.length > 0 && (
        <Group justify="center">
          <Pagination
            value={page}
            onChange={setPage}
            total={Math.ceil((stats?.total || 0) / limit)}
          />
        </Group>
      )}

      {/* Модальное окно с деталями */}
      <Modal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        title="Обратная связь"
        size="lg"
      >
        {selectedFeedback && (
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="xs">
                <IconUser size={20} />
                <Text fw={600}>{getUserName(selectedFeedback)}</Text>
              </Group>
              <Group gap="xs">
                <Badge
                  color={getPriorityColor(selectedFeedback.priority)}
                  variant="filled"
                >
                  {getPriorityLabel(selectedFeedback.priority)}
                </Badge>
                <Badge
                  color={getStatusColor(selectedFeedback.status)}
                  variant="filled"
                >
                  {getStatusLabel(selectedFeedback.status)}
                </Badge>
                {selectedFeedback.isRead ? (
                  <Badge color="green" variant="light" leftSection={<IconCheck size={12} />}>
                    Прочитано
                  </Badge>
                ) : (
                  <Badge color="red" variant="light" leftSection={<IconX size={12} />}>
                    Не прочитано
                  </Badge>
                )}
              </Group>
            </Group>

            <Divider />

            {/* Действия с пользователем */}
            <Group gap="xs" wrap="wrap">
              {(selectedFeedback.user.username || selectedFeedback.user.userId) && (
                <Tooltip label="Открыть в Telegram">
                  <ActionIcon
                    variant="light"
                    color="blue"
                    onClick={(e) => handleOpenTelegram(e, selectedFeedback)}
                  >
                    <IconBrandTelegram size={18} />
                  </ActionIcon>
                </Tooltip>
              )}
              {selectedFeedback.email && (
                <Tooltip label="Написать на email">
                  <ActionIcon
                    variant="light"
                    color="grape"
                    onClick={(e) => handleSendEmail(e, selectedFeedback.email)}
                  >
                    <IconMail size={18} />
                  </ActionIcon>
                </Tooltip>
              )}
              {selectedFeedback.email && selectedFeedback.user.userId && (
                <Tooltip label="Открыть профиль">
                  <ActionIcon
                    variant="light"
                    color="green"
                    onClick={(e) => handleOpenProfile(e, selectedFeedback)}
                  >
                    <IconExternalLink size={18} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>

            <Divider />

            <Group gap="xs" align="center">
              <Text size="sm" c="dimmed">Приоритет:</Text>
              <Select
                size="xs"
                w={180}
                data={[
                  { value: 'LOW', label: 'Низкий' },
                  { value: 'MEDIUM', label: 'Средний' },
                  { value: 'HIGH', label: 'Высокий' },
                  { value: 'CRITICAL', label: 'Критический' }
                ]}
                value={(selectedFeedback.priority || 'MEDIUM') as string}
                onChange={(value) => handleChangePriority(selectedFeedback, value)}
                disabled={updatingFeedbackId === selectedFeedback.id}
              />
            </Group>

            <Group gap="xs" align="center">
              <Text size="sm" c="dimmed">Статус:</Text>
              <Select
                size="xs"
                w={200}
                data={[
                  { value: 'NEW', label: 'Новое' },
                  { value: 'IN_PROGRESS', label: 'В работе' },
                  { value: 'RESOLVED', label: 'Решено' },
                  { value: 'REJECTED', label: 'Отклонено' }
                ]}
                value={(selectedFeedback.status || 'NEW') as string}
                onChange={(value) => handleChangeStatus(selectedFeedback, value)}
                disabled={updatingFeedbackId === selectedFeedback.id}
              />
            </Group>

            <Divider />

            <Group gap="xs">
              <IconMail size={16} />
              <Text size="sm" c="dimmed">Email:</Text>
              <Text size="sm" fw={500}>{selectedFeedback.email}</Text>
            </Group>

            <Group gap="xs">
              <IconCalendar size={16} />
              <Text size="sm" c="dimmed">Дата:</Text>
              <Text size="sm">{formatDate(selectedFeedback.createdAt)}</Text>
            </Group>

            <Divider />

            <div>
              <Text size="sm" c="dimmed" mb="xs">Сообщение:</Text>
              <Paper 
                p="md" 
                withBorder 
                radius="md" 
                style={{ 
                  backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))',
                }}
              >
                <Text 
                  size="sm" 
                  style={{ 
                    whiteSpace: 'pre-wrap',
                    color: 'light-dark(var(--mantine-color-dark-9), var(--mantine-color-gray-0))'
                  }}
                >
                  {selectedFeedback.text}
                </Text>
              </Paper>
            </div>

            {selectedFeedback.photos.length > 0 && (
              <div>
                <Text size="sm" c="dimmed" mb="xs">Фотографии ({selectedFeedback.photos.length}):</Text>
                <SimpleGrid cols={2} spacing="md">
                  {selectedFeedback.photos.map((photo, index) => {
                    // Фотографии из обратной связи всегда сохраняются в public/feedback/
                    let photoPath: string;
                    if (photo.startsWith('http')) {
                      photoPath = photo;
                    } else {
                      // Для всех инструментов фото в public/feedback/
                      photoPath = `${API}/public/feedback/${photo}`;
                    }
                    
                    return (
                      <Image
                        key={index}
                        src={photoPath}
                        alt={`Фото ${index + 1}`}
                        radius="md"
                      />
                    );
                  })}
                </SimpleGrid>
              </div>
            )}

            {selectedFeedback.readAt && (
              <Group gap="xs">
                <IconMailOpened size={16} />
                <Text size="xs" c="dimmed">
                  Прочитано: {formatDate(selectedFeedback.readAt)}
                </Text>
              </Group>
            )}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

export default MerchFeedbackComponent;

