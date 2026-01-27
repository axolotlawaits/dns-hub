import { useState, useEffect } from 'react';
import {
  Tabs,
  Text,
  Badge,
  Group,
  Stack,
  Paper,
  Button,
  Select,
  Grid
} from '@mantine/core';
import { IconUser, IconBook, IconHistory, IconMessageCircle } from '@tabler/icons-react';
import { API } from '../../../../config/constants';
import dayjs from 'dayjs';
import Comment from '../../../../utils/Comment';
import { CustomModal } from '../../../../utils/CustomModal';

interface ManagerCardProps {
  manager: any;
  onRefresh: () => void;
}

function ManagerCard({ manager, onRefresh }: ManagerCardProps) {
  const [activeTab, setActiveTab] = useState<string | null>('info');
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchManagerDetails();
  }, [manager.id]);

  const fetchManagerDetails = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/training/managers/${manager.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Ошибка загрузки данных');
      }

      const data = await response.json();
      setDetails(data);
    } catch (error) {
      console.error('Ошибка при загрузке деталей:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProgress = async (programId: string, statusId: string, completionDate?: Date) => {
    try {
      const response = await fetch(`${API}/training/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          managerId: manager.id,
          trainingProgramId: programId,
          statusId,
          completionDate: completionDate?.toISOString()
        })
      });

      if (!response.ok) {
        throw new Error('Ошибка обновления');
      }

      await fetchManagerDetails();
      onRefresh();
    } catch (error) {
      console.error('Ошибка при обновлении прогресса:', error);
    }
  };

  // Функции для работы с комментариями через универсальный компонент
  const fetchTrainingComments = async (entityId: string, page?: number, limit?: number) => {
    const response = await fetch(`${API}/comments?entityType=TRAINING_MANAGER&entityId=${entityId}&page=${page || 1}&limit=${limit || 20}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    if (!response.ok) {
      throw new Error('Ошибка загрузки комментариев');
    }
    const data = await response.json();
    return {
      comments: data.comments.map((c: any) => ({
        id: c.id,
        content: c.message,
        entityId: c.entityId,
        senderId: c.senderId,
        parentId: c.parentId,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        user: c.sender,
        sender: c.sender,
        replies: c.replies?.map((r: any) => ({
          id: r.id,
          content: r.message,
          senderId: r.senderId,
          parentId: r.parentId,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          user: r.sender,
          sender: r.sender
        })) || []
      })),
      total: data.pagination.total,
      page: data.pagination.page,
      totalPages: data.pagination.totalPages
    };
  };

  const createTrainingComment = async (entityId: string, content: string, parentId?: string | null) => {
    const response = await fetch(`${API}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        entityType: 'TRAINING_MANAGER',
        entityId,
        message: content,
        parentId: parentId || null
      })
    });
    if (!response.ok) {
      throw new Error('Ошибка создания комментария');
    }
    const comment = await response.json();
    return {
      id: comment.id,
      content: comment.message,
      entityId: comment.entityId,
      senderId: comment.senderId,
      parentId: comment.parentId,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      user: comment.sender,
      sender: comment.sender
    };
  };

  const updateTrainingComment = async (commentId: string, content: string) => {
    const response = await fetch(`${API}/comments/${commentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ message: content })
    });
    if (!response.ok) {
      throw new Error('Ошибка обновления комментария');
    }
    const comment = await response.json();
    return {
      id: comment.id,
      content: comment.message,
      entityId: comment.entityId,
      senderId: comment.senderId,
      parentId: comment.parentId,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      user: comment.sender,
      sender: comment.sender
    };
  };

  const deleteTrainingComment = async (commentId: string) => {
    const response = await fetch(`${API}/comments/${commentId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    if (!response.ok) {
      throw new Error('Ошибка удаления комментария');
    }
  };

  if (loading || !details) {
    return <Text>Загрузка...</Text>;
  }

  return (
    <Tabs value={activeTab} onChange={setActiveTab}>
      <Tabs.List>
        <Tabs.Tab value="info" leftSection={<IconUser size={16} />}>
          Информация
        </Tabs.Tab>
        <Tabs.Tab value="training" leftSection={<IconBook size={16} />}>
          Обучение
        </Tabs.Tab>
        <Tabs.Tab value="history" leftSection={<IconHistory size={16} />}>
          История
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="info" pt="md">
        <Stack>
          <Paper p="md">
            <Text fw={600} mb="md">Основная информация</Text>
            <Group mb="xs">
              <Text size="sm" c="dimmed">Email:</Text>
              <Text size="sm">{details.user?.email}</Text>
            </Group>
            <Group mb="xs">
              <Text size="sm" c="dimmed">Должность:</Text>
              <Text size="sm">{details.userData?.position?.name || details.user?.position}</Text>
            </Group>
            <Group mb="xs">
              <Text size="sm" c="dimmed">Филиал:</Text>
              <Text size="sm">{details.userData?.branch?.name || details.user?.branch}</Text>
            </Group>
            <Group mb="xs">
              <Text size="sm" c="dimmed">РРС:</Text>
              <Text size="sm">{details.userData?.branch?.rrs || '-'}</Text>
            </Group>
            <Group mb="xs">
              <Text size="sm" c="dimmed">Статус:</Text>
              <Badge color={details.status === 'ACTIVE' ? 'green' : details.status === 'DEMOTED' ? 'orange' : 'red'}>
                {details.status === 'ACTIVE' ? 'Действующий' : details.status === 'DEMOTED' ? 'Понижен' : 'Уволен'}
              </Badge>
            </Group>
          </Paper>
        </Stack>
      </Tabs.Panel>

      <Tabs.Panel value="training" pt="md">
        <Grid>
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Stack>
              <Text fw={600} mb="md">Обязательные модули</Text>
              {details.trainingProgress
                ?.filter((tp: any) => tp.trainingProgram.type?.name === 'ОБЯЗАТЕЛЬНЫЙ_МОДУЛЬ')
                .map((tp: any) => (
                  <Paper key={tp.id} p="md">
                    <Group justify="space-between" mb="xs">
                      <Text fw={500}>{tp.trainingProgram.name}</Text>
                      <Select
                        value={tp.statusId}
                        onChange={(value) => value && handleUpdateProgress(tp.trainingProgramId, value)}
                        data={[
                          // Здесь нужно будет загрузить статусы из API
                          { value: tp.statusId, label: tp.status?.name || 'Не начал' }
                        ]}
                        size="xs"
                      />
                    </Group>
                    {tp.completionDate && (
                      <Text size="xs" c="dimmed">
                        Дата завершения: {dayjs(tp.completionDate).format('DD.MM.YYYY')}
                      </Text>
                    )}
                  </Paper>
                ))}

              <Text fw={600} mb="md" mt="lg">Дополнительные программы</Text>
              {details.trainingProgress
                ?.filter((tp: any) => tp.trainingProgram.type?.name === 'ДОП_ПРОГРАММА')
                .map((tp: any) => (
                  <Paper key={tp.id} p="md">
                    <Group justify="space-between" mb="xs">
                      <Text fw={500}>{tp.trainingProgram.name}</Text>
                      <Select
                        value={tp.statusId}
                        onChange={(value) => value && handleUpdateProgress(tp.trainingProgramId, value)}
                        data={[
                          { value: tp.statusId, label: tp.status?.name || 'Не начал' }
                        ]}
                        size="xs"
                      />
                    </Group>
                    {tp.completionDate && (
                      <Text size="xs" c="dimmed">
                        Дата завершения: {dayjs(tp.completionDate).format('DD.MM.YYYY')}
                      </Text>
                    )}
                  </Paper>
                ))}
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Paper p="md" withBorder>
              <Comment
                entityId={manager.id}
                entityType="TRAINING_MANAGER"
                fetchComments={fetchTrainingComments}
                createComment={createTrainingComment}
                updateComment={updateTrainingComment}
                deleteComment={deleteTrainingComment}
                height={400}
              />
            </Paper>
          </Grid.Col>
        </Grid>
      </Tabs.Panel>

      <Tabs.Panel value="history" pt="md">
        <Stack>
          {details.employmentHistory?.map((history: any) => (
            <Paper key={history.id} p="md">
              <Group justify="space-between" mb="xs">
                <Text fw={500}>
                  {history.changeType?.name === 'HIRE' ? 'Назначение' :
                   history.changeType?.name === 'TRANSFER' ? 'Перевод' :
                   history.changeType?.name === 'DEMOTION' ? 'Понижение' :
                   history.changeType?.name === 'TERMINATION' ? 'Увольнение' :
                   history.changeType?.name || 'Изменение'}
                </Text>
                <Text size="xs" c="dimmed">
                  {dayjs(history.changeDate).format('DD.MM.YYYY')}
                </Text>
              </Group>
              {history.notes && (
                <Text size="sm" c="dimmed">{history.notes}</Text>
              )}
            </Paper>
          ))}
        </Stack>
      </Tabs.Panel>
    </Tabs>
  );
}

export default ManagerCard;
