import { useState, useEffect, useMemo } from 'react';
import React from 'react';
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
import { IconEdit, IconTrash, IconPlus, IconAlertCircle, IconTags, IconFolder, IconChevronRight, IconChevronDown } from '@tabler/icons-react';
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
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

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
  const chapterFilter = columnFilters.find(f => f.id === 'chapter')?.value as string[] || [];
  const nameFilter = columnFilters.find(f => f.id === 'name')?.value as string[] || [];

  // Функция для применения фильтров
  const applyFilters = (items: Type[]) => {
    return items.filter(type => {
      // Фильтр по разделу
      const chapterSearch = chapterFilter.length > 0 ? chapterFilter[0].toLowerCase() : '';
      if (chapterSearch && !type.chapter.toLowerCase().includes(chapterSearch)) return false;
      // Фильтр по названию
      const nameSearch = nameFilter.length > 0 ? nameFilter[0].toLowerCase() : '';
      if (nameSearch && !type.name.toLowerCase().includes(nameSearch)) return false;
      return true;
    });
  };

  // Строим иерархию: инструменты → разделы
  const toolsWithChapters = useMemo(() => {
    return tools
      .map(tool => {
        // Получаем все разделы для этого инструмента
        const toolTypes = types.filter(type => type.model_uuid === tool.id);
        const chapters = Array.from(new Set(toolTypes.map(t => t.chapter || 'Без раздела')))
          .sort()
          .map(chapter => ({
            name: chapter,
            count: toolTypes.filter(t => (t.chapter || 'Без раздела') === chapter).length
          }));
        
        return {
          ...tool,
          chapters,
          totalCount: toolTypes.length
        };
      })
      .filter(tool => tool.totalCount > 0) // Показываем только инструменты с типами
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tools, types]);

  // Получаем типы выбранного раздела
  const selectedChapterTypes = useMemo(() => {
    if (!selectedToolId || !selectedChapter) return [];
    const filtered = types.filter(type => 
      type.model_uuid === selectedToolId && 
      (type.chapter || 'Без раздела') === selectedChapter
    );
    return applyFilters(filtered)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [types, selectedToolId, selectedChapter, chapterFilter, nameFilter]);

  const handleColumnFiltersChange = (columnId: string, value: any) => {
    setColumnFilters(prev => {
      const filtered = prev.filter(f => f.id !== columnId);
      if (value && (Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0)) {
        return [...filtered, { id: columnId, value }];
      }
      return filtered;
    });
  };

  const filterConfig = useMemo(() => [
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
  ], []);

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

        {/* Две колонки: инструменты и типы */}
        <Grid gutter="md">
          {/* Левая колонка: Инструменты */}
          <Grid.Col span={4}>
            <Paper shadow="sm" p="md" radius="md" withBorder h="calc(100vh - 300px)">
              <Stack gap="md" h="100%">
                <Group justify="space-between">
                  <Title order={4}>Инструменты</Title>
                  <Badge variant="light">{toolsWithChapters.length}</Badge>
                </Group>
                {loading ? (
                  <Text c="dimmed">Загрузка...</Text>
                ) : (
                  <ScrollArea h="100%">
                    {toolsWithChapters.length === 0 ? (
                      <Text c="dimmed" ta="center" py="xl">
                        Нет инструментов
                      </Text>
                    ) : (
                      <Table striped highlightOnHover>
                        <Table.Tbody>
                          {toolsWithChapters.map((tool) => {
                            const isExpanded = expandedTools.has(tool.id);
                            const isSelected = selectedToolId === tool.id;
                            return (
                              <React.Fragment key={tool.id}>
                                {/* Инструмент */}
                                <Table.Tr
                                  style={{
                                    cursor: 'pointer',
                                    backgroundColor: isSelected
                                      ? 'var(--theme-bg-secondary)'
                                      : undefined,
                                  }}
                                  onClick={() => {
                                    setSelectedToolId(tool.id);
                                    setExpandedTools(prev => {
                                      const newSet = new Set(prev);
                                      if (newSet.has(tool.id)) {
                                        newSet.delete(tool.id);
                                        setSelectedChapter(null);
                                      } else {
                                        newSet.add(tool.id);
                                        // Автоматически выбираем первый раздел, если он есть
                                        if (tool.chapters.length > 0) {
                                          setSelectedChapter(tool.chapters[0].name);
                                        } else {
                                          setSelectedChapter(null);
                                        }
                                      }
                                      return newSet;
                                    });
                                  }}
                                >
                                  <Table.Td>
                                    <Group gap="xs">
                                      {isExpanded ? (
                                        <IconChevronDown size={14} style={{ opacity: 0.6 }} />
                                      ) : (
                                        <IconChevronRight size={14} style={{ opacity: 0.6 }} />
                                      )}
                                      <IconTags size={16} />
                                      <Text fw={isSelected ? 600 : 500}>
                                        {tool.name}
                                      </Text>
                                    </Group>
                                  </Table.Td>
                                  <Table.Td>
                                    <Badge variant="light" size="sm">
                                      {tool.totalCount}
                                    </Badge>
                                  </Table.Td>
                                </Table.Tr>
                                {/* Разделы инструмента */}
                                {isExpanded && tool.chapters.map((chapter) => {
                                  const isChapterSelected = selectedChapter === chapter.name && isSelected;
                                  return (
                                    <Table.Tr
                                      key={`${tool.id}-${chapter.name}`}
                                      style={{
                                        cursor: 'pointer',
                                        backgroundColor: isChapterSelected
                                          ? 'var(--theme-bg-secondary)'
                                          : undefined,
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedToolId(tool.id);
                                        setSelectedChapter(chapter.name);
                                      }}
                                    >
                                      <Table.Td>
                                        <Group gap="xs" style={{ paddingLeft: '24px' }}>
                                          <IconFolder size={14} style={{ opacity: 0.7 }} />
                                          <Text 
                                            fw={isChapterSelected ? 600 : 400}
                                            c={isChapterSelected ? undefined : 'dimmed'}
                                            size="sm"
                                          >
                                            {chapter.name}
                                          </Text>
                                        </Group>
                                      </Table.Td>
                                      <Table.Td>
                                        <Badge variant="light" size="sm">
                                          {chapter.count}
                                        </Badge>
                                      </Table.Td>
                                    </Table.Tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
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

          {/* Правая колонка: Типы выбранного инструмента */}
          <Grid.Col span={7.5}>
            <Paper shadow="sm" p="md" radius="md" withBorder h="calc(100vh - 300px)">
              <Stack gap="md" h="100%">
                <Group justify="space-between">
                  <Title order={4}>
                    Типы
                    {selectedToolId && selectedChapter && (
                      <Text span c="dimmed" size="sm" fw={400}>
                        {' '}({tools.find(t => t.id === selectedToolId)?.name || ''} / {selectedChapter})
                      </Text>
                    )}
                  </Title>
                  {selectedChapterTypes.length > 0 && (
                    <Badge variant="light">{selectedChapterTypes.length}</Badge>
                  )}
                </Group>
                {loading ? (
                  <Text c="dimmed">Загрузка...</Text>
                ) : !selectedToolId || !selectedChapter ? (
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
                    <IconTags size={48} color="var(--mantine-color-gray-4)" />
                    <Text c="dimmed" size="lg">
                      {!selectedToolId 
                        ? 'Выберите инструмент слева для просмотра разделов'
                        : 'Выберите раздел слева для просмотра типов'}
                    </Text>
                  </Box>
                ) : selectedChapterTypes.length === 0 ? (
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
                    <IconTags size={48} color="var(--mantine-color-gray-4)" />
                    <Text c="dimmed">
                      {columnFilters.length > 0 
                        ? 'Нет результатов по заданным фильтрам' 
                        : 'В этом разделе нет типов'}
                    </Text>
                  </Box>
                ) : (
                  <ScrollArea h="100%">
                    <Table striped highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Название</Table.Th>
                          <Table.Th>Цвет</Table.Th>
                          <Table.Th>Действия</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {selectedChapterTypes.map((type) => (
                          <Table.Tr key={type.id}>
                            <Table.Td>
                              <Text>{type.name}</Text>
                            </Table.Td>
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

