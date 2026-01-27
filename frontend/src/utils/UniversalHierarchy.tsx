import React, { useState, useEffect, useMemo, useCallback, createContext, useContext } from 'react';
import { Button, Group, Alert, ActionIcon, Tooltip, Box, Stack, Paper, Text, TextInput } from '@mantine/core';
import { IconPlus, IconEdit, IconTrash, IconChevronRight, IconSearch } from '@tabler/icons-react';
import { CustomModal } from './CustomModal';
import { notificationSystem } from './Push';
import './styles/UniversalHierarchy.css';

// Контекст для выбранного элемента
interface SelectedItemContextType {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

const SelectedItemContext = createContext<SelectedItemContextType>({
  selectedId: null,
  setSelectedId: () => {},
});

export const useSelectedItem = () => useContext(SelectedItemContext);

// Интерфейс для элемента иерархии
export interface HierarchyItem {
  id: string;
  name: string;
  [key: string]: any; // Для дополнительных полей
}

// Конфигурация для универсальной иерархии
export interface UniversalHierarchyConfig {
  // API функции (один из вариантов обязателен)
  fetchItems?: (parentId?: string | null) => Promise<HierarchyItem[]>; // Загрузка элементов
  initialData?: HierarchyItem[]; // Уже загруженные данные (если не используется fetchItems)
  // Поля данных
  parentField: string; // Поле для parentId (например, 'parent_type', 'parent_id', 'parentId')
  nameField: string; // Поле для имени (например, 'name')
  idField?: string; // Поле для ID (по умолчанию 'id')
  // Дополнительные опции
  rootFilter?: (item: HierarchyItem) => boolean; // Фильтр для корневых элементов (например, item.layer === 1)
  disableExpansion?: boolean; // Отключить раскрытие дочерних элементов (для плоского списка)
  // Модалки (опционально)
  AddModal?: React.ComponentType<{
    parentItem?: HierarchyItem | null;
    onClose: () => void;
    onSuccess: () => void;
  }>;
  EditModal?: React.ComponentType<{
    item: HierarchyItem;
    onClose: () => void;
    onSuccess: () => void;
  }>;
  DeleteModal?: React.ComponentType<{
    item: HierarchyItem;
    onClose: () => void;
    onSuccess: () => void;
  }>;
  // Кастомный рендер элемента
  renderItem?: (item: HierarchyItem, isSelected: boolean, hasChildren: boolean) => React.ReactNode;
  // Обработчики
  onItemSelect?: (item: HierarchyItem) => void;
  onDataUpdate?: (data: HierarchyItem[]) => void;
}

interface UniversalHierarchyBlockProps {
  item: HierarchyItem;
  config: UniversalHierarchyConfig;
  onDataUpdate: () => void;
  hasFullAccess?: boolean;
  searchQuery?: string;
  level?: number;
  disableExpansion?: boolean;
  // Управление состоянием раскрытых узлов
  expandedItems?: Set<string>;
  setExpanded?: (itemId: string, expanded: boolean) => void;
}

// Рекурсивный компонент блока иерархии
const UniversalHierarchyBlock = ({ 
  item, 
  config, 
  onDataUpdate, 
  hasFullAccess = true, 
  searchQuery = '',
  level = 0,
  disableExpansion = false,
  expandedItems,
  setExpanded,
  externalSelectedContext
}: UniversalHierarchyBlockProps & { externalSelectedContext?: { selectedId: string | null; setSelectedId: (id: string | null) => void } }) => {
  const {
    fetchItems,
    initialData,
    parentField,
    nameField,
    idField = 'id',
    AddModal,
    EditModal,
    DeleteModal,
    renderItem,
    onItemSelect,
    disableExpansion: configDisableExpansion
  } = config;
  
  const itemId = item[idField];
  // Используем внешнее состояние раскрытых узлов, если оно предоставлено
  const isExpanded = expandedItems?.has(itemId) ?? false;
  const setIsExpanded = (expanded: boolean) => {
    if (setExpanded) {
      setExpanded(itemId, expanded);
    }
  };
  const [childItems, setChildItems] = useState<HierarchyItem[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [hasLoadedChildren, setHasLoadedChildren] = useState(false);
  const contextSelected = useSelectedItem();
  const selectedId = externalSelectedContext?.selectedId ?? contextSelected.selectedId;
  const setSelectedId = externalSelectedContext?.setSelectedId ?? contextSelected.setSelectedId;
  const isSelected = selectedId === itemId;
  
  const shouldDisableExpansion = disableExpansion || configDisableExpansion;

  // Если используется initialData, ищем детей в нем, иначе используем fetchItems
  const getChildItems = useCallback(async (parentId: string): Promise<HierarchyItem[]> => {
    if (initialData) {
      // Ищем детей в уже загруженных данных
      return initialData.filter(item => {
        const itemParentId = item[parentField];
        return itemParentId === parentId;
      });
    } else if (fetchItems) {
      return await fetchItems(parentId);
    }
    return [];
  }, [initialData, fetchItems, parentField]);

  const itemName = item[nameField];

  // Загружаем дочерние элементы при монтировании для определения наличия детей
  // Если элемент должен быть раскрыт, загружаем детей сразу
  useEffect(() => {
    if (shouldDisableExpansion) {
      // Если раскрытие отключено, не загружаем дочерние элементы
      setHasLoadedChildren(true);
      setChildItems([]);
      return;
    }
    
    if (!hasLoadedChildren) {
      const shouldLoad = isExpanded; // Если элемент раскрыт, загружаем сразу
      const timeoutId = setTimeout(() => {
        getChildItems(itemId)
          .then(children => {
            setChildItems(children);
            setHasLoadedChildren(true);
          })
          .catch(error => {
            console.error('Ошибка загрузки дочерних элементов:', error);
            setHasLoadedChildren(true);
          });
      }, shouldLoad ? 0 : 100); // Если нужно раскрыть, загружаем без задержки
      
      return () => clearTimeout(timeoutId);
    }
  }, [itemId, hasLoadedChildren, getChildItems, shouldDisableExpansion, isExpanded]);

  // Загружаем дочерние элементы, если элемент раскрыт, но дети еще не загружены
  useEffect(() => {
    if (shouldDisableExpansion || hasLoadedChildren) {
      return;
    }
    
    if (isExpanded && childItems.length === 0) {
      setLoadingChildren(true);
      getChildItems(itemId)
        .then(children => {
          setChildItems(children);
          setHasLoadedChildren(true);
        })
        .catch(error => {
          console.error('Ошибка загрузки дочерних элементов:', error);
          setHasLoadedChildren(true);
        })
        .finally(() => {
          setLoadingChildren(false);
        });
    }
  }, [isExpanded, hasLoadedChildren, childItems.length, itemId, getChildItems, shouldDisableExpansion]);

  // Определяем, есть ли дочерние элементы
  const hasChildren = useMemo(() => {
    if (hasLoadedChildren) {
      return childItems.length > 0;
    }
    return false;
  }, [hasLoadedChildren, childItems.length]);

  // Проверяем, содержит ли элемент или его дочерние элементы поисковый запрос
  const matchesSearch = useMemo(() => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    if (itemName.toLowerCase().includes(query)) return true;
    return childItems.some(child => {
      const childName = child[nameField];
      return childName?.toLowerCase().includes(query);
    });
  }, [searchQuery, itemName, childItems, nameField]);

  // Автоматически разворачиваем, если поиск найден в дочерних элементах
  useEffect(() => {
    if (matchesSearch && hasChildren && !isExpanded && searchQuery.trim()) {
      if (!hasLoadedChildren || childItems.length === 0) {
        setLoadingChildren(true);
        getChildItems(itemId)
          .then(children => {
            setChildItems(children);
            setHasLoadedChildren(true);
            setIsExpanded(true);
          })
          .catch(error => {
            console.error('Ошибка загрузки дочерних элементов:', error);
            setHasLoadedChildren(true);
          })
          .finally(() => {
            setLoadingChildren(false);
          });
      } else {
        setIsExpanded(true);
      }
    }
  }, [matchesSearch, hasChildren, isExpanded, hasLoadedChildren, childItems.length, itemId, getChildItems, searchQuery, setIsExpanded]);

  const [openedEdit, setOpenedEdit] = useState(false);
  const [openedDelete, setOpenedDelete] = useState(false);
  const [openedAdd, setOpenedAdd] = useState(false);

  const handleEdit = useCallback(() => {
    setOpenedEdit(true);
  }, []);

  const handleDelete = useCallback(() => {
    setOpenedDelete(true);
  }, []);

  const handleAdd = useCallback(() => {
    setOpenedAdd(true);
  }, []);

  const toggleExpanded = useCallback(async () => {
    if (!isExpanded && childItems.length === 0) {
      setLoadingChildren(true);
      try {
        const children = await getChildItems(itemId);
        setChildItems(children);
        setHasLoadedChildren(true);
      } catch (error) {
        console.error('Ошибка загрузки детей:', error);
        setHasLoadedChildren(true);
      } finally {
        setLoadingChildren(false);
      }
    }
    setIsExpanded(!isExpanded);
  }, [isExpanded, childItems.length, itemId, getChildItems, setIsExpanded]);

  const handleSelect = useCallback(() => {
    setSelectedId(itemId);
    if (onItemSelect) {
      onItemSelect(item);
    }
  }, [itemId, setSelectedId, item, onItemSelect]);

  const handleSuccess = useCallback(async () => {
    onDataUpdate();
    if (hasLoadedChildren) {
      try {
        const children = await getChildItems(itemId);
        setChildItems(children);
      } catch (error) {
        console.error('Ошибка обновления детей:', error);
      }
    }
  }, [onDataUpdate, hasLoadedChildren, itemId, getChildItems]);

  if (!matchesSearch && searchQuery.trim()) {
    return null;
  }

  return (
    <>
      <Paper 
        key={itemId} 
        shadow="xs"
        radius="md"
        p="xs"
        mb={4}
        className={`hierarchy-block ${isSelected ? 'hierarchy-block-selected' : ''} ${isExpanded ? 'hierarchy-block-expanded' : ''}`}
        style={{ 
          backgroundColor: 'transparent'
        } as React.CSSProperties}
      > 
        <Group gap={4} justify="space-between" style={{ width: '100%' }}>
          <Group gap={4} style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start' }}>
            {/* Стрелка раскрытия/сворачивания (placeholder для выравнивания текста) */}
            <Box className="hierarchy-chevron-wrapper">
              {hasChildren && !shouldDisableExpansion && (
                <ActionIcon
                  variant="subtle"
                  size="xs"
                  onClick={toggleExpanded}
                  style={{ 
                    color: 'light-dark(var(--color-primary-600), var(--color-accent-light-80))',
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                  }}
                >
                  <IconChevronRight size={12} />
                </ActionIcon>
              )}
            </Box>
            
            <Box 
              onClick={handleSelect}
              className="hierarchy-title-button"
              style={{ cursor: 'pointer', flex: 1 }}
            > 
              {renderItem ? (
                renderItem(item, isSelected, hasChildren)
              ) : (
                <Text size="xs" fw={500} ta="left" className="hierarchy-title-text">
                  {searchQuery.trim() ? (
                    (() => {
                      const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                      const parts = itemName.split(regex);
                      return parts.map((part: string, index: number) => 
                        regex.test(part) ? (
                          <mark key={index} style={{ 
                            backgroundColor: 'var(--mantine-color-yellow-3)', 
                            color: 'var(--mantine-color-dark-9)',
                            padding: '0 2px',
                            borderRadius: '2px'
                          }}>
                            {part}
                          </mark>
                        ) : part
                      );
                    })()
                  ) : (
                    itemName
                  )}
                </Text>
              )}
            </Box>
          </Group>
          
          {hasFullAccess && (AddModal || EditModal || DeleteModal) && (
            <Group gap={4} style={{ flexShrink: 0 }}>
              {AddModal && (
                <Tooltip label="Добавить дочерний элемент" withArrow>
                  <ActionIcon 
                    variant="light" 
                    size="xs" 
                    style={{ color: 'var(--color-primary-500)' }}
                    onClick={handleAdd}
                  >
                    <IconPlus size={12} />
                  </ActionIcon>
                </Tooltip>
              )}

              {EditModal && (
                <Tooltip label="Редактировать" withArrow>
                  <ActionIcon 
                    variant="light" 
                    size="xs" 
                    color="orange"
                    onClick={handleEdit}
                  >
                    <IconEdit size={12} />
                  </ActionIcon>
                </Tooltip>
              )}

              {DeleteModal && (
                <Tooltip label="Удалить" withArrow>
                  <ActionIcon 
                    variant="light" 
                    size="xs" 
                    color="red"
                    onClick={handleDelete}
                  >
                    <IconTrash size={12} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          )}
        </Group>
      </Paper>

      {/* Дочерние элементы - рендерим только если раскрыто (ниже родителя) */}
      {isExpanded && hasChildren && !shouldDisableExpansion && (
        <Box className="hierarchy-children-container">
          {loadingChildren ? (
            <Box className="hierarchy-loading-container">
              <Text size="xs" c="dimmed">Загрузка подкатегорий...</Text>
            </Box>
          ) : (
            <Box>
              {childItems.map((childItem) => (
                <UniversalHierarchyBlockMemo 
                  key={childItem[idField]}
                  item={childItem} 
                  config={config}
                  onDataUpdate={onDataUpdate}
                  hasFullAccess={hasFullAccess}
                  searchQuery={searchQuery}
                  level={level + 1}
                  expandedItems={expandedItems}
                  setExpanded={setExpanded}
                  externalSelectedContext={externalSelectedContext}
                />
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Модалки */}
      {AddModal && (
        <CustomModal
          opened={openedAdd}
          onClose={() => setOpenedAdd(false)}
          title="Добавить дочерний элемент"
          size="lg"
          icon={<IconPlus size={20} />}
        >
          <AddModal 
            parentItem={item}
            onClose={() => setOpenedAdd(false)}
            onSuccess={() => {
              handleSuccess();
              setOpenedAdd(false);
            }}
          />
        </CustomModal>
      )}

      {EditModal && (
        <CustomModal
          opened={openedEdit}
          onClose={() => setOpenedEdit(false)}
          title="Редактирование"
          size="lg"
          icon={<IconEdit size={20} />}
        >
          <EditModal
            item={item}
            onClose={() => setOpenedEdit(false)}
            onSuccess={() => {
              handleSuccess();
              setOpenedEdit(false);
            }}
          />
        </CustomModal>
      )}

      {DeleteModal && (
        <CustomModal
          opened={openedDelete}
          onClose={() => setOpenedDelete(false)}
          title="Удаление"
          size="lg"
          icon={<IconTrash size={20} />}
        >
          <DeleteModal
            item={item}
            onClose={() => setOpenedDelete(false)}
            onSuccess={() => {
              handleSuccess();
              setOpenedDelete(false);
            }}
          />
        </CustomModal>
      )}
    </>
  );
};

UniversalHierarchyBlock.displayName = 'UniversalHierarchyBlock';

// Кастомная функция сравнения для оптимизации ререндеров
const areEqual = (prevProps: any, nextProps: any) => {
  const idField = prevProps.config.idField || 'id';
  const itemId = prevProps.item[idField];
  
  // Сравниваем ID элемента
  if (itemId !== nextProps.item[idField]) {
    return false;
  }
  
  // Сравниваем основные пропсы
  if (prevProps.searchQuery !== nextProps.searchQuery) {
    return false;
  }
  
  if (prevProps.level !== nextProps.level) {
    return false;
  }
  
  if (prevProps.disableExpansion !== nextProps.disableExpansion) {
    return false;
  }
  
  if (prevProps.hasFullAccess !== nextProps.hasFullAccess) {
    return false;
  }
  
  // Сравниваем selectedId - проверяем только для текущего элемента
  const prevSelectedId = prevProps.externalSelectedContext?.selectedId ?? null;
  const nextSelectedId = nextProps.externalSelectedContext?.selectedId ?? null;
  const isPrevSelected = prevSelectedId === itemId;
  const isNextSelected = nextSelectedId === itemId;
  if (isPrevSelected !== isNextSelected) {
    return false;
  }
  
  // Сравниваем expandedItems - проверяем, изменилось ли состояние раскрытия для этого элемента
  const prevExpanded = prevProps.expandedItems?.has(itemId) ?? false;
  const nextExpanded = nextProps.expandedItems?.has(itemId) ?? false;
  if (prevExpanded !== nextExpanded) {
    return false;
  }
  
  // Сравниваем config - проверяем только критичные поля
  // Игнорируем изменения в функциях и объектах, если они не влияют на рендер
  if (prevProps.config.parentField !== nextProps.config.parentField ||
      prevProps.config.nameField !== nextProps.config.nameField ||
      prevProps.config.idField !== nextProps.config.idField ||
      prevProps.config.disableExpansion !== nextProps.config.disableExpansion) {
    return false;
  }
  
  // Сравниваем onDataUpdate - если это разные функции, но это не должно вызывать ререндер
  // (они могут быть пересозданы, но функционально идентичны)
  // Игнорируем изменения в onItemSelect, так как это не влияет на визуальный рендер
  
  // Если все пропсы равны, не перерисовываем
  return true;
};

// Применяем кастомную функцию сравнения
const UniversalHierarchyBlockMemo = React.memo(UniversalHierarchyBlock, areEqual);

interface UniversalHierarchyProps {
  config: UniversalHierarchyConfig;
  hasFullAccess?: boolean;
  initialSelectedId?: string | null;
  // Опциональный внешний контекст для выбранного элемента
  externalSelectedContext?: {
    selectedId: string | null;
    setSelectedId: (id: string | null) => void;
  };
}

export function UniversalHierarchy({ config, hasFullAccess = true, initialSelectedId = null, externalSelectedContext }: UniversalHierarchyProps) {
  // Мемоизируем config, чтобы избежать лишних ререндеров при пересоздании объекта
  // Сравниваем только критичные поля, игнорируя функции и компоненты
  const memoizedConfig = React.useMemo(() => {
    // Создаем новый объект с теми же значениями, но стабильными ссылками на функции
    return {
      ...config,
      // Сохраняем ссылки на функции из предыдущего config, если они не изменились
    };
  }, [
    // Сравниваем только примитивные значения и массивы
    config.initialData,
    config.parentField,
    config.nameField,
    config.idField,
    config.disableExpansion,
    // Не включаем функции (fetchItems, rootFilter, onItemSelect, onDataUpdate) 
    // и компоненты (AddModal, EditModal, DeleteModal, renderItem) в зависимости,
    // так как они могут пересоздаваться без изменения функциональности
  ]);
  
  const [data, setData] = useState<HierarchyItem[]>(memoizedConfig.initialData || []);
  // Если есть fetchItems, показываем loading, иначе проверяем наличие initialData
  const [loading, setLoading] = useState(() => {
    if (memoizedConfig.fetchItems) return true;
    // Если initialData не определен или пустой массив при первом рендере, показываем loading
    return memoizedConfig.initialData === undefined;
  });
  const [openedAdd, setOpenedAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(initialSelectedId);
  // Состояние раскрытых узлов - сохраняем Set ID раскрытых элементов
  const [expandedItems, setExpandedItemsState] = useState<Set<string>>(new Set());
  // Ref для сохранения состояния раскрытых узлов перед перезагрузкой
  const expandedItemsRef = React.useRef<Set<string>>(new Set());
  
  // Используем внешний контекст, если он предоставлен, иначе внутренний
  const selectedId = externalSelectedContext?.selectedId ?? internalSelectedId;
  const setSelectedId = externalSelectedContext?.setSelectedId ?? setInternalSelectedId;

  const {
    rootFilter,
    AddModal
  } = memoizedConfig;

  const loadData = useCallback(async () => {
    if (!memoizedConfig.fetchItems) {
      // Если нет fetchItems, используем initialData
      if (memoizedConfig.initialData !== undefined) {
        setData(memoizedConfig.initialData);
        setLoading(false);
        // Не вызываем onDataUpdate здесь, чтобы избежать бесконечных циклов
      } else {
        setLoading(false);
      }
      return;
    }

    try {
      setLoading(true);
      const hierarchyData = await memoizedConfig.fetchItems();
      setData(hierarchyData || []);
      if (memoizedConfig.onDataUpdate) {
        memoizedConfig.onDataUpdate(hierarchyData || []);
      }
    } catch (error) {
      console.error('❌ [UniversalHierarchy] Ошибка загрузки данных:', error);
      setData([]);
      notificationSystem.addNotification(
        'Ошибка!',
        'Не удалось загрузить данные. Проверьте подключение к серверу.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [memoizedConfig.fetchItems, memoizedConfig.onDataUpdate, memoizedConfig.initialData]);

  // Загружаем данные при монтировании или изменении fetchItems
  // Используем ref для отслеживания предыдущего fetchItems, чтобы избежать лишних загрузок
  const prevFetchItemsRef = React.useRef(memoizedConfig.fetchItems);
  const hasLoadedRef = React.useRef(false);
  
  useEffect(() => {
    // Загружаем при первом монтировании, если есть fetchItems
    if (memoizedConfig.fetchItems && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      prevFetchItemsRef.current = memoizedConfig.fetchItems;
      loadData();
    } else if (memoizedConfig.fetchItems && prevFetchItemsRef.current !== memoizedConfig.fetchItems) {
      // Загружаем только если fetchItems действительно изменился (новая функция)
      prevFetchItemsRef.current = memoizedConfig.fetchItems;
      loadData();
    } else if (!memoizedConfig.fetchItems && prevFetchItemsRef.current) {
      // Если fetchItems был удален, сбрасываем ref
      prevFetchItemsRef.current = undefined;
      hasLoadedRef.current = false;
    }
  }, [memoizedConfig.fetchItems, loadData]);

  // Обновляем данные при изменении initialData (если нет fetchItems)
  // Используем useRef для отслеживания предыдущего значения, чтобы избежать бесконечных циклов
  const prevInitialDataRef = React.useRef<HierarchyItem[] | undefined>(memoizedConfig.initialData);
  
  useEffect(() => {
    if (!memoizedConfig.fetchItems && memoizedConfig.initialData !== undefined) {
      // Проверяем, изменились ли данные по содержимому, а не по ссылке
      const prevData = prevInitialDataRef.current;
      const newData = memoizedConfig.initialData;
      
      // Сравниваем по содержимому, чтобы избежать лишних обновлений при пересоздании массива
      const prevDataStr = prevData ? JSON.stringify(prevData) : '';
      const newDataStr = JSON.stringify(newData);
      
      if (prevDataStr !== newDataStr) {
        // Сохраняем состояние раскрытых узлов перед обновлением данных
        const currentExpanded = new Set(expandedItemsRef.current);
        prevInitialDataRef.current = memoizedConfig.initialData;
        setData(memoizedConfig.initialData);
        setLoading(false);
        // Восстанавливаем состояние раскрытых узлов после обновления данных
        // Используем requestAnimationFrame для более плавного обновления
        requestAnimationFrame(() => {
          setExpandedItemsState(currentExpanded);
          expandedItemsRef.current = currentExpanded;
        });
        // Не вызываем onDataUpdate здесь, чтобы избежать бесконечных циклов
        // onDataUpdate должен вызываться только при явном обновлении данных через модалки
      }
    }
  }, [memoizedConfig.initialData, memoizedConfig.fetchItems]);

  // Функция для управления состоянием раскрытых узлов
  // Используем функциональное обновление, чтобы избежать лишних ререндеров
  const setExpanded = useCallback((itemId: string, expanded: boolean) => {
    setExpandedItemsState(prev => {
      // Проверяем, изменилось ли состояние
      const wasExpanded = prev.has(itemId);
      if (wasExpanded === expanded) {
        // Состояние не изменилось, возвращаем тот же Set
        return prev;
      }
      
      // Создаем новый Set только если состояние действительно изменилось
      const newSet = new Set(prev);
      if (expanded) {
        newSet.add(itemId);
      } else {
        newSet.delete(itemId);
      }
      expandedItemsRef.current = newSet;
      return newSet;
    });
  }, []);

  // Синхронизируем ref с состоянием
  React.useEffect(() => {
    expandedItemsRef.current = expandedItems;
  }, [expandedItems]);

  const handleDataUpdate = useCallback(async () => {
    // Сохраняем текущее состояние раскрытых узлов перед перезагрузкой
    const currentExpanded = new Set(expandedItemsRef.current);
    await loadData();
    // Восстанавливаем состояние раскрытых узлов после перезагрузки
    // Используем requestAnimationFrame для более плавного обновления
    requestAnimationFrame(() => {
      setExpandedItemsState(currentExpanded);
      expandedItemsRef.current = currentExpanded;
    });
  }, [loadData]);

  const rootElements = useMemo(() => {
    if (rootFilter) {
      return data.filter(rootFilter);
    }
    // По умолчанию фильтруем элементы без родителя
    return data.filter(item => {
      const parentId = item[memoizedConfig.parentField];
      return parentId === null || parentId === undefined;
    });
  }, [data, rootFilter, memoizedConfig.parentField]);

  if (loading) {
    return (
      <Box className="hierarchy-loading-container">
        Загрузка иерархии...
      </Box>
    );
  }

  // Если используется внешний контекст, не создаем свой провайдер
  const contextValue = { selectedId, setSelectedId };
  
  const content = (
      <Stack gap="xs" className="hierarchy-sort-container">
        {/* Поиск и кнопка сортировки */}
        <Group gap="xs" className="hierarchy-header">
          <TextInput
            placeholder="Поиск по категориям..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
            size="sm"
            style={{ flex: 1 }}
          />
        </Group>
        
        {/* Основная иерархия */}
        {rootElements.length > 0 ? (
          rootElements.map((item) => (
            <UniversalHierarchyBlockMemo 
              key={item[memoizedConfig.idField || 'id']} 
              item={item} 
              config={memoizedConfig}
              onDataUpdate={handleDataUpdate}
              hasFullAccess={hasFullAccess}
              searchQuery={searchQuery}
              disableExpansion={memoizedConfig.disableExpansion}
              expandedItems={expandedItems}
              setExpanded={setExpanded}
              externalSelectedContext={externalSelectedContext}
            />
          ))
        ) : (
          <Alert color="yellow" title="Нет данных" style={{ marginBottom: 15 }}>
            Иерархия пуста. Добавьте корневую категорию.
          </Alert>
        )}
        
        {/* Кнопка добавления корневого элемента - только для пользователей с полным доступом */}
        {hasFullAccess && AddModal && (
          <Paper shadow="xs" radius="md" p="lg" style={{ textAlign: 'center' }}>
            <Button 
              onClick={() => setOpenedAdd(true)}
              size="md"
              leftSection={<IconPlus size={20} />}
              variant="filled"
              style={{ 
                background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                color: 'white'
              }}
            >
              Добавить категорию
            </Button>
          </Paper>
        )}

        {/* Модалка добавления корневой категории */}
        {AddModal && (
          <CustomModal
            opened={openedAdd}
            onClose={() => setOpenedAdd(false)}
            title="Добавить корневую категорию"
            size="lg"
            icon={<IconPlus size={20} />}
          >
            <AddModal
              onClose={() => setOpenedAdd(false)}
              onSuccess={() => {
                handleDataUpdate();
                setOpenedAdd(false);
              }}
            />
          </CustomModal>
        )}
      </Stack>
  );
  
  // Если используется внешний контекст, возвращаем контент без провайдера
  if (externalSelectedContext) {
    return content;
  }
  
  // Иначе оборачиваем в провайдер
  return (
    <SelectedItemContext.Provider value={contextValue}>
      {content}
    </SelectedItemContext.Provider>
  );
}

export default UniversalHierarchy;
