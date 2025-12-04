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
  Divider,
  Tabs,
  Title
} from '@mantine/core';
import {
  IconMail,
  IconCheck,
  IconX,
  IconPhoto,
  IconUser,
  IconCalendar,
  IconMailOpened
} from '@tabler/icons-react';
import {
  fetchFeedback,
  markFeedbackAsRead,
  fetchFeedbackStats,
  Feedback,
  FeedbackStats,
  FeedbackPriority,
  FeedbackStatus,
  updateFeedbackPriority,
  updateFeedbackStatus
} from './data/FeedbackData';
import { API } from '../../config/constants';
import './Feedback.css';

function FeedbackModule() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [isReadFilter, setIsReadFilter] = useState<boolean | undefined>(undefined);
  const [toolFilter] = useState<string | undefined>(undefined);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [toolsMap, setToolsMap] = useState<Record<string, string>>({});
  const [updatingFeedbackId, setUpdatingFeedbackId] = useState<string | null>(null);

  useEffect(() => {
    loadFeedbacks();
    loadStats();
    loadTools();
  }, [page, limit, isReadFilter, toolFilter, activeTab]);

  const loadTools = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${API}/merch-bot/feedback/tools`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) return;

      const data = await response.json();
      const map: Record<string, string> = {};
      
      // Добавляем родительские инструменты
      if (data.parentTools) {
        data.parentTools.forEach((tool: { value: string; label: string }) => {
          map[tool.value] = tool.label;
        });
      }
      
      // Добавляем дочерние инструменты
      if (data.parentToolsWithChildren) {
        data.parentToolsWithChildren.forEach((parent: { value: string; label: string; children?: Array<{ value: string; label: string }> }) => {
          map[parent.value] = parent.label;
          if (parent.children) {
            parent.children.forEach((child: { value: string; label: string }) => {
              // Составной ключ: parent:child
              map[`${parent.value}:${child.value}`] = `${parent.label}: ${child.label}`;
            });
          }
        });
      }
      
      setToolsMap(map);
    } catch (err) {
      console.error('Ошибка загрузки инструментов:', err);
    }
  };

  const loadFeedbacks = async () => {
    setLoading(true);
    setError(null);
    try {
      const tool = activeTab === 'all' ? undefined : activeTab;
      const data = await fetchFeedback({
        page,
        limit,
        isRead: isReadFilter,
        tool
      });
      setFeedbacks(data.feedbacks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await fetchFeedbackStats();
      setStats(statsData);
    } catch (err) {
      console.error('Ошибка загрузки статистики:', err);
    }
  };

  const handleMarkAsRead = async (feedback: Feedback) => {
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

  const handleOpenModal = (feedback: Feedback) => {
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

  const getUserName = (feedback: Feedback) => {
    const { dbName, tgName, username, userId } = feedback.user;
    
    // Формируем части имени
    const nameParts: string[] = [];
    
    // Если это не мерч, используем ФИО из базы
    if (feedback.tool !== 'merch') {
      if (dbName) {
        // Если есть и данные из Telegram, показываем оба
        if (tgName && tgName !== dbName) {
          nameParts.push(`${dbName} (${tgName})`);
        } else {
          nameParts.push(dbName);
        }
      } else if (tgName) {
        // Если нет ФИО из базы, но есть из Telegram
        nameParts.push(tgName);
      }
    } else {
      // Для мерча используем данные из Telegram
      if (tgName) {
        // Если есть и ФИО из базы, показываем оба
        if (dbName && dbName !== tgName) {
          nameParts.push(`${dbName} (${tgName})`);
        } else {
          nameParts.push(tgName);
        }
      } else if (dbName) {
        nameParts.push(dbName);
      }
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

  const getToolLabel = (tool: string) => {
    // Сначала проверяем маппинг из загруженных инструментов
    if (toolsMap[tool]) {
      return toolsMap[tool];
    }
    
    // Если tool содержит двоеточие (составной формат parent:child), пытаемся найти parent
    if (tool.includes(':')) {
      const [parent, child] = tool.split(':');
      if (toolsMap[parent]) {
        // Ищем дочерний инструмент
        const childLabel = toolsMap[tool] || child;
        return `${toolsMap[parent]}: ${childLabel}`;
      }
    }
    
    // Fallback на старый маппинг для обратной совместимости
    const labels: Record<string, string> = {
      'merch': 'Мерч',
      'radio': 'Радио',
      'app': 'Приложения',
      'other': 'Другое',
      'general': 'Общая обратная связь'
    };
    
    // Пытаемся извлечь последнюю часть из пути (например, add/merch -> merch)
    const lastPart = tool.split('/').pop() || tool;
    if (labels[lastPart]) {
      return labels[lastPart];
    }
    
    return labels[tool] || tool;
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

  const handleChangePriority = async (feedback: Feedback, value: string | null) => {
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

  const handleChangeStatus = async (feedback: Feedback, value: string | null) => {
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

  // Получаем список уникальных инструментов из статистики
  const availableTools = stats?.byTool ? Object.keys(stats.byTool) : [];

  return (
    <Box style={{ width: '100%', padding: 'var(--mantine-spacing-md)' }}>
      <Stack gap="lg">
        <Title order={2} c="var(--theme-text-primary)">Обратная связь</Title>

      {/* Статистика */}
      {stats && (
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Paper 
            withBorder 
            p="md" 
            radius="md"
            style={{
              background: 'var(--theme-bg-elevated)',
              borderColor: 'var(--theme-border-primary)'
            }}
          >
            <Group justify="space-between">
              <div>
                <Text size="sm" c="var(--theme-text-secondary)" mb={4}>
                  Всего сообщений
                </Text>
                <Text size="xl" fw={700} c="var(--theme-text-primary)">
                  {stats.total}
                </Text>
              </div>
              <IconMail size={32} color="var(--color-primary-500)" />
            </Group>
          </Paper>
          <Paper 
            withBorder 
            p="md" 
            radius="md"
            style={{
              background: 'var(--theme-bg-elevated)',
              borderColor: 'var(--theme-border-primary)'
            }}
          >
            <Group justify="space-between">
              <div>
                <Text size="sm" c="var(--theme-text-secondary)" mb={4}>
                  Непрочитанных
                </Text>
                <Text size="xl" fw={700} c="var(--color-red-500)">
                  {stats.unread}
                </Text>
              </div>
              <IconMail size={32} color="var(--color-red-500)" />
            </Group>
          </Paper>
          <Paper 
            withBorder 
            p="md" 
            radius="md"
            style={{
              background: 'var(--theme-bg-elevated)',
              borderColor: 'var(--theme-border-primary)'
            }}
          >
            <Group justify="space-between">
              <div>
                <Text size="sm" c="var(--theme-text-secondary)" mb={4}>
                  Прочитанных
                </Text>
                <Text size="xl" fw={700} c="var(--color-green-500)">
                  {stats.read}
                </Text>
              </div>
              <IconMailOpened size={32} color="var(--color-green-500)" />
            </Group>
          </Paper>
        </SimpleGrid>
      )}

      {/* Вкладки по инструментам */}
      <Tabs value={activeTab} onChange={(value) => {
        setActiveTab(value || 'all');
        setPage(1);
      }}>
        <Tabs.List>
          <Tabs.Tab value="all">
            Все ({stats?.total || 0})
          </Tabs.Tab>
          {availableTools.map(tool => (
            <Tabs.Tab key={tool} value={tool}>
              {getToolLabel(tool)} ({stats?.byTool?.[tool]?.total || 0})
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

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
      <Paper 
        withBorder 
        p="md" 
        radius="md"
        style={{
          background: 'var(--theme-bg-elevated)',
          borderColor: 'var(--theme-border-primary)'
        }}
      >
        <ScrollArea>
          <Table className="feedback-container">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Инструмент</Table.Th>
                <Table.Th>Пользователь</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Сообщение</Table.Th>
                <Table.Th>Фото</Table.Th>
                <Table.Th>Дата</Table.Th>
                <Table.Th>Приоритет</Table.Th>
                <Table.Th>Статус</Table.Th>
                <Table.Th>Действия</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {feedbacks.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={9}>
                    <Text c="var(--theme-text-secondary)" ta="center" py="xl">
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
                      <Badge variant="light" color="blue">
                        {getToolLabel(feedback.tool)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <IconUser size={16} />
                        <Text size="sm" fw={feedback.isRead ? 400 : 600} c="var(--theme-text-primary)">
                          {getUserName(feedback)}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="var(--theme-text-primary)">{feedback.email}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="var(--theme-text-primary)" lineClamp={2}>
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
                        <Text size="sm" c="var(--theme-text-secondary)">
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
                <Badge variant="light" color="blue">
                  {getToolLabel(selectedFeedback.tool)}
                </Badge>
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
                  <Badge color="green" variant="light" leftSection={<IconCheck size={12} />}
                  >
                    Прочитано
                  </Badge>
                ) : (
                  <Badge color="red" variant="light" leftSection={<IconX size={12} />}
                  >
                    Не прочитано
                  </Badge>
                )}
              </Group>
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
                  backgroundColor: 'var(--theme-bg-elevated)',
                  borderColor: 'var(--theme-border-primary)',
                  color: 'var(--theme-text-primary)'
                }}
              >
                <Text 
                  size="sm" 
                  c="var(--mantine-color-text)" 
                  style={{ whiteSpace: 'pre-wrap' }}
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
                    let photoPath: string;
                    if (selectedFeedback.tool === 'merch') {
                      // Для merch бота фото теперь в public/retail/merch (старые add/merch обрабатывает бэкенд)
                      photoPath = photo.startsWith('http') 
                        ? photo 
                        : `${API}/public/retail/merch/${photo}`;
                    } else {
                      // Для остальных инструментов фото в public/feedback/
                      photoPath = photo.startsWith('http') 
                        ? photo 
                        : `${API}/public/feedback/${photo}`;
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
    </Box>
  );
}

export default FeedbackModule;

