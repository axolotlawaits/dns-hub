import { useState, useEffect, useMemo, useCallback } from 'react';
import { ColumnFiltersState } from '@tanstack/react-table';
import {
  Paper,
  Title,
  Button,
  Group,
  Modal,
  Badge,
  Stack,
  Alert,
  Text,
  Grid,
  Divider,
  Box,
  ActionIcon,
  Tooltip
} from '@mantine/core';
import { IconPlus, IconAlertCircle, IconMenu2, IconArrowsSort } from '@tabler/icons-react';
import * as TablerIcons from '@tabler/icons-react';
import { DynamicFormModal } from '../../../utils/formModal';
import { FilterGroup } from '../../../utils/filter';
import useAuthFetch from '../../../hooks/useAuthFetch';
import { API } from '../../../config/constants';
import { UniversalHierarchy, HierarchyItem } from '../../../utils/UniversalHierarchy';
import { UniversalHierarchySortModal } from '../../../utils/UniversalHierarchySortModal';
import { flattenTree, buildTree } from '../../../utils/hierarchy';
import { CustomModal } from '../../../utils/CustomModal';
import { useDisclosure } from '@mantine/hooks';

interface MenuItem {
  id: string;
  parent_id: string | null;
  name: string;
  icon: string;
  link: string;
  description: string | null;
  order: number;
  included: boolean;
  types?: Array<{
    id: string;
    name: string;
    chapter: string;
  }>;
}

export default function NavigationManagement() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpened, setModalOpened] = useState(false);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedRootItem, setSelectedRootItem] = useState<string | null>(null);
  const [isChildMode, setIsChildMode] = useState(false); // Режим создания дочернего элемента
  const [error, setError] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sortModalOpened, { open: openSortModal, close: closeSortModal }] = useDisclosure(false);

  const authFetch = useAuthFetch();

  useEffect(() => {
    fetchMenuItems();
  }, []);

  const fetchMenuItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await authFetch(`${API}/navigation/all`);
      if (response && response.ok) {
        const data = await response.json();
        setMenuItems(Array.isArray(data) ? data : []);
      } else {
        const errorData = await response?.json().catch(() => ({ error: 'Unknown error' }));
        setError(errorData?.error || 'Ошибка загрузки пунктов меню');
        setMenuItems([]);
      }
    } catch (error) {
      console.error('Error fetching menu items:', error);
      setError(error instanceof Error ? error.message : 'Ошибка загрузки пунктов меню');
      setMenuItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = (childMode: boolean = false, parentId: string | null = null) => {
    setSelectedItem(null);
    setIsChildMode(childMode);
    if (childMode && parentId) {
      setSelectedRootItem(parentId);
    }
    setModalOpened(true);
  };

  const handleEdit = useCallback((item: MenuItem) => {
    setSelectedItem(item);
    setIsChildMode(!!item.parent_id);
    setModalOpened(true);
  }, []);

  const handleDelete = useCallback((item: MenuItem) => {
    setSelectedItem(item);
    setDeleteModalOpened(true);
  }, []);

  // Обертки для модалок UniversalHierarchy
  const NavigationAddModal = useCallback(({ parentItem, onSuccess }: { parentItem?: HierarchyItem | null; onClose: () => void; onSuccess: () => void }) => {
    // Если parentItem передан, значит добавляем дочерний элемент
    if (parentItem) {
      handleCreate(true, parentItem.id);
    } else {
      // Иначе добавляем корневой элемент
      handleCreate(false);
    }
    onSuccess(); // Закрываем модалку UniversalHierarchy
    return null;
  }, [handleCreate]);

  const NavigationEditModal = useCallback(({ item, onSuccess }: { item: HierarchyItem; onClose: () => void; onSuccess: () => void }) => {
    handleEdit(item as MenuItem);
    onSuccess(); // Закрываем модалку UniversalHierarchy
    return null;
  }, [handleEdit]);

  const NavigationDeleteModal = useCallback(({ item, onSuccess }: { item: HierarchyItem; onClose: () => void; onSuccess: () => void }) => {
    handleDelete(item as MenuItem);
    onSuccess(); // Закрываем модалку UniversalHierarchy
    return null;
  }, [handleDelete]);

  // Обработчик для AddModal в правой колонке (для дочерних элементов)
  const NavigationAddModalForChildren = useCallback(({ onSuccess }: { parentItem?: HierarchyItem | null; onClose: () => void; onSuccess: () => void }) => {
    // Для правой колонки всегда передаем selectedRootItem как parentItem
    if (selectedRootItem) {
      handleCreate(true, selectedRootItem);
    }
    onSuccess();
    return null;
  }, [selectedRootItem, handleCreate]);

  const handleSave = async (formData: any) => {
    try {
      setError(null);
      
      // Автоматически определяем порядок сортировки
      let order = formData.order;
      if (!order || order === 0) {
        if (isChildMode && selectedRootItem) {
          // Для дочернего элемента - максимальный order среди дочерних + 1
          const siblings = menuItems.filter(item => item.parent_id === selectedRootItem);
          order = siblings.length > 0 
            ? Math.max(...siblings.map(s => s.order)) + 1 
            : 1;
        } else {
          // Для корневого элемента - максимальный order среди корневых + 1
          const rootItems = menuItems.filter(item => !item.parent_id);
          order = rootItems.length > 0 
            ? Math.max(...rootItems.map(r => r.order)) + 1 
            : 1;
        }
      }

      // Автоматически подписываем endpoint для дочерних элементов
      let link = formData.link;
      if (isChildMode && selectedRootItem) {
        const parentItem = menuItems.find(item => item.id === selectedRootItem);
        if (parentItem && link) {
          // Всегда добавляем link родителя к дочернему элементу
          const parentLink = parentItem.link.endsWith('/') 
            ? parentItem.link.slice(0, -1) 
            : parentItem.link;
          // Убираем ведущий слэш из link дочернего элемента, если есть
          const childLink = link.startsWith('/') ? link.slice(1) : link;
          link = `${parentLink}/${childLink}`;
        }
      } else if (selectedItem?.parent_id) {
        // При редактировании дочернего элемента также добавляем родительский link
        const parentItem = menuItems.find(item => item.id === selectedItem.parent_id);
        if (parentItem && link && !link.startsWith(parentItem.link)) {
          const parentLink = parentItem.link.endsWith('/') 
            ? parentItem.link.slice(0, -1) 
            : parentItem.link;
          const childLink = link.startsWith('/') ? link.slice(1) : link;
          link = `${parentLink}/${childLink}`;
        }
      }

      // Определяем parent_id
      let parentId = null;
      if (isChildMode && selectedRootItem) {
        parentId = selectedRootItem;
      } else if (selectedItem) {
        // При редактировании используем существующий parent_id или из формы
        parentId = formData.parent_id || selectedItem.parent_id || null;
      } else {
        // При создании корневого элемента parent_id = null
        parentId = null;
      }

      // Нормализуем значение иконки - убеждаемся, что это полное название с префиксом "Icon"
      let iconValue = formData.icon || '';
      if (iconValue && !iconValue.startsWith('Icon')) {
        // Если значение без префикса "Icon", добавляем его
        iconValue = `Icon${iconValue.charAt(0).toUpperCase() + iconValue.slice(1)}`;
      }
      // Если значение пустое, используем значение из selectedItem (при редактировании)
      if (!iconValue && selectedItem?.icon) {
        iconValue = selectedItem.icon;
      }

      const data = {
        ...formData,
        icon: iconValue,
        link,
        order,
        parent_id: parentId,
        included: formData.included !== undefined ? formData.included : true,
      };

      if (selectedItem) {
        // Обновление
        const response = await authFetch(`${API}/navigation/${selectedItem.id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
        if (response && response.ok) {
          await fetchMenuItems();
          setModalOpened(false);
          setIsChildMode(false);
        } else {
          const errorData = await response?.json();
          setError(errorData?.error || 'Ошибка обновления пункта меню');
        }
      } else {
        // Создание
        const response = await authFetch(`${API}/navigation`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        if (response && response.ok) {
          await fetchMenuItems();
          setModalOpened(false);
          setIsChildMode(false);
        } else {
          const errorData = await response?.json();
          setError(errorData?.error || 'Ошибка создания пункта меню');
        }
      }
    } catch (error) {
      console.error('Error saving menu item:', error);
      setError('Ошибка сохранения пункта меню');
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedItem) return;

    try {
      setError(null);
      const response = await authFetch(`${API}/navigation/${selectedItem.id}`, {
        method: 'DELETE',
      });
      if (response && response.ok) {
        await fetchMenuItems();
        setDeleteModalOpened(false);
        setSelectedItem(null);
      } else {
        const errorData = await response?.json();
        setError(errorData?.error || 'Ошибка удаления пункта меню');
      }
    } catch (error) {
      console.error('Error deleting menu item:', error);
      setError('Ошибка удаления пункта меню');
    }
  };

  // Получаем список родительских элементов для селекта (только корневые)
  const parentOptions = useMemo(() => menuItems
    .filter(item => item.id !== selectedItem?.id && !item.parent_id)
    .map(item => ({ value: item.id, label: item.name })), [menuItems, selectedItem]);

  // Получаем родительский элемент для подсказки endpoint
  const parentItemForHint = useMemo(() => {
    if (isChildMode && selectedRootItem) {
      return menuItems.find(item => item.id === selectedRootItem);
    }
    if (selectedItem?.parent_id) {
      return menuItems.find(item => item.id === selectedItem.parent_id);
    }
    return null;
  }, [isChildMode, selectedRootItem, selectedItem, menuItems]);

  const formFields = useMemo(() => {
    const fields: any[] = [];
    
    // Показываем parent_id только при редактировании (не при создании)
    if (selectedItem) {
      fields.push({
        name: 'parent_id',
        label: 'Родительский пункт',
        type: 'select' as const,
        required: false,
        options: [{ value: '', label: 'Нет (корневой элемент)' }, ...parentOptions],
      });
    }

    fields.push(
      {
        name: 'name',
        label: 'Название',
        type: 'text' as const,
        required: true,
      },
      {
        name: 'icon',
        label: 'Иконка (Tabler Icons)',
        type: 'icon' as const,
        required: true,
        placeholder: 'Выберите иконку',
      },
      {
        name: 'link',
        label: 'Ссылка',
        type: 'text' as const,
        required: true,
        placeholder: isChildMode && parentItemForHint 
          ? `your-path (будет: ${parentItemForHint.link}/your-path)` 
          : '/path/to/page',
        description: isChildMode && parentItemForHint 
          ? `Будет автоматически добавлен к: ${parentItemForHint.link}/` 
          : undefined,
      },
      {
        name: 'description',
        label: 'Описание',
        type: 'textarea' as const,
        required: false,
      }
    );

    // Порядок сортировки скрыт - определяется автоматически

    fields.push({
      name: 'included',
      label: 'Включен в меню',
      type: 'boolean' as const,
      required: false,
    });

    return fields;
  }, [parentOptions, isChildMode, parentItemForHint, selectedItem]);

  const initialValues = useMemo(() => {
    if (selectedItem) {
      // При редактировании
      const parentItem = selectedItem.parent_id 
        ? menuItems.find(item => item.id === selectedItem.parent_id)
        : null;
      
      // Если это дочерний элемент, показываем только дочернюю часть ссылки
      let linkValue = selectedItem.link;
      if (parentItem && linkValue.startsWith(parentItem.link)) {
        // Извлекаем только дочернюю часть
        linkValue = linkValue.substring(parentItem.link.length);
        if (linkValue.startsWith('/')) {
          linkValue = linkValue.substring(1);
        }
      }
      
      return {
        parent_id: selectedItem.parent_id || '',
        name: selectedItem.name,
        icon: selectedItem.icon,
        link: linkValue,
        description: selectedItem.description || '',
        included: selectedItem.included,
      };
    }
    if (isChildMode && selectedRootItem) {
      // При создании дочернего элемента - пустая строка, будет добавлена родительская часть
      return {
        name: '',
        icon: '',
        link: '',
        description: '',
        included: true,
      };
    }
    // Корневой элемент - без parent_id
    return {
      name: '',
      icon: '',
      link: '',
      description: '',
      included: true,
    };
  }, [selectedItem, isChildMode, selectedRootItem, menuItems]);

  const handleColumnFiltersChange = (columnId: string, value: any) => {
    setColumnFilters(prev => {
      const filtered = prev.filter(f => f.id !== columnId);
      if (value && (Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0)) {
        return [...filtered, { id: columnId, value }];
      }
      return filtered;
    });
  };

  // Получаем значения фильтров
  const includedFilter = columnFilters.find(f => f.id === 'included')?.value as string[] || [];
  const nameFilter = columnFilters.find(f => f.id === 'name')?.value as string[] || [];

  // Функция для применения фильтров (мемоизирована)
  const applyFilters = useCallback((items: MenuItem[]) => {
    return items.filter(item => {
      // Фильтр по статусу
      if (includedFilter.length > 0) {
        const included = includedFilter.includes('true');
        const excluded = includedFilter.includes('false');
        if (included && !excluded && !item.included) return false;
        if (excluded && !included && item.included) return false;
      }
      // Фильтр по названию
      const nameSearch = nameFilter.length > 0 ? nameFilter[0].toLowerCase() : '';
      if (nameSearch && !item.name.toLowerCase().includes(nameSearch)) return false;
      return true;
    });
  }, [includedFilter, nameFilter]);

  // Получаем только корневые элементы для левой колонки (без иерархии)
  const rootItemsForLeftColumn = useMemo(() => {
    const filtered = menuItems.filter(item => item.parent_id === null);
    return applyFilters(filtered)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [menuItems, applyFilters]);

  // Получаем уникальные родительские элементы для фильтра
  const rootItems = useMemo(() => {
    const filtered = menuItems.filter(item => item.parent_id === null);
    return applyFilters(filtered)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [menuItems, includedFilter, nameFilter]);

  // Получаем все элементы меню в плоском виде для UniversalHierarchy (чтобы дочерние элементы могли быть найдены)
  const allMenuItemsFlat = useMemo(() => {
    const filtered = applyFilters(menuItems);
    const tree = buildTree(filtered, {
      parentField: 'parent_id',
      sortField: 'order',
      nameField: 'name',
      childrenField: 'children'
    });
    return flattenTree(tree, {
      parentField: 'parent_id',
      sortField: 'order',
      nameField: 'name',
      childrenField: 'children'
    });
  }, [menuItems, applyFilters]);

  // Получаем корневые элементы (плоский список для UniversalHierarchy)
  const rootItemsFlat = useMemo(() => {
    const filtered = applyFilters(rootItemsForLeftColumn);
    return filtered.map(item => ({ ...item, parent_id: null }));
  }, [rootItemsForLeftColumn, applyFilters]);

  // Получаем дочерние элементы выбранного корневого пункта с иерархией (плоский список для UniversalHierarchy)
  const childItemsFlat = useMemo(() => {
    if (!selectedRootItem) return [];
    
    const children = menuItems.filter(item => item.parent_id === selectedRootItem);
    const filtered = applyFilters(children);
    const tree = buildTree(filtered, {
      parentField: 'parent_id',
      sortField: 'order',
      nameField: 'name',
      childrenField: 'children'
    });
    
    return flattenTree(tree, {
      parentField: 'parent_id',
      sortField: 'order',
      nameField: 'name',
      childrenField: 'children'
    });
  }, [menuItems, selectedRootItem, applyFilters]);

  const filterConfig = useMemo(() => [
    {
      type: 'select' as const,
      columnId: 'parent',
      label: 'Родительский пункт',
      placeholder: 'Выберите родительские пункты',
      options: [
        { value: 'root', label: 'Корневые элементы' },
        ...rootItems.map(item => ({ value: item.id, label: item.name })),
      ],
    },
    {
      type: 'select' as const,
      columnId: 'included',
      label: 'Статус',
      placeholder: 'Выберите статусы',
      options: [
        { value: 'true', label: 'Включен' },
        { value: 'false', label: 'Скрыт' },
      ],
    },
    {
      type: 'text' as const,
      columnId: 'name',
      label: 'Название',
      placeholder: 'Поиск по названию...',
    },
  ], [rootItems]);

  return (
    <Box size="xl">
      <Stack gap="md">
        {error && (
          <Alert icon={<IconAlertCircle size={18} />} color="red" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        {/* Фильтры */}
        <Group justify="space-between" align="flex-start">
          <Box style={{ flex: 1 }}>
            <FilterGroup
              filters={filterConfig}
              columnFilters={columnFilters}
              onColumnFiltersChange={handleColumnFiltersChange}
            />
          </Box>
          <Group gap="xs" style={{ alignSelf: 'flex-start', marginTop: '8px' }}>
            <Button 
              leftSection={<IconPlus size={18} />} 
              onClick={() => handleCreate(false)}
              variant="filled"
            >
              Добавить корневой пункт
            </Button>
            {selectedRootItem && (
              <Button 
                leftSection={<IconPlus size={18} />} 
                onClick={() => handleCreate(true, selectedRootItem)}
                variant="light"
              >
                Добавить дочерний пункт
              </Button>
            )}
          </Group>
        </Group>

        {/* Две колонки: корневые и дочерние */}
        <Grid gutter="md">
          {/* Левая колонка: Корневые пункты с иерархией */}
          <Grid.Col span={4}>
            <Paper shadow="sm" p="md" radius="md" withBorder h="calc(100vh - 300px)">
              <Stack gap="md" h="100%">
                <Group justify="space-between">
                  <Title order={4}>Корневые пункты</Title>
                  <Group gap="xs">
                    <Badge variant="light">{rootItemsFlat.length}</Badge>
                    {rootItemsFlat.length > 0 && (
                      <Tooltip label="Сортировка иерархии">
                        <ActionIcon
                          variant="light"
                          color="blue"
                          onClick={openSortModal}
                        >
                          <IconArrowsSort size={18} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Group>
                {loading ? (
                  <Text c="dimmed">Загрузка...</Text>
                ) : (
                  <Box style={{ flex: 1, overflow: 'auto' }}>
                    <UniversalHierarchy
                      config={{
                        initialData: rootItemsFlat, // Только корневые элементы без дочерних
                        parentField: 'parent_id',
                        nameField: 'name',
                        idField: 'id',
                        rootFilter: (item) => !item.parent_id, // Все элементы уже корневые
                        disableExpansion: true, // Отключаем раскрытие дочерних элементов в левой колонке
                        AddModal: NavigationAddModal,
                        EditModal: NavigationEditModal,
                        DeleteModal: NavigationDeleteModal,
                        renderItem: (item: HierarchyItem, isSelected: boolean) => {
                          const menuItem = item as MenuItem;
                          const IconComponent = TablerIcons[menuItem.icon as keyof typeof TablerIcons] as 
                            React.ComponentType<{ size?: number; stroke?: number }> | undefined;
                          return (
                            <Group gap="xs" style={{ width: '100%' }}>
                              {IconComponent ? (
                                <IconComponent size={16} stroke={1.5} />
                              ) : (
                                <IconMenu2 size={16} />
                              )}
                              <Text fw={isSelected ? 600 : 400} style={{ flex: 1 }}>
                                {menuItem.name}
                              </Text>
                              <Badge color={menuItem.included ? 'green' : 'gray'} size="sm">
                                {menuItem.included ? 'Вкл' : 'Скрыт'}
                              </Badge>
                            </Group>
                          );
                        },
                        onItemSelect: (item) => {
                          setSelectedRootItem(item.id);
                        },
                        onDataUpdate: () => {
                          fetchMenuItems();
                        }
                      }}
                      hasFullAccess={true}
                      initialSelectedId={selectedRootItem}
                    />
                  </Box>
                )}
              </Stack>
            </Paper>
          </Grid.Col>

          {/* Разделитель */}
          <Grid.Col span={0.5}>
            <Divider orientation="vertical" />
          </Grid.Col>

          {/* Правая колонка: Дочерние пункты */}
          <Grid.Col span={7.5}>
            <Paper shadow="sm" p="md" radius="md" withBorder h="calc(100vh - 300px)">
              <Stack gap="md" h="100%">
                <Group justify="space-between">
                  <Title order={4}>
                    Дочерние пункты
                    {selectedRootItem && (
                      <Text span c="dimmed" size="sm" fw={400}>
                        {' '}({rootItems.find(r => r.id === selectedRootItem)?.name || ''})
                      </Text>
                    )}
                  </Title>
                  <Group>
                    {childItemsFlat.length > 0 && (
                      <Badge variant="light">{childItemsFlat.length}</Badge>
                    )}
                    {selectedRootItem && (
                      <Button 
                        size="xs"
                        leftSection={<IconPlus size={14} />} 
                        onClick={() => handleCreate(true, selectedRootItem)}
                        variant="light"
                      >
                        Добавить дочерний
                      </Button>
                    )}
                  </Group>
                </Group>
                {loading ? (
                  <Text c="dimmed">Загрузка...</Text>
                ) : !selectedRootItem ? (
                  <Box
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      flexDirection: 'column',
                      gap: 16,
                    }}
                  >
                    <IconMenu2 size={48} color="var(--mantine-color-gray-4)" />
                    <Text c="dimmed" size="lg">
                      Выберите корневой пункт слева для просмотра дочерних элементов
                    </Text>
                  </Box>
                ) : (
                  <Box style={{ flex: 1, overflow: 'auto' }}>
                    <UniversalHierarchy
                      config={{
                        initialData: allMenuItemsFlat,
                        parentField: 'parent_id',
                        nameField: 'name',
                        idField: 'id',
                        rootFilter: (item) => {
                          // Показываем только прямых дочерних элементов выбранного корневого пункта
                          // UniversalHierarchy сам найдет и отобразит их потомков рекурсивно
                          return item.parent_id === selectedRootItem;
                        },
                        AddModal: NavigationAddModalForChildren,
                        EditModal: NavigationEditModal,
                        DeleteModal: NavigationDeleteModal,
                        renderItem: (item: HierarchyItem, isSelected: boolean) => {
                          const menuItem = item as MenuItem;
                          const IconComponent = TablerIcons[menuItem.icon as keyof typeof TablerIcons] as 
                            React.ComponentType<{ size?: number; stroke?: number }> | undefined;
                          return (
                            <Group gap="xs" style={{ width: '100%' }}>
                              {IconComponent ? (
                                <IconComponent size={16} stroke={1.5} />
                              ) : (
                                <IconMenu2 size={16} />
                              )}
                              <Text fw={isSelected ? 600 : 400} style={{ flex: 1 }}>
                                {menuItem.name}
                              </Text>
                              <Badge color={menuItem.included ? 'green' : 'gray'} size="sm">
                                {menuItem.included ? 'Включен' : 'Скрыт'}
                              </Badge>
                            </Group>
                          );
                        },
                        onItemSelect: () => {
                          // Можно добавить логику выбора дочернего элемента
                        },
                        onDataUpdate: () => {
                          fetchMenuItems();
                        }
                      }}
                      hasFullAccess={true}
                    />
                  </Box>
                )}
              </Stack>
            </Paper>
          </Grid.Col>
        </Grid>

        <DynamicFormModal
          opened={modalOpened}
          onClose={() => {
            setModalOpened(false);
            setSelectedItem(null);
            setIsChildMode(false);
            setError(null);
          }}
          title={
            selectedItem 
              ? 'Редактировать пункт меню' 
              : isChildMode 
                ? 'Добавить дочерний пункт меню' 
                : 'Добавить корневой пункт меню'
          }
          mode={selectedItem ? 'edit' : 'create'}
          fields={formFields}
          initialValues={initialValues || {}}
          onSubmit={handleSave}
        />

        <Modal
          opened={deleteModalOpened}
          onClose={() => {
            setDeleteModalOpened(false);
            setSelectedItem(null);
            setError(null);
          }}
          title="Подтверждение удаления"
        >
          <Text mb="md">
            Вы уверены, что хотите удалить пункт меню "{selectedItem?.name}"?
            {selectedItem && menuItems.some(item => item.parent_id === selectedItem.id) && (
              <Alert icon={<IconAlertCircle size={18} />} color="yellow" mt="md">
                Внимание! У этого пункта есть дочерние элементы. Сначала удалите или переместите их.
              </Alert>
            )}
          </Text>
          {error && (
            <Alert icon={<IconAlertCircle size={18} />} color="red" mb="md">
              {error}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteModalOpened(false);
                setSelectedItem(null);
              }}
            >
              Отмена
            </Button>
            <Button color="red" onClick={handleConfirmDelete}>
              Удалить
            </Button>
          </Group>
        </Modal>

        {/* Модалка сортировки иерархии */}
        {rootItemsFlat.length > 0 && (
          <CustomModal
            opened={sortModalOpened}
            onClose={closeSortModal}
            title="Сортировка иерархии навигации"
            size="xl"
            icon={<IconArrowsSort size={20} />}
          >
            <UniversalHierarchySortModal
              onClose={closeSortModal}
              onSuccess={() => {
                fetchMenuItems();
                closeSortModal();
              }}
              config={{
                fetchEndpoint: `${API}/navigation/all`,
                updateItemEndpoint: (id: string) => `${API}/navigation/${id}`,
                parentField: 'parent_id',
                sortField: 'order',
                nameField: 'name',
                idField: 'id',
                transformItem: (item: MenuItem) => {
                  const { id, name, parent_id, order, ...rest } = item;
                  return {
                    id,
                    name,
                    parentId: parent_id || null,
                    level: 0,
                    originalLevel: 0,
                    originalParentId: parent_id || null,
                    sortOrder: order || 0,
                    ...rest
                  };
                },
                onSave: async (items, originalItems) => {
                  // Находим все измененные элементы
                  const movedItems = items.filter(item => {
                    const original = originalItems.find(orig => orig.id === item.id);
                    if (!original) return false;
                    
                    if (item.parentId !== original.parentId || item.level !== original.level) {
                      return true;
                    }
                    
                    const currentSameParent = items.filter(i => i.parentId === item.parentId);
                    const originalSameParent = originalItems.filter(i => i.parentId === original.parentId);
                    
                    const currentIndex = currentSameParent.findIndex(i => i.id === item.id);
                    const originalIndex = originalSameParent.findIndex(i => i.id === item.id);
                    
                    return currentIndex !== originalIndex;
                  });

                  // Группируем изменения по родителям
                  const parentsToUpdate = new Set<string | null>();
                  movedItems.forEach(item => {
                    parentsToUpdate.add(item.parentId);
                    const original = originalItems.find(orig => orig.id === item.id);
                    if (original && original.parentId !== item.parentId) {
                      parentsToUpdate.add(original.parentId);
                    }
                  });

                  // Обновляем порядок для каждого родителя
                  for (const parentId of parentsToUpdate) {
                    const sameParentItems = items.filter(i => i.parentId === parentId);
                    for (let i = 0; i < sameParentItems.length; i++) {
                      const item = sameParentItems[i];
                      await authFetch(`${API}/navigation/${item.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ order: i })
                      });
                    }
                  }

                  // Обновляем parent_id для перемещенных элементов
                  for (const item of movedItems) {
                    const original = originalItems.find(orig => orig.id === item.id);
                    if (original && original.parentId !== item.parentId) {
                      await authFetch(`${API}/navigation/${item.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ parent_id: item.parentId })
                      });
                    }
                  }
                }
              }}
            />
          </CustomModal>
        )}
      </Stack>
    </Box>
  );
}

