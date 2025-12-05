import { useEffect, useCallback, useState, useRef } from 'react';
import { useDisclosure } from '@mantine/hooks';
import { Button, Container, Alert, Center, Box, Pagination, Select, Group, Text, Stack, LoadingOverlay, TextInput, ActionIcon, Affix, Transition, SimpleGrid, SegmentedControl } from '@mantine/core';
import { IconPlus, IconEdit, IconTrash, IconSearch, IconX, IconArrowUp, IconApps, IconList } from '@tabler/icons-react';
import Card from './Card';
import { AddCardModal, EditCardModal, DeleteCardModal } from './CardModal';
import { useApp } from '../../context/SelectedCategoryContext';
import { useCardStore, type CardItem } from '../../data/CardData';
import { CustomModal } from '../../../../../utils/CustomModal';
import { notificationSystem } from '../../../../../utils/Push';
import './CardGroup.css';

//---------------------------------------------Группа карточек
interface CardGroupProps {
  hasFullAccess?: boolean;
  onCardsUpdate?: (cards: CardItem[]) => void;
}

function CardGroup({ hasFullAccess = true, onCardsUpdate }: CardGroupProps) {
  const { selectedId } = useApp();
  const { cards, loading, error, pagination, loadCardsByCategory, removeCard, toggleCardActive } = useCardStore();
  
  const visibleCards = cards;
  const [addModalOpened, { open: openAddModal, close: closeAddModal }] = useDisclosure(false);
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [selectedCard, setSelectedCard] = useState<CardItem | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [scrollY, setScrollY] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollParentRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (selectedId) {
      const activeFilterValue = activeFilter === 'all' ? undefined : activeFilter === 'active';
      loadCardsByCategory(selectedId, currentPage, pageSize, activeFilterValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, currentPage, pageSize, activeFilter]); // Убираем loadCardsByCategory из зависимостей

  // Отслеживание скролла для кнопки "наверх" - находим родительский контейнер со скроллом
  useEffect(() => {
    const findScrollContainer = (): HTMLElement | null => {
      // Сначала ищем по классу mantine-AppShell-main
      const appShellMain = document.querySelector('.mantine-AppShell-main') as HTMLElement;
      if (appShellMain) {
        const style = window.getComputedStyle(appShellMain);
        const hasOverflow = style.overflowY === 'auto' || style.overflowY === 'scroll' || 
                           style.overflow === 'auto' || style.overflow === 'scroll';
        if (hasOverflow || appShellMain.scrollHeight > appShellMain.clientHeight) {
          return appShellMain;
        }
      }
      
      // Если не нашли по классу, ищем контейнер со скроллом, начиная с самого элемента и поднимаясь вверх по дереву
      let element: HTMLElement | null = scrollContainerRef.current;
      const maxDepth = 20; // Ограничение глубины поиска
      let depth = 0;
      
      while (element && depth < maxDepth) {
        const style = window.getComputedStyle(element);
        const hasOverflow = style.overflowY === 'auto' || style.overflowY === 'scroll' || 
                           style.overflow === 'auto' || style.overflow === 'scroll';
        
        // Также проверяем, есть ли у элемента скролл (scrollHeight > clientHeight)
        const hasScroll = element.scrollHeight > element.clientHeight;
        
        if (hasOverflow && hasScroll) {
          return element;
        }
        
        element = element.parentElement;
        depth++;
      }
      
      // Если не нашли по overflow, ищем по наличию скролла
      element = scrollContainerRef.current;
      depth = 0;
      while (element && depth < maxDepth) {
        if (element.scrollHeight > element.clientHeight && element.scrollTop !== undefined) {
          return element;
        }
        element = element.parentElement;
        depth++;
      }
      
      return null;
    };

    const handleScroll = () => {
      const scrollContainer = scrollParentRef.current || findScrollContainer();
      if (scrollContainer) {
        const scrollTop = scrollContainer.scrollTop || 0;
        setScrollY(scrollTop);
      } else {
        // Fallback на window
        const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
        setScrollY(scrollY);
      }
    };
    
    // Находим контейнер со скроллом с небольшой задержкой для гарантии, что DOM готов
    const timeoutId = setTimeout(() => {
      scrollParentRef.current = findScrollContainer();
      
      // Если не нашли, пробуем найти AppShell-main по классу
      if (!scrollParentRef.current) {
        const appShellMain = document.querySelector('.mantine-AppShell-main') as HTMLElement;
        if (appShellMain) {
          scrollParentRef.current = appShellMain;
        }
      }
      
      if (scrollParentRef.current) {
        console.log('📜 [CardGroup] Найден скролл-контейнер:', scrollParentRef.current, {
          scrollHeight: scrollParentRef.current.scrollHeight,
          clientHeight: scrollParentRef.current.clientHeight,
          className: scrollParentRef.current.className
        });
        scrollParentRef.current.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll(); // Инициализируем начальное значение
      } else {
        console.warn('⚠️ [CardGroup] Скролл-контейнер не найден, используем window');
        // Fallback на window
        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
      }
    }, 200); // Увеличиваем задержку для гарантии готовности DOM
    
    return () => {
      clearTimeout(timeoutId);
      scrollParentRef.current?.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    if (scrollParentRef.current) {
      scrollParentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Fallback на window
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Уведомляем родителя об обновлении карточек только при изменении selectedId
  useEffect(() => {
    if (onCardsUpdate && cards.length > 0 && selectedId) {
      onCardsUpdate(cards);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length, selectedId]); // Убираем onCardsUpdate и cards из зависимостей, оставляем только length и selectedId

  const handleEditCard = (card: CardItem) => {
    setSelectedCard(card);
    openEditModal();
  };

  const handleDeleteCard = (cardId: string) => {
    // Находим карточку по ID для отображения в модалке удаления
    const cardToDelete = cards.find(card => card.id === cardId);
    if (cardToDelete) {
      setSelectedCard(cardToDelete);
      openDeleteModal();
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedCard) return;
    
    try {
      await removeCard(selectedCard.id);
      notificationSystem.addNotification(
        'Успех!', 
        `Карточка "${selectedCard.name}" успешно удалена`, 
        'success'
      );
      closeDeleteModal();
      setSelectedCard(null);
      
      // Автоматически перезагружаем карточки после удаления
      refreshCards();
    } catch (error) {
      console.error('Ошибка при удалении карточки:', error);
      notificationSystem.addNotification(
        'Ошибка!', 
        'Не удалось удалить карточку', 
        'error'
      );
    }
  };

  const handleToggleActive = async (cardId: string, isActive: boolean) => {
    try {
      // Используем метод toggleCardActive из useCardStore
      await toggleCardActive(cardId, isActive);
      
      notificationSystem.addNotification(
        'Успех!', 
        `Статус карточки изменен на ${isActive ? 'активна' : 'неактивна'}`, 
        'success'
      );
      
      // Перезагружаем карточки для обновления списка
      refreshCards();
    } catch (error) {
      console.error('Ошибка при переключении активности:', error);
      notificationSystem.addNotification(
        'Ошибка!', 
        'Не удалось изменить статус карточки', 
        'error'
      );
    }
  };

  const refreshCards = useCallback(() => {
    if (selectedId) {
      // Сбрасываем на первую страницу и перезагружаем карточки
      setCurrentPage(1);
      const activeFilterValue = activeFilter === 'all' ? undefined : activeFilter === 'active';
      loadCardsByCategory(selectedId, 1, pageSize, activeFilterValue);
    }
  }, [selectedId, loadCardsByCategory, activeFilter, pageSize]);

  // Обработчик drag and drop для карточек (теперь обрабатывается в Merch.handleGlobalDragEnd)
  // Этот компонент только предоставляет Droppable

  if (loading) {
    return (
      <Box className="card-group-loading-container">
        <LoadingOverlay visible={loading} />
        <Container style={{ textAlign: 'center', padding: '40px' }}>
          <Text size="sm" c="dimmed">Загрузка карточек...</Text>
        </Container>
      </Box>
    );
  }

  if (error) {
    return (
      <Container style={{ padding: '20px' }}>
        <Alert color="red" title="Ошибка загрузки карточек">
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Stack gap="md"> 
      {/* Модалка добавления карточки */}
      <CustomModal 
        opened={addModalOpened} 
        onClose={closeAddModal} 
        title="Добавление новой карточки" 
        size="lg"
        icon={<IconPlus size={20} />}
      >
        <AddCardModal 
          categoryId={selectedId || ''} 
          onSuccess={() => {
            closeAddModal();
            refreshCards();
          }}
          onClose={closeAddModal}
        />
      </CustomModal>

      {/* Модалка редактирования карточки */}
      <CustomModal 
        opened={editModalOpened} 
        onClose={closeEditModal} 
        title="Редактирование карточки" 
        size="lg"
        icon={<IconEdit size={20} />}
      >
        {selectedCard && (
          <EditCardModal 
            card={selectedCard}
            onSuccess={() => {
              closeEditModal();
              refreshCards();
              setSelectedCard(null);
            }}
            onClose={closeEditModal}
          />
        )}
      </CustomModal>

      {/* Модалка удаления карточки */}
      <CustomModal 
        opened={deleteModalOpened} 
        onClose={closeDeleteModal} 
        title="Удаление карточки"
        icon={<IconTrash size={20} />}
      >
        {selectedCard && (
          <DeleteCardModal 
            card={selectedCard}
            onSuccess={handleConfirmDelete}
            onClose={() => {
              closeDeleteModal();
              setSelectedCard(null);
            }}
          />
        )}
      </CustomModal>

      {!selectedId ? (
        <Center style={{ height: '300px' }}>
          <Box style={{ textAlign: 'center' }}>
            <div className="card-group-empty-message">
              Выберите категорию в иерархии для отображения карточек
            </div>
          </Box>
        </Center>
      ) : cards.length > 0 ? (
        <>
          {/* Поиск, фильтры и пагинация */}
          <Box mb="md">
            <Stack gap="sm">
              <TextInput
                placeholder="Поиск по карточкам..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                leftSection={<IconSearch size={16} />}
                rightSection={searchQuery ? (
                  <ActionIcon size="sm" onClick={() => setSearchQuery('')}>
                    <IconX size={14} />
                  </ActionIcon>
                ) : null}
                size="sm"
              />
              <Group justify="space-between" align="flex-end">
                <Group align="flex-end">
                  <Select
                    label="Статус"
                    placeholder="Все карточки"
                    value={activeFilter}
                    onChange={(value) => {
                      setActiveFilter(value || 'all');
                      setCurrentPage(1); // Сбрасываем на первую страницу при смене фильтра
                    }}
                    data={[
                      { value: 'all', label: 'Все карточки' },
                      { value: 'active', label: 'Только активные' },
                      { value: 'inactive', label: 'Только неактивные' }
                    ]}
                    size="sm"
                    w={150}
                  />
                  <Select
                    label="На странице"
                    value={pageSize.toString()}
                    onChange={(value) => {
                      setPageSize(parseInt(value || '20'));
                      setCurrentPage(1); // Сбрасываем на первую страницу при смене размера
                    }}
                    data={[
                      { value: '10', label: '10' },
                      { value: '20', label: '20' },
                      { value: '50', label: '50' },
                      { value: '100', label: '100' }
                    ]}
                    size="sm"
                    w={100}
                  />
                </Group>
                <Group align="flex-end">
                  <SegmentedControl
                    value={viewMode}
                    onChange={(value) => setViewMode(value as 'list' | 'grid')}
                    data={[
                      { label: <IconApps size={16} />, value: 'grid' },
                      { label: <IconList size={16} />, value: 'list' }
                    ]}
                    size="sm"
                  />
                </Group>
              <Group>
                <Text size="sm" c="dimmed">
                  Показано {cards.length} из {pagination.total} карточек
                </Text>
                {hasFullAccess && (
                  <Button 
                    onClick={openAddModal}
                    size="sm"
                    leftSection={<IconPlus size={16} />}
                    variant="gradient"
                    gradient={{ from: 'blue', to: 'cyan' }}
                  >
                    Добавить карточку
                  </Button>
                )}
              </Group>
            </Group>
            </Stack>
          </Box>

          {/* Карточки */}
          <Box ref={scrollContainerRef}>
            {viewMode === 'list' ? (
              <Box>
                {visibleCards.map((card) => (
                  <Card 
                    key={card.id}
                    cardData={card}
                    onEdit={hasFullAccess ? handleEditCard : undefined}
                    onDelete={hasFullAccess ? handleDeleteCard : undefined}
                    onToggleActive={hasFullAccess ? handleToggleActive : undefined}
                    searchQuery={searchQuery}
                  />
                ))}
              </Box>
            ) : (
              <SimpleGrid
                cols={{ base: 1, sm: 2, md: 3, lg: 3 }}
                spacing="md"
              >
                {visibleCards.map((card) => (
                  <Card 
                    key={card.id}
                    cardData={card}
                    onEdit={hasFullAccess ? handleEditCard : undefined}
                    onDelete={hasFullAccess ? handleDeleteCard : undefined}
                    onToggleActive={hasFullAccess ? handleToggleActive : undefined}
                    searchQuery={searchQuery}
                    compact={true}
                  />
                ))}
              </SimpleGrid>
            )}
          </Box>
          
          {/* Кнопка "наверх" */}
          {scrollY > 400 && (
            <Affix position={{ bottom: 20, right: 20 }} zIndex={1000}>
              <Transition transition="slide-up" mounted={true}>
                {(transitionStyles) => (
                  <ActionIcon
                    style={{ ...transitionStyles, zIndex: 1000 }}
                    onClick={scrollToTop}
                    size="xl"
                    radius="xl"
                    variant="filled"
                    color="blue"
                    title="Вернуться наверх"
                  >
                    <IconArrowUp size={20} />
                  </ActionIcon>
                )}
              </Transition>
            </Affix>
          )}
          
          {/* Пагинация */}
          {pagination.totalPages > 1 && (
            <Box mt="md" className="card-group-pagination-container">
              <Pagination
                value={currentPage}
                onChange={setCurrentPage}
                total={pagination.totalPages}
                size="sm"
              />
            </Box>
          )}
        </>
      ) : (
        <Center style={{ height: '400px' }}>
          <Box style={{ textAlign: 'center' }}>
            <div className="card-group-empty-message-large">
              В этой категории пока нет карточек
            </div>
            {hasFullAccess && (
              <Button 
                onClick={openAddModal}
                size="xl"
                leftSection={<IconPlus size={24} />}
                variant="gradient"
                gradient={{ from: 'blue', to: 'cyan' }}
                className="card-group-empty-button"
              >
                Создать первую карточку
              </Button>
            )}
          </Box>
        </Center>
      )}
    </Stack> 
  );
}

export default CardGroup;
