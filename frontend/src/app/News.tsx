import { useState, useEffect, useRef } from 'react';
import { API } from '../config/constants';
import { User } from '../contexts/UserContext';
import { formatName, truncateText } from '../utils/format';
import { 
  Modal, 
  TextInput, 
  Text, 
  Group, 
  ActionIcon, 
  Box, 
  LoadingOverlay, 
  ThemeIcon,
  Avatar, 
  Divider,
  Card,
  Stack,
  Title,
  Button
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useUserContext } from '../hooks/useUserContext';
import dayjs from 'dayjs';
import TiptapEditor from '../utils/editor';
import { IconPencil, IconTrash, IconChevronRight, IconNews } from '@tabler/icons-react';
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
    userId: user?.id || '',
  });
  const [visibleCount, setVisibleCount] = useState(3);
  const containerRef = useRef<HTMLDivElement>(null);

  const [viewModalOpened, { open: openViewModal, close: closeViewModal }] = useDisclosure(false);
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [createModalOpened, { close: closeCreateModal }] = useDisclosure(false);
  const [deleteModalOpened, { close: closeDeleteModal }] = useDisclosure(false);
  const [allNewsModalOpened, { open: openAllNewsModal, close: closeAllNewsModal }] = useDisclosure(false);

  const calculateVisibleCount = () => {
    if (!containerRef.current) return;

    const containerWidth = containerRef.current.offsetWidth;
    const cardWidth = 280 + 16; // Ширина карточки + отступ
    const allNewsCardWidth = 280 + 16; // Ширина карточки "Все новости" + отступ

    // Вычисляем сколько карточек помещается (минус место для карточки "Все новости")
    const count = Math.floor((containerWidth - allNewsCardWidth) / cardWidth);

    // Минимум 1 карточка должна быть видна
    setVisibleCount(Math.max(1, count));
  };

  useEffect(() => {
    calculateVisibleCount();
    window.addEventListener('resize', calculateVisibleCount);
    return () => window.removeEventListener('resize', calculateVisibleCount);
  }, []);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API}/news`);
        if (!response.ok) {
          throw new Error('Ошибка загрузки новостей');
        }
        const data = await response.json();
        setNews(data);
      } catch (error) {
        console.error('Ошибка загрузки новостей:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
  }, []);

  const handleCreateNews = async () => {
    try {
      const response = await fetch(`${API}/news`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newsForm),
      });

      if (!response.ok) {
        throw new Error('Ошибка создания новости');
      }

      const newNews = await response.json();
        setNews([newNews, ...news]);
      setNewsForm({ name: '', description: '', userId: user?.id || '' });
        closeCreateModal();
    } catch (error) {
      console.error('Ошибка создания новости:', error);
    }
  };

  const handleUpdateNews = async () => {
    if (!selectedNews) return;

    try {
      const response = await fetch(`${API}/news/${selectedNews.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newsForm),
      });

      if (!response.ok) {
        throw new Error('Ошибка обновления новости');
      }

      const updatedNews = await response.json();
      setNews(news.map(n => n.id === selectedNews.id ? updatedNews : n));
      setSelectedNews(null);
      setNewsForm({ name: '', description: '', userId: user?.id || '' });
      closeEditModal();
    } catch (error) {
      console.error('Ошибка обновления новости:', error);
    }
  };

  const handleRemoveNews = async () => {
    if (!selectedNews) return;

    try {
      const response = await fetch(`${API}/news/${selectedNews.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Ошибка удаления новости');
      }

      setNews(news.filter(n => n.id !== selectedNews.id));
      setSelectedNews(null);
      closeDeleteModal();
    } catch (error) {
      console.error('Ошибка удаления новости:', error);
    }
  };

  const handleEditNews = (newsItem: News) => {
    setSelectedNews(newsItem);
    setNewsForm({
      name: newsItem.name,
      description: newsItem.description,
      userId: user?.id || '',
    });
    openEditModal();
  };


  const handleViewNews = (newsItem: News) => {
    setSelectedNews(newsItem);
    openViewModal();
  };

  const visibleNews = news.slice(0, visibleCount);

  return (
    <Box className="news-widget">
      <LoadingOverlay visible={loading} />
      
      <Group gap="sm" mb="md">
        <ThemeIcon size="md" color="blue" variant="light">
          <IconNews size={20} />
        </ThemeIcon>
        <Text size="lg" fw={600}>
          Новости
        </Text>
      </Group>
      
      <Stack gap="md" ref={containerRef}>
        {visibleNews.map((newsItem) => (
          <Card
            key={newsItem.id}
            shadow="sm"
            radius="md"
            padding="md"
            style={{ 
              background: 'var(--theme-bg-elevated)',
              color: 'var(--theme-text-primary)',
              cursor: 'pointer',
              border: '1px solid var(--theme-border-primary)'
            }}
            onClick={() => handleViewNews(newsItem)}
          >
            <Group justify="space-between" align="flex-start">
              <Box style={{ flex: 1 }}>
                <Text size="lg" fw={600} mb="xs">
                  {newsItem.name}
                </Text>
                <Text size="sm" opacity={0.9} mb="sm">
                  {truncateText(newsItem.description, 120)}
                </Text>
                <Text size="xs" opacity={0.7}>
                  {dayjs(newsItem.createdAt).format('DD.MM.YYYY')}
                </Text>
              </Box>
              <ActionIcon variant="subtle" color="var(--theme-text-secondary)" size="sm">
                <IconChevronRight size={16} />
              </ActionIcon>
            </Group>
          </Card>
        ))}
      </Stack>
      
      {news.length > visibleCount && (
        <Group gap="sm">
          <Card
            className="all-news-card"
            shadow="sm"
            radius="md"
            padding="md"
            onClick={openAllNewsModal}
            style={{ flex: 1 }}
          >
            <Group justify="center" align="center">
              <ThemeIcon size="md" color="blue" variant="light">
                <IconChevronRight size={20} />
              </ThemeIcon>
              <Text size="sm" fw={500} c="var(--theme-text-primary)">
                Показать все новости
              </Text>
              <Text size="xs" c="var(--theme-text-secondary)">
                +{news.length - visibleCount}
              </Text>
            </Group>
          </Card>
        </Group>
      )}

      {/* Модальные окна */}
      <Modal
        opened={viewModalOpened}
        onClose={closeViewModal}
        title="Просмотр новости"
        size="lg"
        className="form-modal"
        centered
        overlayProps={{
          backgroundOpacity: 0.5,
        }}
        withCloseButton
        closeOnClickOutside
        closeOnEscape
      >
        {selectedNews && (
          <Stack gap="md">
            <Title order={3}>{selectedNews.name}</Title>
            <div dangerouslySetInnerHTML={{ __html: selectedNews.description }} />
            <Divider />
            <Group justify="space-between">
              <Group gap="sm">
                <Avatar size="sm" src={selectedNews.user.image} name={selectedNews.user.name} />
                <Box>
                  <Text size="sm" fw={500}>{formatName(selectedNews.user.name)}</Text>
                  <Text size="xs" c="var(--theme-text-tertiary)">
                    {dayjs(selectedNews.createdAt).format('DD.MM.YYYY HH:mm')}
                  </Text>
                </Box>
              </Group>
              {user?.id === selectedNews.userId && (
                <Group gap="xs">
                  <ActionIcon
                    variant="subtle"
                    color="blue"
                    onClick={() => handleEditNews(selectedNews)}
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={handleRemoveNews}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              )}
                  </Group>
          </Stack>
        )}
      </Modal>

      <Modal
        opened={createModalOpened}
        onClose={closeCreateModal}
        title="Создать новость"
        size="lg"
        className="form-modal"
        centered
        overlayProps={{
          backgroundOpacity: 0.5,
        }}
        withCloseButton
        closeOnClickOutside
        closeOnEscape
      >
        <Stack gap="md">
          <TextInput
            label="Заголовок"
            value={newsForm.name}
            onChange={(e) => setNewsForm({ ...newsForm, name: e.target.value })}
            placeholder="Введите заголовок новости"
          />
          <Box>
            <Text size="sm" fw={500} mb="xs">Описание</Text>
            <TiptapEditor
              content={newsForm.description}
              onChange={(content) => setNewsForm({ ...newsForm, description: content })}
            />
          </Box>
          <Group justify="flex-end">
            <Button variant="outline" onClick={closeCreateModal}>
              Отмена
            </Button>
            <Button onClick={handleCreateNews}>
              Создать
            </Button>
              </Group>
        </Stack>
      </Modal>

      <Modal
        opened={editModalOpened}
        onClose={closeEditModal}
        title="Редактировать новость"
        size="lg"
        className="form-modal"
        centered
        overlayProps={{
          backgroundOpacity: 0.5,
        }}
        withCloseButton
        closeOnClickOutside
        closeOnEscape
      >
        <Stack gap="md">
          <TextInput
            label="Заголовок"
            value={newsForm.name}
            onChange={(e) => setNewsForm({ ...newsForm, name: e.target.value })}
            placeholder="Введите заголовок новости"
          />
          <Box>
            <Text size="sm" fw={500} mb="xs">Описание</Text>
          <TiptapEditor
            content={newsForm.description}
              onChange={(content) => setNewsForm({ ...newsForm, description: content })}
            />
          </Box>
          <Group justify="flex-end">
            <Button variant="outline" onClick={closeEditModal}>
              Отмена
          </Button>
            <Button onClick={handleUpdateNews}>
              Сохранить
          </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={deleteModalOpened}
        onClose={closeDeleteModal}
        title="Удалить новость"
        size="sm"
        className="form-modal delete-mode"
        centered
        overlayProps={{
          backgroundOpacity: 0.5,
        }}
        withCloseButton
        closeOnClickOutside
        closeOnEscape
      >
        <Stack gap="md">
          <Text>Вы уверены, что хотите удалить эту новость?</Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={closeDeleteModal}>
            Отмена
          </Button>
            <Button color="red" onClick={handleRemoveNews}>
            Удалить
          </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={allNewsModalOpened}
        onClose={closeAllNewsModal}
        title="Все новости"
        size="xl"
        className="form-modal"
        centered
        overlayProps={{
          backgroundOpacity: 0.5,
        }}
        withCloseButton
        closeOnClickOutside
        closeOnEscape
      >
        <Stack gap="md">
          {news.map((newsItem) => (
            <Card key={newsItem.id} shadow="sm" radius="md" padding="md">
              <Group justify="space-between" align="flex-start">
                <Box style={{ flex: 1 }}>
                  <Text size="sm" fw={600} mb="xs">{newsItem.name}</Text>
                  <Text size="xs" c="var(--theme-text-secondary)" mb="sm">
                    {truncateText(newsItem.description, 150)}
                  </Text>
                  <Group gap="xs" justify="space-between">
                    <Group gap="xs">
                      <Avatar size="xs" src={newsItem.user.image} name={newsItem.user.name} />
                      <Text size="xs" c="var(--theme-text-tertiary)">
                        {formatName(newsItem.user.name)}
                      </Text>
                    </Group>
                    <Text size="xs" c="var(--theme-text-tertiary)">
                      {dayjs(newsItem.createdAt).format('DD.MM.YYYY')}
                    </Text>
                  </Group>
                </Box>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => handleViewNews(newsItem)}
                >
                  <IconChevronRight size={14} />
                </ActionIcon>
              </Group>
            </Card>
          ))}
        </Stack>
      </Modal>
    </Box>
  );
}