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
  Button,
  Flex
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useUserContext } from '../hooks/useUserContext';
import dayjs from 'dayjs';
import TiptapEditor from '../utils/editor';
import { IconPencil, IconTrash, IconChevronRight, IconNews, IconPlus } from '@tabler/icons-react';
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
  const [visibleCount, setVisibleCount] = useState(4);
  const containerRef = useRef<HTMLDivElement>(null);

  const [viewModalOpened, { open: openViewModal, close: closeViewModal }] = useDisclosure(false);
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);
  const [deleteModalOpened, { close: closeDeleteModal }] = useDisclosure(false);
  const [allNewsModalOpened, { open: openAllNewsModal, close: closeAllNewsModal }] = useDisclosure(false);

  const calculateVisibleCount = () => {
    if (!containerRef.current) return;

    const containerWidth = containerRef.current.offsetWidth;
    const cardSize = 220; // Размер квадратной карточки
    const gap = 16; // Отступ между карточками
    const moreCardSize = 220; // Размер карточки "еще +N"

    // Вычисляем сколько карточек помещается (минус место для карточки "еще +N")
    const availableWidth = containerWidth - moreCardSize - gap;
    const count = Math.floor(availableWidth / (cardSize + gap));

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
      
      <Group gap="sm" mb="md" justify="space-between">
        <Group gap="sm">
          <ThemeIcon size="md" color="blue" variant="light">
            <IconNews size={20} />
          </ThemeIcon>
          <Text size="lg" fw={600}>
            Новости
          </Text>
        </Group>
        {(user?.role === 'DEVELOPER' || user?.role === 'ADMIN') && (
          <Button
            leftSection={<IconPlus size={16} />}
            variant="light"
            color="blue"
            size="sm"
            onClick={() => {
              setNewsForm({ name: '', description: '', userId: user?.id || '' });
              openCreateModal();
            }}
          >
            Добавить новость
          </Button>
        )}
      </Group>
      
      <Flex gap="md" ref={containerRef} wrap="nowrap" style={{ overflowX: 'auto' }}>
        {visibleNews.map((newsItem) => (
          <Card
            key={newsItem.id}
            shadow="sm"
            radius="lg"
            padding="lg"
            style={{ 
              background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, rgba(255, 255, 255, 0.05) 100%)',
              color: 'var(--theme-text-primary)',
              cursor: 'pointer',
              border: '1px solid var(--theme-border-primary)',
              width: '220px',
              height: '220px',
              minWidth: '220px',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              position: 'relative',
              overflow: 'hidden',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.1)'
            }}
            onClick={() => handleViewNews(newsItem)}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-primary-300)';
              e.currentTarget.style.background = 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, rgba(59, 130, 246, 0.08) 100%)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(59, 130, 246, 0.15), 0 4px 10px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--theme-border-primary)';
              e.currentTarget.style.background = 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, rgba(255, 255, 255, 0.05) 100%)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.1)';
            }}
          >
            {/* Декоративный элемент */}
            <Box
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '60px',
                height: '60px',
                background: 'linear-gradient(135deg, var(--color-primary-100) 0%, var(--color-primary-200) 100%)',
                borderRadius: '0 16px 0 60px',
                opacity: 0.3,
                zIndex: 0
              }}
            />
            
            <Stack gap="sm" style={{ height: '100%', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
              <Box>
                <Text 
                  size="sm" 
                  fw={700} 
                  mb="xs"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    lineHeight: 1.3,
                    color: 'var(--theme-text-primary)',
                    fontSize: '14px'
                  }}
                >
                  {newsItem.name}
                </Text>
                <Text 
                  size="xs" 
                  opacity={0.8}
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    lineHeight: 1.4,
                    flex: 1,
                    color: 'var(--theme-text-secondary)',
                    fontSize: '12px'
                  }}
                >
                  {truncateText(newsItem.description.replace(/<[^>]*>/g, ''), 120)}
                </Text>
              </Box>
              
              <Box>
                <Divider 
                  mb="sm" 
                  style={{ 
                    borderColor: 'var(--theme-border-primary)',
                    opacity: 0.3
                  }} 
                />
                <Group justify="space-between" align="center">
                  <Box
                    style={{
                      background: 'linear-gradient(135deg, var(--color-primary-50) 0%, var(--color-primary-100) 100%)',
                      padding: '4px 8px',
                      borderRadius: '12px',
                      border: '1px solid var(--color-primary-200)'
                    }}
                  >
                    <Text size="xs" fw={600} c="var(--color-primary-700)">
                      {dayjs(newsItem.createdAt).format('DD.MM')}
                    </Text>
                  </Box>
                  <ActionIcon 
                    variant="light" 
                    color="blue" 
                    size="sm"
                    style={{
                      background: 'var(--color-primary-100)',
                      border: '1px solid var(--color-primary-200)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <IconChevronRight size={14} />
                  </ActionIcon>
                </Group>
              </Box>
            </Stack>
          </Card>
        ))}
        
        {news.length > visibleCount && (
          <Card
            className="more-news-card"
            shadow="sm"
            radius="lg"
            padding="lg"
            onClick={openAllNewsModal}
            style={{ 
              width: '220px',
              height: '220px',
              minWidth: '220px',
              flexShrink: 0,
              background: 'linear-gradient(135deg, var(--color-primary-50) 0%, var(--color-primary-100) 50%, var(--color-primary-200) 100%)',
              border: '1px solid var(--color-primary-300)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              position: 'relative',
              overflow: 'hidden',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 20px rgba(59, 130, 246, 0.15), 0 1px 3px rgba(59, 130, 246, 0.1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, var(--color-primary-100) 0%, var(--color-primary-200) 50%, var(--color-primary-300) 100%)';
              e.currentTarget.style.borderColor = 'var(--color-primary-400)';
              e.currentTarget.style.boxShadow = '0 12px 30px rgba(59, 130, 246, 0.25), 0 6px 12px rgba(59, 130, 246, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, var(--color-primary-50) 0%, var(--color-primary-100) 50%, var(--color-primary-200) 100%)';
              e.currentTarget.style.borderColor = 'var(--color-primary-300)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(59, 130, 246, 0.15), 0 1px 3px rgba(59, 130, 246, 0.1)';
            }}
          >
            {/* Декоративные элементы */}
            <Box
              style={{
                position: 'absolute',
                top: '-20px',
                right: '-20px',
                width: '80px',
                height: '80px',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.1) 100%)',
                borderRadius: '50%',
                zIndex: 0
              }}
            />
            <Box
              style={{
                position: 'absolute',
                bottom: '-10px',
                left: '-10px',
                width: '60px',
                height: '60px',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.05) 100%)',
                borderRadius: '50%',
                zIndex: 0
              }}
            />
            
            <Stack gap="md" align="center" style={{ position: 'relative', zIndex: 1 }}>
              <ThemeIcon 
                size="xl" 
                color="blue" 
                variant="light"
                style={{
                  background: 'rgba(255, 255, 255, 0.8)',
                  border: '2px solid var(--color-primary-300)',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                  transition: 'all 0.2s ease'
                }}
              >
                <IconPlus size={28} />
              </ThemeIcon>
              <Stack gap="xs" align="center">
                <Text size="sm" fw={700} c="var(--color-primary-800)" ta="center">
                  Еще
                </Text>
                <Text 
                  size="xl" 
                  fw={800} 
                  c="var(--color-primary-700)" 
                  ta="center"
                  style={{
                    textShadow: '0 2px 4px rgba(59, 130, 246, 0.3)',
                    fontSize: '24px'
                  }}
                >
                  +{news.length - visibleCount}
                </Text>
                <Text size="xs" c="var(--color-primary-600)" ta="center" fw={500}>
                  новостей
                </Text>
              </Stack>
            </Stack>
          </Card>
        )}
      </Flex>

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
          <Stack gap="md" p="md">
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
              {((user?.role === 'DEVELOPER' || user?.role === 'ADMIN') || user?.id === selectedNews.userId) && (
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
        <Stack gap="md" p="md">
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
        <Stack gap="md" p="md">
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
        <Stack gap="md" p="md">
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
        <Stack gap="md" p="md">
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