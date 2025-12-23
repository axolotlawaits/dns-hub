import { useState, useEffect, useMemo } from 'react';
import React from 'react';
import { ColumnFiltersState } from '@tanstack/react-table';
import {
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
import { IconEdit, IconTrash, IconPlus, IconAlertCircle, IconTags, IconFolder, IconChevronRight, IconChevronDown, IconDownload } from '@tabler/icons-react';
import { DynamicFormModal } from '../../../utils/formModal';
import { FilterGroup } from '../../../utils/filter';
import useAuthFetch from '../../../hooks/useAuthFetch';
import { useUserContext } from '../../../hooks/useUserContext';
import { API } from '../../../config/constants';

interface Type {
  id: string;
  model_uuid: string;
  chapter: string;
  name: string;
  colorHex?: string;
  parent_type?: string | null;
  sortOrder?: number;
  Tool: {
    id: string;
    name: string;
  };
  parent?: {
    id: string;
    name: string;
    colorHex?: string;
  } | null;
  children?: Type[];
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
  const [loadingCorrespondenceTypes, setLoadingCorrespondenceTypes] = useState(false);

  const authFetch = useAuthFetch();
  const { user } = useUserContext();

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

  const handleEditChapter = (toolId: string, chapterName: string) => {
    // Находим первый тип в разделе для редактирования
    const chapterTypes = types.filter(t => 
      t.model_uuid === toolId && 
      (t.chapter || 'Без раздела') === chapterName
    );
    if (chapterTypes.length > 0) {
      handleEdit(chapterTypes[0]);
    }
  };

  const handleDeleteChapter = (toolId: string, chapterName: string) => {
    // Находим все типы в разделе
    const chapterTypes = types.filter(t => 
      t.model_uuid === toolId && 
      (t.chapter || 'Без раздела') === chapterName
    );
    if (chapterTypes.length > 0) {
      // Устанавливаем первый тип для показа модального окна
      // В модальном окне будет информация о количестве типов для удаления
      setSelectedType(chapterTypes[0]);
      setDeleteModalOpened(true);
    }
  };

  const handleSave = async (formData: any) => {
    try {
      setError(null);
      const data = {
        ...formData,
        parent_type: formData.parent_type || null,
        sortOrder: formData.sortOrder ?? 0,
      };
      
      if (selectedType) {
        // Обновление
        const response = await authFetch(`${API}/type/${selectedType.id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
        if (response && response.ok) {
          await fetchTypes();
          setModalOpened(false);
        } else {
          const errorData = await response?.json();
          setError(errorData?.error || errorData?.errors?.[0]?.message || 'Ошибка обновления типа');
        }
      } else {
        // Создание
        const response = await authFetch(`${API}/type`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        if (response && response.ok) {
          await fetchTypes();
          setModalOpened(false);
        } else {
          const errorData = await response?.json();
          setError(errorData?.error || errorData?.errors?.[0]?.message || 'Ошибка создания типа');
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
      
      // Проверяем, удаляем ли мы весь раздел или один тип
      const chapterTypes = types.filter(t => 
        t.model_uuid === selectedType.model_uuid && 
        (t.chapter || 'Без раздела') === (selectedType.chapter || 'Без раздела')
      );
      const isChapterDelete = chapterTypes.length > 1 && 
        chapterTypes.some(t => t.id === selectedType.id);
      
      if (isChapterDelete) {
        // Удаляем все типы раздела
        const deletePromises = chapterTypes.map(type => 
          authFetch(`${API}/type/${type.id}`, {
            method: 'DELETE',
          })
        );
        
        const responses = await Promise.all(deletePromises);
        const failed = responses.filter(r => !r || !r.ok);
        
        if (failed.length === 0) {
          await fetchTypes();
          setDeleteModalOpened(false);
          setSelectedType(null);
          // Сбрасываем выбор раздела, если он был удален
          if (selectedToolId === selectedType.model_uuid && selectedChapter === (selectedType.chapter || 'Без раздела')) {
            setSelectedChapter(null);
          }
        } else {
          const errorData = await failed[0]?.json();
          setError(errorData?.error || `Ошибка удаления типа. Удалено ${responses.length - failed.length} из ${responses.length}`);
        }
      } else {
        // Удаляем один тип
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
      }
    } catch (error) {
      console.error('Error deleting type:', error);
      setError('Ошибка удаления типа');
    }
  };

  const handleLoadCorrespondenceTypes = async () => {
    try {
      setLoadingCorrespondenceTypes(true);
      setError(null);
      
      const response = await authFetch(`${API}/type/load-correspondence-types`, {
        method: 'POST',
      });
      
      if (response && response.ok) {
        await response.json();
        await fetchTypes();
        setError(null);
        // Показываем успешное сообщение через alert (можно заменить на notification)
        alert('Типы корреспонденции успешно загружены!');
      } else {
        const errorData = await response?.json();
        setError(errorData?.error || errorData?.message || 'Ошибка загрузки типов корреспонденции');
      }
    } catch (error) {
      console.error('Error loading correspondence types:', error);
      setError('Ошибка загрузки типов корреспонденции');
    } finally {
      setLoadingCorrespondenceTypes(false);
    }
  };

  // Получаем доступные типы для выбора родителя (только из того же инструмента и раздела)
  const parentTypeOptions = useMemo(() => {
    if (!selectedType && !selectedToolId || !selectedChapter) return [];
    
    const toolId = selectedType?.model_uuid || selectedToolId;
    const chapter = selectedType?.chapter || selectedChapter;
    
    // Получаем все типы из того же инструмента и раздела, исключая текущий тип и его потомков
    const availableTypes = types.filter(type => 
      type.model_uuid === toolId && 
      type.chapter === chapter &&
      type.id !== selectedType?.id
    );
    
    // Исключаем потомков текущего типа (если редактируем)
    const excludeIds = new Set<string>();
    if (selectedType) {
      const findChildren = (parentId: string) => {
        availableTypes.forEach(type => {
          if (type.parent_type === parentId) {
            excludeIds.add(type.id);
            findChildren(type.id);
          }
        });
      };
      findChildren(selectedType.id);
    }
    
    return availableTypes
      .filter(type => !excludeIds.has(type.id))
      .map(type => ({ 
        value: type.id, 
        label: type.name,
        parent: type.parent_type 
      }))
      .sort((a, b) => {
        // Сортируем: сначала корневые, потом по имени
        const aIsRoot = !types.find(t => t.id === a.value)?.parent_type;
        const bIsRoot = !types.find(t => t.id === b.value)?.parent_type;
        if (aIsRoot !== bIsRoot) return aIsRoot ? -1 : 1;
        return a.label.localeCompare(b.label);
      });
  }, [types, selectedType, selectedToolId, selectedChapter]);

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
      name: 'parent_type',
      label: 'Родительский тип',
      type: 'select' as const,
      required: false,
      options: [
        { value: '', label: 'Нет (корневой тип)' },
        ...parentTypeOptions.map(opt => ({
          value: opt.value,
          label: opt.parent 
            ? `  └─ ${opt.label}` 
            : opt.label
        }))
      ],
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
    {
      name: 'sortOrder',
      label: 'Порядок сортировки',
      type: 'number' as const,
      required: false,
      min: 0,
      placeholder: '0',
    },
  ], [tools, parentTypeOptions]);

  const initialValues = useMemo(() => selectedType ? {
    model_uuid: selectedType.model_uuid,
    chapter: selectedType.chapter,
    parent_type: selectedType.parent_type || '',
    name: selectedType.name,
    colorHex: selectedType.colorHex || '',
    sortOrder: selectedType.sortOrder || 0,
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

  // Строим иерархию типов для выбранного раздела
  const buildTypeHierarchy = (typesList: Type[]): Type[] => {
    const typeMap = new Map<string, Type & { level: number }>();
    
    // Создаем карту всех типов с уровнем вложенности
    typesList.forEach(type => {
      typeMap.set(type.id, { ...type, level: 0 });
    });
    
    // Определяем уровни вложенности
    const setLevel = (typeId: string, level: number = 0): number => {
      const type = typeMap.get(typeId);
      if (!type) return level;
      
      if (type.parent_type) {
        const parentLevel = setLevel(type.parent_type, level + 1);
        type.level = parentLevel;
        return parentLevel;
      }
      type.level = level;
      return level;
    };
    
    typesList.forEach(type => {
      setLevel(type.id);
    });
    
    // Сортируем: сначала по уровню, потом по sortOrder, потом по имени
    const sortedTypes = Array.from(typeMap.values()).sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      if ((a.sortOrder ?? 0) !== (b.sortOrder ?? 0)) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      return a.name.localeCompare(b.name);
    });
    
    return sortedTypes;
  };

  // Получаем типы выбранного раздела с иерархией
  const selectedChapterTypes = useMemo(() => {
    if (!selectedToolId || !selectedChapter) return [];
    const filtered = types.filter(type => 
      type.model_uuid === selectedToolId && 
      (type.chapter || 'Без раздела') === selectedChapter
    );
    const filteredTypes = applyFilters(filtered);
    return buildTypeHierarchy(filteredTypes);
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
    <Box size="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Управление типами</Title>
          <Group gap="sm">
            {(user?.role === 'DEVELOPER' || user?.role === 'ADMIN') && (
              <Button 
                leftSection={<IconDownload size={18} />} 
                onClick={handleLoadCorrespondenceTypes}
                loading={loadingCorrespondenceTypes}
                variant="light"
                color="blue"
              >
                Загрузить типы корреспонденции
              </Button>
            )}
            <Button leftSection={<IconPlus size={18} />} onClick={handleCreate}>
              Добавить тип
            </Button>
          </Group>
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
                                        <Group gap="xs" style={{ paddingLeft: '24px' }} justify="space-between">
                                          <Group gap="xs">
                                            <IconFolder size={14} style={{ opacity: 0.7 }} />
                                            <Text 
                                              fw={isChapterSelected ? 600 : 400}
                                              c={isChapterSelected ? undefined : 'dimmed'}
                                              size="sm"
                                            >
                                              {chapter.name}
                                            </Text>
                                          </Group>
                                          <Group gap={4} onClick={(e) => e.stopPropagation()}>
                                            <Tooltip label="Редактировать все типы раздела">
                                              <ActionIcon
                                                variant="subtle"
                                                color="blue"
                                                size="sm"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleEditChapter(tool.id, chapter.name);
                                                }}
                                              >
                                                <IconEdit size={14} />
                                              </ActionIcon>
                                            </Tooltip>
                                            <Tooltip label="Удалить все типы раздела">
                                              <ActionIcon
                                                variant="subtle"
                                                color="red"
                                                size="sm"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleDeleteChapter(tool.id, chapter.name);
                                                }}
                                              >
                                                <IconTrash size={14} />
                                              </ActionIcon>
                                            </Tooltip>
                                          </Group>
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
                    <IconTags size={48} style={{ color: 'var(--mantine-color-dimmed)' }} />
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
                    <IconTags size={48} style={{ color: 'var(--mantine-color-dimmed)' }} />
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
                          <Table.Th>Родитель</Table.Th>
                          <Table.Th>Порядок</Table.Th>
                          <Table.Th>Цвет</Table.Th>
                          <Table.Th>Действия</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {selectedChapterTypes.map((type: Type & { level?: number }) => {
                          const level = type.level || 0;
                          const parentType = types.find(t => t.id === type.parent_type);
                          const hasChildren = types.some(t => t.parent_type === type.id);
                          
                          // Вычисляем цвет границы с прозрачностью
                          const getBorderColor = () => {
                            if (level === 0) return undefined;
                            const baseColor = parentType?.colorHex || 'var(--mantine-color-gray-4)';
                            // Если это hex цвет, добавляем прозрачность через rgba
                            if (baseColor.startsWith('#')) {
                              const r = parseInt(baseColor.slice(1, 3), 16);
                              const g = parseInt(baseColor.slice(3, 5), 16);
                              const b = parseInt(baseColor.slice(5, 7), 16);
                              return `rgba(${r}, ${g}, ${b}, 0.3)`;
                            }
                            return baseColor;
                          };

                          return (
                            <Table.Tr 
                              key={type.id}
                              style={{
                                borderLeft: level > 0 ? `3px solid ${getBorderColor()}` : undefined,
                              }}
                            >
                              <Table.Td>
                                <Group gap="xs" style={{ paddingLeft: `${level * 24}px`, position: 'relative' }}>
                                  {/* Индикатор уровня с визуальными элементами */}
                                  <Group gap={6} style={{ position: 'relative', zIndex: 1 }}>
                                    {/* Отступы для уровней */}
                                    {level > 0 && (
                                      <Group gap={2} style={{ width: `${(level - 1) * 20}px`, justifyContent: 'flex-end' }}>
                                        {/* Вертикальная линия для каждого уровня */}
                                        {Array.from({ length: level }).map((_, idx) => (
                                          <Box
                                            key={idx}
                                            style={{
                                              width: '2px',
                                              height: '100%',
                                              backgroundColor: idx === level - 1 
                                                ? (parentType?.colorHex || 'var(--mantine-color-gray-5)')
                                                : 'transparent',
                                              opacity: 0.4,
                                              marginRight: idx < level - 1 ? '18px' : '0',
                                            }}
                                          />
                                        ))}
                                        {/* Горизонтальная линия и стрелка */}
                                        <Box
                                          style={{
                                            width: '10px',
                                            height: '2px',
                                            backgroundColor: parentType?.colorHex || 'var(--mantine-color-gray-5)',
                                            opacity: 0.5,
                                          }}
                                        />
                                        <IconChevronRight 
                                          size={14} 
                                          style={{ 
                                            opacity: 0.7,
                                            color: parentType?.colorHex || 'var(--mantine-color-gray-6)',
                                            marginLeft: '-4px',
                                            marginRight: '2px'
                                          }} 
                                        />
                                      </Group>
                                    )}
                                    {/* Иконка типа */}
                                    {hasChildren ? (
                                      <IconFolder 
                                        size={18} 
                                        style={{ 
                                          opacity: 0.8, 
                                          color: type.colorHex || 'var(--mantine-color-blue-6)',
                                          flexShrink: 0
                                        }} 
                                      />
                                    ) : level === 0 ? (
                                      <IconTags size={16} style={{ opacity: 0.6, flexShrink: 0 }} />
                                    ) : (
                                      <Box 
                                        style={{ 
                                          width: 18, 
                                          height: 18, 
                                          display: 'flex', 
                                          alignItems: 'center', 
                                          justifyContent: 'center',
                                          flexShrink: 0
                                        }}
                                      >
                                        <Box
                                          style={{
                                            width: '6px',
                                            height: '6px',
                                            borderRadius: '50%',
                                            backgroundColor: parentType?.colorHex || 'var(--mantine-color-gray-5)',
                                            opacity: 0.6,
                                          }}
                                        />
                                      </Box>
                                    )}
                                    {/* Название типа */}
                                    <Text 
                                      fw={level === 0 ? 600 : level === 1 ? 500 : 400}
                                      c={type.colorHex || (level === 0 ? undefined : 'dimmed')}
                                      size="sm"
                                      style={{ flex: 1 }}
                                    >
                                      {type.name}
                                    </Text>
                                  </Group>
                                </Group>
                              </Table.Td>
                              <Table.Td>
                                {parentType ? (
                                  <Badge 
                                    variant="light" 
                                    size="sm"
                                    style={{ 
                                      backgroundColor: parentType.colorHex 
                                        ? `${parentType.colorHex}20` 
                                        : undefined 
                                    }}
                                  >
                                    {parentType.name}
                                  </Badge>
                                ) : (
                                  <Text c="dimmed" size="sm">Корневой</Text>
                                )}
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm">{type.sortOrder ?? 0}</Text>
                              </Table.Td>
                              <Table.Td>
                                {type.colorHex ? (
                                  <Badge
                                    style={{ 
                                      backgroundColor: type.colorHex,
                                      color: '#fff',
                                      border: 'none'
                                    }}
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
                          );
                        })}
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
          {selectedType && (() => {
            const chapterTypes = types.filter(t => 
              t.model_uuid === selectedType.model_uuid && 
              (t.chapter || 'Без раздела') === (selectedType.chapter || 'Без раздела')
            );
            const isChapterDelete = chapterTypes.length > 1;
            
            return (
              <Text mb="md">
                {isChapterDelete 
                  ? `Вы уверены, что хотите удалить все типы раздела "${selectedType.chapter || 'Без раздела'}" (${chapterTypes.length} типов)?`
                  : `Вы уверены, что хотите удалить тип "${selectedType.name}"?`
                }
              </Text>
            );
          })()}
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
    </Box>
  );
}

