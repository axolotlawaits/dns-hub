import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Group, 
  ActionIcon, 
  Box, 
  Collapse,
  Paper,
  Text,
  Stack,
  Tabs
} from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconChartBar, IconShoppingBag } from '@tabler/icons-react';
import { usePageHeader } from '../../../contexts/PageHeaderContext';
import { AppProvider } from './context/SelectedCategoryContext';
import Hierarchy from './components/Hierarchy/Hierarchy';
import CardGroup from './components/Card/CardGroup';
import MerchStats from './components/Stats/MerchStats';
import { DndProviderWrapper } from '../../../utils/dnd';
import './Merch.css';

// Константы
const TRANSITION_DURATION = 300;
const STORAGE_KEY = 'merchHierarchyVisible';

function Merch() {
  const { setHeader, clearHeader } = usePageHeader();
  const [isHierarchyVisible, setIsHierarchyVisible] = useState<boolean>(true);

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
    <DndProviderWrapper>
      <AppProvider>
        <Box className="merch-container">
          <Box p="xl">
            <Tabs defaultValue="management">
              <Tabs.List>
                <Tabs.Tab value="management" leftSection={<IconShoppingBag size={16} />}>
                  Управление
                </Tabs.Tab>
                <Tabs.Tab value="stats" leftSection={<IconChartBar size={16} />}>
                  Статистика
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="management" pt="md">
                <Group align="flex-start" gap="md" style={{ width: '100%' }}>
                  {/* Контейнер для иерархии и кнопки */}
                  <Box className="merch-hierarchy-container">
                    {/* Иерархия с анимацией */}
                    <Collapse in={isHierarchyVisible} transitionDuration={TRANSITION_DURATION}>
                      <Paper 
                        withBorder
                        radius="md" 
                        p="lg" 
                        className="merch-hierarchy-paper"
                      >
                        <Stack gap="md">
                          <Text size="lg" fw={600} className="merch-title">
                            Категории товаров
                          </Text>
                          <Hierarchy/>
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
                  >
                    <Stack gap="md">
                      <Text size="lg" fw={600} className="merch-title">
                        Карточки товаров
                      </Text>
                      <CardGroup/>
                    </Stack>
                  </Paper>
                </Group>
              </Tabs.Panel>

              <Tabs.Panel value="stats" pt="md">
                <MerchStats />
              </Tabs.Panel>
            </Tabs>
          </Box>
        </Box>
      </AppProvider>
    </DndProviderWrapper>
  );
}

export default Merch;