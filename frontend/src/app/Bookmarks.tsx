import { useState, useEffect, useCallback } from 'react';
import { API } from '../config/constants';
import {  Box,  Text,  Group,  LoadingOverlay,  ActionIcon,  Modal,  ThemeIcon,  Card,  Badge, Grid, Tooltip, Alert } from '@mantine/core';
import {  IconBookmark,  IconTrash,  IconExternalLink,  IconPlus,  IconX,  IconEdit,  IconGripVertical } from '@tabler/icons-react';
import { useUserContext } from '../hooks/useUserContext';
import { useDisclosure } from '@mantine/hooks';
import { normalizeUrl, isValidUrl } from '../utils/url';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { DynamicFormModal, FormField } from '../utils/formModal';
import { notificationSystem } from '../utils/Push';
import './styles/Bookmarks.css';

interface Bookmark {
  id: string;
  name: string;
  url: string;
  order: number;
  secure?: boolean;
  preview?: string;
}

const DEFAULT_BOOKMARK = { name: '', url: '' };

export default function BookmarksList() {
  const { user } = useUserContext();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [originalBookmarks, setOriginalBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewAllModalOpen, { open: openViewAllModal, close: closeViewAllModal }] = useDisclosure(false);
  const [addModalOpen, { open: openAddModal, close: closeAddModal }] = useDisclosure(false);
  const [editModalOpen, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [deleteModalOpen, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [selectedBookmark, setSelectedBookmark] = useState<Bookmark | null>(null);
  const [newBookmark, setNewBookmark] = useState(DEFAULT_BOOKMARK);
  const [cardsPerRow, setCardsPerRow] = useState<3 | 6 | 9>(6);


  // Конфигурация полей для модальных окон
  const bookmarkFields: FormField[] = [
    {
      name: 'name',
      label: 'Название',
      type: 'text',
      required: true,
      placeholder: 'Введите название закладки'
    },
    {
      name: 'url',
      label: 'URL',
      type: 'text',
      required: true,
      placeholder: 'https://example.com'
    }
  ];



  const fetchBookmarks = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const response = await fetch(`${API}/bookmarks/${user.id}`);
      if (!response.ok) {
        throw new Error('Ошибка загрузки закладок');
      }
      const data = await response.json();
      setBookmarks(data);
      setOriginalBookmarks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  // Загрузка сохраненной настройки количества карточек
  useEffect(() => {
    const loadCardsPerRowSetting = async () => {
      if (!user?.id) return;

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API}/user/settings/${user.id}/bookmarks_cards_per_row`, {
          headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          }
        });
        if (response.ok) {
          const data = await response.json();
          const savedSetting = data.value;
          if (savedSetting && ['3', '6', '9'].includes(savedSetting)) {
            setCardsPerRow(parseInt(savedSetting) as 3 | 6 | 9);
          }
        } else if (response.status === 404) {
          // Если настройка не найдена, используем значение по умолчанию
          console.log('Настройка bookmarks_cards_per_row не найдена, используем значение по умолчанию');
        }
      } catch (err) {
        console.error('Error loading bookmarks setting:', err);
      }
    };

    if (user?.id) {
      loadCardsPerRowSetting();
    }
  }, [user?.id]);

  const handleAddBookmark = async (values: Record<string, any>) => {
    if (!user?.id) return;

    try {
      const normalizedUrl = normalizeUrl(values.url);
      if (!isValidUrl(normalizedUrl)) {
        setError('Некорректный URL');
      return;
    }

      const response = await fetch(`${API}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          url: normalizedUrl,
          userId: user.id,
          order: bookmarks.length,
        }),
      });

      if (!response.ok) {
        throw new Error('Ошибка создания закладки');
      }

      const newBookmarkData = await response.json();
      setBookmarks([...bookmarks, newBookmarkData]);
      setNewBookmark(DEFAULT_BOOKMARK);
      setError(null);
      closeAddModal();
      notificationSystem.addNotification('Успех', 'Закладка добавлена', 'success');
    } catch (err) {
      notificationSystem.addNotification('Ошибка', err instanceof Error ? err.message : 'Ошибка создания закладки', 'error');
    }
  };

  const handleEditBookmark = async (values: Record<string, any>) => {
    if (!selectedBookmark || !user?.id) return;

    try {
      const normalizedUrl = normalizeUrl(values.url);
      if (!isValidUrl(normalizedUrl)) {
        setError('Некорректный URL');
        return;
      }

      const response = await fetch(`${API}/bookmarks/${selectedBookmark.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          url: normalizedUrl,
          userId: user.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Ошибка обновления закладки');
      }

      const updatedBookmark = await response.json();
      setBookmarks(bookmarks.map(b => b.id === selectedBookmark.id ? updatedBookmark : b));
      setSelectedBookmark(null);
      setError(null);
      closeEditModal();
      notificationSystem.addNotification('Успех', 'Закладка обновлена', 'success');
    } catch (err) {
      notificationSystem.addNotification('Ошибка', err instanceof Error ? err.message : 'Ошибка обновления закладки', 'error');
    }
  };

  const handleDeleteBookmark = async () => {
    if (!selectedBookmark) return;

    try {
      const response = await fetch(`${API}/bookmarks/${selectedBookmark.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Ошибка удаления закладки');
      }

      setBookmarks(bookmarks.filter(b => b.id !== selectedBookmark.id));
      setSelectedBookmark(null);
      closeDeleteModal();
      notificationSystem.addNotification('Успех', 'Закладка удалена', 'success');
    } catch (err) {
      notificationSystem.addNotification('Ошибка', err instanceof Error ? err.message : 'Ошибка удаления закладки', 'error');
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(bookmarks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const updatedBookmarks = items.map((bookmark, index) => ({
      ...bookmark,
      order: index,
    }));

    setBookmarks(updatedBookmarks);

    try {
      await fetch(`${API}/bookmarks/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookmarks: updatedBookmarks.map(({ id, order }) => ({ id, order })),
        }),
      });
    } catch (err) {
      console.error('Ошибка сохранения порядка закладок:', err);
      setBookmarks(originalBookmarks);
    }
  };

  const openEditModalForBookmark = (bookmark: Bookmark) => {
    setSelectedBookmark(bookmark);
    openEditModal();
  };

  const openDeleteModalForBookmark = (bookmark: Bookmark) => {
    setSelectedBookmark(bookmark);
    openDeleteModal();
  };

  const openAddModalHandler = () => {
    setNewBookmark(DEFAULT_BOOKMARK);
    setError(null);
    openAddModal();
  };


  const maxVisibleBookmarks = cardsPerRow * 2; // Максимум 2 ряда
  const visibleBookmarks = bookmarks.slice(0, maxVisibleBookmarks);
  const getSpanValue = () => {
    switch (cardsPerRow) {
      case 3: return 4; // 12/3 = 4
      case 6: return 2; // 12/6 = 2  
      case 9: return 1.33; // 12/9 ≈ 1.33
      default: return 2;
    }
  };

  if (loading) {
    return (
      <Box className="bookmarks-container">
        <LoadingOverlay visible={loading} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box className="bookmarks-container">
        <Alert
          icon={<IconX size={16} />}
          title="Ошибка загрузки"
          color="red"
          variant="light"
        >
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box className="bookmarks-widget">
      <Group gap="sm" mb="md">
        <ThemeIcon size="md" color="green" variant="light">
          <IconBookmark size={20} />
        </ThemeIcon>
        <Text size="lg" fw={600}>
          Закладки
        </Text>
      </Group>

      <Grid gutter="md">
        {visibleBookmarks.map((bookmark) => (
          <Grid.Col key={bookmark.id} span={getSpanValue()}>
            <Card
              className="bookmark-card"
              shadow="sm"
              radius="md"
              padding={0}
              style={{ height: '200px', position: 'relative', overflow: 'hidden' }}
            >
              {/* Превью изображения или градиент */}
              <div className="bookmark-preview">
                {bookmark.preview ? (
                            <img
                              src={bookmark.preview}
                              alt={bookmark.name}
                    className="bookmark-image"
                  />
                ) : (
                  <div className="bookmark-gradient">
                    <Text 
                      size="lg" 
                      fw={600} 
                      c="white" 
                      ta="center"
                      style={{ 
                        textShadow: '1px 1px 2px rgba(0, 0, 0, 0.5)',
                        lineHeight: 1.2,
                        maxWidth: '100%',
                        wordBreak: 'break-word',
                        padding: 'var(--space-4)'
                      }}
                    >
                      {bookmark.name}
                    </Text>
                  </div>
                )}
                          </div>

              {/* Градиентный оверлей */}
              <div className="bookmark-overlay">
                <div className="bookmark-content">
                  <Group gap="xs" mt="xs">
                    {bookmark.secure && (
                      <Badge size="xs" color="green" variant="light">
                        HTTPS
                      </Badge>
                    )}
                    <Text size="xs" c="rgba(255,255,255,0.8)" className="bookmark-url">
                      {bookmark.url.replace(/^https?:\/\//, '')}
                    </Text>
                  </Group>
                </div>

                {/* Действия */}
                <div className="bookmark-actions">
                  <Group gap="xs">
                    <Tooltip label="Открыть">
                      <ActionIcon
                        variant="filled"
                        color="blue"
                        size="sm"
                        component="a"
                        href={bookmark.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <IconExternalLink size={14} />
                      </ActionIcon>
                    </Tooltip>
                    
                    <Tooltip label="Редактировать">
                                  <ActionIcon
                        variant="filled"
                        color="orange"
                        size="sm"
                        onClick={() => openEditModalForBookmark(bookmark)}
                      >
                        <IconEdit size={14} />
                                  </ActionIcon>
                    </Tooltip>
                    
                    <Tooltip label="Удалить">
                                  <ActionIcon
                        variant="filled"
                        color="red"
                        size="sm"
                        onClick={() => openDeleteModalForBookmark(bookmark)}
                      >
                        <IconTrash size={14} />
                                  </ActionIcon>
                    </Tooltip>
                              </Group>
                            </div>
                          </div>
                        </Card>
                      </Grid.Col>
        ))}
        
        {/* Кнопка добавления */}
        <Grid.Col span={getSpanValue()}>
          <Card
            className="bookmark-add-card"
            shadow="sm"
            radius="md"
            padding={0}
            style={{ height: '200px', position: 'relative', overflow: 'hidden' }}
            onClick={openAddModalHandler}
          >
            <div className="bookmark-add-content">
              <ThemeIcon size="xl" color="gray" variant="light">
                <IconPlus size={32} />
              </ThemeIcon>
              <Text size="lg" fw={500} c="var(--theme-text-secondary)" mt="md">
                Добавить закладку
              </Text>
            </div>
          </Card>
        </Grid.Col>

        {/* Показать все закладки */}
        {bookmarks.length > maxVisibleBookmarks && (
          <Grid.Col span={12}>
            <Card
              className="bookmark-show-all"
              shadow="sm"
              radius="md"
              padding="md"
        onClick={openViewAllModal}
            >
              <Group justify="center" align="center">
                <ThemeIcon size="md" color="blue" variant="light">
                  <IconBookmark size={20} />
                </ThemeIcon>
                <Text size="sm" fw={500} c="var(--theme-text-primary)">
                  Показать все закладки
                </Text>
                <Text size="xs" c="var(--theme-text-secondary)">
                  +{bookmarks.length - maxVisibleBookmarks}
                </Text>
              </Group>
            </Card>
          </Grid.Col>
        )}
      </Grid>

      {/* Модальные окна */}


      <Modal
        opened={viewAllModalOpen}
        onClose={closeViewAllModal}
        title="Все закладки"
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
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="bookmarks">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef}>
                <Grid gutter="md">
                {bookmarks.map((bookmark, index) => (
                    <Draggable key={bookmark.id} draggableId={bookmark.id} index={index}>
                      {(provided, snapshot) => (
                        <Grid.Col span={getSpanValue()}>
                          <Card
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                            className={`bookmark-card ${snapshot.isDragging ? 'dragging' : ''}`}
                            shadow="sm"
                          radius="md"
                            padding={0}
                            style={{ height: '200px', position: 'relative', overflow: 'hidden' }}
                          >
                            <div className="bookmark-preview">
                              {bookmark.preview ? (
                            <img
                              src={bookmark.preview}
                              alt={bookmark.name}
                                  className="bookmark-image"
                                />
                              ) : (
                                <div className="bookmark-gradient">
                                  <ThemeIcon size="xl" color="blue" variant="light">
                                    <IconBookmark size={32} />
                                  </ThemeIcon>
                                </div>
                              )}
                            </div>

                            <div className="bookmark-overlay">
                              <div className="bookmark-content">
                                <Text size="lg" fw={600} c="white" className="bookmark-title">
                                  {bookmark.name}
                                </Text>
                                
                                <Group gap="xs" mt="xs">
                                  {bookmark.secure && (
                                    <Badge size="xs" color="green" variant="light">
                                      HTTPS
                                    </Badge>
                                  )}
                                  <Text size="xs" c="rgba(255,255,255,0.8)" className="bookmark-url">
                                    {bookmark.url.replace(/^https?:\/\//, '')}
                                  </Text>
                                </Group>
                              </div>

                              <div className="bookmark-actions">
                                <Group gap="xs">
                                  <div {...provided.dragHandleProps}>
                                    <Tooltip label="Перетащить">
                                      <ActionIcon variant="filled" color="gray" size="sm">
                                        <IconGripVertical size={14} />
                                      </ActionIcon>
                            </Tooltip>
                          </div>
                                  
                                  <Tooltip label="Открыть">
                                    <ActionIcon
                                      variant="filled"
                                      color="blue"
                                      size="sm"
                                      component="a"
                                      href={bookmark.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <IconExternalLink size={14} />
                                    </ActionIcon>
                                  </Tooltip>
                                  
                                  <Tooltip label="Редактировать">
                                  <ActionIcon
                                      variant="filled"
                                      color="orange"
                                      size="sm"
                                      onClick={() => openEditModalForBookmark(bookmark)}
                                    >
                                      <IconEdit size={14} />
                                  </ActionIcon>
                                  </Tooltip>
                                  
                                  <Tooltip label="Удалить">
                                  <ActionIcon
                                      variant="filled"
                                      color="red"
                                      size="sm"
                                      onClick={() => openDeleteModalForBookmark(bookmark)}
                                    >
                                      <IconTrash size={14} />
                                  </ActionIcon>
                                  </Tooltip>
                              </Group>
                            </div>
                          </div>
                        </Card>
                      </Grid.Col>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </Grid>
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </Modal>

      {/* Модальные окна */}
      <DynamicFormModal
        opened={addModalOpen}
        onClose={closeAddModal}
        title="Добавить закладку"
        mode="create"
        fields={bookmarkFields}
        initialValues={newBookmark}
        onSubmit={handleAddBookmark}
      />

      <DynamicFormModal
        opened={editModalOpen}
        onClose={closeEditModal}
        title="Редактировать закладку"
        mode="edit"
        fields={bookmarkFields}
        initialValues={selectedBookmark || DEFAULT_BOOKMARK}
        onSubmit={handleEditBookmark}
      />

      <DynamicFormModal
        opened={deleteModalOpen}
        onClose={closeDeleteModal}
        title="Удалить закладку"
        mode="delete"
        initialValues={selectedBookmark || {}}
        onConfirm={handleDeleteBookmark}
      />
    </Box>
  );
}