import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Stack, 
  Box, 
  Text, 
  Button, 
  Group,
  Paper,
  ScrollArea,
  Loader,
  TextInput,
  Badge,
  ActionIcon,
  Tooltip,
  Grid,
  Divider
} from '@mantine/core';
import { 
  IconFolder, 
  IconGripVertical, 
  IconCheck, 
  IconSearch,
  IconArrowUp,
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconRefresh,
  IconX,
  IconMenu2
} from '@tabler/icons-react';
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import cx from 'clsx';
import { notificationSystem } from './Push';
import { buildTree } from './hierarchy';
import useAuthFetch from '../hooks/useAuthFetch';
import { API } from '../config/constants';
import './styles/UniversalHierarchySortModal.css';

interface SortableItem {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  originalLevel: number;
  originalParentId: string | null;
  sortOrder: number;
  [key: string]: any; // Для дополнительных полей
}

interface UniversalHierarchySortModalProps {
  onClose: () => void;
  onSuccess: () => void;
  // Конфигурация для работы с данными
  config: {
    // API endpoints
    fetchEndpoint: string; // GET endpoint для загрузки данных
    updateOrderEndpoint?: string; // POST/PUT endpoint для обновления порядка (опционально, если используется bulk update)
    updateItemEndpoint?: (id: string) => string; // PUT endpoint для обновления отдельного элемента
    // Поля данных
    parentField: string; // Поле для parentId (например, 'parent_type', 'parent_id', 'parentId')
    sortField: string; // Поле для сортировки (например, 'sortOrder', 'order')
    nameField: string; // Поле для имени (например, 'name')
    idField?: string; // Поле для ID (по умолчанию 'id')
    // Дополнительные фильтры для загрузки данных
    additionalFilters?: Record<string, any>; // Дополнительные query параметры
    // Функция для преобразования данных из API в SortableItem
    transformItem?: (item: any) => SortableItem;
    // Функция для сохранения изменений (если нужна кастомная логика)
    onSave?: (items: SortableItem[], originalItems: SortableItem[]) => Promise<void>;
  };
}

const INDENT_PER_LEVEL = 30;

function SortableItemComponent({ 
  item, 
  allItems, 
  originalItems, 
  handleQuickMove,
  selectedItem,
  setSelectedItem,
  isCategoryColumn = false,
  draggedOverId = null,
  searchQuery = '',
  parentField,
}: {
  item: SortableItem;
  allItems: SortableItem[];
  originalItems: SortableItem[];
  handleQuickMove: (itemId: string, direction: 'up' | 'down' | 'left' | 'right') => void;
  selectedItem: string | null;
  setSelectedItem: (id: string | null) => void;
  isCategoryColumn?: boolean;
  draggedOverId?: string | null;
  searchQuery?: string;
  parentField: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    marginLeft: isCategoryColumn ? `${item.level * INDENT_PER_LEVEL}px` : 0,
  };

  const originalIndex = originalItems.findIndex(i => i.id === item.id);
  const isSelected = selectedItem === item.id;
  
  // Проверяем изменения
  let hasChanged = false;
  if (originalItems.length > 0 && originalIndex !== -1 && originalItems[originalIndex]) {
    const original = originalItems[originalIndex];
    if (item[parentField] !== original[parentField] || item.level !== original.level) {
      hasChanged = true;
    } else {
      const currentSameParent = allItems.filter(i => i[parentField] === item[parentField]);
      const originalSameParent = originalItems.filter(i => i[parentField] === original[parentField]);
      const currentIndex = currentSameParent.findIndex(i => i.id === item.id);
      const originalIndex = originalSameParent.findIndex(i => i.id === item.id);
      if (currentIndex !== originalIndex) {
        hasChanged = true;
      }
    }
  }

  const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());

  if (!matchesSearch) return null;

  const isDragOver = draggedOverId === item.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
    >
      <Paper
        className={cx('hierarchy-sort-item', {
          'hierarchy-sort-item-dragging': isDragging,
          'hierarchy-sort-item-selected': isSelected,
          'hierarchy-sort-item-changed': hasChanged,
          'hierarchy-sort-item-drag-over': isDragOver,
        })}
        onClick={() => setSelectedItem(isSelected ? null : item.id)}
        p="xs"
        mb="xs"
      >
        <Group gap="sm" style={{ width: '100%' }}>
          <div className="hierarchy-sort-drag-handle" {...listeners}>
            <IconGripVertical size={18} stroke={1.5} />
          </div>
          <IconFolder size={16} color="var(--color-accent-80)" />
          <Text 
            size="sm" 
            fw={500} 
            style={{ flex: 1 }}
          >
            {searchQuery.trim() ? (
              (() => {
                const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                const parts = item.name.split(regex);
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
              item.name
            )}
          </Text>
          {hasChanged && (
            <Badge size="xs" variant="dot" color="orange">
              Изменено
            </Badge>
          )}
        <Group gap={4}>
          <Tooltip label="Вверх">
            <ActionIcon
              size="sm"
              variant="subtle"
              onClick={(e) => {
                e.stopPropagation();
                handleQuickMove(item.id, 'up');
              }}
            >
              <IconArrowUp size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Вниз">
            <ActionIcon
              size="sm"
              variant="subtle"
              onClick={(e) => {
                e.stopPropagation();
                handleQuickMove(item.id, 'down');
              }}
            >
              <IconArrowDown size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Влево (уровень вверх)">
            <ActionIcon
              size="sm"
              variant="subtle"
              onClick={(e) => {
                e.stopPropagation();
                handleQuickMove(item.id, 'left');
              }}
            >
              <IconArrowLeft size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Вправо (уровень вниз)">
            <ActionIcon
              size="sm"
              variant="subtle"
              onClick={(e) => {
                e.stopPropagation();
                handleQuickMove(item.id, 'right');
              }}
            >
              <IconArrowRight size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
    </Paper>
    </div>
  );
}

export function UniversalHierarchySortModal({ onClose, onSuccess, config }: UniversalHierarchySortModalProps) {
  const [allItems, setAllItems] = useState<SortableItem[]>([]);
  const [originalItems, setOriginalItems] = useState<SortableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQueryChildren, setSearchQueryChildren] = useState('');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedRootItem, setSelectedRootItem] = useState<string | null>(null);
  const [draggedOverId, setDraggedOverId] = useState<string | null>(null);
  const [activeDraggedItem, setActiveDraggedItem] = useState<SortableItem | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const authFetch = useAuthFetch();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const {
    fetchEndpoint,
    updateOrderEndpoint,
    updateItemEndpoint,
    parentField,
    sortField,
    nameField,
    idField = 'id',
    additionalFilters = {},
    transformItem,
    onSave
  } = config;

  // Загружаем всю иерархию
  useEffect(() => {
    const loadAllData = async () => {
      try {
        setLoading(true);
        
        // Строим query строку для дополнительных фильтров
        const queryParams = new URLSearchParams();
        Object.entries(additionalFilters).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            queryParams.append(key, String(value));
          }
        });
        const queryString = queryParams.toString();
        const url = queryString ? `${fetchEndpoint}?${queryString}` : fetchEndpoint;

        const response = await authFetch(url);
        if (!response || !response.ok) {
          throw new Error('Ошибка загрузки данных');
        }

        const data = await response.json();
        
        // Преобразуем данные в SortableItem
        const items: SortableItem[] = transformItem 
          ? data.map(transformItem)
          : data.map((item: any) => ({
              id: item[idField],
              name: item[nameField],
              parentId: item[parentField] || null,
              level: 0, // Будет вычислено
              originalLevel: 0,
              originalParentId: item[parentField] || null,
              sortOrder: item[sortField] || 0,
              ...item
            }));

        // Строим дерево и вычисляем уровни
        const tree = buildTree(items, {
          parentField,
          sortField,
          nameField,
          childrenField: 'children'
        });

        const flattenWithLevels = (treeItems: any[], level: number = 0): SortableItem[] => {
          const result: SortableItem[] = [];
          treeItems.forEach(item => {
            result.push({
              ...item,
              level,
              originalLevel: level
            });
            if (item.children && item.children.length > 0) {
              result.push(...flattenWithLevels(item.children, level + 1));
            }
          });
          return result;
        };

        const itemsWithLevels = flattenWithLevels(tree);
        setAllItems(itemsWithLevels);
        setOriginalItems(JSON.parse(JSON.stringify(itemsWithLevels)));
      } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        notificationSystem.addNotification('Ошибка', 'Не удалось загрузить данные', 'error');
      } finally {
        setLoading(false);
      }
    };
    
    loadAllData();
  }, [fetchEndpoint, JSON.stringify(additionalFilters)]);

  // Подсчет изменений
  const hasChanges = useMemo(() => {
    if (originalItems.length === 0 || allItems.length !== originalItems.length) return false;
    
    const originalMap = new Map(originalItems.map(i => [i.id, i]));
    
    for (const item of allItems) {
      const original = originalMap.get(item.id);
      if (!original) return true;
      
      if (item[parentField] !== original[parentField] || item.level !== original.level) {
        return true;
      }
      
      const currentSameParent = allItems.filter(i => i[parentField] === item[parentField]);
      const originalSameParent = originalItems.filter(i => i[parentField] === original[parentField]);
      
      const currentIndex = currentSameParent.findIndex(i => i.id === item.id);
      const originalIndex = originalSameParent.findIndex(i => i.id === item.id);
      
      if (currentIndex !== originalIndex) {
        return true;
      }
    }
    
    return false;
  }, [allItems, originalItems, parentField]);

  // Отмена изменений
  const handleReset = () => {
    setAllItems(JSON.parse(JSON.stringify(originalItems)));
    setSelectedItem(null);
    notificationSystem.addNotification('Информация', 'Изменения отменены', 'info');
  };

  // Получить все дочерние элементы (рекурсивно)
  const getAllChildren = useCallback((itemId: string, items: SortableItem[]): SortableItem[] => {
    const children: SortableItem[] = [];
    const findChildren = (parentId: string) => {
      const directChildren = items.filter(item => item[parentField] === parentId);
      children.push(...directChildren);
      directChildren.forEach(child => {
        findChildren(child.id);
      });
    };
    findChildren(itemId);
    return children;
  }, [parentField]);

  // Быстрое перемещение
  const handleQuickMove = (itemId: string, direction: 'up' | 'down' | 'left' | 'right') => {
    const itemIndex = allItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;

    const item = allItems[itemIndex];
    const newItems = [...allItems];

    const itemsToMove: SortableItem[] = [item];
    const children = getAllChildren(item.id, allItems);
    itemsToMove.push(...children);

    if (direction === 'up' && itemIndex > 0) {
      const prevIndex = itemIndex - 1;
      const prevItem = newItems[prevIndex];
      
      if (prevItem.level === item.level && prevItem[parentField] === item[parentField]) {
        const itemsToMoveIds = new Set(itemsToMove.map(i => i.id));
        const itemsWithoutMoved = newItems.filter(i => !itemsToMoveIds.has(i.id));
        
        const insertIndex = prevIndex;
        const updatedItems = [
          ...itemsWithoutMoved.slice(0, insertIndex),
          ...itemsToMove,
          ...itemsWithoutMoved.slice(insertIndex)
        ];
        
        setAllItems(updatedItems);
      }
    } else if (direction === 'down' && itemIndex < allItems.length - 1) {
      let nextIndex = itemIndex + 1;
      while (nextIndex < allItems.length) {
        const nextItem = newItems[nextIndex];
        if (nextItem.level === item.level && nextItem[parentField] === item[parentField]) {
          const itemsToMoveIds = new Set(itemsToMove.map(i => i.id));
          const itemsWithoutMoved = newItems.filter(i => !itemsToMoveIds.has(i.id));
          
          const nextItemNewIndex = itemsWithoutMoved.findIndex(i => i.id === nextItem.id);
          const insertIndex = nextItemNewIndex + 1;
          
          const updatedItems = [
            ...itemsWithoutMoved.slice(0, insertIndex),
            ...itemsToMove,
            ...itemsWithoutMoved.slice(insertIndex)
          ];
          
          setAllItems(updatedItems);
          break;
        }
        if (nextItem.level > item.level || nextItem[parentField] === item.id) {
          nextIndex++;
        } else {
          break;
        }
      }
    } else if (direction === 'left' && item.level > 0) {
      const newLevel = item.level - 1;
      let newParentId: string | null = null;
      
      for (let i = itemIndex - 1; i >= 0; i--) {
        const parentItem = newItems[i];
        if (parentItem.level === newLevel) {
          newParentId = parentItem.id;
          break;
        }
        if (parentItem.level < newLevel) break;
      }
      
      const levelDiff = newLevel - item.level;
      const updatedItemsToMove = itemsToMove.map(childItem => {
        if (childItem.id === item.id) {
          return { ...childItem, level: newLevel, [parentField]: newParentId };
        } else {
          const originalItem = originalItems.find(orig => orig.id === childItem.id);
          const originalParent = originalItems.find(orig => orig.id === item.id);
          
          if (originalItem && originalParent) {
            const relativeLevel = originalItem.level - originalParent.level;
            const newChildLevel = newLevel + relativeLevel;
            const newChildParentId = childItem.id === item.id ? newParentId : childItem[parentField];
            return { ...childItem, level: newChildLevel, [parentField]: newChildParentId };
          } else {
            return { ...childItem, level: childItem.level + levelDiff };
          }
        }
      });
      
      const itemsToMoveIds = new Set(itemsToMove.map(i => i.id));
      const itemsWithoutMoved = newItems.filter(i => !itemsToMoveIds.has(i.id));
      const insertIndex = itemIndex;
      
      const updatedItems = [
        ...itemsWithoutMoved.slice(0, insertIndex),
        ...updatedItemsToMove,
        ...itemsWithoutMoved.slice(insertIndex)
      ];
      
      setAllItems(updatedItems);
    } else if (direction === 'right' && item.level < 10) {
      const newLevel = item.level + 1;
      let newParentId: string | null = null;
      
      for (let i = itemIndex - 1; i >= 0; i--) {
        const parentItem = newItems[i];
        if (parentItem.level === newLevel - 1) {
          newParentId = parentItem.id;
          break;
        }
        if (parentItem.level < newLevel - 1) break;
      }
      
      if (newParentId || newLevel === 1) {
        const levelDiff = newLevel - item.level;
        const updatedItemsToMove = itemsToMove.map(childItem => {
          if (childItem.id === item.id) {
            return { ...childItem, level: newLevel, [parentField]: newParentId };
          } else {
            const originalItem = originalItems.find(orig => orig.id === childItem.id);
            const originalParent = originalItems.find(orig => orig.id === item.id);
            
            if (originalItem && originalParent) {
              const relativeLevel = originalItem.level - originalParent.level;
              const newChildLevel = newLevel + relativeLevel;
              // Вычисляем нового родителя для дочернего элемента
              const newChildParentId = childItem.id === item.id ? newParentId : 
                (relativeLevel === 1 ? item.id : childItem[parentField]);
              return { ...childItem, level: newChildLevel, [parentField]: newChildParentId };
            } else {
              return { ...childItem, level: childItem.level + levelDiff };
            }
          }
        });
        
        const itemsToMoveIds = new Set(itemsToMove.map(i => i.id));
        const itemsWithoutMoved = newItems.filter(i => !itemsToMoveIds.has(i.id));
        const insertIndex = itemIndex;
        
        const updatedItems = [
          ...itemsWithoutMoved.slice(0, insertIndex),
          ...updatedItemsToMove,
          ...itemsWithoutMoved.slice(insertIndex)
        ];
        
        setAllItems(updatedItems);
      }
    }
  };

  // Обработчик окончания перетаскивания
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setDraggedOverId(null);
      setActiveDraggedItem(null);
      setActiveId(null);
      return;
    }

    const activeItem = allItems.find(i => i.id === active.id);
    const overItem = allItems.find(i => i.id === over.id);
    
    if (!activeItem || !overItem) {
      setDraggedOverId(null);
      setActiveDraggedItem(null);
      setActiveId(null);
      return;
    }

    // Если перетаскиваем дочерний элемент на корневой элемент (между колонками)
    // Делаем дочерний элемент корневым
    if (activeItem.parentId && !overItem.parentId) {
      const newItems = allItems.map(item => {
        if (item.id === activeItem.id) {
          return {
            ...item,
            [parentField]: null,
            level: 0
          };
        }
        return item;
      });
      setAllItems(newItems);
      setDraggedOverId(null);
      setActiveDraggedItem(null);
      setActiveId(null);
      // Если перетаскиваем из текущей выбранной категории, обновляем выбор
      if (selectedRootItem === activeItem.parentId) {
        setSelectedRootItem(null);
      }
      return;
    }

    // Если перетаскиваем корневой элемент на другой корневой элемент - изменение порядка
    if (!activeItem.parentId && !overItem.parentId) {
      const activeIndex = allItems.findIndex(i => i.id === active.id);
      const overIndex = allItems.findIndex(i => i.id === over.id);
      
      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        const itemsToMove: SortableItem[] = [activeItem];
        const children = getAllChildren(activeItem.id, allItems);
        itemsToMove.push(...children);
        
        const itemsToMoveIds = new Set(itemsToMove.map(i => i.id));
        const itemsWithoutMoved = allItems.filter(i => !itemsToMoveIds.has(i.id));
        
        const insertIndex = overIndex > activeIndex ? overIndex - itemsToMove.length + 1 : overIndex + 1;
        
        const updatedItems = [
          ...itemsWithoutMoved.slice(0, insertIndex),
          ...itemsToMove,
          ...itemsWithoutMoved.slice(insertIndex)
        ];
        
        setAllItems(updatedItems);
        setDraggedOverId(null);
        setActiveDraggedItem(null);
        setActiveId(null);
        return;
      }
    }

    // Если перетаскиваем дочерний элемент на корневой элемент - делаем его дочерним этого корневого
    if (activeItem.parentId && !overItem.parentId && overItem.id !== activeItem.parentId) {
      const newItems = allItems.map(item => {
        if (item.id === activeItem.id) {
          return {
            ...item,
            [parentField]: overItem.id,
            level: 1
          };
        }
        return item;
      });
      setAllItems(newItems);
      setDraggedOverId(null);
      setActiveDraggedItem(null);
      setActiveId(null);
      // Обновляем выбранную категорию
      if (selectedRootItem !== overItem.id) {
        setSelectedRootItem(overItem.id);
      }
      return;
    }

    // Если перетаскиваем дочерний элемент на другой дочерний элемент с тем же родителем - изменение порядка
    if (activeItem.parentId && overItem.parentId && activeItem.parentId === overItem.parentId) {
      const activeIndex = allItems.findIndex(i => i.id === active.id);
      const overIndex = allItems.findIndex(i => i.id === over.id);
      
      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        const itemsToMove: SortableItem[] = [activeItem];
        const children = getAllChildren(activeItem.id, allItems);
        itemsToMove.push(...children);
        
        const itemsToMoveIds = new Set(itemsToMove.map(i => i.id));
        const itemsWithoutMoved = allItems.filter(i => !itemsToMoveIds.has(i.id));
        
        const insertIndex = overIndex > activeIndex ? overIndex - itemsToMove.length + 1 : overIndex + 1;
        
        const updatedItems = [
          ...itemsWithoutMoved.slice(0, insertIndex),
          ...itemsToMove,
          ...itemsWithoutMoved.slice(insertIndex)
        ];
        
        setAllItems(updatedItems);
        setDraggedOverId(null);
        setActiveDraggedItem(null);
        setActiveId(null);
        return;
      }
    }

    // Общая логика для остальных случаев
    const activeIndex = allItems.findIndex(i => i.id === active.id);
    const overIndex = allItems.findIndex(i => i.id === over.id);

    // Перемещаем элемент и всех его детей
    const itemsToMove: SortableItem[] = [activeItem];
    const children = getAllChildren(activeItem.id, allItems);
    itemsToMove.push(...children);

    const itemsToMoveIds = new Set(itemsToMove.map(i => i.id));
    const itemsWithoutMoved = allItems.filter(i => !itemsToMoveIds.has(i.id));

    // Вставляем после элемента over
    const insertIndex = overIndex > activeIndex ? overIndex - itemsToMove.length + 1 : overIndex + 1;
    
    // Вычисляем новый уровень и родителя для перемещаемого элемента
    // Используем уровень элемента over как целевой уровень
    let newLevel = overItem.level;
    let newParentId: string | null = overItem[parentField] || null;
    
    // Обновляем перемещаемые элементы с новым уровнем и родителем
    const updatedItemsToMove: SortableItem[] = [];
    itemsToMove.forEach((item, idx) => {
      if (idx === 0) {
        // Первый элемент - сам перемещаемый элемент
        updatedItemsToMove.push({ ...item, level: newLevel, [parentField]: newParentId });
      } else {
        // Дочерние элементы - сохраняем относительный уровень и обновляем родителя
        const levelDiff = item.level - activeItem.level;
        const newChildLevel = newLevel + levelDiff;
        // Для прямых детей используем ID перемещаемого элемента
        let newChildParentId: string | null = null;
        if (levelDiff === 1) {
          newChildParentId = activeItem.id;
        } else if (levelDiff > 1) {
          // Для вложенных детей находим родителя из уже обновленных элементов
          const parentLevel = newChildLevel - 1;
          for (let i = idx - 1; i >= 0; i--) {
            if (updatedItemsToMove[i].level === parentLevel) {
              newChildParentId = updatedItemsToMove[i].id;
              break;
            }
          }
        } else {
          newChildParentId = newParentId;
        }
        updatedItemsToMove.push({ ...item, level: newChildLevel, [parentField]: newChildParentId });
      }
    });
    
    const updatedItems = [
      ...itemsWithoutMoved.slice(0, insertIndex),
      ...updatedItemsToMove,
      ...itemsWithoutMoved.slice(insertIndex)
    ];

    setAllItems(updatedItems);
    setDraggedOverId(null);
    setActiveDraggedItem(null);
    setActiveId(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setDraggedOverId(null);
    setActiveId(event.active.id as string);
    const item = allItems.find(i => i.id === event.active.id);
    setActiveDraggedItem(item || null);
  };

  const handleDragOver = (event: any) => {
    const { over } = event;
    if (over) {
      setDraggedOverId(over.id as string);
    }
  };

  const handleDragCancel = () => {
    setDraggedOverId(null);
    setActiveDraggedItem(null);
    setActiveId(null);
  };

  // Сохранение изменений
  const handleSave = async () => {
    if (onSave) {
      // Используем кастомную функцию сохранения
      try {
        setSaving(true);
        await onSave(allItems, originalItems);
        notificationSystem.addNotification('Успех', 'Изменения сохранены', 'success');
        onSuccess();
        onClose();
      } catch (error) {
        console.error('Ошибка сохранения:', error);
        notificationSystem.addNotification('Ошибка', 'Не удалось сохранить изменения', 'error');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Стандартная логика сохранения
    try {
      setSaving(true);
      
      // Находим все измененные элементы
      const movedItems = allItems.filter(item => {
        const original = originalItems.find(orig => orig.id === item.id);
        if (!original) return false;
        
        if (item[parentField] !== original[parentField] || item.level !== original.level) {
          return true;
        }
        
        const currentSameParent = allItems.filter(i => i[parentField] === item[parentField]);
        const originalSameParent = originalItems.filter(i => i[parentField] === original[parentField]);
        
        const currentIndex = currentSameParent.findIndex(i => i.id === item.id);
        const originalIndex = originalSameParent.findIndex(i => i.id === item.id);
        
        return currentIndex !== originalIndex;
      });

      // Группируем изменения по родителям
      const parentsToUpdate = new Set<string | null>();
      movedItems.forEach(item => {
        parentsToUpdate.add(item[parentField]);
        const original = originalItems.find(orig => orig.id === item.id);
        if (original && original[parentField] !== item[parentField]) {
          parentsToUpdate.add(original[parentField]);
        }
      });

      // Обновляем порядок для каждого родителя
      for (const parentId of parentsToUpdate) {
        const sameParentItems = allItems.filter(i => i[parentField] === parentId);
        const itemIds = sameParentItems.map((item, index) => ({
          id: item.id,
          sortOrder: index
        }));

        // Обновляем sortOrder для каждого элемента
        for (const { id, sortOrder } of itemIds) {
          if (updateItemEndpoint) {
            const endpoint = updateItemEndpoint(id);
            await authFetch(endpoint, {
              method: 'PUT',
              body: JSON.stringify({ [sortField]: sortOrder })
            });
          } else {
            // Используем универсальный endpoint для обновления порядка
            const endpoint = updateOrderEndpoint || `${API}/type/${id}`;
            await authFetch(endpoint, {
              method: 'PUT',
              body: JSON.stringify({ [sortField]: sortOrder })
            });
          }
        }
      }

      // Обновляем parentId для перемещенных элементов
      for (const item of movedItems) {
        const original = originalItems.find(orig => orig.id === item.id);
        if (original && original[parentField] !== item[parentField]) {
          const endpoint = updateItemEndpoint ? updateItemEndpoint(item.id) : `${API}/type/${item.id}`;
          await authFetch(endpoint, {
            method: 'PUT',
            body: JSON.stringify({ [parentField]: item[parentField] })
          });
        }
      }

      notificationSystem.addNotification('Успех', 'Изменения сохранены', 'success');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      notificationSystem.addNotification('Ошибка', 'Не удалось сохранить изменения', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Корневые элементы (для левой колонки)
  const rootItems = useMemo(() => {
    return allItems.filter(item => !item.parentId);
  }, [allItems]);

  // Отфильтрованные корневые элементы
  const filteredRootItems = useMemo(() => {
    if (!searchQuery) return rootItems;
    const query = searchQuery.toLowerCase();
    return rootItems.filter(item => item.name.toLowerCase().includes(query));
  }, [rootItems, searchQuery]);

  // Дочерние элементы выбранного корневого элемента (для правой колонки)
  const childItems = useMemo(() => {
    if (!selectedRootItem) return [];
    return allItems.filter(item => item.parentId === selectedRootItem);
  }, [allItems, selectedRootItem]);

  // Отфильтрованные дочерние элементы
  const filteredChildItems = useMemo(() => {
    if (!searchQueryChildren) return childItems;
    const query = searchQueryChildren.toLowerCase();
    return childItems.filter(item => item.name.toLowerCase().includes(query));
  }, [childItems, searchQueryChildren]);

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader size="lg" />
        <Text c="dimmed">Загрузка данных...</Text>
      </Stack>
    );
  }

  return (
    <Stack gap="md" h="calc(100vh - 60px)" style={{ padding: '16px', overflowY: 'hidden' }}>
      <Group justify="space-between" align="center">
        <Group>
          {hasChanges && (
            <Badge color="orange" size="lg" variant="filled">
              Есть изменения
            </Badge>
          )}
          <Text size="sm" c="dimmed">
            Всего элементов: {allItems.length}
          </Text>
        </Group>
        {hasChanges && (
          <Group gap="xs">
            <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={handleReset}>
              Отменить
            </Button>
            <Button leftSection={<IconCheck size={16} />} onClick={handleSave} loading={saving}>
              Сохранить
            </Button>
          </Group>
        )}
      </Group>

      {/* Основной контент: две колонки */}
      <DndContext 
        sensors={sensors} 
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <Grid gutter="md" style={{ flex: 1, minHeight: 0 }}>
          {/* Левая колонка: Корневые элементы */}
          <Grid.Col span={4}>
            <SortableContext items={filteredRootItems.map((i: SortableItem) => i.id)} strategy={verticalListSortingStrategy}>
              <Stack gap="md" h="100%">
                <Text fw={600} size="lg">Корневые элементы</Text>
                <TextInput
                  placeholder="Поиск корневых элементов..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.currentTarget.value)}
                  leftSection={<IconSearch size={16} />}
                  rightSection={searchQuery ? (
                    <ActionIcon size="sm" onClick={() => setSearchQuery('')}>
                      <IconX size={14} />
                    </ActionIcon>
                  ) : null}
                  styles={{
                    input: {
                      paddingLeft: 10
                    }
                  }}
                />
                <ScrollArea h="calc(100vh - 280px)" style={{ paddingBottom: '16px' }}>
                  <Box
                    ref={containerRef}
                    className="hierarchy-sort-container"
                    style={{ paddingBottom: '16px', paddingRight: '10px' }}
                  >
                    {filteredRootItems.map((item: SortableItem) => {
                      const isSelected = selectedRootItem === item.id;
                      return (
                        <Box
                          key={item.id}
                          onClick={() => setSelectedRootItem(item.id)}
                          style={{ marginBottom: 8 }}
                        >
                          <SortableItemComponent
                            item={item}
                            allItems={allItems}
                            originalItems={originalItems}
                            handleQuickMove={handleQuickMove}
                            selectedItem={isSelected ? item.id : null}
                            setSelectedItem={setSelectedRootItem}
                            isCategoryColumn={true}
                            draggedOverId={draggedOverId}
                            searchQuery={searchQuery}
                            parentField={parentField}
                          />
                        </Box>
                      );
                    })}
                  </Box>
                </ScrollArea>
              </Stack>
            </SortableContext>
          </Grid.Col>

          {/* Разделитель */}
          <Grid.Col span={0.5}>
            <Divider orientation="vertical" />
          </Grid.Col>

          {/* Правая колонка: Дочерние элементы выбранного корневого элемента */}
          <Grid.Col span={7.5}>
            <SortableContext items={filteredChildItems.map((i: SortableItem) => i.id)} strategy={verticalListSortingStrategy}>
              <Stack gap="md" h="100%">
                <Group justify="space-between" align="center">
                  <Text fw={600} size="lg" style={{ paddingLeft: 10 }}>
                    Дочерние элементы {selectedRootItem ? `(${rootItems.find((r: SortableItem) => r.id === selectedRootItem)?.name || ''})` : ''}
                  </Text>
                  {filteredChildItems.length > 0 && (
                    <Badge size="lg" variant="light">
                      {filteredChildItems.length}
                    </Badge>
                  )}
                </Group>
                {selectedRootItem ? (
                  <>
                    <TextInput
                      placeholder="Поиск дочерних элементов..."
                      value={searchQueryChildren}
                      onChange={(e) => setSearchQueryChildren(e.currentTarget.value)}
                      leftSection={<IconSearch size={16} />}
                      rightSection={searchQueryChildren ? (
                        <ActionIcon size="sm" onClick={() => setSearchQueryChildren('')}>
                          <IconX size={14} />
                        </ActionIcon>
                      ) : null}
                    />
                    <ScrollArea h="calc(100vh - 280px)" style={{ paddingBottom: '16px' }}>
                      <Box style={{ paddingBottom: '16px' }}>
                        {filteredChildItems.length > 0 ? (
                          filteredChildItems.map((item: SortableItem) => (
                            <Box key={item.id} style={{ marginBottom: 8 }}>
                              <SortableItemComponent
                                item={item}
                                allItems={allItems}
                                originalItems={originalItems}
                                handleQuickMove={handleQuickMove}
                                selectedItem={selectedItem}
                                setSelectedItem={setSelectedItem}
                                draggedOverId={draggedOverId}
                                searchQuery={searchQueryChildren}
                                parentField={parentField}
                              />
                            </Box>
                          ))
                        ) : (
                          <Box style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            height: '100%',
                            flexDirection: 'column',
                            gap: 16
                          }}>
                            <IconMenu2 size={48} color="var(--mantine-color-gray-4)" />
                            <Text c="dimmed">У этого элемента нет дочерних элементов</Text>
                          </Box>
                        )}
                      </Box>
                    </ScrollArea>
                  </>
                ) : (
                  <Box style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    height: 'calc(100vh - 300px)',
                    flexDirection: 'column',
                    gap: 16
                  }}>
                    <IconMenu2 size={64} color="var(--mantine-color-gray-4)" />
                    <Text c="dimmed" size="lg">Выберите корневой элемент слева для просмотра дочерних элементов</Text>
                  </Box>
                )}
              </Stack>
            </SortableContext>
          </Grid.Col>
        </Grid>
        <DragOverlay 
          adjustScale={false} 
          style={{ 
            cursor: 'grabbing',
          }}
          dropAnimation={{
            duration: 200,
            easing: 'ease-out',
          }}
        >
          {activeId && activeDraggedItem ? (
            <Paper
              className="hierarchy-sort-item"
              style={{
                minWidth: '250px',
                maxWidth: '400px',
                opacity: 0.95,
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
                border: '2px solid var(--color-accent-70)',
                marginTop: '-20px',
              }}
            >
              <Group gap="sm" style={{ width: '100%' }}>
                <div className="hierarchy-sort-drag-handle" style={{ pointerEvents: 'none' }}>
                  <IconGripVertical size={18} stroke={1.5} />
                </div>
                <IconFolder size={16} color="var(--color-accent-80)" />
                <Text 
                  size="sm" 
                  fw={500} 
                  style={{ flex: 1 }}
                >
                  {activeDraggedItem.name}
                </Text>
              </Group>
            </Paper>
          ) : null}
        </DragOverlay>
      </DndContext>
    </Stack>
  );
}
