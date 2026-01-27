import { PrismaClient } from '@prisma/client';

export interface HierarchyConfig {
  modelName: string; // Название модели в Prisma ('merch', 'type', 'trainingProgram')
  parentField: string; // Название поля родителя ('parentId', 'parent_type')
  sortField: string; // Название поля сортировки ('sortOrder', 'order')
  nameField?: string; // Название поля имени для вторичной сортировки (по умолчанию 'name')
  childrenRelation?: string; // Название отношения для детей (по умолчанию 'children')
}

export interface HierarchyModel {
  findMany: (args: any) => Promise<any[]>;
  findFirst: (args: any) => Promise<any>;
  findUnique: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
  delete: (args: any) => Promise<any>;
  deleteMany: (args: any) => Promise<any>;
  count: (args: any) => Promise<number>;
}

export interface HierarchyQueryOptions {
  parentId?: string | null;
  additionalWhere?: Record<string, any>;
  include?: any;
  select?: any;
}

/**
 * Получить элементы иерархии с сортировкой
 */
export async function getHierarchyItems<T = any>(
  model: HierarchyModel,
  config: HierarchyConfig,
  options: HierarchyQueryOptions = {}
): Promise<T[]> {
  const { parentField, sortField, nameField = 'name' } = config;
  const { parentId, additionalWhere = {}, include, select } = options;

  const where: any = { ...additionalWhere };

  // Обработка parentId
  if (parentId === null || parentId === 'null' || parentId === undefined) {
    where[parentField] = null;
  } else if (parentId) {
    where[parentField] = parentId;
  }

  const queryOptions: any = {
    where,
    orderBy: [
      { [sortField]: 'asc' },
      { [nameField]: 'asc' }
    ]
  };

  if (include) {
    queryOptions.include = include;
  }

  if (select) {
    queryOptions.select = select;
  }

  return await model.findMany(queryOptions);
}

/**
 * Построить дерево из плоского списка элементов с сортировкой
 */
export function buildTree<T extends { id: string; [key: string]: any }>(
  items: T[],
  parentField: string = 'parentId',
  childrenField: string = 'children',
  parentId: string | null = null,
  sortField: string = 'sortOrder',
  nameField: string = 'name'
): T[] {
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
      [childrenField]: buildTree(items, parentField, childrenField, item.id, sortField, nameField)
    }));
}

/**
 * Получить максимальный sortOrder для элементов с указанным parentId
 */
export async function getMaxSortOrder(
  model: HierarchyModel,
  config: HierarchyConfig,
  parentId: string | null,
  additionalWhere: Record<string, any> = {}
): Promise<number> {
  const { parentField, sortField } = config;

  const where: any = { ...additionalWhere };
  if (parentId === null || parentId === 'null' || parentId === undefined) {
    where[parentField] = null;
  } else {
    where[parentField] = parentId;
  }

  const lastItem = await model.findFirst({
    where,
    orderBy: {
      [sortField]: 'desc'
    },
    select: {
      [sortField]: true
    }
  });

  return lastItem ? (lastItem[sortField] as number) + 1 : 0;
}

/**
 * Обновить порядок элементов
 */
export async function updateItemsOrder(
  model: HierarchyModel,
  config: HierarchyConfig,
  itemIds: string[]
): Promise<void> {
  const { sortField } = config;

  for (let i = 0; i < itemIds.length; i++) {
    await model.update({
      where: { id: itemIds[i] },
      data: { [sortField]: i }
    });
  }
}

/**
 * Проверить, является ли один элемент потомком другого (для предотвращения циклических зависимостей)
 */
export async function checkIfDescendant(
  model: HierarchyModel,
  config: HierarchyConfig,
  ancestorId: string,
  descendantId: string
): Promise<boolean> {
  const { parentField } = config;

  const item = await model.findUnique({
    where: { id: descendantId },
    select: { [parentField]: true }
  });

  if (!item || !item[parentField]) {
    return false;
  }

  if (item[parentField] === ancestorId) {
    return true;
  }

  return checkIfDescendant(model, config, ancestorId, item[parentField]);
}

/**
 * Получить все потомки элемента (рекурсивно)
 */
export async function getAllDescendants(
  model: HierarchyModel,
  config: HierarchyConfig,
  parentId: string,
  additionalWhere: Record<string, any> = {}
): Promise<string[]> {
  const { parentField } = config;

  const where: any = { ...additionalWhere, [parentField]: parentId };
  const children = await model.findMany({
    where,
    select: { id: true }
  });

  const descendantIds = children.map(child => child.id);

  for (const child of children) {
    const childDescendants = await getAllDescendants(model, config, child.id, additionalWhere);
    descendantIds.push(...childDescendants);
  }

  return descendantIds;
}

/**
 * Рекурсивное удаление дочерних элементов
 * model может быть как prisma.model, так и tx.model (из транзакции)
 */
export async function deleteChildrenRecursively(
  model: HierarchyModel,
  config: HierarchyConfig,
  parentId: string,
  additionalWhere: Record<string, any> = {}
): Promise<void> {
  const { parentField, childrenRelation = 'children' } = config;

  const where: any = { ...additionalWhere, [parentField]: parentId };
  const children = await model.findMany({
    where,
    include: {
      [childrenRelation]: {
        select: { id: true }
      }
    }
  });

  for (const child of children) {
    // Рекурсивно удаляем детей
    if (child[childrenRelation] && child[childrenRelation].length > 0) {
      await deleteChildrenRecursively(model, config, child.id, additionalWhere);
    }

    // Удаляем сам элемент
    await model.delete({
      where: { id: child.id }
    });
  }
}

