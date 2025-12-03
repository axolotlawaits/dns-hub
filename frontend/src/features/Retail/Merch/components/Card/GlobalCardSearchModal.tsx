import { useEffect, useMemo, useState } from 'react';
import { 
  Box, 
  TextInput, 
  Stack, 
  ScrollArea, 
  Text, 
  Badge, 
  Group, 
  Loader, 
  Paper,
  Image,
  ActionIcon,
  Tooltip,
  Select,
  Divider
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconSearch, IconEdit, IconEye, IconEyeOff } from '@tabler/icons-react';
import { fetchAllCards, type CardItem } from '../../data/CardData';
import { EditCardModal } from './CardModal';
import { TelegramPreview } from './TelegramPreview';
import { CustomModal } from '../../../../../utils/CustomModal';
import { API } from '../../../../../config/constants';
import { formatDescriptionForTelegram } from '../../../../../utils/telegramFormatter';
import './GlobalCardSearchModal.css';

interface GlobalCardSearchModalProps {
  onClose?: () => void;
}

// Функция для подсветки текста
const highlightText = (text: string, query: string): React.ReactNode => {
  if (!query.trim()) return text;
  
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  
  return parts.map((part, index) => 
    regex.test(part) ? (
      <mark 
        key={index} 
        style={{ 
          backgroundColor: 'var(--mantine-color-yellow-3)', 
          color: 'var(--mantine-color-dark-9)',
          padding: '0 2px',
          borderRadius: '2px'
        }}
      >
        {part}
      </mark>
    ) : part
  );
};

export function GlobalCardSearchModal({ onClose }: GlobalCardSearchModalProps) {
  const [allCards, setAllCards] = useState<CardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>('all');
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [previewModalOpened, { open: openPreviewModal, close: closePreviewModal }] = useDisclosure(false);
  const [selectedCard, setSelectedCard] = useState<CardItem | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const cards = await fetchAllCards();
        setAllCards(cards || []);
      } catch (e) {
        console.error('❌ [GlobalCardSearch] Ошибка загрузки карточек', e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // Получаем уникальные категории для фильтра
  const categories = useMemo(() => {
    const uniqueCategories = new Set<string>();
    allCards.forEach(card => {
      if (card.category?.name) {
        uniqueCategories.add(card.category.name);
      }
    });
    return Array.from(uniqueCategories).sort();
  }, [allCards]);

  // Фильтрация карточек
  const filtered = useMemo(() => {
    let result = allCards;
    const q = query.trim().toLowerCase();

    // Поиск по тексту
    if (q) {
      result = result.filter((c) =>
        [c.name, c.description, c.category?.name]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))
      );
    }

    // Фильтр по категории
    if (categoryFilter) {
      result = result.filter((c) => c.category?.name === categoryFilter);
    }

    // Фильтр по активности
    if (activeFilter === 'active') {
      result = result.filter((c) => c.isActive);
    } else if (activeFilter === 'inactive') {
      result = result.filter((c) => !c.isActive);
    }

    return result;
  }, [allCards, query, categoryFilter, activeFilter]);

  const handleCardClick = (card: CardItem) => {
    setSelectedCard(card);
    openPreviewModal();
  };

  const handleEditClick = (card: CardItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCard(card);
    openEditModal();
  };

  const handleEditSuccess = () => {
    // Перезагружаем карточки после успешного редактирования
    const load = async () => {
      try {
        const cards = await fetchAllCards();
        setAllCards(cards || []);
      } catch (e) {
        console.error('❌ [GlobalCardSearch] Ошибка перезагрузки карточек', e);
      }
    };
    load();
    closeEditModal();
    // Закрываем родительское модальное окно поиска, если передан onClose
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      <Stack gap="md" style={{ height: '100%' }}>
        {/* Поиск и фильтры */}
        <Stack gap="sm">
          <TextInput
            autoFocus
            placeholder="Поиск по названию, описанию, категории..."
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
          
          <Group gap="sm">
            <Select
              placeholder="Все категории"
              data={categories.map(cat => ({ value: cat, label: cat }))}
              value={categoryFilter}
              onChange={setCategoryFilter}
              clearable
              style={{ flex: 1 }}
            />
            <Select
              placeholder="Статус"
              data={[
                { value: 'all', label: 'Все' },
                { value: 'active', label: 'Активные' },
                { value: 'inactive', label: 'Неактивные' }
              ]}
              value={activeFilter}
              onChange={setActiveFilter}
              style={{ flex: 1 }}
            />
          </Group>

          {/* Счетчик результатов */}
          <Text size="sm" c="dimmed">
            Найдено карточек: {filtered.length} {allCards.length > 0 && `из ${allCards.length}`}
          </Text>
        </Stack>

        <Divider />

        {/* Список карточек */}
        {loading ? (
          <Group justify="center" mt="md">
            <Loader size="md" />
          </Group>
        ) : (
          <ScrollArea style={{ flex: 1, minHeight: 0 }}>
            <Stack gap="sm">
              {filtered.length === 0 ? (
                <Text size="sm" c="dimmed" ta="center" py="xl">
                  {query.trim() || categoryFilter || activeFilter !== 'all' 
                    ? 'Ничего не найдено. Попробуйте изменить параметры поиска.' 
                    : 'Карточки не найдены.'}
                </Text>
              ) : (
                filtered.map((card) => {
                  const firstImage = card.imageUrls?.[0];
                  const imageUrl = firstImage?.startsWith('http') 
                    ? firstImage 
                    : `${API}/public/add/merch/${firstImage || ''}`;
                  
                  return (
                    <Paper
                      key={card.id}
                      p="md"
                      withBorder
                      radius="md"
                      className="global-search-card"
                      style={{
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onClick={() => handleCardClick(card)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = 'var(--theme-shadow-md)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'var(--theme-shadow-xs)';
                      }}
                    >
                      <Group align="flex-start" gap="md" wrap="nowrap">
                        {/* Изображение */}
                        {firstImage && (
                          <Box style={{ flexShrink: 0 }}>
                            <Image
                              src={imageUrl}
                              alt={card.name}
                              width={80}
                              height={80}
                              fit="cover"
                              radius="sm"
                              style={{ objectFit: 'cover' }}
                            />
                          </Box>
                        )}

                        {/* Контент */}
                        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                          <Group justify="space-between" align="flex-start" gap="sm">
                            <Box style={{ flex: 1, minWidth: 0 }}>
                              <Text fw={600} size="sm" lineClamp={2}>
                                {highlightText(card.name, query)}
                              </Text>
                              {card.category?.name && (
                                <Badge 
                                  size="xs" 
                                  variant="light" 
                                  color="blue" 
                                  mt={4}
                                >
                                  {highlightText(card.category.name, query)}
                                </Badge>
                              )}
                            </Box>
                            <Group gap="xs">
                              <Badge 
                                size="xs" 
                                color={card.isActive ? 'green' : 'gray'} 
                                variant="light"
                                leftSection={card.isActive ? <IconEye size={10} /> : <IconEyeOff size={10} />}
                              >
                                {card.isActive ? 'Активна' : 'Неактивна'}
                              </Badge>
                              <Tooltip label="Редактировать">
                                <ActionIcon
                                  variant="subtle"
                                  size="sm"
                                  onClick={(e) => handleEditClick(card, e)}
                                >
                                  <IconEdit size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          </Group>

                          {card.description && (
                            <Text 
                              size="xs" 
                              c="dimmed" 
                              lineClamp={2}
                              style={{ 
                                wordBreak: 'break-word'
                              }}
                              dangerouslySetInnerHTML={{
                                __html: (() => {
                                  let formatted = formatDescriptionForTelegram(card.description);
                                  // Применяем подсветку поиска только если есть запрос
                                  if (query.trim()) {
                                    formatted = formatted.replace(
                                      new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                                      '<mark style="background-color: var(--mantine-color-yellow-3); color: var(--mantine-color-dark-9); padding: 0 2px; border-radius: 2px;">$1</mark>'
                                    );
                                  }
                                  return formatted;
                                })()
                              }}
                            />
                          )}
                        </Stack>
                      </Group>
                    </Paper>
                  );
                })
              )}
            </Stack>
          </ScrollArea>
        )}
      </Stack>

      {/* Модальное окно превью Telegram */}
      {selectedCard && (
        <CustomModal
          opened={previewModalOpened}
          onClose={closePreviewModal}
          title="Превью карточки"
          size="lg"
          icon={<IconEye size={20} />}
        >
          <TelegramPreview
            name={selectedCard.name}
            description={selectedCard.description || ''}
            images={selectedCard.imageUrls || []}
          />
        </CustomModal>
      )}

      {/* Модальное окно редактирования */}
      {selectedCard && (
        <CustomModal
          opened={editModalOpened}
          onClose={closeEditModal}
          title="Редактировать карточку"
          size="xl"
          icon={<IconEdit size={20} />}
        >
          <EditCardModal
            card={selectedCard}
            onSuccess={handleEditSuccess}
            onClose={closeEditModal}
          />
        </CustomModal>
      )}
    </>
  );
}


