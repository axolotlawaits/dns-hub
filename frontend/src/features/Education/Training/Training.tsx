import { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Paper, 
  Text, 
  Loader,
  Grid,
  Tabs
} from '@mantine/core';
import { IconBook, IconUsers, IconMessageCircle, IconFolder } from '@tabler/icons-react';
import { usePageHeader } from '../../../contexts/PageHeaderContext';
import { API } from '../../../config/constants';
import ProgramTree from './components/ProgramTree';
import ManagerAttendanceList from './components/ManagerAttendanceList';
import Comment from '../../../utils/Comment';
import './Training.css';

interface TrainingProgram {
  id: string;
  name: string;
  typeId: string;
  parentId: string | null;
  order: number;
  isRequired: boolean;
  children?: TrainingProgram[];
  type?: {
    name: string;
  };
}

function Training() {
  const { setHeader, clearHeader } = usePageHeader();
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setHeader({
      title: 'Управление обучением',
      subtitle: 'Учет прохождения обучения',
      icon: <IconBook size={24} />
    });

    return () => {
      clearHeader();
    };
  }, [setHeader, clearHeader]);

  useEffect(() => {
    fetchPrograms();
  }, []);

  const fetchPrograms = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/training/programs`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Ошибка загрузки данных');
      }

      const data = await response.json();
      setPrograms(data);
    } catch (error) {
      console.error('Ошибка при загрузке программ:', error);
    } finally {
      setLoading(false);
    }
  };

  // Функции для работы с комментариями к программам обучения
  const fetchProgramComments = useCallback(async (entityId: string, page?: number, limit?: number) => {
    const response = await fetch(`${API}/comments?entityType=TRAINING_PROGRAM&entityId=${entityId}&page=${page || 1}&limit=${limit || 20}`, {
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
  }, []);

  const createProgramComment = useCallback(async (entityId: string, content: string, parentId?: string | null) => {
    const response = await fetch(`${API}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        entityType: 'TRAINING_PROGRAM',
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
  }, []);

  const updateProgramComment = useCallback(async (commentId: string, content: string) => {
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
  }, []);

  const deleteProgramComment = useCallback(async (commentId: string) => {
    const response = await fetch(`${API}/comments/${commentId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    if (!response.ok) {
      throw new Error('Ошибка удаления комментария');
    }
  }, []);

  return (
    <Box className="training-container">
      <Paper p="md" style={{ height: 'calc(100vh - 200px)' }}>
        <Grid gutter="md" style={{ height: '100%' }}>
          {/* Левая колонка - Иерархия программ */}
          <Grid.Col span={4}>
            <Paper p="md" style={{ height: '100%', overflow: 'auto' }}>
              <Text size="lg" fw={600} mb="md">
                Программы обучения
              </Text>
              {loading ? (
                <Box style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                  <Loader />
                </Box>
              ) : (
                <ProgramTree
                  programs={programs}
                  selectedProgramId={selectedProgramId}
                  onSelectProgram={setSelectedProgramId}
                  onProgramsChange={fetchPrograms}
                />
              )}
            </Paper>
          </Grid.Col>

          {/* Правая колонка - Список управляющих и комментарии */}
          <Grid.Col span={8}>
            <Paper p="md" style={{ height: '100%', overflow: 'auto' }}>
              {selectedProgramId ? (
                <Tabs defaultValue="managers">
                  <Tabs.List>
                    <Tabs.Tab value="managers" leftSection={<IconUsers size={16} />}>
                      Управляющие
                    </Tabs.Tab>
                    <Tabs.Tab value="children" leftSection={<IconFolder size={16} />}>
                      Дочерние программы
                    </Tabs.Tab>
                    <Tabs.Tab value="comments" leftSection={<IconMessageCircle size={16} />}>
                      Комментарии
                    </Tabs.Tab>
                  </Tabs.List>

                  <Tabs.Panel value="managers" pt="md">
                    <ManagerAttendanceList
                      programId={selectedProgramId}
                      programName={programs.find(p => p.id === selectedProgramId)?.name || ''}
                    />
                  </Tabs.Panel>

                  <Tabs.Panel value="children" pt="md">
                    <ProgramTree
                      programs={programs.find(p => p.id === selectedProgramId)?.children || []}
                      selectedProgramId={null}
                      onSelectProgram={(id) => {
                        // Можно добавить логику выбора дочерней программы
                      }}
                      onProgramsChange={fetchPrograms}
                    />
                  </Tabs.Panel>

                  <Tabs.Panel value="comments" pt="md">
                    <Comment
                      entityId={selectedProgramId}
                      entityType="TRAINING_PROGRAM"
                      fetchComments={fetchProgramComments}
                      createComment={createProgramComment}
                      updateComment={updateProgramComment}
                      deleteComment={deleteProgramComment}
                      height={600}
                    />
                  </Tabs.Panel>
                </Tabs>
              ) : (
                <Box style={{ textAlign: 'center', padding: '40px' }}>
                  <Text c="dimmed" size="lg">
                    Выберите программу обучения слева
                  </Text>
                </Box>
              )}
            </Paper>
          </Grid.Col>
        </Grid>
      </Paper>
    </Box>
  );
}

export default Training;
