import { useState, useEffect } from 'react';
import { 
  Group, 
  ActionIcon, 
  Box, 
  Collapse,
  Paper,
  Text,
  Stack
} from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconRefresh } from '@tabler/icons-react';
import { usePageHeader } from '../../../contexts/PageHeaderContext';
import { AppProvider } from './context/SelectedCategoryContext';
import Hierarchy from './components/Hierarchy/Hierarchy';
import CardGroup from './components/Card/CardGroup';
import { DndProviderWrapper } from '../../../utils/dnd';

function Merch() {
  const { setHeader, clearHeader } = usePageHeader();
  const [isHierarchyVisible, setIsHierarchyVisible] = useState(true);

  useEffect(() => {
    const savedState = localStorage.getItem('merchHierarchyVisible');
    if (savedState !== null) {
      setIsHierarchyVisible(JSON.parse(savedState));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('merchHierarchyVisible', JSON.stringify(isHierarchyVisible));
  }, [isHierarchyVisible]);

  // Устанавливаем заголовок страницы
  useEffect(() => {
    setHeader({
      title: 'Управление мерчем',
      subtitle: 'Создание и управление категориями и карточками товаров',
      icon: <Text size="xl" fw={700} c="white">🛍️</Text>,
      actionButton: {
        text: 'Обновить данные',
        onClick: () => window.location.reload(),
        icon: <IconRefresh size={18} />
      }
    });

    return () => clearHeader();
  }, [setHeader, clearHeader]);

  const toggleHierarchy = () => {
    setIsHierarchyVisible(!isHierarchyVisible);
  };

  return (
    <DndProviderWrapper>
      <AppProvider>
        <Box
          style={{
            background: 'var(--theme-bg-primary)',
            minHeight: '50vh'
          }}
        >
        <Box p="xl">
          <Group align="flex-start" gap="md">
            {/* Контейнер для иерархии и кнопки */}
            <Box style={{ 
              display: 'flex', 
              alignItems: 'flex-start',
              position: 'relative'
            }}>
              {/* Иерархия с анимацией */}
              <Collapse in={isHierarchyVisible} transitionDuration={300}>
                <Paper 
                  withBorder
                  radius="md" 
                  p="lg" 
                  style={{ 
                    width: 700,
                    minHeight: 500,
                    background: 'var(--theme-bg-primary)'
                  }}
                >
                  <Stack gap="md">
                    <Text size="lg" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
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
                style={{
                  position: 'absolute',
                  left: isHierarchyVisible ? 715 : -15,
                  top: 10,
                  zIndex: 10,
                  transition: 'left 0.3s ease',
                  background: 'var(--color-primary-500)'
                }}
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
              style={{ 
                flex: 1,
                minWidth: 300,
                minHeight: 500,
                background: 'var(--theme-bg-primary)',
                transition: 'margin-left 0.3s ease'
              }}
            >
              <Stack gap="md">
                <Text size="lg" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
                  Карточки товаров
                </Text>
                <CardGroup/>
              </Stack>
            </Paper>
          </Group>
        </Box>
      </Box>
    </AppProvider>
    </DndProviderWrapper>
  );
}

export default Merch;