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

interface Type {
  id: string;
  model_uuid: string;
  chapter: string;
  name: string;
  colorHex?: string;
  Tool: {
    id: string;
    name: string;
  };
}

interface Tool {
  id: string;
  name: string;
}

export default function TypesManagement() {
  const [types, setTypes] = useState<Type[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpened, setModalOpened] = useState(false);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [selectedType, setSelectedType] = useState<Type | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const itemsPerPage = 20;

  const authFetch = useAuthFetch();

  useEffect(() => {
    fetchTypes();
    fetchTools();
  }, []);

  const fetchTypes = async () => {
    try {
      setLoading(true);
      const response = await authFetch(`${API}/type`);
      if (response && response.ok) {
        const data = await response.json();
        setTypes(data);
      }
    } catch (error) {
      console.error('Error fetching types:', error);
      setError('Ошибка загрузки типов');
    } finally {
      setLoading(false);
    }
  };

  const fetchTools = async () => {
    try {
      const response = await authFetch(`${API}/navigation/all`);
      if (response && response.ok) {
        const data = await response.json();
        setTools(data);
      }
    } catch (error) {
      console.error('Error fetching tools:', error);
    }
  };

  const handleCreate = () => {
    setSelectedType(null);
    setModalOpened(true);
  };

  const handleEdit = (type: Type) => {
    setSelectedType(type);
    setModalOpened(true);
  };

  const handleDelete = (type: Type) => {
    setSelectedType(type);
    setDeleteModalOpened(true);
  };

  const handleSave = async (formData: any) => {
    try {
      setError(null);
      if (selectedType) {
        // Обновление
        const response = await authFetch(`${API}/type/${selectedType.id}`, {
          method: 'PATCH',
          body: JSON.stringify(formData),
        });
        if (response && response.ok) {
          await fetchTypes();
          setModalOpened(false);
        } else {
          const errorData = await response?.json();
          setError(errorData?.error || 'Ошибка обновления типа');
        }
      } else {
        // Создание
        const response = await authFetch(`${API}/type`, {
          method: 'POST',
          body: JSON.stringify(formData),
        });
        if (response && response.ok) {
          await fetchTypes();
          setModalOpened(false);
        } else {
          const errorData = await response?.json();
          setError(errorData?.error || 'Ошибка создания типа');
        }
      }
    } catch (error) {
      console.error('Error saving type:', error);
      setError('Ошибка сохранения типа');
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedType) return;

    try {
      setError(null);
      const response = await authFetch(`${API}/type/${selectedType.id}`, {
        method: 'DELETE',
      });
      if (response && response.ok) {
        await fetchTypes();
        setDeleteModalOpened(false);
        setSelectedType(null);
      } else {
        const errorData = await response?.json();
        setError(errorData?.error || 'Ошибка удаления типа');
      }
    } catch (error) {
      console.error('Error deleting type:', error);
      setError('Ошибка удаления типа');
    }
  };

  const formFields = useMemo(() => [
    {
      name: 'model_uuid',
      label: 'Инструмент (Tool)',
      type: 'select' as const,
      required: true,
      options: tools.map(tool => ({ value: tool.id, label: tool.name })),
    },
    {
      name: 'chapter',
      label: 'Раздел (Chapter)',
      type: 'text' as const,
      required: true,
    },
    {
      name: 'name',
      label: 'Название',
      type: 'text' as const,
      required: true,
    },
    {
      name: 'colorHex',
      label: 'Цвет (HEX)',
      type: 'text' as const,
      required: false,
      placeholder: '#000000',
    },
  ], [tools]);

  const initialValues = useMemo(() => selectedType ? {
    model_uuid: selectedType.model_uuid,
    chapter: selectedType.chapter,
    name: selectedType.name,
    colorHex: selectedType.colorHex || '',
  } : undefined, [selectedType]);

  // Получаем значения фильтров
  const toolFilter = columnFilters.find(f => f.id === 'tool')?.value as string[] || [];
  const chapterFilter = columnFilters.find(f => f.id === 'chapter')?.value as string[] || [];
  const nameFilter = columnFilters.find(f => f.id === 'name')?.value as string[] || [];

  // Фильтрация типов
  const filteredTypes = types.filter(type => {
    if (toolFilter.length > 0 && !toolFilter.includes(type.model_uuid)) return false;
    // Для text фильтров берем первый элемент массива (текст поиска)
    const chapterSearch = chapterFilter.length > 0 ? chapterFilter[0].toLowerCase() : '';
    if (chapterSearch && !type.chapter.toLowerCase().includes(chapterSearch)) return false;
    const nameSearch = nameFilter.length > 0 ? nameFilter[0].toLowerCase() : '';
    if (nameSearch && !type.name.toLowerCase().includes(nameSearch)) return false;
    return true;
  });

  // Сортировка: сначала по инструменту, потом по разделу, потом по названию
  const sortedTypes = [...filteredTypes].sort((a, b) => {
    if (a.Tool.name !== b.Tool.name) {
      return a.Tool.name.localeCompare(b.Tool.name);
    }
    if (a.chapter !== b.chapter) {
      return a.chapter.localeCompare(b.chapter);
    }
    return a.name.localeCompare(b.name);
  });

  const paginatedTypes = sortedTypes.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(sortedTypes.length / itemsPerPage);

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

  const filterConfig = useMemo(() => [
    {
      type: 'select' as const,
      columnId: 'tool',
      label: 'Инструмент',
      placeholder: 'Выберите инструменты',
      options: tools.map(tool => ({ value: tool.id, label: tool.name })),
    },
    {
      type: 'text' as const,
      columnId: 'chapter',
      label: 'Раздел',
      placeholder: 'Поиск по разделу...',
    },
    {
      type: 'text' as const,
      columnId: 'name',
      label: 'Название',
      placeholder: 'Поиск по названию...',
    },
  ], [tools]);

  return (
    <Container size="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Управление типами</Title>
          <Button leftSection={<IconPlus size={18} />} onClick={handleCreate}>
            Добавить тип
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
              {sortedTypes.length === 0 ? (
                <Text c="dimmed" ta="center" py="xl">
                  {columnFilters.length > 0 ? 'Нет результатов по заданным фильтрам' : 'Нет типов'}
                </Text>
              ) : (
                <>
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Название</Table.Th>
                        <Table.Th>Раздел</Table.Th>
                        <Table.Th>Инструмент</Table.Th>
                        <Table.Th>Цвет</Table.Th>
                        <Table.Th>Действия</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {paginatedTypes.map((type) => (
                    <Table.Tr key={type.id}>
                      <Table.Td>{type.name}</Table.Td>
                      <Table.Td>{type.chapter}</Table.Td>
                      <Table.Td>{type.Tool.name}</Table.Td>
                      <Table.Td>
                        {type.colorHex ? (
                          <Badge
                            color={type.colorHex}
                            style={{ backgroundColor: type.colorHex }}
                          >
                            {type.colorHex}
                          </Badge>
                        ) : (
                          <Text c="dimmed">—</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Tooltip label="Редактировать">
                            <ActionIcon
                              variant="light"
                              color="blue"
                              onClick={() => handleEdit(type)}
                            >
                              <IconEdit size={18} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Удалить">
                            <ActionIcon
                              variant="light"
                              color="red"
                              onClick={() => handleDelete(type)}
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
            setSelectedType(null);
            setError(null);
          }}
          title={selectedType ? 'Редактировать тип' : 'Добавить тип'}
          mode={selectedType ? 'edit' : 'create'}
          fields={formFields}
          initialValues={initialValues || {}}
          onSubmit={handleSave}
        />

        <Modal
          opened={deleteModalOpened}
          onClose={() => {
            setDeleteModalOpened(false);
            setSelectedType(null);
            setError(null);
          }}
          title="Подтверждение удаления"
        >
          <Text mb="md">
            Вы уверены, что хотите удалить тип "{selectedType?.name}"?
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
                setSelectedType(null);
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

