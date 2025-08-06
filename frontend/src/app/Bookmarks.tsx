import { useState, useEffect, useCallback, useMemo } from 'react';
import { API } from '../config/constants';
import { Box, Title, Text, Group, LoadingOverlay, Grid, ActionIcon, Anchor, Modal, Button, ThemeIcon, TextInput, Card, Alert, Tooltip } from '@mantine/core';
import { IconBookmark, IconTrash, IconExternalLink, IconPlus, IconCheck, IconX, IconSortAscending, IconEdit, IconDeviceFloppy, IconGripVertical } from '@tabler/icons-react';
import { useUserContext } from '../hooks/useUserContext';
import { useDisclosure } from '@mantine/hooks';
import { normalizeUrl, isValidUrl, isSecureUrl, getPreviewUrl } from '../utils/url';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import styles from './styles/Bookmarks.module.css';

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
  const [deleteModalOpen, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [addModalOpen, { open: openAddModal, close: closeAddModal }] = useDisclosure(false);
  const [editModalOpen, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [viewAllModalOpen, { open: openViewAllModal, close: closeViewAllModal }] = useDisclosure(false);
  const [selectedBookmark, setSelectedBookmark] = useState<Bookmark | null>(null);
  const [newBookmark, setNewBookmark] = useState(DEFAULT_BOOKMARK);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; color: string } | null>(null);
  const [isSorting, setIsSorting] = useState(false);

  const hasBookmarks = useMemo(() => bookmarks.length > 0, [bookmarks]);
  const isAddDisabled = useMemo(
    () => !newBookmark.name || !newBookmark.url || !!urlError,
    [newBookmark.name, newBookmark.url, urlError]
  );

  const isEditDisabled = useMemo(
    () => !selectedBookmark?.name || !selectedBookmark?.url || !!urlError,
    [selectedBookmark, urlError]
  );

  const showNotification = useCallback((message: string, color: string) => {
    setNotification({ message, color });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  const fetchBookmarks = useCallback(async () => {
    if (!user?.id) {
      setError('Пользователь не авторизован');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(`${API}/bookmarks/${user.id}`);
      if (!response.ok) throw new Error(`Ошибка загрузки данных: ${response.status}`);
      const data = await response.json();
      const bookmarksWithSecurity = data.map((bookmark: Bookmark) => ({
        ...bookmark,
        secure: isSecureUrl(bookmark.url),
        preview: getPreviewUrl(bookmark.url)
      }));
      setBookmarks(bookmarksWithSecurity);
      setOriginalBookmarks([...bookmarksWithSecurity]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      console.error('Ошибка:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${API}/bookmarks/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Не удалось удалить закладку');
      setBookmarks(prev => prev.filter(b => b.id !== id));
      setOriginalBookmarks(prev => prev.filter(b => b.id !== id));
      showNotification('Закладка удалена', 'green');
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Неизвестная ошибка', 'red');
    } finally {
      closeDeleteModal();
    }
  }, [closeDeleteModal, showNotification]);

  const handleAddBookmark = useCallback(async () => {
    if (!isValidUrl(newBookmark.url)) {
      setUrlError('Некорректный URL');
      return;
    }
    try {
      const normalizedUrl = normalizeUrl(newBookmark.url);
      const response = await fetch(`${API}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBookmark.name,
          url: normalizedUrl,
          userId: user?.id,
          order: bookmarks.length
        })
      });
      if (!response.ok) throw new Error('Не удалось добавить закладку');
      const addedBookmark = await response.json();
      const newBookmarkWithPreview = {
        ...addedBookmark,
        secure: isSecureUrl(addedBookmark.url),
        preview: getPreviewUrl(addedBookmark.url)
      };
      setBookmarks(prev => [...prev, newBookmarkWithPreview]);
      setOriginalBookmarks(prev => [...prev, newBookmarkWithPreview]);
      setNewBookmark(DEFAULT_BOOKMARK);
      showNotification('Закладка добавлена', 'green');
      closeAddModal();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Неизвестная ошибка', 'red');
    }
  }, [newBookmark, user?.id, bookmarks.length, closeAddModal, showNotification]);

  const handleUpdateBookmark = useCallback(async () => {
    if (!selectedBookmark) return;
    if (!isValidUrl(selectedBookmark.url)) {
      setUrlError('Некорректный URL');
      return;
    }
    try {
      const normalizedUrl = normalizeUrl(selectedBookmark.url);
      const response = await fetch(`${API}/bookmarks/${selectedBookmark.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedBookmark.name,
          url: normalizedUrl
        })
      });
      if (!response.ok) throw new Error('Не удалось обновить закладку');
      const updatedBookmark = await response.json();
      const updatedBookmarkWithPreview = {
        ...updatedBookmark,
        secure: isSecureUrl(updatedBookmark.url),
        preview: getPreviewUrl(updatedBookmark.url)
      };
      setBookmarks(prev => prev.map(b => b.id === updatedBookmark.id ? updatedBookmarkWithPreview : b));
      setOriginalBookmarks(prev => prev.map(b => b.id === updatedBookmark.id ? updatedBookmarkWithPreview : b));
      showNotification('Закладка обновлена', 'green');
      closeEditModal();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Неизвестная ошибка', 'red');
    }
  }, [selectedBookmark, closeEditModal, showNotification]);

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination || !isSorting) return;
    const items = Array.from(bookmarks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    const updatedBookmarks = items.map((item, index) => ({
      ...item,
      order: index
    }));
    setBookmarks(updatedBookmarks);
  }, [bookmarks, isSorting]);

  const saveSorting = useCallback(async () => {
    try {
      const response = await fetch(`${API}/bookmarks/reorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.id}`
        },
        body: JSON.stringify({
          bookmarks: bookmarks.map(b => ({ id: b.id, order: b.order })),
          userId: user?.id
        })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to save order');
      }
      setOriginalBookmarks([...bookmarks]);
      setIsSorting(false);
      showNotification('Сортировка сохранена', 'green');
    } catch (err) {
      console.error('Order update error:', err);
      setBookmarks([...originalBookmarks]);
      setIsSorting(false);
      showNotification(
        err instanceof Error ? err.message : 'Failed to save order',
        'red'
      );
    }
  }, [bookmarks, user?.id, originalBookmarks, showNotification]);

  const cancelSorting = useCallback(() => {
    setBookmarks([...originalBookmarks]);
    setIsSorting(false);
  }, [originalBookmarks]);

  const startSorting = useCallback(() => {
    setIsSorting(true);
  }, []);

  const validateUrl = useCallback((url: string) => {
    setUrlError(isValidUrl(url) ? null : 'Некорректный URL');
  }, []);

  const openEditModalWithBookmark = useCallback((bookmark: Bookmark) => {
    setSelectedBookmark(bookmark);
    openEditModal();
  }, [openEditModal]);

  const openDeleteModalWithBookmark = useCallback((bookmark: Bookmark) => {
    setSelectedBookmark(bookmark);
    openDeleteModal();
  }, [openDeleteModal]);

  const resetAddForm = useCallback(() => {
    setNewBookmark(DEFAULT_BOOKMARK);
    setUrlError(null);
    openAddModal();
  }, [openAddModal]);

  if (loading) return <LoadingOverlay visible />;
  if (error) return <Text c="red">Ошибка: {error}</Text>;

  const visibleBookmarks = bookmarks.slice(0, 8);
  const hasMoreBookmarks = bookmarks.length > 8;

  return (
    <Box p="md">
      {notification && (
        <Alert
          color={notification.color}
          onClose={() => setNotification(null)}
          mb="md"
          icon={notification.color === 'green' ? <IconCheck size={18} /> : <IconX size={18} />}
        >
          {notification.message}
        </Alert>
      )}
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <ThemeIcon variant="light" color="blue" size="lg" radius="xl">
            <IconBookmark size={18} />
          </ThemeIcon>
          <Title order={2}>Мои закладки</Title>
        </Group>
        <Group>
          {isSorting ? (
            <Group gap="xs">
              <Button
                leftSection={<IconX size={18} />}
                onClick={cancelSorting}
                variant="light"
                color="red"
              >
                Отмена
              </Button>
              <Button
                leftSection={<IconDeviceFloppy size={18} />}
                onClick={saveSorting}
                variant="light"
                color="green"
              >
                Сохранить
              </Button>
            </Group>
          ) : (
            <Button
              leftSection={<IconSortAscending size={18} />}
              onClick={startSorting}
              variant="light"
            >
              Сортировать
            </Button>
          )}
          {!isSorting && (
            <Button
              leftSection={<IconPlus size={18} />}
              onClick={resetAddForm}
              variant="light"
            >
              Добавить
            </Button>
          )}
        </Group>
      </Group>
      {!hasBookmarks ? (
        <Text c="dimmed">У вас пока нет сохраненных закладок</Text>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="bookmarks" direction="horizontal">
            {(provided) => (
              <Grid
                gutter="md"
                ref={provided.innerRef}
                {...provided.droppableProps}
              >
                {visibleBookmarks.map((bookmark, index) => (
                  <Draggable
                    key={bookmark.id}
                    draggableId={bookmark.id}
                    index={index}
                    isDragDisabled={!isSorting}
                  >
                    {(provided) => (
                      <Grid.Col
                        span={{ base: 12, sm: 6, md: 4, lg: 3 }}
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                      >
                        <Card
                          withBorder
                          p={0}
                          radius="md"
                          className={`${styles.card} ${isSorting ? styles.sorting : ''}`}
                        >
                          <div className={styles.imageContainer}>
                            {isSorting && (
                              <div
                                {...provided.dragHandleProps}
                                className={styles.dragHandle}
                              >
                                <IconGripVertical size={18} color="white" />
                              </div>
                            )}
                            <img
                              src={bookmark.preview}
                              alt={bookmark.name}
                              className={styles.image}
                              loading="lazy"
                            />
                            <Tooltip label={isSecureUrl(bookmark.url).message} position="left">
                              <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                                {isSecureUrl(bookmark.url).icon}
                              </div>
                            </Tooltip>
                          </div>
                          <div className={styles.content}>
                            <Text fw={500} truncate className={styles.name}>
                              {bookmark.name}
                            </Text>
                            <div className={styles.actions}>
                              <Group justify="space-between">
                                <Anchor href={bookmark.url} target="_blank" size="sm" c="gray.3">
                                  <IconExternalLink size={25} style={{ marginRight: 5 }} />
                                  Перейти
                                </Anchor>
                                <Group gap={4}>
                                  <ActionIcon
                                    variant="subtle"
                                    color="gray.3"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditModalWithBookmark(bookmark);
                                    }}
                                  >
                                    <IconEdit size={25} />
                                  </ActionIcon>
                                  <ActionIcon
                                    variant="subtle"
                                    color="gray.3"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openDeleteModalWithBookmark(bookmark);
                                    }}
                                  >
                                    <IconTrash size={25} />
                                  </ActionIcon>
                                </Group>
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
            )}
          </Droppable>
        </DragDropContext>
      )}
      {hasMoreBookmarks && (
      <Button
        onClick={openViewAllModal}
        mt="md"
        leftSection={<IconBookmark size={18} />}
        variant="light"
      >
        Посмотреть все
      </Button>

      )}
      <Modal
        opened={viewAllModalOpen}
        onClose={closeViewAllModal}
        title={
          <Group justify="space-between">
            <Title order={3}>Все закладки</Title>
            <Group>
              {isSorting ? (
                <Group gap="xs">
                  <Button
                    leftSection={<IconX size={18} />}
                    onClick={cancelSorting}
                    variant="light"
                    color="red"
                    size="xs"
                  >
                    Отмена
                  </Button>
                  <Button
                    leftSection={<IconDeviceFloppy size={18} />}
                    onClick={saveSorting}
                    variant="light"
                    color="green"
                    size="xs"
                  >
                    Сохранить
                  </Button>
                </Group>
              ) : (
                <>
                  <Button
                    leftSection={<IconSortAscending size={18} />}
                    onClick={startSorting}
                    variant="light"
                    size="xs"
                  >
                    Сортировать
                  </Button>
                  <Button
                    leftSection={<IconPlus size={18} />}
                    onClick={resetAddForm}
                    variant="light"
                    size="xs"
                  >
                    Добавить
                  </Button>
                </>
              )}
            </Group>
          </Group>
        }
        size="70%"
      >
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="allBookmarks" direction="horizontal">
            {(provided) => (
              <Grid
                gutter="md"
                ref={provided.innerRef}
                {...provided.droppableProps}
              >
                {bookmarks.map((bookmark, index) => (
                  <Draggable
                    key={bookmark.id}
                    draggableId={bookmark.id}
                    index={index}
                    isDragDisabled={!isSorting}
                  >
                    {(provided) => (
                      <Grid.Col
                        span={{ base: 12, sm: 6, md: 4, lg: 3 }}
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                      >
                        <Card
                          withBorder
                          p={0}
                          radius="md"
                          className={styles.card}
                        >
                          <div className={styles.imageContainer}>
                            {isSorting && (
                              <div
                                {...provided.dragHandleProps}
                                className={styles.dragHandle}
                              >
                                <IconGripVertical size={18} color="white" />
                              </div>
                            )}
                            <img
                              src={bookmark.preview}
                              alt={bookmark.name}
                              className={styles.image}
                              loading="lazy"
                            />
                            <Tooltip label={isSecureUrl(bookmark.url).message} position="left">
                              <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                                {isSecureUrl(bookmark.url).icon}
                              </div>
                            </Tooltip>
                          </div>
                          <div className={styles.content}>
                            <Text fw={500} truncate className={styles.name}>
                              {bookmark.name}
                            </Text>
                            <div className={styles.actions}>
                              <Group justify="space-between">
                                <Anchor href={bookmark.url} target="_blank" size="sm" c="gray.3">
                                  <IconExternalLink size={25} style={{ marginRight: 5 }} />
                                  Перейти
                                </Anchor>
                                <Group gap={4}>
                                  <ActionIcon
                                    variant="subtle"
                                    color="gray.3"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditModalWithBookmark(bookmark);
                                    }}
                                  >
                                    <IconEdit size={25} />
                                  </ActionIcon>
                                  <ActionIcon
                                    variant="subtle"
                                    color="gray.3"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openDeleteModalWithBookmark(bookmark);
                                    }}
                                  >
                                    <IconTrash size={16} />
                                  </ActionIcon>
                                </Group>
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
            )}
          </Droppable>
        </DragDropContext>
      </Modal>
      <Modal opened={deleteModalOpen} onClose={closeDeleteModal} title="Удаление закладки">
        <Text mb="md">Вы уверены, что хотите удалить закладку "{selectedBookmark?.name}"?</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={closeDeleteModal}>Отмена</Button>
          <Button color="red" onClick={() => selectedBookmark && handleDelete(selectedBookmark.id)}>
            Удалить
          </Button>
        </Group>
      </Modal>
      <Modal opened={addModalOpen} onClose={closeAddModal} title="Добавление закладки">
        <TextInput
          label="Название"
          placeholder="Мой любимый сайт"
          value={newBookmark.name}
          onChange={(e) => setNewBookmark(prev => ({ ...prev, name: e.target.value }))}
          mb="md"
        />
        <TextInput
          label="URL"
          placeholder="https://example.ru или example.ru"
          value={newBookmark.url}
          onChange={(e) => {
            setNewBookmark(prev => ({ ...prev, url: e.target.value }));
            validateUrl(e.target.value);
          }}
          error={urlError}
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={closeAddModal}>Отмена</Button>
          <Button
            color="blue"
            onClick={handleAddBookmark}
            disabled={isAddDisabled}
          >
            Добавить
          </Button>
        </Group>
      </Modal>
      <Modal opened={editModalOpen} onClose={closeEditModal} title="Редактирование закладки">
        <TextInput
          label="Название"
          placeholder="Мой любимый сайт"
          value={selectedBookmark?.name || ''}
          onChange={(e) => selectedBookmark && setSelectedBookmark({ ...selectedBookmark, name: e.target.value })}
          mb="md"
        />
        <TextInput
          label="URL"
          placeholder="https://example.ru или example.ru"
          value={selectedBookmark?.url || ''}
          onChange={(e) => {
            if (selectedBookmark) {
              setSelectedBookmark({ ...selectedBookmark, url: e.target.value });
              validateUrl(e.target.value);
            }
          }}
          error={urlError}
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={closeEditModal}>Отмена</Button>
          <Button
            color="blue"
            onClick={handleUpdateBookmark}
            disabled={isEditDisabled}
          >
            Сохранить
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}