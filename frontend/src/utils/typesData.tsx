import { API } from '../config/constants';
import { fetchWithAuth } from './fetchWithAuth';
import { flattenTree } from './hierarchy';

export interface Type {
  id: string;
  model_uuid: string;
  chapter: string;
  name: string;
  colorHex?: string;
  parent_type?: string | null;
  sortOrder?: number;
  Tool?: {
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

/**
 * Универсальная функция для получения типов по model_uuid и chapter
 * Использует универсальный эндпоинт /type/sub
 * @param chapter - название главы (обязательно, на русском языке)
 * @param model_uuid - UUID модели Tool (обязательно)
 * @param parent_type - UUID родительского типа для фильтрации по иерархии (опционально)
 * @param returnTree - возвращать дерево вместо плоского списка (по умолчанию false)
 * @returns Promise с массивом типов
 */
export const getTypes = async (
  chapter: string,
  model_uuid: string,
  parent_type?: string | null,
  returnTree: boolean = false
): Promise<Type[]> => {
  try {
    const params = new URLSearchParams();
    params.append('chapter', chapter);
    params.append('model_uuid', model_uuid);
    if (parent_type !== undefined) {
      params.append('parent_type', parent_type || 'null');
    }
    if (returnTree) {
      params.append('tree', 'true');
    }

    const url = `${API}/type/sub?${params.toString()}`;
    const response = await fetchWithAuth(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Ошибка HTTP:', response.status, errorText);
      throw new Error(`Ошибка HTTP: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Ошибка при загрузке типов:', error);
    throw error;
  }
};

/**
 * Получить все типы определенного chapter в плоском виде (для select и т.д.)
 * @param chapter - название главы (на русском языке)
 * @param model_uuid - UUID модели Tool
 * @returns Promise с плоским массивом типов
 */
export const getTypesFlat = async (
  chapter: string,
  model_uuid: string
): Promise<Type[]> => {
  const types = await getTypes(chapter, model_uuid, undefined, false);
  // Если пришли типы с children (старый формат), разворачиваем их
  const hasChildren = types.some(t => t.children && t.children.length > 0);
  if (hasChildren) {
    return flattenTree(types, {
      parentField: 'parent_type',
      sortField: 'sortOrder',
      nameField: 'name',
      childrenField: 'children'
    });
  }
  return types;
};
