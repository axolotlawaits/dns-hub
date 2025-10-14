import { useEffect, useCallback, useState } from 'react';
import { useDisclosure } from '@mantine/hooks';
import { Button, Container, Alert, Center, Box, Pagination, Select, Group, Text, Stack, LoadingOverlay } from '@mantine/core';
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import Card from './Card';
import { AddCardModal, EditCardModal, DeleteCardModal } from './CardModal';
import { useApp } from '../../context/SelectedCategoryContext';
import { useCardStore, type CardItem } from '../../data/CardData';
import { CustomModal } from '../../../../../utils/CustomModal';
import { notificationSystem } from '../../../../../utils/Push';

//---------------------------------------------Группа карточек
function CardGroup() {
  const { selectedId } = useApp();
  const { cards, loading, error, pagination, loadCardsByCategory, removeCard, toggleCardActive } = useCardStore();
  const [addModalOpened, { open: openAddModal, close: closeAddModal }] = useDisclosure(false);
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [selectedCard, setSelectedCard] = useState<CardItem | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [activeFilter, setActiveFilter] = useState<string>('all');

  useEffect(() => {
    if (selectedId) {
      console.log(`🔄 Загружаем карточки для категории ${selectedId} (страница ${currentPage})`);
      const activeFilterValue = activeFilter === 'all' ? undefined : activeFilter === 'active';
      loadCardsByCategory(selectedId, currentPage, pageSize, activeFilterValue);
    } else {
      console.log('📭 Категория не выбрана, карточки не загружаются');
    }
  }, [selectedId, currentPage, pageSize, activeFilter, loadCardsByCategory]);

  const handleEditCard = (card: CardItem) => {
    console.log('Редактирование карточки:', card);
    setSelectedCard(card);
    openEditModal();
  };

  const handleDeleteCard = (cardId: string) => {
    // Находим карточку по ID для отображения в модалке удаления
    const cardToDelete = cards.find(card => card.id === cardId);
    if (cardToDelete) {
      console.log('Удаление карточки:', cardToDelete);
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
      if (selectedId) {
        loadCardsByCategory(selectedId);
      }
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
      if (selectedId) {
        loadCardsByCategory(selectedId);
      }
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
      loadCardsByCategory(selectedId);
    }
  }, [selectedId, loadCardsByCategory]);

  if (loading) {
    return (
      <Box style={{ position: 'relative', minHeight: 200 }}>
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
            <div style={{ fontSize: '18px', color: 'gray', marginBottom: '20px' }}>
              Выберите категорию в иерархии для отображения карточек
            </div>
          </Box>
        </Center>
      ) : cards.length > 0 ? (
        <>
          {/* Фильтры и пагинация */}
          <Box mb="md">
            <Group justify="space-between" align="center">
              <Group>
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
              <Text size="sm" c="dimmed">
                Показано {cards.length} из {pagination.total} карточек
              </Text>
            </Group>
          </Box>

          {/* Карточки отображаются ПЕРВЫМИ */}
          {cards.map((card) => (
            <Card 
              key={card.id} 
              cardData={card}
              onEdit={handleEditCard}
              onDelete={handleDeleteCard}
              onToggleActive={handleToggleActive}
            />
          ))}
          
          {/* Пагинация */}
          {pagination.totalPages > 1 && (
            <Box mt="md" style={{ display: 'flex', justifyContent: 'center' }}>
              <Pagination
                value={currentPage}
                onChange={setCurrentPage}
                total={pagination.totalPages}
                size="sm"
              />
            </Box>
          )}
          
          {/* Кнопка добавления отображается ПОСЛЕ карточек */}
          <Center style={{ marginTop: 30, marginBottom: 30 }}>
            <Button 
              onClick={openAddModal}
              size="lg"
              leftSection={<IconPlus size={20} />}
              variant="gradient"
              gradient={{ from: 'blue', to: 'cyan' }}
              style={{
                borderRadius: '50px',
                padding: '12px 30px',
                fontSize: '16px',
                fontWeight: 600
              }}
            >
              Добавить карточку
            </Button>
          </Center>
        </>
      ) : (
        <Center style={{ height: '400px' }}>
          <Box style={{ textAlign: 'center' }}>
            <div style={{ 
              fontSize: '18px', 
              color: 'gray', 
              marginBottom: '30px' 
            }}>
              В этой категории пока нет карточек
            </div>
            <Button 
              onClick={openAddModal}
              size="xl"
              leftSection={<IconPlus size={24} />}
              variant="gradient"
              gradient={{ from: 'blue', to: 'cyan' }}
              style={{
                borderRadius: '50px',
                padding: '15px 40px',
                fontSize: '18px',
                fontWeight: 600
              }}
            >
              Создать первую карточку
            </Button>
          </Box>
        </Center>
      )}
    </Stack> 
  );
}

export default CardGroup;
