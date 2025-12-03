import { useState, useEffect, useMemo } from 'react';
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
  Pagination,
  Text
} from '@mantine/core';
import { IconEdit, IconTrash, IconPlus, IconAlertCircle } from '@tabler/icons-react';
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
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const itemsPerPage = 20;

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

  // Получаем значения фильтров
  const parentFilter = columnFilters.find(f => f.id === 'parent')?.value as string[] || [];
  const includedFilter = columnFilters.find(f => f.id === 'included')?.value as string[] || [];
  const nameFilter = columnFilters.find(f => f.id === 'name')?.value as string[] || [];

  // Фильтрация пунктов меню
  const filteredItems = menuItems.filter(item => {
    if (parentFilter.length > 0) {
      const hasRoot = parentFilter.includes('root');
      const hasParent = parentFilter.some(p => p !== 'root' && p === item.parent_id);
      if (!hasRoot && !hasParent) return false;
      if (hasRoot && item.parent_id !== null && !hasParent) return false;
      if (!hasRoot && item.parent_id !== parentFilter.find(p => p !== 'root')) return false;
    }
    if (includedFilter.length > 0) {
      const included = includedFilter.includes('true');
      const excluded = includedFilter.includes('false');
      if (included && !excluded && !item.included) return false;
      if (excluded && !included && item.included) return false;
    }
    // Для text фильтров берем первый элемент массива (текст поиска)
    const nameSearch = nameFilter.length > 0 ? nameFilter[0].toLowerCase() : '';
    if (nameSearch && !item.name.toLowerCase().includes(nameSearch)) return false;
    return true;
  });

  // Сортировка: сначала по parent_id (null в начале), потом по order, потом по названию
  const sortedItems = [...filteredItems].sort((a, b) => {
    // Сначала сортируем по наличию parent_id (корневые элементы первыми)
    if (a.parent_id === null && b.parent_id !== null) return -1;
    if (a.parent_id !== null && b.parent_id === null) return 1;
    
    // Если оба имеют parent_id или оба не имеют, сортируем по parent_id
    if (a.parent_id !== b.parent_id) {
      if (a.parent_id === null || b.parent_id === null) return 0;
      return a.parent_id.localeCompare(b.parent_id);
    }
    
    // Затем по order
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    
    // И наконец по названию
    return a.name.localeCompare(b.name);
  });

  const paginatedItems = sortedItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(sortedItems.length / itemsPerPage);

  const getParentName = (parentId: string | null) => {
    if (!parentId) return 'Корневой';
    const parent = menuItems.find(item => item.id === parentId);
    return parent?.name || 'Неизвестно';
  };

  const handleColumnFiltersChange = (columnId: string, value: any) => {
    setColumnFilters(prev => {
      const filtered = prev.filter(f => f.id !== columnId);
      if (value && (Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0)) {
        return [...filtered, { id: columnId, value }];
      }
      return filtered;
    });
    setCurrentPage(1);
  };

  // Получаем уникальные родительские элементы для фильтра
  const rootItems = menuItems.filter(item => item.parent_id === null);

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


        <Paper shadow="sm" p="md" radius="md" withBorder>
          {loading ? (
            <Text>Загрузка...</Text>
          ) : (
            <>
              {sortedItems.length === 0 ? (
                <Text c="dimmed" ta="center" py="xl">
                  {columnFilters.length > 0 ? 'Нет результатов по заданным фильтрам' : 'Нет пунктов меню'}
                </Text>
              ) : (
                <>
                  <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Название</Table.Th>
                    <Table.Th>Иконка</Table.Th>
                    <Table.Th>Ссылка</Table.Th>
                    <Table.Th>Родитель</Table.Th>
                    <Table.Th>Порядок</Table.Th>
                    <Table.Th>Статус</Table.Th>
                    <Table.Th>Действия</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {paginatedItems.map((item) => (
                    <Table.Tr key={item.id}>
                      <Table.Td>{item.name}</Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">{item.icon}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">{item.link}</Text>
                      </Table.Td>
                      <Table.Td>{getParentName(item.parent_id)}</Table.Td>
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

                  {totalPages > 1 && (
                    <Group justify="center" mt="md">
                      <Pagination
                        value={currentPage}
                        onChange={setCurrentPage}
                        total={totalPages}
                      />
                    </Group>
                  )}
                </>
              )}
            </>
          )}
        </Paper>

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

