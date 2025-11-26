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
  Button,
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
  IconMailOpened
} from '@tabler/icons-react';
import {
  fetchMerchFeedback,
  markFeedbackAsRead,
  fetchMerchFeedbackStats,
  MerchFeedback,
  MerchFeedbackStats
} from '../../data/MerchFeedbackData';
import './MerchFeedback.css';

function MerchFeedbackComponent() {
  const [feedbacks, setFeedbacks] = useState<MerchFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<MerchFeedbackStats | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [isReadFilter, setIsReadFilter] = useState<boolean | undefined>(undefined);
  const [selectedFeedback, setSelectedFeedback] = useState<MerchFeedback | null>(null);
  const [modalOpened, setModalOpened] = useState(false);

  useEffect(() => {
    loadFeedbacks();
    loadStats();
  }, [page, limit, isReadFilter]);

  const loadFeedbacks = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMerchFeedback(page, limit, isReadFilter);
      setFeedbacks(data.feedbacks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await fetchMerchFeedbackStats();
      setStats(statsData);
    } catch (err) {
      console.error('Ошибка загрузки статистики:', err);
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
    const { firstName, lastName, username } = feedback.user;
    if (firstName || lastName) {
      return `${firstName || ''} ${lastName || ''}`.trim();
    }
    return username ? `@${username}` : `ID: ${feedback.user.userId}`;
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
    <Stack gap="md">
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
                <Table.Th>Пользователь</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Сообщение</Table.Th>
                <Table.Th>Фото</Table.Th>
                <Table.Th>Дата</Table.Th>
                <Table.Th>Статус</Table.Th>
                <Table.Th>Действия</Table.Th>
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
                    style={{
                      cursor: 'pointer',
                      backgroundColor: feedback.isRead ? undefined : 'var(--mantine-color-blue-0)'
                    }}
                    onClick={() => handleOpenModal(feedback)}
                  >
                    <Table.Td>
                      <Group gap="xs">
                        <IconUser size={16} />
                        <Text size="sm" fw={feedback.isRead ? 400 : 600}>
                          {getUserName(feedback)}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{feedback.email}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" lineClamp={2}>
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
                        <Badge color="green" variant="light" leftSection={<IconCheck size={12} />}>
                          Прочитано
                        </Badge>
                      ) : (
                        <Badge color="red" variant="light" leftSection={<IconX size={12} />}>
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
                <IconUser size={20} />
                <Text fw={600}>{getUserName(selectedFeedback)}</Text>
              </Group>
              {selectedFeedback.isRead ? (
                <Badge color="green" variant="light">
                  Прочитано
                </Badge>
              ) : (
                <Badge color="red" variant="light">
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
              <Paper p="md" withBorder radius="md" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {selectedFeedback.text}
                </Text>
              </Paper>
            </div>

            {selectedFeedback.photos.length > 0 && (
              <div>
                <Text size="sm" c="dimmed" mb="xs">Фотографии ({selectedFeedback.photos.length}):</Text>
                <SimpleGrid cols={2} spacing="md">
                  {selectedFeedback.photos.map((photo, index) => {
                    // Определяем путь к фото в зависимости от инструмента
                    const photoPath = selectedFeedback.tool === 'merch' 
                      ? `${API}/public/add/merch/${photo}`
                      : photo.startsWith('http') ? photo : `${API}/public/${photo}`;
                    
                    return (
                      <Image
                        key={index}
                        src={photoPath}
                        alt={`Фото ${index + 1}`}
                        radius="md"
                        fallback="https://via.placeholder.com/300?text=Изображение+не+найдено"
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

