/**
 * Универсальная утилита для работы с иерархическими данными
 * Основана на логике из backend/utils/hierarchy.ts
 */

export interface HierarchyItem {
  id: string;
  [key: string]: any;
}

export interface HierarchyConfig {
  parentField?: string; // Название поля родителя (по умолчанию 'parentId' или 'parent_type')
  sortField?: string; // Название поля сортировки (по умолчанию 'sortOrder' или 'order')
  nameField?: string; // Название поля имени для вторичной сортировки (по умолчанию 'name')
  childrenField?: string; // Название поля для детей (по умолчанию 'children')
}

/**
 * Построить дерево из плоского списка элементов
 * @param items - плоский массив элементов с полями id и parentField
 * @param config - конфигурация иерархии
 * @param parentId - ID родителя для фильтрации (null для корневых элементов)
 * @returns массив элементов с построенной иерархией children
 */
export function buildTree<T extends HierarchyItem>(
  items: T[],
  config: HierarchyConfig = {},
  parentId: string | null = null
): T[] {
  const {
    parentField = 'parentId',
    sortField = 'sortOrder',
    nameField = 'name',
    childrenField = 'children'
  } = config;

  return items
    .filter(item => {
      const itemParentId = item[parentField];
      if (parentId === null) {
        return itemParentId === null || itemParentId === undefined;
      }
      return itemParentId === parentId;
    })
    .sort((a, b) => {
      // Сортируем по sortField, затем по nameField
      const aOrder = a[sortField] ?? 0;
      const bOrder = b[sortField] ?? 0;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      const aName = a[nameField] ?? '';
      const bName = b[nameField] ?? '';
      return aName.localeCompare(bName);
    })
    .map(item => ({
      ...item,
      [childrenField]: buildTree(items, config, item.id)
    }));
}

/**
 * Развернуть дерево в плоский список (рекурсивно)
 * @param items - массив элементов с иерархией children
 * @param config - конфигурация иерархии
 * @returns плоский массив элементов, отсортированный по sortOrder
 */
export function flattenTree<T extends HierarchyItem>(
  items: T[],
  config: HierarchyConfig = {}
): T[] {
  const {
    sortField = 'sortOrder',
    nameField = 'name',
    childrenField = 'children'
  } = config;

  const result: T[] = [];

  const traverse = (itemsToTraverse: T[], level: number = 0) => {
    // Сортируем по sortField, затем по nameField
    const sorted = [...itemsToTraverse].sort((a, b) => {
      const aOrder = a[sortField] ?? 0;
      const bOrder = b[sortField] ?? 0;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      const aName = a[nameField] ?? '';
      const bName = b[nameField] ?? '';
      return aName.localeCompare(bName);
    });

    sorted.forEach(item => {
      // Убираем children из плоского списка
      const { [childrenField]: _, ...itemWithoutChildren } = item;
      result.push(itemWithoutChildren as T);
      
      if (item[childrenField] && Array.isArray(item[childrenField]) && item[childrenField].length > 0) {
        traverse(item[childrenField] as T[], level + 1);
      }
    });
  };

  traverse(items);
  return result;
}

/**
 * Получить все потомки элемента (рекурсивно)
 * @param items - плоский массив всех элементов
 * @param parentId - ID родителя
 * @param config - конфигурация иерархии
 * @returns массив ID всех потомков
 */
export function getAllDescendantIds<T extends HierarchyItem>(
  items: T[],
  parentId: string,
  config: HierarchyConfig = {}
): string[] {
  const { parentField = 'parentId' } = config;
  
  const children = items.filter(item => item[parentField] === parentId);
  const descendantIds = children.map(child => child.id);

  for (const child of children) {
    const childDescendants = getAllDescendantIds(items, child.id, config);
    descendantIds.push(...childDescendants);
  }

  return descendantIds;
}

/**
 * Проверить, является ли один элемент потомком другого
 * @param items - плоский массив всех элементов
 * @param ancestorId - ID предка
 * @param descendantId - ID потомка
 * @param config - конфигурация иерархии
 * @returns true если descendantId является потомком ancestorId
 */
export function isDescendant<T extends HierarchyItem>(
  items: T[],
  ancestorId: string,
  descendantId: string,
  config: HierarchyConfig = {}
): boolean {
  const { parentField = 'parentId' } = config;
  
  const item = items.find(i => i.id === descendantId);
  if (!item || !item[parentField]) {
    return false;
  }

  if (item[parentField] === ancestorId) {
    return true;
  }

  return isDescendant(items, ancestorId, item[parentField] as string, config);
}

/**
 * Получить путь от корня до элемента (массив ID)
 * @param items - плоский массив всех элементов
 * @param itemId - ID элемента
 * @param config - конфигурация иерархии
 * @returns массив ID от корня до элемента
 */
export function getPathToRoot<T extends HierarchyItem>(
  items: T[],
  itemId: string,
  config: HierarchyConfig = {}
): string[] {
  const { parentField = 'parentId' } = config;
  
  const path: string[] = [itemId];
  const item = items.find(i => i.id === itemId);
  
  if (!item) {
    return path;
  }

  let currentParentId = item[parentField];
  while (currentParentId) {
    path.unshift(currentParentId as string);
    const parent = items.find(i => i.id === currentParentId);
    if (!parent || !parent[parentField]) {
      break;
    }
    currentParentId = parent[parentField];
  }

  return path;
}

/**
 * Получить уровень вложенности элемента
 * @param items - плоский массив всех элементов
 * @param itemId - ID элемента
 * @param config - конфигурация иерархии
 * @returns уровень вложенности (0 для корневых элементов)
 */
export function getItemLevel<T extends HierarchyItem>(
  items: T[],
  itemId: string,
  config: HierarchyConfig = {}
): number {
  const path = getPathToRoot(items, itemId, config);
  return path.length - 1;
}

export default {
  buildTree,
  flattenTree,
  getAllDescendantIds,
  isDescendant,
  getPathToRoot,
  getItemLevel
};
