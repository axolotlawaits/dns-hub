import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ActionIcon, 
  Box, 
  Collapse,
  Paper,
  Text,
  Stack,
  Tabs,
  Modal,
  Image,
  Group,
  Card
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { 
  IconChevronLeft, 
  IconChevronRight, 
  IconChartBar, 
  IconShoppingBag, 
  IconMail, 
  IconQrcode,
  IconArrowsSort,
  IconSearch
} from '@tabler/icons-react';
import { usePageHeader } from '../../../contexts/PageHeaderContext';
import { useAccessContext } from '../../../hooks/useAccessContext';
import { useUserContext } from '../../../hooks/useUserContext';
import { AppProvider, useApp } from './context/SelectedCategoryContext';
import { UniversalHierarchy, HierarchyItem } from '../../../utils/UniversalHierarchy';
import CardGroup from './components/Card/CardGroup';
import { GlobalCardSearchModal } from './components/Card/GlobalCardSearchModal';
import { CustomModal } from '../../../utils/CustomModal';
import { UniversalHierarchySortModal } from '../../../utils/UniversalHierarchySortModal';
import { HierarchyAddModal, HierarchyEditModal, HierarchyDeleteModal } from './components/Hierarchy/Modals/HierarchyModals';
import { getHierarchyData, type DataItem } from './data/HierarchyData';
import { API } from '../../../config/constants';
import useAuthFetch from '../../../hooks/useAuthFetch';
import MerchStats from './components/Stats/MerchStats';
import MerchFeedback from './components/Feedback/MerchFeedback';
import './Merch.css';

// Константы
const TRANSITION_DURATION = 300;
const STORAGE_KEY = 'merchHierarchyVisible';

function Merch() {
  const { setHeader, clearHeader } = usePageHeader();
  const { access } = useAccessContext();
  const { user } = useUserContext();
  const [isHierarchyVisible, setIsHierarchyVisible] = useState<boolean>(true);
  const [qrOpened, { open: qrOpen, close: qrClose }] = useDisclosure(false);
  const [sortOpened, { open: sortOpen, close: sortClose }] = useDisclosure(false);
  const [globalSearchOpened, { open: globalSearchOpen, close: globalSearchClose }] = useDisclosure(false);
  
  // Ссылка на бота
  const botLink = 'https://t.me/merchzs_bot';
  // URL для генерации QR-кода
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(botLink)}`;

  // Проверка доступа к управлению (FULL доступ)
  const hasFullAccess = useMemo(() => {
    // DEVELOPER и ADMIN имеют полный доступ
    if (user && ['DEVELOPER', 'ADMIN'].includes(user.role)) {
      return true;
    }
    
    // Проверяем доступ через access context
    const merchAccess = access.find(tool => 
      tool.link === 'retail/merch' || tool.link === '/retail/merch'
    );
    
    return merchAccess?.accessLevel === 'FULL';
  }, [access, user]);

  // Загрузка состояния из localStorage с обработкой ошибок
  useEffect(() => {
    try {
      const savedState = localStorage.getItem(STORAGE_KEY);
      if (savedState !== null) {
        const parsed = JSON.parse(savedState);
        if (typeof parsed === 'boolean') {
          setIsHierarchyVisible(parsed);
        }
      }
    } catch (error) {
      console.error('Ошибка при чтении состояния иерархии из localStorage:', error);
      // Используем значение по умолчанию при ошибке
      setIsHierarchyVisible(true);
    }
  }, []);

  // Сохранение состояния в localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(isHierarchyVisible));
    } catch (error) {
      console.error('Ошибка при сохранении состояния иерархии в localStorage:', error);
    }
  }, [isHierarchyVisible]);

  // Устанавливаем заголовок страницы
  useEffect(() => {
    setHeader({
      title: 'Управление мерчем',
      subtitle: 'Создание и управление категориями и карточками товаров',
      icon: <Text size="xl" fw={700} c="white">🛍️</Text>,
    });

    return () => clearHeader();
  }, [setHeader, clearHeader]);

  // Мемоизация функции переключения иерархии
  const toggleHierarchy = useCallback(() => {
    setIsHierarchyVisible(prev => !prev);
  }, []);

  // Мемоизация стилей кнопки
  const toggleButtonClassName = useMemo(() => {
    return `merch-toggle-button ${isHierarchyVisible ? 'merch-toggle-button--visible' : 'merch-toggle-button--hidden'}`;
  }, [isHierarchyVisible]);

  return (
    <AppProvider>
      <MerchContent 
        hasFullAccess={hasFullAccess}
        isHierarchyVisible={isHierarchyVisible}
        toggleHierarchy={toggleHierarchy}
        toggleButtonClassName={toggleButtonClassName}
        qrOpened={qrOpened}
        qrClose={qrClose}
        qrOpen={qrOpen}
        qrCodeUrl={qrCodeUrl}
        botLink={botLink}
        sortOpened={sortOpened}
        sortOpen={sortOpen}
        sortClose={sortClose}
        globalSearchOpened={globalSearchOpened}
        globalSearchOpen={globalSearchOpen}
        globalSearchClose={globalSearchClose}
      />
    </AppProvider>
  );
}

// Внутренний компонент для использования контекста мерча
function MerchContent({
  hasFullAccess,
  isHierarchyVisible,
  toggleHierarchy,
  toggleButtonClassName,
  qrOpened,
  qrClose,
  qrOpen,
  qrCodeUrl,
  botLink,
  sortOpened,
  sortOpen,
  sortClose,
  globalSearchOpened,
  globalSearchOpen,
  globalSearchClose
}: {
  hasFullAccess: boolean;
  isHierarchyVisible: boolean;
  toggleHierarchy: () => void;
  toggleButtonClassName: string;
  qrOpened: boolean;
  qrClose: () => void;
  qrOpen: () => void;
  qrCodeUrl: string;
  botLink: string;
  sortOpened: boolean;
  sortOpen: () => void;
  sortClose: () => void;
  globalSearchOpened: boolean;
  globalSearchOpen: () => void;
  globalSearchClose: () => void;
}) {
  const { selectedId, setSelectedId } = useApp();

  // Обертки для модалок, чтобы преобразовать типы
  const MerchAddModal = useCallback(({ parentItem, onClose, onSuccess }: { parentItem?: HierarchyItem | null; onClose: () => void; onSuccess: () => void }) => {
    return <HierarchyAddModal parentItem={parentItem as DataItem | undefined} onClose={onClose} onSuccess={onSuccess} />;
  }, []);

  const MerchEditModal = useCallback(({ item, onClose, onSuccess }: { item: HierarchyItem; onClose: () => void; onSuccess: () => void }) => {
    return <HierarchyEditModal item={item as DataItem} onClose={onClose} onSuccess={onSuccess} />;
  }, []);

  const MerchDeleteModal = useCallback(({ item, onClose, onSuccess }: { item: HierarchyItem; onClose: () => void; onSuccess: () => void }) => {
    return <HierarchyDeleteModal item={item as DataItem} onClose={onClose} onSuccess={onSuccess} />;
  }, []);

  const authFetch = useAuthFetch();

  // Функция для сохранения порядка категорий через правильный endpoint
  const handleSaveCategoriesOrder = useCallback(async (items: any[], originalItems: any[]) => {
    // Группируем изменения по родителям
    const parentsToUpdate = new Set<string | null>();
    items.forEach(item => {
      parentsToUpdate.add(item.parentId);
      const original = originalItems.find(orig => orig.id === item.id);
      if (original && original.parentId !== item.parentId) {
        parentsToUpdate.add(original.parentId);
      }
    });

    // Обновляем порядок для каждого родителя
    for (const parentId of parentsToUpdate) {
      const sameParentItems = items.filter(i => i.parentId === parentId);
      const categoryIds = sameParentItems.map(item => item.id);

      // Используем правильный endpoint для обновления порядка
      const endpoint = parentId 
        ? `${API}/retail/merch/categories/${parentId}/order`
        : `${API}/retail/merch/categories/order`;
      
      const response = await authFetch(endpoint, {
        method: 'PATCH',
        body: JSON.stringify({ categoryIds })
      });

      if (!response || !response.ok) {
        throw new Error(`Ошибка обновления порядка для родителя ${parentId || 'null'}`);
      }
    }

    // Обновляем parentId для перемещенных элементов
    for (const item of items) {
      const original = originalItems.find(orig => orig.id === item.id);
      if (original && original.parentId !== item.parentId) {
        const endpoint = `${API}/retail/merch/categories/${item.id}/parent`;
        const response = await authFetch(endpoint, {
          method: 'PATCH',
          body: JSON.stringify({ parentId: item.parentId })
        });

        if (!response || !response.ok) {
          throw new Error(`Ошибка обновления родителя для категории ${item.id}`);
        }
      }
    }
  }, [authFetch]);

  return (
          <Box className="merch-container">
            <Box>
              <Tabs defaultValue="management">
                <Group justify="space-between" align="center" mb="md">
                  <Card shadow="sm" radius="lg" p="md" className="merch-navigation" style={{ flex: 1 }}>
                    <Tabs.List className="merch-tabs-list">
                      <Tabs.Tab 
                        value="management" 
                        leftSection={<IconShoppingBag size={18} />}
                        className="merch-tab-item"
                      >
                        Управление
                      </Tabs.Tab>
                      <Tabs.Tab 
                        value="stats" 
                        leftSection={<IconChartBar size={18} />}
                        className="merch-tab-item"
                      >
                        Статистика
                      </Tabs.Tab>
                      <Tabs.Tab 
                        value="feedback" 
                        leftSection={<IconMail size={18} />}
                        className="merch-tab-item"
                      >
                        Обратная связь
                      </Tabs.Tab>
                    </Tabs.List>
                  </Card>
                  <Group gap="xs">
                    {hasFullAccess && (
                      <>
                        <ActionIcon
                          variant="outline"
                          size={35}
                          aria-label="Сортировка категорий и карточек"
                          onClick={sortOpen}
                        >
                          <IconArrowsSort style={{ width: '70%', height: '70%' }} stroke={1.6} />
                        </ActionIcon>
                        <ActionIcon
                          variant="outline"
                          size={35}
                          aria-label="Поиск по всем карточкам"
                          onClick={globalSearchOpen}
                        >
                          <IconSearch style={{ width: '70%', height: '70%' }} stroke={1.6} />
                        </ActionIcon>
                      </>
                    )}
                    <ActionIcon 
                      variant="outline" 
                      size={35} 
                      aria-label="QR код бота" 
                      onClick={qrOpen}
                    >
                      <IconQrcode style={{ width: '80%', height: '80%' }} stroke={1.5} />
                    </ActionIcon>
                  </Group>
                </Group>

                <Tabs.Panel value="management" pt="md">
                <Box style={{ display: 'flex', gap: 'var(--mantine-spacing-md)', width: '100%', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                  {/* Контейнер для иерархии и кнопки */}
                  <Box className="merch-hierarchy-container" style={{ 
                    flex: isHierarchyVisible ? '0 0 30%' : '0 0 0', 
                    maxWidth: isHierarchyVisible ? '30%' : '0', 
                    minWidth: 0,
                    // Даем кнопке раскрытия возможность выходить за пределы контейнера
                    overflow: 'visible',
                    transition: 'flex 0.3s ease, max-width 0.3s ease'
                  }}>
                    {/* Иерархия с анимацией */}
                    <Collapse in={isHierarchyVisible} transitionDuration={TRANSITION_DURATION}>
                      <Paper 
                        withBorder
                        radius="md" 
                        p={0} 
                        className="merch-hierarchy-paper"
                      >
                        <Stack gap="md" style={{ height: '100%' }}>
                          <Group
                            justify="space-between"
                            align="center"
                          >

                          </Group>
                          <Box
                            style={{
                              flex: 1,
                              minHeight: 0,
                              maxHeight: 'calc(100vh - 200px)',
                              overflowY: 'auto',
                             padding:10,
                            }}
                          >
                            <Text size="lg" fw={600} className="merch-title">
                              Категории товаров
                            </Text>
                            <UniversalHierarchy
                              config={{
                                fetchItems: async (parentId?: string | null) => {
                                  return await getHierarchyData(parentId || undefined, 1);
                                },
                                parentField: 'parentId',
                                nameField: 'name',
                                idField: 'id',
                                rootFilter: (item) => item.layer === 1 && !item.parentId,
                                AddModal: MerchAddModal,
                                EditModal: MerchEditModal,
                                DeleteModal: MerchDeleteModal,
                                onItemSelect: (item) => {
                                  setSelectedId(item.id);
                                },
                                onDataUpdate: () => {}
                              }}
                              hasFullAccess={hasFullAccess}
                              externalSelectedContext={{
                                selectedId,
                                setSelectedId
                              }}
                            />
                          </Box>
                        </Stack>
                      </Paper>
                    </Collapse>
                    
                    {/* Плавающая кнопка */}
                    <ActionIcon
                      onClick={toggleHierarchy}
                      variant="filled"
                      size="md"
                      className={toggleButtonClassName}
                    >
                      {isHierarchyVisible ? 
                        <IconChevronLeft size={16} /> : 
                        <IconChevronRight size={16} />
                      }
                    </ActionIcon>
                  </Box>
                  
                  {/* Карточки */}
                  <Paper 
                    withBorder
                    radius="md" 
                    p="lg" 
                    className="merch-cards-paper"
                    style={{ 
                      flex: isHierarchyVisible ? '1 1 70%' : '1 1 100%', 
                      minWidth: 0,
                      transition: 'flex 0.3s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden'
                    }}
                  >
                    <Stack gap="md" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                      <Group justify="space-between" align="center">
                        <Text size="lg" fw={600} className="merch-title" style={{ paddingLeft: 10 }}>
                          Карточки товаров
                        </Text>
                      </Group>
                      <Box style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                        <CardGroup 
                          hasFullAccess={hasFullAccess}
                          onCardsUpdate={() => {}}
                        />
                      </Box>
                    </Stack>
                  </Paper>

                </Box>
              </Tabs.Panel>

              <Tabs.Panel value="stats" pt="md">
                <MerchStats />
              </Tabs.Panel>

              <Tabs.Panel value="feedback" pt="md">
                <MerchFeedback />
              </Tabs.Panel>
            </Tabs>
            
            {/* Модальное окно с QR-кодом */}
            <Modal 
              opened={qrOpened} 
              onClose={qrClose} 
              title="QR-код телеграм бота @merchzs_bot" 
              centered 
              zIndex={99999} 
              size="auto"
            >
              <Stack gap="md" align="center">
                <Image
                  radius="md"
                  h={300}
                  w={300}
                  fit="contain"
                  src={qrCodeUrl}
                  alt="QR код для бота @merchzs_bot"
                />
                <Text size="sm" c="dimmed" ta="center">
                  Отсканируйте QR-код, чтобы перейти к боту в Telegram
                </Text>
                <Text size="sm" c="blue" style={{ cursor: 'pointer' }} onClick={() => window.open(botLink, '_blank')}>
                  Или перейдите по ссылке: {botLink}
                </Text>
              </Stack>
            </Modal>

            {/* Модальное окно сортировки (fullscreen) */}
            {hasFullAccess && (
              <CustomModal
                opened={sortOpened}
                onClose={sortClose}
                title="Сортировка иерархии и карточек"
                width="100vw"
                height="100vh"
                maxWidth="100vw"
                maxHeight="100vh"
                centered={false}
                zIndex={10000}
                styles={{
                  content: {
                    margin: 0,
                    width: '100vw',
                    height: '100vh',
                    maxWidth: '100vw',
                    maxHeight: '100vh',
                    borderRadius: 0,
                    overflowY: 'hidden',
                  },
                  body: {
                    height: '100vh',
                    overflow: 'hidden',
                    overflowY: 'hidden',
                    padding: 0,
                  },
                  header: {
                    borderRadius: 0,
                  },
                }}
              >
                <UniversalHierarchySortModal
                  onClose={sortClose}
                  onSuccess={() => {
                    sortClose();
                    // Обновляем данные после сортировки
                    window.location.reload();
                  }}
                  config={{
                    fetchEndpoint: `${API}/retail/merch/categories`,
                    parentField: 'parentId',
                    sortField: 'sortOrder',
                    nameField: 'name',
                    idField: 'id',
                    additionalFilters: {
                      layer: 1 // Только категории
                    },
                    transformItem: (item: any) => ({
                      id: item.id,
                      name: item.name,
                      parentId: item.parentId || null,
                      level: 0,
                      originalLevel: 0,
                      originalParentId: item.parentId || null,
                      sortOrder: item.sortOrder || 0,
                      ...item
                    }),
                    onSave: handleSaveCategoriesOrder
                  }}
                />
              </CustomModal>
            )}

            {/* Модальное окно глобального поиска по карточкам */}
            {hasFullAccess && (
              <CustomModal
                opened={globalSearchOpened}
                onClose={globalSearchClose}
                title="Поиск по всем карточкам"
                size="xl"
                icon={<IconSearch size={20} />}
              >
                <GlobalCardSearchModal onClose={globalSearchClose} />
              </CustomModal>
            )}
          </Box>
        </Box>
  );
}

export default Merch;