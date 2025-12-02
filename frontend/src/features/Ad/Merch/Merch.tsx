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
import { AppProvider } from './context/SelectedCategoryContext';
import Hierarchy from './components/Hierarchy/Hierarchy';
import CardGroup from './components/Card/CardGroup';
import { GlobalCardSearchModal } from './components/Card/GlobalCardSearchModal';
import { CustomModal } from '../../../utils/CustomModal';
import { HierarchySortModal } from './components/Hierarchy/HierarchySortModal';
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
      tool.link === 'add/merch' || tool.link === '/add/merch'
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
          <Box className="merch-container">
            <Box p="xl">
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
                            <Hierarchy 
                              hasFullAccess={hasFullAccess}
                              onDataUpdate={() => {}}
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
                      transition: 'flex 0.3s ease'
                    }}
                  >
                    <Stack gap="md">
                      <Group justify="space-between" align="center">
                        <Text size="lg" fw={600} className="merch-title" style={{ paddingLeft: 10 }}>
                          Карточки товаров
                        </Text>
                      </Group>
                      <CardGroup 
                        hasFullAccess={hasFullAccess}
                        onCardsUpdate={() => {}}
                      />
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
                <HierarchySortModal
                  onClose={sortClose}
                  onSuccess={() => {
                    sortClose();
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
      </AppProvider>
  );
}

export default Merch;