import { useState, useEffect } from 'react';
import { API } from '../config/constants';
import { User } from '../contexts/UserContext';
import { formatName, truncateText } from '../utils/format';
import { 
  Button, 
  Modal, 
  TextInput, 
  Title, 
  Text, 
  Group, 
  ActionIcon,
  Box,
  LoadingOverlay,
  ThemeIcon
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useUserContext } from '../hooks/useUserContext';
import dayjs from 'dayjs';
import TiptapEditor from '../utils/editor';
import { IconNews, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import './styles/News.css'
import { useThemeContext } from '../hooks/useThemeContext';

type News = {
  id: string;
  name: string;
  description: string;
  userId: string;
  createdAt: Date;
  user: User;
};

export default function NewsList() {
  const { user } = useUserContext();
  const { isDark } = useThemeContext()
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNews, setSelectedNews] = useState<News | null>(null);
  const [newsForm, setNewsForm] = useState({
    name: '',
    description: '',
  });

  const [viewModalOpened, { open: openViewModal, close: closeViewModal }] = useDisclosure(false);
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const response = await fetch(`${API}/news`);
        const data = await response.json();
        setNews(data);
      } catch (err) {
        console.error('Failed to load news:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchNews();
  }, []);

  const handleViewNews = (item: News) => {
    setSelectedNews(item);
    openViewModal();
  };

  const handleEditNews = (item: News, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNews(item);
    setNewsForm({ name: item.name, description: item.description });
    openEditModal();
  };

  const handleDeleteNews = (item: News, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNews(item);
    openDeleteModal();
  };

  const handleDeleteConfirm = async () => {
    if (!selectedNews) return;
    try {
      await fetch(`${API}/news/${selectedNews.id}`, { method: 'DELETE' });
      setNews(news.filter(item => item.id !== selectedNews.id));
      closeDeleteModal();
    } catch (err) {
      console.error('Failed to delete news:', err);
    }
  };

  const handleCreateNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const response = await fetch(`${API}/news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...newsForm, 
          userId: user.id
        }),
      });
      const newNews = await response.json();
      if(response.ok) {
        setNews([newNews, ...news]);
        closeCreateModal();
      }
    } catch (err) {
      console.error('Failed to create news:', err);
    }
  };

  const handleEditNewsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNews) return;
    try {
      await fetch(`${API}/news/${selectedNews.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newsForm),
      });
      setNews(news.map(item => 
        item.id === selectedNews.id ? { ...item, ...newsForm } : item
      ));
      closeEditModal();
    } catch (err) {
      console.error('Failed to edit news:', err);
    }
  };

  if (loading) {
    return <LoadingOverlay visible />;
  }

  return (
    <Box p="md">
      <Button 
        leftSection={<IconPlus size={18} />}
        variant="light"
        onClick={() => {
          setNewsForm({ name: '', description: '' });
          openCreateModal();
        }}
      >
        Добавить новость
      </Button>
        <Group gap="xs">
          <ThemeIcon variant="light" color="blue" size="lg" radius="xl">
            <IconNews size={18} />
          </ThemeIcon>
          <Title order={2} mt="md" mb="lg">Последние новости</Title>
        </Group>
      {news.length === 0 ? (
        <Text color="dimmed">Пока нет новостей</Text>
      ) : (
        
        <Box style={{ display: 'flex', flexDirection:'column', gap: 15, overflow: 'auto', height:'540px'}}>
          {news.map(newsItem => (
            <Box
              key={newsItem.id}
              p="md"
              style={{
                borderRadius: '10px',
                backgroundColor: isDark ? '#2A2D35' : '#ffffff',
                cursor: 'pointer',
                '&:hover': {
                  backgroundColor: '#3b2121',
                },
              }}
              onClick={() => handleViewNews(newsItem)}
            >
              <Group justify="space-between" mb="xs">
                <Title order={4} style={{ 
                  flex: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontSize:32
                }}>
                  {newsItem.name}
                </Title>
                <Text size="sm" c="dimmed" bg="rgba(255, 255, 255, 0.1)" px="sm" py="xs" style={{ borderRadius: '10px' }}>
                  {dayjs(newsItem.createdAt).format('D MMMM YYYY')}
                </Text>
              </Group>
              <Text size="xm" c="gray" lineClamp={2} mb="xs">
                {truncateText(newsItem.description, 200)}
              </Text>
              <Group justify="space-between" pt="sm" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <Text size="xs" c="dimmed" fs="italic">
                  {formatName(newsItem.user.name)}
                </Text>
                <Group gap="xs">
                  <ActionIcon 
                    color="blue" 
                    variant="subtle"
                    onClick={(e) => handleEditNews(newsItem, e)}
                  >
                    <IconPencil size={18} />
                  </ActionIcon>
                  <ActionIcon 
                    color="red" 
                    variant="subtle"
                    onClick={(e) => handleDeleteNews(newsItem, e)}
                  >
                    <IconTrash size={18} />
                  </ActionIcon>
                </Group>
              </Group>
            </Box>
          ))}
        </Box>
      )}
      <Modal
        opened={viewModalOpened}
        onClose={closeViewModal}
        size="xl"
        radius="md"
      >
        {selectedNews && (
          <>
            <Modal.Header>
              <Modal.Title style={{ fontSize: '2.5rem', margin:10 }}>{selectedNews.name}</Modal.Title> {/* [[2]] */}
            </Modal.Header>
            <Modal.Body>
              <div dangerouslySetInnerHTML={{ __html: selectedNews.description }} />
              <Group justify="space-between" mt="xl">
                <Text size="sm" c="dimmed">
                  Автор: {formatName(selectedNews.user.name)}
                </Text>
                <Text size="sm" c="dimmed">
                  Дата: {dayjs(selectedNews.createdAt).format('D MMMM YYYY HH:mm')}
                </Text>
              </Group>
            </Modal.Body>
          </>
        )}
      </Modal>
      <Modal
        opened={editModalOpened}
        onClose={closeEditModal}
        title="Редактировать новость"
        size="xl"
        radius="md"
      >
        <form onSubmit={handleEditNewsSubmit}>
          <TextInput
            label="Название"
            value={newsForm.name}
            onChange={(e) => setNewsForm({...newsForm, name: e.target.value})}
            required
            mb="md"
          />
          <TiptapEditor
            content={newsForm.description}
            onChange={(content) => setNewsForm({...newsForm, description: content})}
          />
          <Button type="submit" fullWidth mt="xl">
            Сохранить изменения
          </Button>
        </form>
      </Modal>
      <Modal
        opened={createModalOpened}
        onClose={closeCreateModal}
        title="Добавить новость"
        size="xl"
        radius="md"
      >
        <form onSubmit={handleCreateNews}>
          <TextInput
            label="Название"
            value={newsForm.name}
            onChange={(e) => setNewsForm({...newsForm, name: e.target.value})}
            required
            mb="md"
          />
          <TiptapEditor
            content={newsForm.description}
            onChange={(content) => setNewsForm({...newsForm, description: content})}
          />
          <Button type="submit" fullWidth mt="xl">
            Создать новость
          </Button>
        </form>
      </Modal>
      <Modal
        opened={deleteModalOpened}
        onClose={closeDeleteModal}
        title="Подтверждение удаления"
        size="sm"
        radius="md"
      >
        <Text mb="xl">Вы уверены, что хотите удалить новость "{selectedNews?.name}"?</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={closeDeleteModal}>
            Отмена
          </Button>
          <Button color="red" onClick={handleDeleteConfirm}>
            Удалить
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}