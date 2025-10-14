import { API } from '../../../../config/constants';

export interface DataItem {
  id: string;
  name: string;
  description: string;
  child: string[];
  layer: number;
  imageUrl?: string;
  isActive?: boolean;
  attachmentsCount?: number;
  hasChildren?: boolean; // Флаг наличия детей
  sortOrder?: number;
}

// Базовый URL API
const API_BASE = `${API}/add/merch`;

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
    const response = await fetch(url);
    
    if (!response.ok) {
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
    console.log('✅ globalDataList инициализирован:', globalDataList.length, 'элементов');
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
  console.log('💾 globalDataList обновлен:', globalDataList.length, 'элементов');
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
    
    console.log('✅ Категория добавлена с изображением:', data.imageUrl ? 'да' : 'нет');
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
    
    console.log('✅ Категория обновлена, изображение:', data.imageUrl ? 'обновлено' : 'нет');
    return data;
  } catch (error) {
    console.error('❌ Ошибка при обновлении категории:', error);
    throw error;
  }
};

// Функция для удаления категории
export const deleteCategory = async (id: string): Promise<void> => {
  try {
    console.log(`🗑️ Удаляем категорию ${id}...`);
    
    const response = await fetch(`${API_BASE}/categories/${id}`, {
      method: 'DELETE',
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
    
    console.log('💾 Категория удалена из globalDataList, ID:', id);
    console.log('✅ Категория удалена');
  } catch (error) {
    console.error('❌ Ошибка при удалении категории:', error);
    throw error;
  }
};

// Функция для удаления изображения категории
export const deleteCategoryImage = async (id: string): Promise<DataItem> => {
  try {
    console.log(`🗑️ Удаляем изображение категории ${id}...`);
    
    const response = await fetch(`${API_BASE}/categories/${id}/image`, {
      method: 'DELETE',
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
    
    console.log('✅ Изображение категории удалено');
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
  setGlobalDataList
};
