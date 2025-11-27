import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Stack, 
  Box, 
  Text, 
  Button, 
  Group,
  Paper,
  ScrollArea,
  Loader,
  Alert
} from '@mantine/core';
import { IconFolder, IconGripVertical, IconCheck } from '@tabler/icons-react';
import { getHierarchyData } from '../../data/HierarchyData';
import { fetchCardsByCategory } from '../../data/CardData';
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
  children?: SortableItem[];
}

const INDENT_PER_LEVEL = 30; // Отступ на каждый уровень вложенности

export function HierarchySortModal({ onClose, onSuccess }: HierarchySortModalProps): React.JSX.Element {
  const [allItems, setAllItems] = useState<SortableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draggedItem, setDraggedItem] = useState<SortableItem | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const [insertBeforeIndex, setInsertBeforeIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Загружаем всю иерархию и карточки
  useEffect(() => {
    const loadAllData = async () => {
      try {
        setLoading(true);
        
        // Загружаем всю иерархию рекурсивно
        const loadHierarchyRecursive = async (parentId: string | null = null, level: number = 0): Promise<SortableItem[]> => {
          const categories = await getHierarchyData(parentId || undefined, 1);
          const items: SortableItem[] = [];
          
          for (const category of categories) {
            // Добавляем категорию
            const categoryItem: SortableItem = {
              id: category.id,
              name: category.name,
              type: 'category',
              parentId: (category as any).parentId || null,
              level: level,
              originalLevel: level,
              originalParentId: (category as any).parentId || null,
              sortOrder: category.sortOrder || 0,
              hasChildren: category.hasChildren || false
            };
            items.push(categoryItem);
            
            // Рекурсивно загружаем дочерние категории ПЕРЕД карточками
            if (category.hasChildren) {
              const children = await loadHierarchyRecursive(category.id, level + 1);
              items.push(...children);
            }
            
            // Загружаем карточки этой категории ПОСЛЕ дочерних категорий
            try {
              const result = await fetchCardsByCategory(category.id, 1, 1000); // Загружаем все карточки
              result.cards.forEach((card, index) => {
                items.push({
                  id: card.id,
                  name: card.name,
                  type: 'card',
                  parentId: category.id,
                  level: level + 1,
                  originalLevel: level + 1,
                  originalParentId: category.id,
                  sortOrder: (card as any).sortOrder || index
                });
              });
            } catch (err) {
              console.error(`Ошибка загрузки карточек для категории ${category.id}:`, err);
            }
          }
          
          return items;
        };
        
        const items = await loadHierarchyRecursive();
        setAllItems(items);
      } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        notificationSystem.addNotification('Ошибка', 'Не удалось загрузить данные', 'error');
      } finally {
        setLoading(false);
      }
    };
    
    loadAllData();
  }, []);

  // Вычисляем уровень вложенности на основе позиции X
  const calculateLevelFromX = useCallback((x: number): number => {
    if (!containerRef.current) return 0;
    const containerLeft = containerRef.current.getBoundingClientRect().left;
    const relativeX = x - containerLeft;
    const level = Math.max(0, Math.floor(relativeX / INDENT_PER_LEVEL));
    return Math.min(level, 10); // Ограничиваем максимальный уровень
  }, []);

  // Получить все дочерние элементы категории (рекурсивно)
  const getAllChildren = useCallback((categoryId: string, items: SortableItem[]): SortableItem[] => {
    const children: SortableItem[] = [];
    
    const findChildren = (parentId: string) => {
      const directChildren = items.filter(item => item.parentId === parentId);
      children.push(...directChildren);
      
      // Рекурсивно находим детей категорий
      directChildren
        .filter(item => item.type === 'category')
        .forEach(category => findChildren(category.id));
    };
    
    findChildren(categoryId);
    return children;
  }, []);

  // Обработчик начала перетаскивания
  const handleDragStart = (e: React.DragEvent, item: SortableItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.id);
    
    // Если это категория, показываем количество дочерних элементов
    let dragText = item.name;
    if (item.type === 'category') {
      const children = getAllChildren(item.id, allItems);
      if (children.length > 0) {
        dragText = `${item.name} (${children.length} элементов)`;
      }
    }
    
    // Создаем полупрозрачный элемент для перетаскивания
    const dragImage = document.createElement('div');
    dragImage.textContent = dragText;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    dragImage.style.padding = '8px 12px';
    dragImage.style.background = 'var(--mantine-color-blue-6)';
    dragImage.style.color = 'white';
    dragImage.style.borderRadius = '4px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  // Обработчик перетаскивания над элементом
  const handleDragOver = (e: React.DragEvent, item: SortableItem) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (!draggedItem) return;
    
    const level = calculateLevelFromX(e.clientX);
    setDragOverItem(item.id);
    
    // Определяем позицию вставки
    const targetIndex = allItems.findIndex(i => i.id === item.id);
    const draggedIndex = allItems.findIndex(i => i.id === draggedItem.id);
    
    // Определяем нового родителя
    let newParentId: string | null = null;
    if (level > 0) {
      for (let i = targetIndex - 1; i >= 0; i--) {
        const parentItem = allItems[i];
        if (parentItem.type === 'category' && parentItem.level === level - 1) {
          newParentId = parentItem.id;
          break;
        }
        if (parentItem.level < level - 1) {
          break;
        }
      }
    }
    
    // Проверяем, что карточка не может быть родителем для карточки
    if (draggedItem.type === 'card' && newParentId) {
      const parentItem = allItems.find(i => i.id === newParentId);
      if (parentItem && parentItem.type === 'card') {
        // Нельзя переместить карточку под карточку
        return;
      }
    }
    
    // Определяем, вставлять ли перед или после элемента
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseY = e.clientY;
    const elementCenterY = rect.top + rect.height / 2;
    
    // Если мышь выше центра элемента - вставляем перед, иначе после
    const insertBefore = mouseY < elementCenterY;
    
    // Если перетаскиваемый элемент находится после целевого и вставляем перед - нужно скорректировать индекс
    let insertIndex = targetIndex;
    if (draggedIndex < targetIndex && insertBefore) {
      insertIndex = targetIndex;
    } else if (draggedIndex > targetIndex && !insertBefore) {
      insertIndex = targetIndex + 1;
    } else if (draggedIndex < targetIndex && !insertBefore) {
      insertIndex = targetIndex + 1;
    } else if (draggedIndex > targetIndex && insertBefore) {
      insertIndex = targetIndex;
    }
    
    setInsertBeforeIndex(insertIndex);
  };

  // Обработчик окончания перетаскивания
  const handleDrop = (e: React.DragEvent, targetItem: SortableItem) => {
    e.preventDefault();
    
    if (!draggedItem || draggedItem.id === targetItem.id) {
      setDraggedItem(null);
      setDragOverItem(null);
      setInsertBeforeIndex(null);
      return;
    }

    const newLevel = calculateLevelFromX(e.clientX);
    
    // Определяем нового родителя на основе уровня
    let newParentId: string | null = null;
    
    if (newLevel > 0) {
      const targetIndex = allItems.findIndex(i => i.id === targetItem.id);
      
      for (let i = targetIndex - 1; i >= 0; i--) {
        const item = allItems[i];
        if (item.type === 'category' && item.level === newLevel - 1) {
          newParentId = item.id;
          break;
        }
        if (item.level < newLevel - 1) {
          break;
        }
      }
    }
    
    // Проверяем, что карточка не может быть родителем для карточки
    if (draggedItem.type === 'card' && newParentId) {
      const parentItem = allItems.find(i => i.id === newParentId);
      if (parentItem && parentItem.type === 'card') {
        // Нельзя переместить карточку под карточку
        setDraggedItem(null);
        setDragOverItem(null);
        setInsertBeforeIndex(null);
        notificationSystem.addNotification('Ошибка', 'Карточка не может быть родителем для карточки', 'error');
        return;
      }
    }
    
    // Проверяем, что не перемещаем категорию в саму себя или в её дочерние элементы
    if (draggedItem.type === 'category') {
      const children = getAllChildren(draggedItem.id, allItems);
      const childrenIds = new Set(children.map(c => c.id));
      
      if (childrenIds.has(targetItem.id) || (newParentId && childrenIds.has(newParentId))) {
        setDraggedItem(null);
        setDragOverItem(null);
        setInsertBeforeIndex(null);
        notificationSystem.addNotification('Ошибка', 'Нельзя переместить категорию в саму себя или в её дочерние элементы', 'error');
        return;
      }
    }

    // Используем сохраненную позицию вставки или определяем заново
    let insertIndex = insertBeforeIndex !== null ? insertBeforeIndex : allItems.findIndex(i => i.id === targetItem.id);
    
    // Если позиция не была определена, определяем её на основе позиции мыши
    if (insertBeforeIndex === null) {
      const targetIndex = allItems.findIndex(i => i.id === targetItem.id);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const mouseY = e.clientY;
      const elementCenterY = rect.top + rect.height / 2;
      insertIndex = mouseY < elementCenterY ? targetIndex : targetIndex + 1;
    }

    // Если перетаскиваем категорию, получаем все её дочерние элементы
    const itemsToMove: SortableItem[] = [draggedItem];
    if (draggedItem.type === 'category') {
      const children = getAllChildren(draggedItem.id, allItems);
      itemsToMove.push(...children);
    }
    
    const itemsToMoveIds = new Set(itemsToMove.map(item => item.id));

    // Создаем новый массив без перемещаемых элементов
    const itemsWithoutDragged = allItems.filter(item => !itemsToMoveIds.has(item.id));
    
    // Корректируем индекс, если перетаскиваемый элемент был перед позицией вставки
    const draggedIndex = allItems.findIndex(i => i.id === draggedItem.id);
    if (draggedIndex < insertIndex) {
      insertIndex -= itemsToMove.length - 1;
    }
    
    // Вычисляем разницу уровней для корректировки дочерних элементов
    const levelDiff = newLevel - draggedItem.level;
    
    // Обновляем уровни и parentId для всех перемещаемых элементов
    const updatedItemsToMove = itemsToMove.map(item => {
      if (item.id === draggedItem.id) {
        // Главный элемент
        return {
          ...item,
          level: newLevel,
          parentId: newParentId
        };
      } else {
        // Дочерние элементы - сохраняем относительный уровень
        return {
          ...item,
          level: item.level + levelDiff,
          // parentId остается тем же, если это дочерний элемент главной категории
          // или обновляется, если это дочерний элемент другой категории
          parentId: item.parentId === draggedItem.id ? draggedItem.id : item.parentId
        };
      }
    });
    
    // Вставляем элементы на новую позицию
    const updatedItems = [
      ...itemsWithoutDragged.slice(0, insertIndex),
      ...updatedItemsToMove,
      ...itemsWithoutDragged.slice(insertIndex)
    ];

    // Пересчитываем уровни и порядок для всех элементов
    const recalculatedItems = recalculateAllLevelsAndOrder(updatedItems);
    
    setAllItems(recalculatedItems);
    setDraggedItem(null);
    setDragOverItem(null);
    setInsertBeforeIndex(null);
  };

  // Пересчитываем все уровни и порядок на основе parentId и позиции в массиве
  const recalculateAllLevelsAndOrder = (items: SortableItem[]): SortableItem[] => {
    // Сначала пересчитываем уровни на основе parentId
    const recalculateLevels = (parentId: string | null, currentLevel: number): void => {
      const children = items.filter(item => item.parentId === parentId);
      
      // Сортируем детей по их позиции в массиве
      children.sort((a, b) => {
        const indexA = items.findIndex(i => i.id === a.id);
        const indexB = items.findIndex(i => i.id === b.id);
        return indexA - indexB;
      });
      
      // Обновляем уровни и порядок
      children.forEach((child, index) => {
        const childIndex = items.findIndex(i => i.id === child.id);
        if (childIndex !== -1) {
          items[childIndex] = {
            ...items[childIndex],
            level: currentLevel,
            sortOrder: index
          };
          
          // Рекурсивно обрабатываем детей категорий
          if (child.type === 'category') {
            recalculateLevels(child.id, currentLevel + 1);
          }
        }
      });
    };

    // Пересчитываем от корня
    recalculateLevels(null, 0);

    return items;
  };

  // Сохранение изменений
  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Группируем изменения по родителям
      const changesByParent = new Map<string | null, Array<{ id: string; type: 'category' | 'card'; sortOrder: number }>>();
      
      allItems.forEach(item => {
        const key = item.parentId || 'root';
        if (!changesByParent.has(key)) {
          changesByParent.set(key, []);
        }
        changesByParent.get(key)!.push({
          id: item.id,
          type: item.type,
          sortOrder: item.sortOrder
        });
      });

      // Сохраняем изменения для каждой группы
      for (const [parentId, items] of changesByParent.entries()) {
        const categories = items.filter(i => i.type === 'category');
        const cards = items.filter(i => i.type === 'card');
        
        // Обновляем порядок категорий
        if (categories.length > 0) {
          const categoryIds = categories.sort((a, b) => a.sortOrder - b.sortOrder).map(c => c.id);
          await updateCategoriesOrder(parentId === 'root' ? null : parentId, categoryIds);
        }
        
        // Обновляем порядок карточек
        if (cards.length > 0 && parentId !== 'root' && parentId !== null) {
          const cardIds = cards.sort((a, b) => a.sortOrder - b.sortOrder).map(c => c.id);
          await updateCardsOrder(parentId, cardIds);
        }
        
      }
      
      // Обновляем parentId для категорий, которые были перемещены
      const movedCategories = allItems.filter(item => 
        item.type === 'category' && 
        (item.parentId !== item.originalParentId || item.level !== item.originalLevel)
      );
      
      for (const item of movedCategories) {
        await updateCategoryParent(item.id, item.parentId);
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

  // Функции API (нужно будет добавить в HierarchyData.tsx и CardData.tsx)
  const updateCategoriesOrder = async (parentId: string | null, categoryIds: string[]) => {
    const { updateCategoriesOrder: updateOrder } = await import('../../data/HierarchyData');
    await updateOrder(parentId, categoryIds);
  };

  const updateCardsOrder = async (categoryId: string, cardIds: string[]) => {
    const { updateCardsOrder: updateOrder } = await import('../../data/CardData');
    await updateOrder(categoryId, cardIds);
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
    <Stack gap="md">
      <Alert color="blue" title="Инструкция">
        Перетаскивайте элементы влево-вправо для изменения уровня вложенности. 
        Чем правее элемент, тем глубже он становится в иерархии.
      </Alert>

      <ScrollArea h={500}>
        <Box ref={containerRef} className="hierarchy-sort-container">
          {allItems.map((item, index) => {
            const isDragging = draggedItem?.id === item.id;
            // Проверяем, является ли элемент дочерним элементом перетаскиваемой категории
            const isChildOfDragged = draggedItem && draggedItem.type === 'category' && 
              getAllChildren(draggedItem.id, allItems).some(child => child.id === item.id);
            const isDraggingOrChild = isDragging || isChildOfDragged;
            const isDragOver = dragOverItem === item.id;
            const indent = item.level * INDENT_PER_LEVEL;
            const showInsertLine = insertBeforeIndex === index && draggedItem && draggedItem.id !== item.id && !isChildOfDragged;
            
            return (
              <React.Fragment key={item.id}>
                {/* Линия вставки перед элементом */}
                {showInsertLine && (
                  <Box
                    style={{
                      height: '2px',
                      backgroundColor: 'var(--mantine-color-blue-6)',
                      marginLeft: `${indent}px`,
                      marginBottom: '4px',
                      marginTop: '4px',
                      borderRadius: '2px',
                      position: 'relative',
                      zIndex: 10
                    }}
                  />
                )}
                <Paper
                  p="sm"
                  mb="xs"
                  className={`hierarchy-sort-item ${isDraggingOrChild ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                  style={{
                    marginLeft: `${indent}px`,
                    opacity: isDraggingOrChild ? 0.5 : 1,
                    backgroundColor: isDragOver ? 'var(--mantine-color-blue-1)' : undefined,
                    border: isDragOver ? '2px dashed var(--mantine-color-blue-5)' : undefined,
                    cursor: isDraggingOrChild ? 'grabbing' : 'grab',
                    position: 'relative',
                    transform: isDragOver && draggedItem && draggedItem.id !== item.id && !isChildOfDragged ? 'translateY(4px)' : 'translateY(0)',
                    transition: isDragOver ? 'transform 0.1s ease' : 'none',
                    pointerEvents: isChildOfDragged ? 'none' : 'auto'
                  }}
                  draggable={!isChildOfDragged}
                  onDragStart={(e) => !isChildOfDragged && handleDragStart(e, item)}
                  onDragOver={(e) => !isChildOfDragged && handleDragOver(e, item)}
                  onDrop={(e) => !isChildOfDragged && handleDrop(e, item)}
                  onDragEnd={() => {
                    setDraggedItem(null);
                    setDragOverItem(null);
                    setInsertBeforeIndex(null);
                  }}
                  onDragLeave={() => {
                    // Не сбрасываем состояние при уходе с элемента, чтобы сохранить визуальную обратную связь
                  }}
                >
                  <Group gap="xs">
                    <IconGripVertical size={16} style={{ cursor: isDragging ? 'grabbing' : 'grab', color: 'var(--mantine-color-gray-6)' }} />
                    {item.type === 'category' ? (
                      <IconFolder size={16} />
                    ) : (
                      <Text size="xs" c="dimmed">📄</Text>
                    )}
                    <Text size="sm" fw={item.type === 'category' ? 500 : 400}>
                      {item.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {item.type === 'category' ? 'Категория' : 'Карточка'}
                    </Text>
                  </Group>
                </Paper>
                {/* Линия вставки после последнего элемента */}
                {insertBeforeIndex === allItems.length && index === allItems.length - 1 && draggedItem && draggedItem.id !== item.id && (
                  <Box
                    style={{
                      height: '2px',
                      backgroundColor: 'var(--mantine-color-blue-6)',
                      marginLeft: `${indent}px`,
                      marginTop: '4px',
                      borderRadius: '2px',
                      position: 'relative',
                      zIndex: 10
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </Box>
      </ScrollArea>

      <Group justify="flex-end" mt="md">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button 
          onClick={handleSave} 
          loading={saving}
          leftSection={<IconCheck size={16} />}
        >
          Сохранить
        </Button>
      </Group>
    </Stack>
  );
}

