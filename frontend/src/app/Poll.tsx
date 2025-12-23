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
  ActionIcon
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconPlus, IconX } from '@tabler/icons-react';
import { API } from '../config/constants';
import { useUserContext } from '../hooks/useUserContext';
import { DynamicFormModal, FormField } from '../utils/formModal';

interface PollOption {
  id: string;
  text: string;
  votes?: number;
}

interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  isActive: boolean;
  userVote?: string;
  totalVotes?: number;
}

export default function Poll() {
  const { token, user } = useUserContext();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Модальное окно создания опроса
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [creating, setCreating] = useState(false);
  
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

      // Обновляем опросы после голосования
      await loadPolls();
    } catch (err) {
      console.error('Error voting:', err);
      setError(err instanceof Error ? err.message : 'Ошибка при голосовании');
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

    try {
      setCreating(true);
      setError(null);
      
      const authToken = token || localStorage.getItem('token');
      const response = await fetch(`${API}/polls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          question: values.question.trim(),
          options: validOptions
        })
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
        {canCreatePoll && (
          <Button
            leftSection={<IconPlus size={18} />}
            onClick={() => setCreateModalOpened(true)}
          >
            Создать опрос
          </Button>
        )}
      </Group>
      
      {polls.length === 0 && !loading && (
        <Card shadow="sm" radius="md" padding="md">
          <Text c="dimmed" ta="center">Нет активных опросов</Text>
        </Card>
      )}
      <Stack gap="md">
        {polls.map((poll) => (
          <Card key={poll.id} shadow="sm" radius="md" padding="md">
            <Text fw={600} mb="md">{poll.question}</Text>
            <Stack gap="xs">
              {poll.options.map((option) => {
                const isVoted = poll.userVote === option.id;
                const percentage = poll.totalVotes && poll.totalVotes > 0
                  ? Math.round((option.votes || 0) / poll.totalVotes * 100)
                  : 0;

                return (
                  <Box key={option.id}>
                    <Group justify="space-between" mb={4}>
                      <Radio
                        label={option.text}
                        value={option.id}
                        checked={isVoted}
                        onChange={() => !poll.userVote && handleVote(poll.id, option.id)}
                        disabled={!!poll.userVote}
                      />
                      {poll.userVote && (
                        <Group gap="xs">
                          <Text size="sm" c="dimmed">
                            {percentage}%
                          </Text>
                          {isVoted && <IconCheck size={16} color="green" />}
                        </Group>
                      )}
                    </Group>
                    {poll.userVote && (
                      <Box
                        style={{
                          height: 8,
                          backgroundColor: 'var(--mantine-color-gray-2)',
                          borderRadius: 4,
                          overflow: 'hidden'
                        }}
                      >
                        <Box
                          style={{
                            height: '100%',
                            width: `${percentage}%`,
                            backgroundColor: isVoted ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-gray-4)',
                            transition: 'width 0.3s ease'
                          }}
                        />
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Stack>
            {poll.userVote && poll.totalVotes && (
              <Text size="xs" c="dimmed" mt="md" ta="center">
                Всего голосов: {poll.totalVotes}
              </Text>
            )}
          </Card>
        ))}
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
          options: ['', '']
        }}
        onSubmit={handleCreatePoll}
        error={error}
        loading={creating}
        extraContent={(values, setFieldValue) => (
          <Box>
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
    </Box>
  );
}

