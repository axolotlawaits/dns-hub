import { useState, useEffect, useRef } from 'react';
import { API } from '../config/constants';
import { User } from '../contexts/UserContext';
import { formatName, truncateText } from '../utils/format';
import { Button, Modal, TextInput, Title, Text, Group, ActionIcon, Box, LoadingOverlay, ThemeIcon, Avatar, Flex, Paper, Divider } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useUserContext } from '../hooks/useUserContext';
import dayjs from 'dayjs';
import TiptapEditor from '../utils/editor';
import { IconNews, IconPencil, IconPlus, IconTrash, IconClock } from '@tabler/icons-react';
import './styles/News.css';

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
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNews, setSelectedNews] = useState<News | null>(null);
  const [newsForm, setNewsForm] = useState({
    name: '',
    description: '',
  });
  const [visibleCount, setVisibleCount] = useState(5);
  const containerRef = useRef<HTMLDivElement>(null);

  const [viewModalOpened, { open: openViewModal, close: closeViewModal }] = useDisclosure(false);
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [allNewsModalOpened, { open: openAllNewsModal, close: closeAllNewsModal }] = useDisclosure(false);

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

  useEffect(() => {
    const calculateVisibleCount = () => {
      if (!containerRef.current) return;
      
      const containerWidth = containerRef.current.offsetWidth;
      const cardWidth = 280 + 16; // Ширина карточки + отступ
      const allNewsCardWidth = 280 + 16; // Ширина карточки "Все новости" + отступ
      
      // Вычисляем сколько карточек помещается (минус место для карточки "Все новости")
      const count = Math.floor((containerWidth - allNewsCardWidth) / cardWidth);
      
      // Минимум 1 карточка должна быть видна
      setVisibleCount(Math.max(count, 0));
    };

    calculateVisibleCount();
    window.addEventListener('resize', calculateVisibleCount);
    return () => window.removeEventListener('resize', calculateVisibleCount);
  }, []);

  const groupNewsByMonth = () => {
    const grouped: Record<string, News[]> = {};
    
    news.forEach(item => {
      const monthYear = dayjs(item.createdAt).format('MMMM YYYY');
      if (!grouped[monthYear]) {
        grouped[monthYear] = [];
      }
      grouped[monthYear].push(item);
    });

    return grouped;
  };

  const groupedNews = groupNewsByMonth();

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
    <Box p="md" className="news-page-container">
      <Flex justify="space-between" align="center" mb="xl">
        <Group gap="sm">
          <ThemeIcon variant="light" color="blue" size={36} radius="md">
            <IconNews size={20} />
          </ThemeIcon>
          <Title order={2} fw={600}>Новости</Title>
        </Group>
        <Group>
          <Button 
            leftSection={<IconPlus size={18} />}
            variant="light"
            radius="md"
            onClick={() => {
              setNewsForm({ name: '', description: '' });
              openCreateModal();
            }}
          >
            Новая запись
          </Button>
        </Group>
      </Flex>

      {news.length === 0 ? (
        <Paper withBorder p="xl" radius="md" shadow="none" className="empty-state">
          <Text size="lg" c="dimmed" ta="center">Пока нет новостей</Text>
        </Paper>
      ) : (
        <div className="news-container" ref={containerRef}>
          {news.slice(0, visibleCount).map(newsItem => (
            <Paper
              key={newsItem.id}
              withBorder
              radius="md"
              p="md"
              className="news-item"
              onClick={() => handleViewNews(newsItem)}
            >
              <div className="news-item-content">
                <Text fw={600} size="lg" mb="sm" lineClamp={2}>
                  {newsItem.name}
                </Text>
                
                <Text size="sm" c="dimmed" mb="md" lineClamp={3}>
                  {truncateText(newsItem.description, 200)}
                </Text>
              </div>

              <div className="news-item-footer">
                <Flex justify="space-between" align="center">
                  <Group gap="xs">
                    <Avatar src={`data:image/png;base64,${newsItem.user.image}`} size="sm" color="blue" radius="xl" />
                    <Text size="xs">{formatName(newsItem.user.name)}</Text>
                  </Group>
                  
                  <Group gap="xs">
                    <IconClock size={14} />
                    <Text size="xs">
                      {dayjs(newsItem.createdAt).format('D MMM YYYY')}
                    </Text>
                  </Group>
                </Flex>

                {user?.id === newsItem.userId && (
                  <Flex gap="xs" justify="flex-end" mt="sm">
                    <ActionIcon 
                      variant="subtle"
                      color="blue"
                      radius="md"
                      onClick={(e) => handleEditNews(newsItem, e)}
                    >
                      <IconPencil size={16} />
                    </ActionIcon>
                    <ActionIcon 
                      variant="subtle"
                      color="red"
                      radius="md"
                      onClick={(e) => handleDeleteNews(newsItem, e)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Flex>
                )}
              </div>
            </Paper>
          ))}
          
          {news.length > visibleCount && (
            <Paper
              withBorder
              radius="md"
              p="md"
              className="news-item all-news-card"
              onClick={openAllNewsModal}
            >
              <Flex direction="column" align="center" justify="center" h="100%">
                <IconNews size={40} />
                <Text fw={600} size="lg" mt="md">
                  Все новости
                </Text>
                <Text size="sm" c="dimmed" mt="xs">
                  +{news.length - visibleCount} новостей
                </Text>
              </Flex>
            </Paper>
          )}
        </div>
      )}

      <Modal
        opened={allNewsModalOpened}
        onClose={closeAllNewsModal}
        size="xl"
        radius="md"
        title="Архив новостей"
      >
        <div className="all-news-container">
          {Object.entries(groupedNews).map(([monthYear, newsItems]) => (
            <div key={monthYear} className="news-month-group">
              <Divider 
                my="md" 
                label={
                  <Text fw={600} size="lg">
                    {monthYear}
                  </Text>
                } 
                labelPosition="left"
              />
              
              {newsItems.map(item => (
                <Paper
                  key={item.id}
                  withBorder
                  radius="md"
                  p="md"
                  mb="md"
                  className="news-item-archive"
                  onClick={() => {
                    setSelectedNews(item);
                    closeAllNewsModal();
                    openViewModal();
                  }}
                >
                  <Text fw={600} size="md" mb="xs">
                    {item.name}
                  </Text>
                  <Text size="sm" c="dimmed" lineClamp={1} mb="xs">
                    {truncateText(item.description, 100)}
                  </Text>
                  <Flex justify="space-between" align="center">
                    <Group gap="xs">
                      <Avatar src={`data:image/png;base64,${item.user.image}`} size="sm" color="blue" radius="xl" />
                      <Text size="xs">{formatName(item.user.name)}</Text>
                    </Group>
                    <Group gap="xs">
                      <IconClock size={14} />
                      <Text size="xs">
                        {dayjs(item.createdAt).format('D MMM YYYY')}
                      </Text>
                    </Group>
                  </Flex>
                </Paper>
              ))}
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        opened={viewModalOpened}
        onClose={closeViewModal}
        size="xl"
        radius="md"
        title={
          <Text fw={600} size="xl">
            {selectedNews?.name}
          </Text>
        }
      >
        {selectedNews && (
          <>
            <div 
              className="safe-html-content" 
              dangerouslySetInnerHTML={{ __html: selectedNews.description }} 
            />
            <Flex justify="space-between" mt="xl" c="dimmed">
              <Group gap="xs">
                <Avatar src={`data:image/png;base64,${selectedNews.user.image}`} size="sm" color="blue" radius="xl" />
                <Text size="sm">{formatName(selectedNews.user.name)}</Text>
              </Group>
              <Group gap="xs">
                <IconClock size={16} />
                <Text size="sm">
                  {dayjs(selectedNews.createdAt).format('D MMMM YYYY, HH:mm')}
                </Text>
              </Group>
            </Flex>
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
            radius="md"
          />
          <TiptapEditor
            content={newsForm.description}
            onChange={(content) => setNewsForm({...newsForm, description: content})}
          />
          <Button type="submit" fullWidth mt="xl" radius="md">
            Сохранить изменения
          </Button>
        </form>
      </Modal>

      <Modal
        opened={createModalOpened}
        onClose={closeCreateModal}
        title="Новая новость"
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
            radius="md"
          />
          <TiptapEditor
            content={newsForm.description}
            onChange={(content) => setNewsForm({...newsForm, description: content})}
          />
          <Button type="submit" fullWidth mt="xl" radius="md">
            Опубликовать
          </Button>
        </form>
      </Modal>

      <Modal
        opened={deleteModalOpened}
        onClose={closeDeleteModal}
        title="Удалить новость?"
        size="sm"
        radius="md"
      >
        <Text mb="xl">Вы уверены, что хотите удалить "{selectedNews?.name}"? Это действие нельзя отменить.</Text>
        <Flex justify="flex-end" gap="sm">
          <Button variant="default" onClick={closeDeleteModal} radius="md">
            Отмена
          </Button>
          <Button color="red" onClick={handleDeleteConfirm} radius="md">
            Удалить
          </Button>
        </Flex>
      </Modal>
    </Box>
  );
}