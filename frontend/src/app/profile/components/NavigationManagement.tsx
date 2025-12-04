import { useState, useEffect, useMemo, useCallback } from 'react';
import { ColumnFiltersState } from '@tanstack/react-table';
import {
  Container,
  Paper,
  Title,
  Table,
  Button,
  Group,
  Modal,
  ActionIcon,
  Tooltip,
  Badge,
  Stack,
  Alert,
  Text,
  Grid,
  ScrollArea,
  Divider,
  Box
} from '@mantine/core';
import { IconEdit, IconTrash, IconPlus, IconAlertCircle, IconMenu2, IconChevronRight } from '@tabler/icons-react';
import { DynamicFormModal } from '../../../utils/formModal';
import { FilterGroup } from '../../../utils/filter';
import useAuthFetch from '../../../hooks/useAuthFetch';
import { API } from '../../../config/constants';

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
  const [error, setError] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const authFetch = useAuthFetch();

  useEffect(() => {
    fetchMenuItems();
  }, []);

  const fetchMenuItems = async () => {
    try {
      setLoading(true);
      const response = await authFetch(`${API}/navigation/all`);
      if (response && response.ok) {
        const data = await response.json();
        setMenuItems(data);
      }
    } catch (error) {
      console.error('Error fetching menu items:', error);
      setError('Ошибка загрузки пунктов меню');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedItem(null);
    setModalOpened(true);
  };

  const handleEdit = (item: MenuItem) => {
    setSelectedItem(item);
    setModalOpened(true);
  };

  const handleDelete = (item: MenuItem) => {
    setSelectedItem(item);
    setDeleteModalOpened(true);
  };

  const handleSave = async (formData: any) => {
    try {
      setError(null);
      if (selectedItem) {
        // Обновление
        const response = await authFetch(`${API}/navigation/${selectedItem.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...formData,
            parent_id: formData.parent_id || null,
            included: formData.included !== undefined ? formData.included : true,
          }),
        });
        if (response && response.ok) {
          await fetchMenuItems();
          setModalOpened(false);
        } else {
          const errorData = await response?.json();
          setError(errorData?.error || 'Ошибка обновления пункта меню');
        }
      } else {
        // Создание
        const response = await authFetch(`${API}/navigation`, {
          method: 'POST',
          body: JSON.stringify({
            ...formData,
            parent_id: formData.parent_id || null,
            included: formData.included !== undefined ? formData.included : true,
          }),
        });
        if (response && response.ok) {
          await fetchMenuItems();
          setModalOpened(false);
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

  // Получаем список родительских элементов для селекта
  const parentOptions = useMemo(() => menuItems
    .filter(item => item.id !== selectedItem?.id)
    .map(item => ({ value: item.id, label: item.name })), [menuItems, selectedItem]);

  const formFields = useMemo(() => [
    {
      name: 'parent_id',
      label: 'Родительский пункт',
      type: 'select' as const,
      required: false,
      options: [{ value: '', label: 'Нет (корневой элемент)' }, ...parentOptions],
    },
    {
      name: 'name',
      label: 'Название',
      type: 'text' as const,
      required: true,
    },
    {
      name: 'icon',
      label: 'Иконка (Tabler Icons)',
      type: 'text' as const,
      required: true,
      placeholder: 'IconHome',
    },
    {
      name: 'link',
      label: 'Ссылка',
      type: 'text' as const,
      required: true,
      placeholder: '/path/to/page',
    },
    {
      name: 'description',
      label: 'Описание',
      type: 'textarea' as const,
      required: false,
    },
    {
      name: 'order',
      label: 'Порядок сортировки',
      type: 'number' as const,
      required: true,
      min: 1,
    },
    {
      name: 'included',
      label: 'Включен в меню',
      type: 'boolean' as const,
      required: false,
    },
  ], [parentOptions]);

  const initialValues = useMemo(() => selectedItem ? {
    parent_id: selectedItem.parent_id || '',
    name: selectedItem.name,
    icon: selectedItem.icon,
    link: selectedItem.link,
    description: selectedItem.description || '',
    order: selectedItem.order,
    included: selectedItem.included,
  } : undefined, [selectedItem]);

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

  // Получаем дочерние элементы выбранного корневого пункта с иерархией
  const childItems = useMemo(() => {
    if (!selectedRootItem) return [];
    
    // Рекурсивная функция для построения дерева дочерних элементов
    const buildChildTree = (parentId: string, level: number = 0): Array<MenuItem & { level: number }> => {
      const children = menuItems
        .filter(item => item.parent_id === parentId)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
      
      const result: Array<MenuItem & { level: number }> = [];
      
      for (const child of children) {
        if (applyFilters([child]).length > 0) {
          result.push({ ...child, level });
          // Рекурсивно получаем дочерние элементы
          const grandchildren = buildChildTree(child.id, level + 1);
          result.push(...grandchildren);
        }
      }
      
      return result;
    };
    
    return buildChildTree(selectedRootItem, 0);
  }, [menuItems, selectedRootItem, includedFilter, nameFilter]);

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
    <Container size="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Управление пунктами меню</Title>
          <Button leftSection={<IconPlus size={18} />} onClick={handleCreate}>
            Добавить пункт меню
          </Button>
        </Group>

        {error && (
          <Alert icon={<IconAlertCircle size={18} />} color="red" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        {/* Фильтры */}
        <FilterGroup
          filters={filterConfig}
          columnFilters={columnFilters}
          onColumnFiltersChange={handleColumnFiltersChange}
        />

        {/* Две колонки: корневые и дочерние */}
        <Grid gutter="md">
          {/* Левая колонка: Все пункты с иерархией */}
          <Grid.Col span={4}>
            <Paper shadow="sm" p="md" radius="md" withBorder h="calc(100vh - 300px)">
              <Stack gap="md" h="100%">
                <Group justify="space-between">
                  <Title order={4}>Корневые пункты</Title>
                  <Badge variant="light">{rootItemsForLeftColumn.length}</Badge>
                </Group>
                {loading ? (
                  <Text c="dimmed">Загрузка...</Text>
                ) : (
                  <ScrollArea h="100%">
                    {rootItemsForLeftColumn.length === 0 ? (
                      <Text c="dimmed" ta="center" py="xl">
                        Нет корневых пунктов
                      </Text>
                    ) : (
                      <Table striped highlightOnHover>
                        <Table.Tbody>
                          {rootItemsForLeftColumn.map((item) => (
                            <Table.Tr
                              key={item.id}
                              style={{
                                cursor: 'pointer',
                                backgroundColor: selectedRootItem === item.id
                                  ? 'var(--theme-bg-secondary)'
                                  : undefined,
                              }}
                              onClick={() => setSelectedRootItem(item.id)}
                            >
                              <Table.Td>
                                <Group gap="xs">
                                  <IconMenu2 size={16} />
                                  <Text fw={selectedRootItem === item.id ? 600 : 400}>
                                    {item.name}
                                  </Text>
                                </Group>
                              </Table.Td>
                              <Table.Td>
                                <Badge color={item.included ? 'green' : 'gray'} size="sm">
                                  {item.included ? 'Вкл' : 'Скрыт'}
                                </Badge>
                              </Table.Td>
                              <Table.Td>
                                <Group gap="xs">
                                  <Tooltip label="Редактировать">
                                    <ActionIcon
                                      variant="subtle"
                                      color="blue"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEdit(item);
                                      }}
                                    >
                                      <IconEdit size={16} />
                                    </ActionIcon>
                                  </Tooltip>
                                  <Tooltip label="Удалить">
                                    <ActionIcon
                                      variant="subtle"
                                      color="red"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(item);
                                      }}
                                    >
                                      <IconTrash size={16} />
                                    </ActionIcon>
                                  </Tooltip>
                                </Group>
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    )}
                  </ScrollArea>
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
                  {childItems.length > 0 && (
                    <Badge variant="light">{childItems.length}</Badge>
                  )}
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
                ) : childItems.length === 0 ? (
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
                    <Text c="dimmed">У этого пункта нет дочерних элементов</Text>
                  </Box>
                ) : (
                  <ScrollArea h="100%">
                    <Table striped highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Название</Table.Th>
                          <Table.Th>Иконка</Table.Th>
                          <Table.Th>Ссылка</Table.Th>
                          <Table.Th>Порядок</Table.Th>
                          <Table.Th>Статус</Table.Th>
                          <Table.Th>Действия</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {childItems.map((item) => (
                          <Table.Tr key={item.id}>
                            <Table.Td>
                              <Group gap="xs" style={{ paddingLeft: `${item.level * 20}px` }}>
                                {item.level > 0 && (
                                  <IconChevronRight 
                                    size={14} 
                                    style={{ 
                                      opacity: 0.4,
                                      marginRight: '4px'
                                    }} 
                                  />
                                )}
                                <Text fw={item.level === 0 ? 500 : 400}>
                                  {item.name}
                                </Text>
                              </Group>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" c="dimmed">{item.icon}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" c="dimmed">{item.link}</Text>
                            </Table.Td>
                            <Table.Td>{item.order}</Table.Td>
                            <Table.Td>
                              <Badge color={item.included ? 'green' : 'gray'}>
                                {item.included ? 'Включен' : 'Скрыт'}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Group gap="xs">
                                <Tooltip label="Редактировать">
                                  <ActionIcon
                                    variant="light"
                                    color="blue"
                                    onClick={() => handleEdit(item)}
                                  >
                                    <IconEdit size={18} />
                                  </ActionIcon>
                                </Tooltip>
                                <Tooltip label="Удалить">
                                  <ActionIcon
                                    variant="light"
                                    color="red"
                                    onClick={() => handleDelete(item)}
                                  >
                                    <IconTrash size={18} />
                                  </ActionIcon>
                                </Tooltip>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
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
            setError(null);
          }}
          title={selectedItem ? 'Редактировать пункт меню' : 'Добавить пункт меню'}
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
      </Stack>
    </Container>
  );
}

