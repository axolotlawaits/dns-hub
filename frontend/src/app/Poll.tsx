import { useState, useEffect, useMemo } from 'react';
import { 
  Box, 
  Text, 
  Card, 
  Stack, 
  Radio, 
  Group, 
  Title,
  LoadingOverlay,
  Alert,
  Button,
  TextInput,
  ActionIcon,
  Modal,
  ScrollArea,
  Badge,
  Divider,
  Progress
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconAlertCircle, IconCheck, IconPlus, IconX, IconHistory, IconRotateClockwise } from '@tabler/icons-react';
import { API } from '../config/constants';
import { useUserContext } from '../hooks/useUserContext';
import { DynamicFormModal, FormField } from '../utils/formModal';
import dayjs from 'dayjs';

interface PollOption {
  id: string;
  text: string;
  votes?: number;
  order?: number;
}

interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  isActive: boolean;
  userVote?: string;
  totalVotes?: number;
  createdAt?: string;
  startDate?: string | null;
  endDate?: string | null;
}

interface HistoryPoll extends Poll {
  createdBy?: {
    id: string;
    name: string;
    email: string;
  };
  updatedAt?: string;
}

export default function Poll() {
  const { token, user } = useUserContext();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Модальное окно создания опроса
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Модальное окно истории опросов
  const [historyModalOpened, setHistoryModalOpened] = useState(false);
  const [historyPolls, setHistoryPolls] = useState<HistoryPoll[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Проверка прав доступа (только DEVELOPER и ADMIN)
  const canCreatePoll = user?.role === 'DEVELOPER' || user?.role === 'ADMIN';

  useEffect(() => {
    loadPolls();
  }, []);

  const loadPolls = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const authToken = token || localStorage.getItem('token');
      const response = await fetch(`${API}/polls/active`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Нет активных опросов - это нормально
          setPolls([]);
          return;
        }
        throw new Error(`Ошибка загрузки опросов: ${response.status}`);
      }

      const data = await response.json();
      setPolls(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading polls:', err);
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      setPolls([]);
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (pollId: string, optionId: string) => {
    try {
      const authToken = token || localStorage.getItem('token');
      const response = await fetch(`${API}/polls/${pollId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ optionId })
      });

      if (!response.ok) {
        throw new Error('Ошибка при голосовании');
      }

      // Получаем обновленные данные опроса из ответа
      const updatedPoll = await response.json();
      
      // Обновляем конкретный опрос в состоянии с полными данными
      setPolls(prevPolls => 
        prevPolls.map(poll => {
          if (poll.id === pollId) {
            // Создаем новый объект опроса с обновленными данными
            return {
              ...poll,
              userVote: updatedPoll.userVote,
              totalVotes: updatedPoll.totalVotes,
              options: updatedPoll.options.map((updatedOpt: PollOption) => ({
                id: updatedOpt.id,
                text: updatedOpt.text,
                votes: updatedOpt.votes,
                order: updatedOpt.order
              }))
            };
          }
          return poll;
        })
      );
    } catch (err) {
      console.error('Error voting:', err);
      setError(err instanceof Error ? err.message : 'Ошибка при голосовании');
      // Перезагружаем опросы в случае ошибки
      await loadPolls();
    }
  };

  const handleDeleteVote = async (pollId: string) => {
    try {
      const authToken = token || localStorage.getItem('token');
      const response = await fetch(`${API}/polls/${pollId}/vote`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Ошибка при отмене голоса');
      }

      // Получаем обновленные данные опроса из ответа
      const updatedPoll = await response.json();
      
      // Обновляем конкретный опрос в состоянии с полными данными
      setPolls(prevPolls => 
        prevPolls.map(poll => {
          if (poll.id === pollId) {
            // Создаем новый объект опроса с обновленными данными
            return {
              ...poll,
              userVote: updatedPoll.userVote,
              totalVotes: updatedPoll.totalVotes,
              options: updatedPoll.options.map((updatedOpt: PollOption) => ({
                id: updatedOpt.id,
                text: updatedOpt.text,
                votes: updatedOpt.votes,
                order: updatedOpt.order
              }))
            };
          }
          return poll;
        })
      );
    } catch (err) {
      console.error('Error deleting vote:', err);
      setError(err instanceof Error ? err.message : 'Ошибка при отмене голоса');
      // Перезагружаем опросы в случае ошибки
      await loadPolls();
    }
  };

  const loadHistoryPolls = async () => {
    try {
      setLoadingHistory(true);
      const authToken = token || localStorage.getItem('token');
      const response = await fetch(`${API}/polls`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Ошибка загрузки истории опросов');
      }

      const data = await response.json();
      setHistoryPolls(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading history polls:', err);
      setError(err instanceof Error ? err.message : 'Ошибка загрузки истории опросов');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Обработчик создания опроса через DynamicFormModal
  const handleCreatePoll = async (values: Record<string, any>) => {
    const options = values.options || [];
    const validOptions = options.filter((opt: string) => opt?.trim());
    
    if (!values.question?.trim() || validOptions.length < 2) {
      setError('Введите вопрос и минимум 2 варианта ответа');
      return;
    }

    // Валидация дат
    if (values.hasDates) {
      if (values.startDate && values.endDate) {
        const start = dayjs(values.startDate);
        const end = dayjs(values.endDate);
        if (start.isAfter(end)) {
          setError('Дата начала должна быть раньше даты окончания');
          return;
        }
      }
    }

    try {
      setCreating(true);
      setError(null);
      
      const authToken = token || localStorage.getItem('token');
      const requestBody: any = {
        question: values.question.trim(),
        options: validOptions
      };

      // Добавляем даты только если они установлены
      if (values.hasDates) {
        if (values.startDate) {
          requestBody.startDate = dayjs(values.startDate).toISOString();
        }
        if (values.endDate) {
          requestBody.endDate = dayjs(values.endDate).toISOString();
        }
      }

      const response = await fetch(`${API}/polls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Ошибка при создании опроса');
      }

      // Закрываем модальное окно
      setCreateModalOpened(false);
      
      // Обновляем список опросов
      await loadPolls();
    } catch (err) {
      console.error('Error creating poll:', err);
      setError(err instanceof Error ? err.message : 'Ошибка при создании опроса');
    } finally {
      setCreating(false);
    }
  };

  // Конфигурация полей для DynamicFormModal
  const pollFormFields = useMemo<FormField[]>(() => [
    {
      name: 'question',
      label: 'Вопрос',
      type: 'text',
      required: true,
      placeholder: 'Введите вопрос опроса'
    },
    {
      name: 'hasDates',
      label: 'Установить даты проведения',
      type: 'boolean',
      required: false
    }
  ], []);

  // Функции для управления вариантами ответа в extraContent
  const addOption = (values: Record<string, any>, setFieldValue: (path: string, val: any) => void) => {
    const currentOptions = values.options || [];
    setFieldValue('options', [...currentOptions, '']);
  };

  const removeOption = (index: number, values: Record<string, any>, setFieldValue: (path: string, val: any) => void) => {
    const currentOptions = values.options || [];
    if (currentOptions.length <= 2) {
      setError('Минимум 2 варианта ответа');
      return;
    }
    setFieldValue('options', currentOptions.filter((_: any, i: number) => i !== index));
  };

  const updateOption = (index: number, value: string, values: Record<string, any>, setFieldValue: (path: string, val: any) => void) => {
    const currentOptions = values.options || [];
    setFieldValue('options', currentOptions.map((opt: string, i: number) => i === index ? value : opt));
  };

  if (loading) {
    return (
      <Box style={{ padding: '0 12px 12px 0', width: '100%', position: 'relative', minHeight: '200px' }}>
        <LoadingOverlay visible={loading} />
      </Box>
    );
  }

  if (error && polls.length === 0) {
    return (
      <Box style={{ padding: '0 12px 12px 0', width: '100%' }}>
        <Alert icon={<IconAlertCircle size={16} />} title="Ошибка" color="red">
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box style={{ padding: '0 12px 12px 0', width: '100%' }}>
      <Group justify="space-between" mb="md">
        <Title order={2}>Опросы</Title>
        <Group gap="xs">
          <Button
            variant="light"
            leftSection={<IconHistory size={18} />}
            onClick={() => {
              setHistoryModalOpened(true);
              loadHistoryPolls();
            }}
          >
            История опросов
          </Button>
          {canCreatePoll && (
            <Button
              leftSection={<IconPlus size={18} />}
              onClick={() => setCreateModalOpened(true)}
            >
              Создать опрос
            </Button>
          )}
        </Group>
      </Group>
      
      {polls.length === 0 && !loading && (
        <Card shadow="sm" radius="md" padding="md">
          <Text c="dimmed" ta="center">Нет активных опросов</Text>
        </Card>
      )}
      <Stack gap="md">
        {polls.map((poll) => {
          const isUnlimited = !poll.startDate && !poll.endDate;
          const startDate = poll.startDate ? dayjs(poll.startDate) : null;
          const endDate = poll.endDate ? dayjs(poll.endDate) : null;
          const hasVoted = !!poll.userVote;
          
          return (
          <Card key={poll.id} shadow="sm" radius="md" padding="md">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <Text fw={600} size="lg">{poll.question}</Text>
                {!isUnlimited && (
                  <Badge variant="light" color="blue" size="sm">
                    {startDate && endDate 
                      ? `${startDate.format('DD.MM')} - ${endDate.format('DD.MM.YYYY')}`
                      : startDate 
                      ? `С ${startDate.format('DD.MM.YYYY')}`
                      : endDate 
                      ? `До ${endDate.format('DD.MM.YYYY')}`
                      : ''}
                  </Badge>
                )}
              </Group>
              
              <Stack gap="sm">
                {poll.options.map((option) => {
                  const isVoted = poll.userVote === option.id;
                  const percentage = poll.totalVotes && poll.totalVotes > 0
                    ? Math.round((option.votes || 0) / poll.totalVotes * 100)
                    : 0;

                  return (
                    <Box key={option.id}>
                      {!hasVoted ? (
                        // До голосования - показываем Radio
                        <Radio
                          label={option.text}
                          value={option.id}
                          checked={false}
                          onChange={() => handleVote(poll.id, option.id)}
                          color="blue"
                          size="md"
                        />
                      ) : (
                        // После голосования - показываем результаты
                        <Box>
                          <Group justify="space-between" mb={4}>
                            <Group gap="xs">
                              {isVoted && <IconCheck size={16} color="green" />}
                              <Text size="sm" fw={isVoted ? 500 : 400}>
                                {option.text}
                              </Text>
                            </Group>
                            <Group gap="xs">
                              <Text size="sm" c="dimmed">
                                {option.votes || 0} голосов
                              </Text>
                              <Badge variant="light" color={isVoted ? 'blue' : 'gray'} size="sm">
                                {percentage}%
                              </Badge>
                            </Group>
                          </Group>
                          <Progress 
                            value={percentage} 
                            color={isVoted ? 'blue' : 'gray'}
                            size="sm"
                            radius="md"
                            mt={4}
                          />
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Stack>
              
              {hasVoted && (
                <Group justify="space-between" mt="sm" pt="sm" style={{ borderTop: '1px solid var(--theme-border)' }}>
                  <Text size="xs" c="dimmed">
                    Всего голосов: {poll.totalVotes || 0}
                  </Text>
                  <Button
                    variant="subtle"
                    size="xs"
                    leftSection={<IconRotateClockwise size={14} />}
                    onClick={() => handleDeleteVote(poll.id)}
                  >
                    Отменить голос
                  </Button>
                </Group>
              )}
            </Stack>
          </Card>
          );
        })}
      </Stack>

      {/* Модальное окно создания опроса */}
      <DynamicFormModal
        opened={createModalOpened}
        onClose={() => {
          setCreateModalOpened(false);
          setError(null);
        }}
        title="Создать опрос"
        mode="create"
        fields={pollFormFields}
        initialValues={{
          question: '',
          options: ['', ''],
          hasDates: false,
          startDate: null,
          endDate: null
        }}
        onSubmit={handleCreatePoll}
        error={error}
        loading={creating}
        extraContent={(values, setFieldValue) => (
          <Box>
            {/* Поля дат (условно отображаются) */}
            {values.hasDates && (
              <Stack gap="md" mb="md">
                <DatePickerInput
                  label="Дата начала"
                  placeholder="Выберите дату начала (необязательно)"
                  value={values.startDate ? dayjs(values.startDate).toDate() : null}
                  onChange={(date) => setFieldValue('startDate', date ? dayjs(date).format('YYYY-MM-DD') : null)}
                  clearable
                />
                <DatePickerInput
                  label="Дата окончания"
                  placeholder="Выберите дату окончания (необязательно)"
                  value={values.endDate ? dayjs(values.endDate).toDate() : null}
                  onChange={(date) => setFieldValue('endDate', date ? dayjs(date).format('YYYY-MM-DD') : null)}
                  clearable
                  minDate={values.startDate ? dayjs(values.startDate).toDate() : undefined}
                />
              </Stack>
            )}
            
            <Group justify="space-between" align="center" mb="xs">
              <Text size="sm" fw={500}>Варианты ответа (минимум 2)</Text>
              <Button
                variant="light"
                size="xs"
                leftSection={<IconPlus size={14} />}
                onClick={() => addOption(values, setFieldValue)}
              >
                Добавить вариант
              </Button>
            </Group>
            <Stack gap="xs">
              {(values.options || []).map((option: string, index: number) => (
                <Group key={index} gap="xs" align="flex-start">
                  <TextInput
                    style={{ flex: 1 }}
                    placeholder={`Вариант ${index + 1}`}
                    value={option || ''}
                    onChange={(e) => updateOption(index, e.target.value, values, setFieldValue)}
                    required
                  />
                  {(values.options || []).length > 2 && (
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      onClick={() => removeOption(index, values, setFieldValue)}
                      mt={4}
                    >
                      <IconX size={18} />
                    </ActionIcon>
                  )}
                </Group>
              ))}
            </Stack>
          </Box>
        )}
      />

      {/* Модальное окно истории опросов */}
      <Modal
        opened={historyModalOpened}
        onClose={() => setHistoryModalOpened(false)}
        title="История опросов"
        size="xl"
      >
        <ScrollArea h={500}>
          {loadingHistory ? (
            <LoadingOverlay visible />
          ) : historyPolls.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              Нет опросов в истории
            </Text>
          ) : (
            <Stack gap="md">
              {historyPolls.map((poll) => {
                const totalVotes = poll.totalVotes || 0;
                return (
                  <Card key={poll.id} shadow="sm" radius="md" padding="md" withBorder>
                    <Group justify="space-between" mb="xs">
                      <Text fw={600}>{poll.question}</Text>
                      <Group gap="xs">
                        <Badge color={poll.isActive ? 'green' : 'gray'} variant="light">
                          {poll.isActive ? 'Активен' : 'Завершен'}
                        </Badge>
                        {poll.startDate || poll.endDate ? (
                          <Badge variant="light" color="blue" size="sm">
                            {poll.startDate && poll.endDate 
                              ? `${dayjs(poll.startDate).format('DD.MM.YYYY')} - ${dayjs(poll.endDate).format('DD.MM.YYYY')}`
                              : poll.startDate 
                              ? `С ${dayjs(poll.startDate).format('DD.MM.YYYY')}`
                              : poll.endDate 
                              ? `До ${dayjs(poll.endDate).format('DD.MM.YYYY')}`
                              : ''}
                          </Badge>
                        ) : (
                          <Badge variant="light" color="gray" size="sm">
                            Бессрочно
                          </Badge>
                        )}
                      </Group>
                    </Group>
                    {poll.createdBy && (
                      <Text size="xs" c="dimmed" mb="xs">
                        Создан: {poll.createdBy.name} {poll.createdAt && `• ${dayjs(poll.createdAt).format('DD.MM.YYYY HH:mm')}`}
                      </Text>
                    )}
                    <Divider my="xs" />
                    <Stack gap="xs">
                      {poll.options.map((option) => {
                        const percentage = totalVotes > 0
                          ? Math.round((option.votes || 0) / totalVotes * 100)
                          : 0;
                        const isVoted = poll.userVote === option.id;
                        return (
                          <Box key={option.id}>
                            <Group justify="space-between" mb={4}>
                              <Group gap="xs">
                                <Text size="sm">{option.text}</Text>
                                {isVoted && <IconCheck size={14} color="green" />}
                              </Group>
                              <Group gap="xs">
                                <Text size="sm" c="dimmed">
                                  {option.votes || 0} голосов ({percentage}%)
                                </Text>
                              </Group>
                            </Group>
                            <Progress 
                              value={percentage} 
                              color={isVoted ? 'blue' : 'gray'}
                              size="sm"
                              radius="md"
                              mt={4}
                            />
                          </Box>
                        );
                      })}
                    </Stack>
                    {totalVotes > 0 && (
                      <Text size="xs" c="dimmed" mt="md" ta="center">
                        Всего голосов: {totalVotes}
                      </Text>
                    )}
                  </Card>
                );
              })}
            </Stack>
          )}
        </ScrollArea>
      </Modal>
    </Box>
  );
}

