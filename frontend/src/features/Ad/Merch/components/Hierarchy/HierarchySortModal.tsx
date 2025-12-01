import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  IconShoppingBag
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
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import cx from 'clsx';
import { getHierarchyData } from '../../data/HierarchyData';
import { fetchCardsByCategory } from '../../data/CardData';
import { updateCardsOrder, moveCardToCategory } from '../../data/CardData';
import { notificationSystem } from '../../../../../utils/Push';
import './HierarchySortModal.css';

interface HierarchySortModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface SortableItem {
  id: string;
  name: string;
  type: 'category' | 'card';
  parentId: string | null;
  level: number;
  originalLevel: number;
  originalParentId: string | null;
  sortOrder: number;
  hasChildren?: boolean;
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
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  // Убираем droppable - используем простой подход как в референсе

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    marginLeft: isCategoryColumn ? `${item.level * INDENT_PER_LEVEL}px` : 0,
  };

  const originalIndex = originalItems.findIndex(i => i.id === item.id);
  const isSelected = selectedItem === item.id;
  
  // Проверяем изменения: parentId, level или sortOrder
  let hasChanged = false;
  if (originalItems.length > 0 && originalIndex !== -1 && originalItems[originalIndex]) {
    const original = originalItems[originalIndex];
    
    // Проверяем изменение parentId или level
    if (item.parentId !== original.parentId || item.level !== original.level) {
      hasChanged = true;
    } else {
      // Проверяем изменение sortOrder - сравниваем позицию среди элементов с тем же parentId и типом
      const currentSameParent = allItems.filter(i => i.parentId === item.parentId && i.type === item.type);
      const originalSameParent = originalItems.filter(i => i.parentId === original.parentId && i.type === item.type);
      
      const currentIndex = currentSameParent.findIndex(i => i.id === item.id);
      const originalIndexInSameParent = originalSameParent.findIndex(i => i.id === item.id);
      
      if (currentIndex !== originalIndexInSameParent) {
        hasChanged = true;
      }
    }
  }

  // Проверяем, находится ли над этим элементом перетаскиваемый элемент
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
        data-type={item.type}
        onClick={() => setSelectedItem(item.id)}
      >
        <div className="hierarchy-sort-drag-handle" {...listeners}>
          <IconGripVertical size={18} stroke={1.5} />
        </div>
        {item.type === 'category' ? (
          <IconFolder size={16} color="var(--color-accent-80)" />
        ) : (
          <IconShoppingBag size={16} color="var(--mantine-color-green-6)" />
        )}
        <Text 
          size="sm" 
          fw={item.type === 'category' ? 500 : 400} 
          style={{ flex: 1 }}
          c={item.type === 'card' ? 'dimmed' : undefined}
        >
          {searchQuery.trim() ? (
            (() => {
              const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
              const parts = item.name.split(regex);
              return parts.map((part, index) => 
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
        {item.type === 'category' && (
          <Badge 
            size="sm" 
            variant="light"
            color="blue"
            title={`Карточек: ${allItems.filter(c => c.type === 'card' && c.parentId === item.id).length}`}
          >
            {allItems.filter(c => c.type === 'card' && c.parentId === item.id).length}
          </Badge>
        )}
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
          {item.type === 'category' && (
            <>
              <Tooltip label="Влево">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuickMove(item.id, 'left');
                  }}
                  disabled={item.level === 0}
                >
                  <IconArrowLeft size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Вправо">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuickMove(item.id, 'right');
                  }}
                  disabled={item.level >= 10}
                >
                  <IconArrowRight size={14} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>
      </Paper>
    </div>
  );
}

export function HierarchySortModal({ onClose, onSuccess }: HierarchySortModalProps): React.JSX.Element {
  const [allItems, setAllItems] = useState<SortableItem[]>([]);
  const [originalItems, setOriginalItems] = useState<SortableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQueryCards, setSearchQueryCards] = useState('');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [draggedOverId, setDraggedOverId] = useState<string | null>(null);
  const [activeDraggedItem, setActiveDraggedItem] = useState<SortableItem | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Загружаем всю иерархию
  useEffect(() => {
    const loadAllData = async () => {
      try {
        setLoading(true);
        
        const loadHierarchyRecursive = async (parentId: string | null = null, level: number = 0): Promise<SortableItem[]> => {
          const categories = await getHierarchyData(parentId || undefined, 1);
          const items: SortableItem[] = [];
          
          for (const category of categories) {
            const categoryItem: SortableItem = {
              id: category.id,
              name: category.name,
              type: 'category',
              parentId: parentId,
              level: level,
              originalLevel: level,
              originalParentId: parentId,
              sortOrder: category.sortOrder || 0,
              hasChildren: category.hasChildren || false
            };
            items.push(categoryItem);
            
            // Загружаем карточки для этой категории
            try {
              const cardsData = await fetchCardsByCategory(category.id, 1, 1000); // Загружаем все карточки (большой лимит)
              const cardItems: SortableItem[] = cardsData.cards.map((card, index) => ({
                id: card.id,
                name: card.name,
                type: 'card' as const,
                parentId: category.id,
                level: level + 1, // Карточки на уровень ниже категории
                originalLevel: level + 1,
                originalParentId: category.id,
                sortOrder: index
              }));
              items.push(...cardItems);
            } catch (error) {
              console.error(`Ошибка загрузки карточек для категории ${category.id}:`, error);
            }
            
            if (category.hasChildren) {
              const children = await loadHierarchyRecursive(category.id, level + 1);
              items.push(...children);
            }
          }
          
          return items;
        };
        
        const items = await loadHierarchyRecursive();
        setAllItems(items);
        setOriginalItems(JSON.parse(JSON.stringify(items)));
      } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        notificationSystem.addNotification('Ошибка', 'Не удалось загрузить данные', 'error');
      } finally {
        setLoading(false);
      }
    };
    
    loadAllData();
  }, []);

  // Все категории (без фильтрации, только для подсветки)
  const filteredCategories = useMemo(() => {
    return allItems.filter(item => item.type === 'category');
  }, [allItems]);

  // Получаем карточки выбранной категории (без фильтрации, только для подсветки)
  const categoryCards = useMemo(() => {
    if (!selectedCategoryId) return [];
    return allItems.filter(item => 
      item.type === 'card' && item.parentId === selectedCategoryId
    );
  }, [allItems, selectedCategoryId]);

  // Подсчет изменений
  const hasChanges = useMemo(() => {
    if (originalItems.length === 0 || allItems.length !== originalItems.length) return false;
    
    // Создаем карты для быстрого поиска
    const originalMap = new Map(originalItems.map(i => [i.id, i]));
    
    // Проверяем изменения parentId, level и sortOrder
    for (const item of allItems) {
      const original = originalMap.get(item.id);
      if (!original) return true;
      
      // Проверяем изменение parentId или level
      if (item.parentId !== original.parentId || item.level !== original.level) {
        return true;
      }
      
      // Проверяем изменение sortOrder - сравниваем позицию среди элементов с тем же parentId
      const currentSameParent = allItems.filter(i => i.parentId === item.parentId && i.type === item.type);
      const originalSameParent = originalItems.filter(i => i.parentId === original.parentId && i.type === item.type);
      
      const currentIndex = currentSameParent.findIndex(i => i.id === item.id);
      const originalIndex = originalSameParent.findIndex(i => i.id === item.id);
      
      if (currentIndex !== originalIndex) {
        return true;
      }
    }
    
    return false;
  }, [allItems, originalItems]);

  // Отмена изменений
  const handleReset = () => {
    setAllItems(JSON.parse(JSON.stringify(originalItems)));
    setSelectedItem(null);
    notificationSystem.addNotification('Информация', 'Изменения отменены', 'info');
  };

  // Получить все дочерние элементы (рекурсивно)
  const getAllChildren = useCallback((categoryId: string, items: SortableItem[]): SortableItem[] => {
    const children: SortableItem[] = [];
    
    const findChildren = (parentId: string) => {
      // Ищем прямых детей (у которых parentId совпадает с parentId)
      const directChildren = items.filter(item => item.parentId === parentId);
      children.push(...directChildren);
      
      // Рекурсивно ищем детей категорий
      directChildren
        .filter(item => item.type === 'category')
        .forEach(category => {
          findChildren(category.id);
        });
    };
    
    findChildren(categoryId);
    return children;
  }, []);

  // Быстрое перемещение
  const handleQuickMove = (itemId: string, direction: 'up' | 'down' | 'left' | 'right') => {
    const itemIndex = allItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;

    const item = allItems[itemIndex];
    const newItems = [...allItems];

    // Если перетаскиваем категорию, получаем все её дочерние элементы
    const itemsToMove: SortableItem[] = [item];
    if (item.type === 'category') {
      const children = getAllChildren(item.id, allItems);
      itemsToMove.push(...children);
    }

    if (direction === 'up' && itemIndex > 0) {
      const prevIndex = itemIndex - 1;
      const prevItem = newItems[prevIndex];
      
      if (prevItem.level === item.level && prevItem.parentId === item.parentId) {
        // Перемещаем категорию и все её дочерние элементы
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
      // Находим следующий элемент того же уровня и родителя
      let nextIndex = itemIndex + 1;
      while (nextIndex < allItems.length) {
        const nextItem = newItems[nextIndex];
        if (nextItem.level === item.level && nextItem.parentId === item.parentId) {
          // Перемещаем категорию и все её дочерние элементы после следующего элемента
          const itemsToMoveIds = new Set(itemsToMove.map(i => i.id));
          const itemsWithoutMoved = newItems.filter(i => !itemsToMoveIds.has(i.id));
          
          // Находим индекс следующего элемента в новом массиве
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
        // Если следующий элемент - дочерний, пропускаем его
        if (nextItem.level > item.level || nextItem.parentId === item.id) {
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
        if (parentItem.type === 'category' && parentItem.level === newLevel) {
          newParentId = parentItem.id;
          break;
        }
        if (parentItem.level < newLevel) break;
      }
      
      // Обновляем уровень для категории и всех её дочерних элементов
      const levelDiff = newLevel - item.level;
      const updatedItemsToMove = itemsToMove.map(childItem => {
        if (childItem.id === item.id) {
          return { ...childItem, level: newLevel, parentId: newParentId };
        } else {
          // Дочерние элементы - вычисляем новый уровень относительно нового уровня родителя
          const originalItem = originalItems.find(orig => orig.id === childItem.id);
          const originalParent = originalItems.find(orig => orig.id === item.id);
          
          if (originalItem && originalParent) {
            const relativeLevel = originalItem.level - originalParent.level;
            const newChildLevel = newLevel + relativeLevel;
            return { ...childItem, level: newChildLevel };
          } else {
            return { ...childItem, level: childItem.level + levelDiff };
          }
        }
      });
      
      // Заменяем элементы в массиве
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
        if (parentItem.type === 'category' && parentItem.level === newLevel - 1) {
          newParentId = parentItem.id;
          break;
        }
        if (parentItem.level < newLevel - 1) break;
      }
      
      if (newParentId || newLevel === 1) {
        // Обновляем уровень для категории и всех её дочерних элементов
        const levelDiff = newLevel - item.level;
        const updatedItemsToMove = itemsToMove.map(childItem => {
          if (childItem.id === item.id) {
            return { ...childItem, level: newLevel, parentId: newParentId };
          } else {
            // Дочерние элементы - вычисляем новый уровень относительно нового уровня родителя
            const originalItem = originalItems.find(orig => orig.id === childItem.id);
            const originalParent = originalItems.find(orig => orig.id === item.id);
            
            if (originalItem && originalParent) {
              const relativeLevel = originalItem.level - originalParent.level;
              const newChildLevel = newLevel + relativeLevel;
              return { ...childItem, level: newChildLevel };
            } else {
              return { ...childItem, level: childItem.level + levelDiff };
            }
          }
        });
        
        // Заменяем элементы в массиве
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
      return;
    }

    const activeItem = allItems.find(i => i.id === active.id);
    const overItem = allItems.find(i => i.id === over.id);
    
    if (!activeItem || !overItem) {
      return;
    }

    // Если перетаскиваем карточку на категорию (между колонками)
    if (activeItem.type === 'card' && overItem.type === 'category') {
      // Перемещаем карточку в новую категорию
      const newItems = allItems.map(item => {
        if (item.id === activeItem.id) {
          return {
            ...item,
            parentId: overItem.id,
            level: overItem.level + 1
          };
        }
        return item;
      });
      setAllItems(newItems);
      setDraggedOverId(null);
      setActiveDraggedItem(null);
      setActiveId(null);
      // Обновляем выбранную категорию, если карточка была перемещена из текущей категории
      if (selectedCategoryId === activeItem.parentId) {
        setSelectedCategoryId(overItem.id);
      } else if (!selectedCategoryId || selectedCategoryId !== overItem.id) {
        // Если перетаскиваем в другую категорию, переключаемся на неё
        setSelectedCategoryId(overItem.id);
      }
      return;
    }

    // Если перетаскиваем карточку на другую карточку - это изменение порядка внутри категории
    if (activeItem.type === 'card' && overItem.type === 'card' && activeItem.parentId === overItem.parentId) {
      // Находим индексы в allItems
      const oldIndex = allItems.findIndex((i) => i.id === active.id);
      const newIndex = allItems.findIndex((i) => i.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        // Просто переупорядочиваем в allItems, как в референсе
        const reorderedItems = arrayMove(allItems, oldIndex, newIndex);
        
        // Обновляем sortOrder для всех карточек с тем же parentId
        const updatedItems = reorderedItems.map((item) => {
          if (item.type === 'card' && item.parentId === activeItem.parentId) {
            // Находим позицию среди соседей
            let siblingIndex = 0;
            const itemIndex = reorderedItems.findIndex(i => i.id === item.id);
            
            // Считаем сколько соседей (карточек) до этого элемента
            for (let i = 0; i < itemIndex; i++) {
              const prevItem = reorderedItems[i];
              if (prevItem.type === 'card' && prevItem.parentId === activeItem.parentId) {
                siblingIndex++;
              }
            }
            
            return { ...item, sortOrder: siblingIndex };
          }
          return item;
        });
        
        setAllItems(updatedItems);
        setActiveId(null);
        setActiveDraggedItem(null);
        setDraggedOverId(null);
        return;
      }
    }

    // Сбрасываем activeId для других случаев
    setActiveId(null);
    setActiveDraggedItem(null);

    // Проверяем, не является ли элемент дочерним элементом перетаскиваемой категории
    const isChildOfDragged = activeItem.type === 'category' && 
      getAllChildren(activeItem.id, allItems).some(child => child.id === overItem.id);
    if (isChildOfDragged) {
      return;
    }

    // Если перетаскиваем категорию на категорию с тем же parentId - это изменение порядка
    if (activeItem.type === 'category' && overItem.type === 'category' && 
        activeItem.parentId === overItem.parentId && activeItem.level === overItem.level) {
      // Находим индексы в allItems
      const oldIndex = allItems.findIndex((i) => i.id === active.id);
      const newIndex = allItems.findIndex((i) => i.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        // Просто переупорядочиваем в allItems, как в референсе
        const reorderedItems = arrayMove(allItems, oldIndex, newIndex);
        
        // Обновляем sortOrder для всех категорий с тем же parentId
        const updatedItems = reorderedItems.map((item) => {
          if (item.type === 'category' && item.parentId === activeItem.parentId && item.level === activeItem.level) {
            // Находим позицию среди соседей
            let siblingIndex = 0;
            const itemIndex = reorderedItems.findIndex(i => i.id === item.id);
            
            // Считаем сколько соседей до этого элемента
            for (let i = 0; i < itemIndex; i++) {
              const prevItem = reorderedItems[i];
              if (prevItem.type === 'category' && 
                  prevItem.parentId === activeItem.parentId && 
                  prevItem.level === activeItem.level) {
                siblingIndex++;
              }
            }
            
            return { ...item, sortOrder: siblingIndex };
          }
          return item;
        });
        
        setAllItems(updatedItems);
        setActiveId(null);
        setActiveDraggedItem(null);
        setDraggedOverId(null);
        return;
      }
    }

    const oldIndex = allItems.findIndex((i) => i.id === active.id);
    const newIndex = allItems.findIndex((i) => i.id === over.id);
    
    // Если перетаскиваем категорию, получаем все её дочерние элементы
    const itemsToMove: SortableItem[] = [activeItem];
    if (activeItem.type === 'category') {
      const children = getAllChildren(activeItem.id, allItems);
      itemsToMove.push(...children);
    }
    
    const itemsToMoveIds = new Set(itemsToMove.map(item => item.id));
    
    // Создаем новый массив без перемещаемых элементов
    const itemsWithoutDragged = allItems.filter(item => !itemsToMoveIds.has(item.id));
    
    // Определяем позицию вставки
    let insertIndex = newIndex;
    // Если перетаскиваемый элемент был перед целевой позицией, корректируем индекс
    if (oldIndex < newIndex) {
      insertIndex = newIndex - itemsToMove.length + 1;
    }
    
    // Вставляем элементы на новую позицию
    let newItems = [
      ...itemsWithoutDragged.slice(0, insertIndex),
      ...itemsToMove,
      ...itemsWithoutDragged.slice(insertIndex)
    ];
    
    // Обновляем parentId и level для перемещенных элементов
    newItems = newItems.map((item, index) => {
      if (itemsToMoveIds.has(item.id)) {
        // Для карточек: находим ближайшую категорию выше по иерархии
        if (item.type === 'card') {
          let newParentId: string | null = null;
          let newLevel = 0;
          
          // Ищем категорию выше по иерархии
          for (let i = index - 1; i >= 0; i--) {
            const prevItem = newItems[i];
            if (prevItem.type === 'category') {
              newParentId = prevItem.id;
              newLevel = prevItem.level + 1;
              break;
            }
          }
          
          return { ...item, parentId: newParentId, level: newLevel };
        }
        // Для категорий: пересчитываем уровень на основе позиции
        else if (item.type === 'category') {
          // Находим родительскую категорию выше по иерархии
          let newParentId: string | null = null;
          let newLevel = 0;
          
          for (let i = index - 1; i >= 0; i--) {
            const prevItem = newItems[i];
            if (prevItem.type === 'category' && prevItem.level < item.level) {
              newParentId = prevItem.id;
              newLevel = prevItem.level + 1;
              break;
            }
            if (prevItem.level < item.level - 1) break;
          }
          
          return { ...item, parentId: newParentId, level: newLevel };
        }
      }
      return item;
    });
    
    // Обновляем уровни для дочерних элементов перемещенных категорий
    newItems = newItems.map(item => {
      const movedCategory = itemsToMove.find(moved => moved.type === 'category' && moved.id !== item.id);
      if (movedCategory && item.parentId === movedCategory.id) {
        const originalCategory = originalItems.find(orig => orig.id === movedCategory.id);
        if (originalCategory) {
          const levelDiff = movedCategory.level - originalCategory.level;
          return { ...item, level: item.level + levelDiff };
        }
      }
      return item;
    });
    
    setAllItems(newItems);
  };

  // Сохранение изменений
  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Находим все измененные элементы (категории и карточки)
      // Изменения могут быть в parentId, level или sortOrder
      const movedItems = allItems.filter(item => {
        const original = originalItems.find(orig => orig.id === item.id);
        if (!original) return false;
        
        // Проверяем изменение parentId или level
        if (item.parentId !== original.parentId || item.level !== original.level) {
          return true;
        }
        
        // Проверяем изменение sortOrder
        const currentSameParent = allItems.filter(i => i.parentId === item.parentId && i.type === item.type);
        const originalSameParent = originalItems.filter(i => i.parentId === original.parentId && i.type === item.type);
        
        const currentIndex = currentSameParent.findIndex(i => i.id === item.id);
        const originalIndex = originalSameParent.findIndex(i => i.id === item.id);
        
        return currentIndex !== originalIndex;
      });
      
      // Разделяем на категории и карточки
      const movedCategories = movedItems.filter(item => item.type === 'category');
      const movedCards = movedItems.filter(item => item.type === 'card');
      
      // Находим все родители, для которых нужно обновить порядок
      const parentsToUpdate = new Set<string | null>();
      
      // Добавляем родители измененных элементов
      movedItems.forEach(item => {
        parentsToUpdate.add(item.parentId);
        const original = originalItems.find(orig => orig.id === item.id);
        if (original && original.parentId !== item.parentId) {
          parentsToUpdate.add(original.parentId);
        }
      });
      
      // Также проверяем, изменился ли порядок элементов внутри категорий
      // Для этого сравниваем порядок всех элементов с тем же parentId
      const allParents = new Set<string | null>();
      allItems.forEach(item => {
        if (item.parentId !== null || item.type === 'category') {
          allParents.add(item.parentId);
        }
      });
      
      allParents.forEach(parentId => {
        // Проверяем категории
        const currentCategories = allItems.filter(i => i.type === 'category' && i.parentId === parentId);
        const originalCategories = originalItems.filter(i => i.type === 'category' && i.parentId === parentId);
        
        if (currentCategories.length === originalCategories.length) {
          // Проверяем, изменился ли порядок
          const currentIds = currentCategories.map(c => c.id);
          const originalIds = originalCategories.map(c => c.id);
          if (JSON.stringify(currentIds) !== JSON.stringify(originalIds)) {
            parentsToUpdate.add(parentId);
          }
        }
        
        // Проверяем карточки (только если parentId не null)
        if (parentId !== null) {
          const currentCards = allItems.filter(i => i.type === 'card' && i.parentId === parentId);
          const originalCards = originalItems.filter(i => i.type === 'card' && i.parentId === parentId);
          
          if (currentCards.length === originalCards.length) {
            // Проверяем, изменился ли порядок
            const currentIds = currentCards.map(c => c.id);
            const originalIds = originalCards.map(c => c.id);
            if (JSON.stringify(currentIds) !== JSON.stringify(originalIds)) {
              parentsToUpdate.add(parentId);
            }
          }
        }
      });
      
      // Группируем изменения по родителям
      const changesByParent = new Map<string | null, Array<{ id: string; type: 'category' | 'card'; sortOrder: number }>>();
      
      // Собираем все элементы для обновления порядка
      allItems.forEach((item) => {
        if (parentsToUpdate.has(item.parentId || null)) {
          const key = item.parentId || 'root';
          if (!changesByParent.has(key)) {
            changesByParent.set(key, []);
          }
          // Находим индекс элемента среди элементов с тем же parentId и типом
          const sameParentItems = allItems.filter(i => i.parentId === item.parentId && i.type === item.type);
          const sortOrder = sameParentItems.findIndex(i => i.id === item.id);
          changesByParent.get(key)!.push({
            id: item.id,
            type: item.type,
            sortOrder: sortOrder
          });
        }
      });

      // Обновляем порядок категорий
      for (const [parentId, items] of changesByParent.entries()) {
        const categories = items.filter(i => i.type === 'category');
        if (categories.length > 0) {
          const categoryIds = categories.sort((a, b) => a.sortOrder - b.sortOrder).map(c => c.id);
          await updateCategoriesOrder(parentId === 'root' ? null : parentId, categoryIds);
        }
      }
      
      // Обновляем родителя категорий
      for (const item of movedCategories) {
        const original = originalItems.find(orig => orig.id === item.id);
        if (original && original.parentId !== item.parentId) {
          await updateCategoryParent(item.id, item.parentId);
        }
      }
      
      // Перемещаем карточки между категориями
      for (const card of movedCards) {
        const original = originalItems.find(orig => orig.id === card.id);
        if (original && original.parentId !== card.parentId && card.parentId) {
          await moveCardToCategory(card.id, card.parentId);
        }
      }
      
      // Обновляем порядок карточек в каждой категории
      for (const [parentId, items] of changesByParent.entries()) {
        if (parentId === 'root' || parentId === null) continue; // Пропускаем корневые элементы
        
        const cards = items.filter(i => i.type === 'card');
        if (cards.length > 0) {
          const cardIds = cards.sort((a, b) => a.sortOrder - b.sortOrder).map(c => c.id);
          await updateCardsOrder(parentId, cardIds);
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

  const updateCategoriesOrder = async (parentId: string | null, categoryIds: string[]) => {
    const { updateCategoriesOrder: updateOrder } = await import('../../data/HierarchyData');
    await updateOrder(parentId, categoryIds);
  };

  const updateCategoryParent = async (categoryId: string, newParentId: string | null) => {
    const { API } = await import('../../../../../config/constants');
    const token = localStorage.getItem('token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API}/add/merch/categories/${categoryId}/parent`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ parentId: newParentId })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
  };

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
      {/* Заголовок с информацией */}
      <Group justify="space-between" align="center">
        <Group>
          {hasChanges && (
            <Badge color="orange" size="lg" variant="filled">
              Есть изменения
            </Badge>
          )}
          <Text size="sm" c="dimmed">
            Всего категорий: {filteredCategories.length} | Всего карточек: {allItems.filter(i => i.type === 'card').length}
          </Text>
        </Group>
        {hasChanges && (
          <Button
            variant="outline"
            leftSection={<IconRefresh size={16} />}
            onClick={handleReset}
            size="sm"
          >
            Отменить изменения
          </Button>
        )}
      </Group>

      {/* Основной контент: две колонки */}
      {/* Общий DndContext и SortableContext для всех элементов, чтобы можно было перетаскивать между колонками */}
      <DndContext 
        sensors={sensors} 
        collisionDetection={closestCenter}
        onDragStart={(event: DragStartEvent) => {
          setDraggedOverId(null);
          setActiveId(event.active.id as string);
          const item = allItems.find(i => i.id === event.active.id);
          setActiveDraggedItem(item || null);
        }}
        onDragOver={(event) => {
          const { over } = event;
          if (over) {
            setDraggedOverId(over.id as string);
          }
        }}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setDraggedOverId(null);
          setActiveDraggedItem(null);
          setActiveId(null);
        }}
      >
        {/* Разделяем контексты: категории и карточки отдельно */}
        <Grid gutter="md" style={{ flex: 1, minHeight: 0 }}>
          {/* Левая колонка: Категории */}
          <Grid.Col span={4}>
            <SortableContext items={filteredCategories.map(i => i.id)} strategy={verticalListSortingStrategy}>
              <Stack gap="md" h="100%">
                <Text fw={600} size="lg">Категории</Text>
                <TextInput
                  placeholder="Поиск категорий..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.currentTarget.value)}
                  leftSection={<IconSearch size={16} />}
                  rightSection={searchQuery ? (
                    <ActionIcon size="sm" onClick={() => setSearchQuery('')}>
                      <IconX size={14} />
                    </ActionIcon>
                  ) : null}
                />
                <ScrollArea h="calc(100vh - 280px)" style={{ paddingBottom: '16px' }}>
                  <Box ref={containerRef} className="hierarchy-sort-container" style={{ paddingBottom: '16px' }}>
                    {filteredCategories.map((item) => {
                      const isSelected = selectedCategoryId === item.id;
                      return (
                        <Box
                          key={item.id}
                          onClick={() => setSelectedCategoryId(item.id)}
                          style={{ marginBottom: 8 }}
                        >
                          <SortableItemComponent
                            item={item}
                            allItems={allItems}
                            originalItems={originalItems}
                            handleQuickMove={handleQuickMove}
                            selectedItem={isSelected ? item.id : null}
                            setSelectedItem={setSelectedCategoryId}
                            isCategoryColumn={true}
                            draggedOverId={draggedOverId}
                            searchQuery={searchQuery}
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

          {/* Правая колонка: Карточки выбранной категории */}
          <Grid.Col span={7.5}>
            <SortableContext items={categoryCards.map(i => i.id)} strategy={verticalListSortingStrategy}>
              <Stack gap="md" h="100%">
                <Group justify="space-between" align="center">
                  <Text fw={600} size="lg">
                    Карточки {selectedCategoryId ? `(${filteredCategories.find(c => c.id === selectedCategoryId)?.name || ''})` : ''}
                  </Text>
                  {categoryCards.length > 0 && (
                    <Badge size="lg" variant="light">
                      {categoryCards.length}
                    </Badge>
                  )}
                </Group>
                {selectedCategoryId ? (
                  <>
                    <TextInput
                      placeholder="Поиск карточек..."
                      value={searchQueryCards}
                      onChange={(e) => setSearchQueryCards(e.currentTarget.value)}
                      leftSection={<IconSearch size={16} />}
                      rightSection={searchQueryCards ? (
                        <ActionIcon size="sm" onClick={() => setSearchQueryCards('')}>
                          <IconX size={14} />
                        </ActionIcon>
                      ) : null}
                    />
                    <ScrollArea h="calc(100vh - 280px)" style={{ paddingBottom: '16px' }}>
                      <Box style={{ paddingBottom: '16px' }}>
                        {categoryCards.length > 0 ? (
                          categoryCards.map((item) => (
                            <Box key={item.id} style={{ marginBottom: 8 }}>
                            <SortableItemComponent
                              item={item}
                              allItems={allItems}
                              originalItems={originalItems}
                              handleQuickMove={handleQuickMove}
                              selectedItem={selectedItem}
                              setSelectedItem={setSelectedItem}
                              draggedOverId={draggedOverId}
                              searchQuery={searchQueryCards}
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
                            <IconShoppingBag size={48} color="var(--mantine-color-gray-4)" />
                            <Text c="dimmed">В этой категории нет карточек</Text>
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
                    <IconShoppingBag size={64} color="var(--mantine-color-gray-4)" />
                    <Text c="dimmed" size="lg">Выберите категорию слева для просмотра карточек</Text>
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
                border: `2px solid ${activeDraggedItem.type === 'category' ? 'var(--color-accent-70)' : 'var(--mantine-color-green-6)'}`,
                marginTop: '-20px',
              }}
              data-type={activeDraggedItem.type}
            >
              <Group gap="sm" style={{ width: '100%' }}>
                <div className="hierarchy-sort-drag-handle" style={{ pointerEvents: 'none' }}>
                  <IconGripVertical size={18} stroke={1.5} />
                </div>
                {activeDraggedItem.type === 'category' ? (
                  <IconFolder size={16} color="var(--color-accent-80)" />
                ) : (
                  <IconShoppingBag size={16} color="var(--mantine-color-green-6)" />
                )}
                <Text 
                  size="sm" 
                  fw={activeDraggedItem.type === 'category' ? 500 : 400} 
                  style={{ flex: 1 }}
                  c={activeDraggedItem.type === 'card' ? 'dimmed' : undefined}
                >
                  {activeDraggedItem.name}
                </Text>
              </Group>
            </Paper>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Футер с кнопками */}
      <Group justify="space-between" mt="md" style={{ paddingBottom: '16px', flexShrink: 0 }}>
        <Text size="sm" c="dimmed">
          {selectedCategoryId && `Карточек в категории: ${categoryCards.length}`}
        </Text>
        <Group>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button 
            onClick={handleSave} 
            loading={saving}
            disabled={!hasChanges}
            leftSection={<IconCheck size={16} />}
          >
            Сохранить изменения
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}
