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
  ScrollArea,
  Box
} from '@mantine/core';
import { IconEdit, IconTrash, IconPlus, IconAlertCircle, IconTags, IconFolder, IconChevronRight, IconChevronDown, IconArrowsSort } from '@tabler/icons-react';
import { DynamicFormModal } from '../../../utils/formModal';
import { FilterGroup } from '../../../utils/filter';
import useAuthFetch from '../../../hooks/useAuthFetch';
import { API } from '../../../config/constants';
import { buildTree, flattenTree } from '../../../utils/hierarchy';
import { UniversalHierarchySortModal } from '../../../utils/UniversalHierarchySortModal';
import { UniversalHierarchy, HierarchyItem } from '../../../utils/UniversalHierarchy';
import { CustomModal } from '../../../utils/CustomModal';
import { useDisclosure } from '@mantine/hooks';

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
  const [sortModalOpened, { open: openSortModal, close: closeSortModal }] = useDisclosure(false);

  const authFetch = useAuthFetch();

  useEffect(() => {
    fetchTypes();
    fetchTools();
  }, []);

  const fetchTypes = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await authFetch(`${API}/type`);
      if (response && response.ok) {
        const data = await response.json();
        setTypes(Array.isArray(data) ? data : []);
      } else {
        const errorData = await response?.json().catch(() => ({ error: 'Unknown error' }));
        setError(errorData?.error || 'Ошибка загрузки типов');
        setTypes([]);
      }
    } catch (error) {
      console.error('Error fetching types:', error);
      setError(error instanceof Error ? error.message : 'Ошибка загрузки типов');
      setTypes([]);
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
      
      // Add chapter from context
      const data = {
        ...formData,
        chapter: selectedType?.chapter || '',
        // If creating a child (selectedType exists but has no ID or empty ID), use selectedType.id as parent_type
        parent_type: selectedType && (!selectedType.id || selectedType.id === '') ? selectedType.parent_type : formData.parent_type || null,
        // sortOrder is automatically calculated by the database
      };
      
      if (selectedType && selectedType.id) {
        // Update existing type
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
        // Create new type
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
      setError(error instanceof Error ? error.message : 'Ошибка сохранения типа');
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

  const formFields = useMemo(() => {
    const isCreatingChild = selectedType && !selectedType.id;
    const isEditing = selectedType && selectedType.id;
    
    const fields = [];

    // Добавляем tool только при создании нового типа или редактировании
    if (!isCreatingChild || isEditing) {
      fields.push(
        {
          name: 'model_uuid',
          label: 'Инструмент (Tool)',
          type: 'select' as const,
          required: true,
          options: tools.map(tool => ({ value: tool.id, label: tool.name })),
          disabled: isCreatingChild || isEditing ? true : undefined, // Блокируем при редактировании
        }
      );
    }

    // Добавляем parent_type только если не создаем дочерний элемент (тогда он уже установлен)
    if (!isCreatingChild) {
      fields.push({
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
      });
    }

    // Всегда добавляем основные поля
    fields.push(
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
      }
    );

    return fields;
  }, [tools, parentTypeOptions, selectedType]);

  const initialValues = useMemo(() => {
    if (!selectedType) return undefined;
    
    // If creating a child (no ID), set parent_type to the parent's ID
    if (!selectedType.id) {
      return {
        model_uuid: selectedType.model_uuid,
        parent_type: selectedType.id, // Set parent_type to the parent's ID
        name: '',
        colorHex: '',
        sortOrder: 0,
      };
    }
    
    // If editing an existing type
    return {
      model_uuid: selectedType.model_uuid,
      parent_type: selectedType.parent_type || '',
      name: selectedType.name,
      colorHex: selectedType.colorHex || '',
      sortOrder: selectedType.sortOrder || 0,
    };
  }, [selectedType]);

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

  // Получаем типы выбранного раздела с иерархией (плоский список для UniversalHierarchy)
  const selectedChapterTypesFlat = useMemo(() => {
    if (!selectedToolId || !selectedChapter) return [];
    
    // Получаем все типы из выбранного инструмента
    const toolTypes = types.filter(type => type.model_uuid === selectedToolId);
    
    // Находим корневые элементы из выбранного раздела
    const rootTypes = toolTypes.filter(type => 
      (type.chapter || 'Без раздела') === selectedChapter
    );
    
    // Получаем все ID корневых элементов
    const rootIds = new Set(rootTypes.map(t => t.id));
    
    // Получаем все дочерние элементы корневых типов (рекурсивно)
    const getAllDescendants = (parentId: string): Set<string> => {
      const descendants = new Set<string>();
      // Ищем детей среди ВСЕХ типов инструмента, не только корневых
      const directChildren = toolTypes.filter(t => t.parent_type === parentId);
      
      directChildren.forEach(child => {
        descendants.add(child.id);
        const childDescendants = getAllDescendants(child.id);
        childDescendants.forEach(id => descendants.add(id));
      });
      
      return descendants;
    };
    
    // Собираем все ID корневых элементов и их потомков
    const allIds = new Set(rootIds);
    rootIds.forEach(rootId => {
      const descendants = getAllDescendants(rootId);
      descendants.forEach(id => allIds.add(id));
    });
    
    // Получаем все элементы по ID
    const allElements = toolTypes.filter(type => allIds.has(type.id));
    
    // Применяем текстовые фильтры
    const filteredTypes = applyFilters(allElements);
    
    // Строим иерархию
    const tree = buildTree(filteredTypes, {
      parentField: 'parent_type',
      sortField: 'sortOrder',
      nameField: 'name',
      childrenField: 'children'
    });
    
    // Разворачиваем дерево для UniversalHierarchy
    const result = flattenTree(tree, {
      parentField: 'parent_type',
      sortField: 'sortOrder',
      nameField: 'name',
      childrenField: 'children'
    });
    
    return result;
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
          <Button leftSection={<IconPlus size={18} />} onClick={handleCreate} style={{ alignSelf: 'flex-start', marginTop: '8px' }}>
            Добавить тип
          </Button>
        </Group>

        {/* Две колонки: инструменты и типы */}
        <Group gap="md" style={{ width: '100%', height: 'calc(100vh - 300px)' }}>
          {/* Левая колонка: Инструменты */}
          <Box style={{ width: '30%', height: '100%' }}>
            <Paper shadow="sm" p="md" radius="md" withBorder h="100%">
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
                                          <Group gap="xs" onClick={(e) => e.stopPropagation()}>
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
          </Box>

          {/* Правая колонка: Типы выбранного инструмента */}
          <Box style={{ flex: 1, height: '100%' }}>
            <Paper shadow="sm" p="md" radius="md" withBorder h="100%">
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
                  <Group gap="xs">
                    {selectedChapterTypesFlat.length > 0 && (
                      <Badge variant="light">{selectedChapterTypesFlat.length}</Badge>
                    )}
                    {selectedToolId && selectedChapter && (
                      <Tooltip label="Сортировка иерархии">
                        <ActionIcon
                          variant="light"
                          color="blue"
                          onClick={openSortModal}
                          disabled={selectedChapterTypesFlat.length === 0}
                        >
                          <IconArrowsSort size={18} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
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
                ) : selectedChapterTypesFlat.length === 0 ? (
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
                    <UniversalHierarchy
                      config={{
                        initialData: selectedChapterTypesFlat,
                        parentField: 'parent_type',
                        nameField: 'name',
                        renderItem: (item: HierarchyItem, _isSelected: boolean, _hasChildren: boolean) => {
                          const type = item as Type;
                          const nestingLevel = item.nestingLevel || 0;
                          const indent = nestingLevel * 20; // 20px на каждый уровень
                          
                          return (
                            <Group gap="xs" style={{ width: '100%', paddingLeft: `${indent}px` }}>
                              <IconFolder 
                                size={16} 
                                style={{ 
                                  color: type.colorHex || undefined,
                                  minWidth: 16
                                }} 
                              />
                              <Text style={{ flex: 1 }}>{type.name}</Text>
                              <Group gap="xs">
                                <Tooltip label="Редактировать">
                                  <ActionIcon
                                    variant="light"
                                    size="sm"
                                    onClick={() => handleEdit(type)}
                                  >
                                    <IconEdit size={16} />
                                  </ActionIcon>
                                </Tooltip>
                                <Tooltip label="Добавить дочерний элемент">
                                  <ActionIcon
                                    variant="light"
                                    color="green"
                                    size="sm"
                                    onClick={() => {
                                      // Устанавливаем родителя для нового элемента
                                      setSelectedType({
                                        id: '',
                                        model_uuid: type.model_uuid,
                                        chapter: type.chapter,
                                        parent_type: type.id,
                                        name: '',
                                        colorHex: '',
                                        sortOrder: 0,
                                        Tool: type.Tool
                                      });
                                      setModalOpened(true);
                                    }}
                                  >
                                    <IconPlus size={16} />
                                  </ActionIcon>
                                </Tooltip>
                                <Tooltip label="Удалить">
                                  <ActionIcon
                                    variant="light"
                                    color="red"
                                    size="sm"
                                    onClick={() => handleDelete(type)}
                                  >
                                    <IconTrash size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              </Group>
                            </Group>
                          );
                        },
                        onDataUpdate: () => {
                          fetchTypes();
                        }
                      }}
                      hasFullAccess={true}
                    />
                  </ScrollArea>
                )}
              </Stack>
            </Paper>
          </Box>
        </Group>

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

        {/* Модалка сортировки иерархии */}
        {selectedToolId && selectedChapter && (
          <CustomModal
            opened={sortModalOpened}
            onClose={closeSortModal}
            title="Сортировка иерархии типов"
            size="xl"
            icon={<IconArrowsSort size={20} />}
          >
            <UniversalHierarchySortModal
              onClose={closeSortModal}
              onSuccess={() => {
                fetchTypes();
                closeSortModal();
              }}
              config={{
                fetchEndpoint: `${API}/type`,
                updateItemEndpoint: (id: string) => `${API}/type/${id}`,
                parentField: 'parent_type',
                sortField: 'sortOrder',
                nameField: 'name',
                additionalFilters: {
                  model_uuid: selectedToolId,
                  chapter: selectedChapter
                },
                transformItem: (item: Type) => {
                  const { id, name, parent_type, sortOrder, ...rest } = item;
                  return {
                    id,
                    name,
                    parentId: parent_type || null,
                    level: 0,
                    originalLevel: 0,
                    originalParentId: parent_type || null,
                    sortOrder: sortOrder || 0,
                    ...rest
                  };
                },
                onSave: async (items, originalItems) => {
                  // Находим все измененные элементы
                  const movedItems = items.filter(item => {
                    const original = originalItems.find(orig => orig.id === item.id);
                    if (!original) return false;
                    
                    if (item.parent_type !== original.parent_type || item.level !== original.level) {
                      return true;
                    }
                    
                    const currentSameParent = items.filter(i => i.parent_type === item.parent_type);
                    const originalSameParent = originalItems.filter(i => i.parent_type === original.parent_type);
                    
                    const currentIndex = currentSameParent.findIndex(i => i.id === item.id);
                    const originalIndex = originalSameParent.findIndex(i => i.id === item.id);
                    
                    return currentIndex !== originalIndex;
                  });

                  // Группируем изменения по родителям
                  const parentsToUpdate = new Set<string | null>();
                  movedItems.forEach(item => {
                    parentsToUpdate.add(item.parent_type);
                    const original = originalItems.find(orig => orig.id === item.id);
                    if (original && original.parent_type !== item.parent_type) {
                      parentsToUpdate.add(original.parent_type);
                    }
                  });

                  // Обновляем порядок для каждого родителя
                  for (const parentId of parentsToUpdate) {
                    const sameParentItems = items.filter(i => i.parent_type === parentId);
                    for (let i = 0; i < sameParentItems.length; i++) {
                      const item = sameParentItems[i];
                      await authFetch(`${API}/type/${item.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ sortOrder: i })
                      });
                    }
                  }

                  // Обновляем parent_type для перемещенных элементов
                  for (const item of movedItems) {
                    const original = originalItems.find(orig => orig.id === item.id);
                    if (original && original.parent_type !== item.parent_type) {
                      await authFetch(`${API}/type/${item.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ parent_type: item.parent_type })
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

