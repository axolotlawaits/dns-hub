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
  FeedbackStats
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
      const data = await fetchFeedback(page, limit, isReadFilter, tool);
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
    <Stack gap="md">
      <Title order={2}>Обратная связь</Title>

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
              <IconMail size={32} color="var(--mantine-color-blue-6)" />
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
      <Paper withBorder p="md" radius="md">
        <ScrollArea>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ color: 'var(--mantine-color-text)' }}>Инструмент</Table.Th>
                <Table.Th style={{ color: 'var(--mantine-color-text)' }}>Пользователь</Table.Th>
                <Table.Th style={{ color: 'var(--mantine-color-text)' }}>Email</Table.Th>
                <Table.Th style={{ color: 'var(--mantine-color-text)' }}>Сообщение</Table.Th>
                <Table.Th style={{ color: 'var(--mantine-color-text)' }}>Фото</Table.Th>
                <Table.Th style={{ color: 'var(--mantine-color-text)' }}>Дата</Table.Th>
                <Table.Th style={{ color: 'var(--mantine-color-text)' }}>Статус</Table.Th>
                <Table.Th style={{ color: 'var(--mantine-color-text)' }}>Действия</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {feedbacks.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={8}>
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
                      <Badge variant="light" color="blue">
                        {getToolLabel(feedback.tool)}
                      </Badge>
                    </Table.Td>
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
                      {feedback.isRead ? (
                        <Badge color="green" variant="filled" leftSection={<IconCheck size={12} />}>
                          Прочитано
                        </Badge>
                      ) : (
                        <Badge color="red" variant="filled" leftSection={<IconX size={12} />}>
                          Непрочитано
                        </Badge>
                      )}
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
              {selectedFeedback.isRead ? (
                <Badge color="green" variant="filled">
                  Прочитано
                </Badge>
              ) : (
                <Badge color="red" variant="filled">
                  Непрочитано
                </Badge>
              )}
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
                  backgroundColor: 'var(--mantine-color-body)',
                  color: 'var(--mantine-color-text)'
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
                      // Для merch бота фото могут быть в разных местах
                      photoPath = photo.startsWith('http') 
                        ? photo 
                        : `${API}/public/add/merch/${photo}`;
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
  );
}

export default FeedbackModule;

