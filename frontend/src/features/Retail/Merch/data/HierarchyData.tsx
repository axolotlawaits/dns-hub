import { API } from '../../../../config/constants';

export interface DataItem {
  id: string;
  name: string;
  description: string;
  child: string[];
  layer: number;
  imageUrl?: string;
  imageUrls?: string[]; // Массив URL изображений
  isActive?: boolean;
  attachmentsCount?: number;
  hasChildren?: boolean; // Флаг наличия детей
  sortOrder?: number;
  attachments?: Array<{
    id: string;
    source: string;
    type: string;
  }>;
}

// Базовый URL API
const API_BASE = `${API}/add/merch`;

// Вспомогательная функция для получения токена
const getAuthToken = (): string | null => {
  return localStorage.getItem('token');
};

// Вспомогательная функция для создания заголовков с токеном
const getAuthHeaders = (includeContentType: boolean = false): HeadersInit => {
  const headers: HeadersInit = {};
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
};

//----------------------------------------------Глобальный список и его функции -------------------------------
//Получаем данные из базы
export const getHierarchyData = async (parentId?: string, layer?: number): Promise<DataItem[]> => {
  try {
    const params = new URLSearchParams();
    if (parentId) params.append('parentId', parentId);
    if (layer !== undefined) {
      params.append('layer', layer.toString());
    } else {
      // По умолчанию загружаем только категории (layer = 1)
      params.append('layer', '1');
    }
    
    const url = `${API_BASE}/categories?${params.toString()}`;
    
    const response = await fetch(url, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Ошибка HTTP:', response.status, errorText);
      throw new Error(`Ошибка HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Ошибка при загрузке иерархии:', error);
    throw error;
  }
};

let globalDataList: DataItem[] = [];
(async () => {
  try {
    globalDataList = await getHierarchyData();
  } catch (error) {
    console.error('❌ Ошибка инициализации globalDataList:', error);
    globalDataList = []; // Оставляем пустым при ошибке
  }
})();

// Функция для получения глобального списка (без запроса к серверу)
export const getGlobalDataList = (): DataItem[] => {
  return globalDataList;
};

// Функция для обновления глобального списка
export const setGlobalDataList = (newDataList: DataItem[]): void => {
  globalDataList = newDataList;
};

//-------------------------------------Функции--------------------------------------------------
// Функция для добавления категории с изображениями
export const addCategory = async (categoryData: {
  name: string;
  description?: string;
  parentId?: string;
  images?: File[]; // Добавляем опциональные изображения
}): Promise<DataItem> => {
  try {
    const formData = new FormData();
    formData.append('name', categoryData.name);
    formData.append('description', categoryData.description || '');
    if (categoryData.parentId) {
      formData.append('parentId', categoryData.parentId.toString());
    }
    if (categoryData.images && categoryData.images.length > 0) {
      categoryData.images.forEach(image => {
        formData.append('images', image); // Используем 'images' как в middleware
      });
    }

    const response = await fetch(`${API_BASE}/categories`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData, // Не устанавливаем Content-Type, FormData сделает это автоматически
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка HTTP: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    // ДОБАВЛЯЕМ в globalDataList
    globalDataList = [...globalDataList, data];
    
    // Если есть родитель, обновляем его children в globalDataList
    if (categoryData.parentId) {
      globalDataList = globalDataList.map(item => 
        item.id === categoryData.parentId 
          ? { ...item, child: [...item.child, data.id] }
          : item
      );
    }
    
    return data;
  } catch (error) {
    console.error('❌ Ошибка при добавлении категории:', error);
    throw error;
  }
};

// Функция для обновления категории с изображениями
export const updateCategory = async (id: string, categoryData: {
  name?: string;
  description?: string;
  images?: File[]; // File[] для новых изображений
}): Promise<DataItem> => {
  try {
    // Если переданы новые изображения или обновляются другие данные
    const formData = new FormData();
    if (categoryData.name) formData.append('name', categoryData.name);
    if (categoryData.description !== undefined) formData.append('description', categoryData.description);
    if (categoryData.images && categoryData.images.length > 0) {
      categoryData.images.forEach(image => {
        formData.append('images', image);
      });
    }

    const response = await fetch(`${API_BASE}/categories/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка HTTP: ${response.status} - ${errorText}`);
    }
 
    const data = await response.json();
    
    // ОБНОВЛЯЕМ в globalDataList
    globalDataList = globalDataList.map(item => 
      item.id === id ? data : item
    );
    
    return data;
  } catch (error) {
    console.error('❌ Ошибка при обновлении категории:', error);
    throw error;
  }
};

// Функция для удаления категории
export const deleteCategory = async (id: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/categories/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка HTTP: ${response.status} - ${errorText}`);
    }
    
    // УДАЛЯЕМ из globalDataList
    const categoryToDelete = globalDataList.find(item => item.id === id);
    globalDataList = globalDataList.filter(item => item.id !== id);
    
    // УДАЛЯЕМ из children всех родительских категорий
    if (categoryToDelete) {
      globalDataList = globalDataList.map(item => ({
        ...item,
        child: item.child.filter(childId => childId !== id)
      }));
    }
  } catch (error) {
    console.error('❌ Ошибка при удалении категории:', error);
    throw error;
  }
};

// Функция для удаления изображения категории
export const deleteCategoryImage = async (id: string): Promise<DataItem> => {
  try {
    const response = await fetch(`${API_BASE}/categories/${id}/image`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка HTTP: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    // ОБНОВЛЯЕМ в globalDataList
    globalDataList = globalDataList.map(item => 
      item.id === id ? data : item
    );
    
    return data;
  } catch (error) {
    console.error('❌ Ошибка при удалении изображения категории:', error);
    throw error;
  }
};

// Функция для загрузки карточек категории (layer = 0)
export const getCategoryCards = async (categoryId: string): Promise<DataItem[]> => {
  try {
    const data = await getHierarchyData(categoryId, 0);
    return data;
  } catch (error) {
    console.error('❌ Ошибка при загрузке карточек категории:', error);
    throw error;
  }
};

// Функция возвращает массив данных из globalDataList с детьми
export const getChildCategories = (item: DataItem): DataItem[] => {
  return globalDataList.filter(dataItem => 
    item.child.includes(dataItem.id)
  );
};

// Функция для получения URL изображения категории
export const getCategoryImageUrl = (category: DataItem): string | null => {
  return category.imageUrl || null;
};

// Функция для проверки, есть ли у категории изображение
export const hasCategoryImage = (category: DataItem): boolean => {
  return !!category.imageUrl;
};

// Функция для получения всех дочерних элементов категории (для предпросмотра перед удалением)

// Обновить порядок категорий
export const updateCategoriesOrder = async (parentId: string | null, categoryIds: string[]): Promise<void> => {
  try {
    const url = parentId 
      ? `${API_BASE}/categories/${parentId}/order`
      : `${API_BASE}/categories/order`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ categoryIds }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
  } catch (error) {
    console.error('❌ Ошибка при обновлении порядка категорий:', error);
    throw error;
  }
};

export const getCategoryChildren = async (id: string): Promise<{
  categoryId: string;
  children: Array<{
    id: string;
    name: string;
    layer: number;
    attachmentsCount: number;
    hasChildren: boolean;
    depth: number;
    children?: any[];
  }>;
  totalCount: number;
}> => {
  try {
    const response = await fetch(`${API_BASE}/categories/${id}/children`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Ошибка при получении дочерних элементов:', error);
    throw error;
  }
};

// Экспорт всех функций для использования в компонентах
export default {
  getHierarchyData,
  getCategoryCards,
  addCategory,
  updateCategory,
  deleteCategory,
  deleteCategoryImage,
  getChildCategories,
  getCategoryImageUrl,
  hasCategoryImage,
  getGlobalDataList,
  setGlobalDataList,
  getCategoryChildren
};
