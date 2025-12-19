import { useState, useMemo } from 'react';
import {
  Modal,
  TextInput,
  Button,
  Group,
  Stack,
  SimpleGrid,
  ActionIcon,
  Text,
  Paper,
  Badge,
  Pagination,
  Box,
} from '@mantine/core';
import * as TablerIcons from '@tabler/icons-react';
import { IconSearch, IconX } from '@tabler/icons-react';

interface IconPickerProps {
  opened: boolean;
  onClose: () => void;
  onSelect: (iconName: string) => void;
  currentIcon?: string;
}

const ICONS_PER_PAGE = 48; // 4 колонки * 12 строк

export function IconPicker({ opened, onClose, onSelect, currentIcon }: IconPickerProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  
  // Получаем все иконки из Tabler Icons - кешируем один раз при монтировании
  const allIcons = useMemo(() => {
    const icons: string[] = [];
    try {
      // Используем Object.keys для получения всех ключей
      const allKeys = Object.keys(TablerIcons);
      
      for (const key of allKeys) {
        // Фильтруем только иконки (начинаются с 'Icon' и имеют длину больше 4)
        if (key.startsWith('Icon') && key.length > 4) {
          // Проверяем, что это действительно экспорт иконки
          const iconComponent = (TablerIcons as any)[key];
          // Если компонент существует и не является примитивом, добавляем его
          if (iconComponent !== undefined && iconComponent !== null && 
              (typeof iconComponent === 'function' || typeof iconComponent === 'object')) {
            icons.push(key);
          }
        }
      }
    } catch (error) {
      // Ошибка загрузки иконок
    }
    return icons.sort();
  }, []);

  const filteredIcons = useMemo(() => {
    if (!search.trim()) return allIcons;
    const searchLower = search.toLowerCase();
    return allIcons.filter((icon) => 
      icon.toLowerCase().includes(searchLower)
    );
  }, [search, allIcons]);

  // Сбрасываем страницу при изменении поиска
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  // Вычисляем иконки для текущей страницы
  const paginatedIcons = useMemo(() => {
    const startIndex = (page - 1) * ICONS_PER_PAGE;
    const endIndex = startIndex + ICONS_PER_PAGE;
    return filteredIcons.slice(startIndex, endIndex);
  }, [filteredIcons, page]);

  const totalPages = Math.ceil(filteredIcons.length / ICONS_PER_PAGE);


  const handleSelect = (iconName: string) => {
    onSelect(iconName);
    onClose();
    setSearch('');
    setPage(1);
  };

  const getIconComponent = (iconName: string): React.ComponentType<{ size?: number; stroke?: number }> | null => {
    try {
      if (!iconName || !TablerIcons) {
        return null;
      }
      // Используем тот же подход, что и в Navigation.tsx
      const IconComponent = TablerIcons[iconName as keyof typeof TablerIcons] as React.ComponentType<{
        size?: number;
        stroke?: number;
      }>;
      
      // Если компонент существует (не undefined и не null), возвращаем его
      // React компоненты могут быть функциями или объектами (forwardRef, memo и т.д.)
      if (IconComponent) {
        return IconComponent;
      }
    } catch (error) {
      // Ошибка получения компонента иконки
    }
    return null;
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Выберите иконку"
      size="xl"
      styles={{
        body: { padding: 0 },
      }}
    >
      <Stack gap="md" p="md">
        <TextInput
          placeholder="Поиск иконки..."
          leftSection={<IconSearch size={16} />}
          rightSection={
            search ? (
              <ActionIcon size="sm" variant="transparent" onClick={() => setSearch('')}>
                <IconX size={16} />
              </ActionIcon>
            ) : null
          }
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />

        {currentIcon && (() => {
          const CurrentIconComponent = getIconComponent(currentIcon);
          return CurrentIconComponent ? (
            <Paper p="sm" withBorder>
              <Group gap="sm">
                <Text size="sm" fw={500}>Текущая иконка:</Text>
                <CurrentIconComponent size={24} stroke={1.5} />
                <Badge variant="light">{currentIcon}</Badge>
              </Group>
            </Paper>
          ) : null;
        })()}

        <Box style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {paginatedIcons.length === 0 ? (
            <Paper p="xl" ta="center">
              <Text c="dimmed">Иконки не найдены</Text>
            </Paper>
          ) : (
            <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="xs" p="xs">
              {paginatedIcons.map((iconName) => {
                const IconComponent = getIconComponent(iconName);
                if (!IconComponent) {
                  return null;
                }

                const isSelected = currentIcon === iconName;

                try {
                  return (
                    <Paper
                      key={iconName}
                      p="md"
                      withBorder
                      style={{
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        borderColor: isSelected ? 'var(--mantine-color-blue-6)' : undefined,
                        backgroundColor: isSelected ? 'var(--mantine-color-blue-0)' : undefined,
                      }}
                      onClick={() => handleSelect(iconName)}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-0)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      <Stack align="center" gap="xs">
                        <IconComponent size={24} stroke={1.5} />
                        <Text size="xs" ta="center" c="dimmed" lineClamp={2}>
                          {iconName.replace('Icon', '')}
                        </Text>
                      </Stack>
                    </Paper>
                  );
                  } catch (error) {
                    return null;
                  }
              })}
            </SimpleGrid>
          )}
        </Box>

        {/* Пагинация */}
        {totalPages > 1 && (
          <Group justify="center">
            <Pagination
              value={page}
              onChange={setPage}
              total={totalPages}
              size="sm"
            />
          </Group>
        )}

        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Найдено: {filteredIcons.length} из {allIcons.length}
            {totalPages > 1 && ` • Страница ${page} из ${totalPages}`}
          </Text>
          <Button variant="light" onClick={onClose}>
            Отмена
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

