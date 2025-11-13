// CardData.ts - API для работы с карточками
import { useState, useCallback } from 'react';
import { API } from '../../../../config/constants';

// Тип для карточки с бэкенда
export interface CardItem {
  id: string;
  name: string;
  description: string;
  imageUrls: string[];
  isActive: boolean;
  categoryId: string;
  category: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
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

// Утилита для обработки ответов
const handleResponse = async (response: Response) => {
  const contentType = response.headers.get('content-type');
  
  if (contentType && contentType.includes('application/json')) {
    const data = await response.json();
    return data;
  } else {
    const text = await response.text();
    console.error('❌ Сервер вернул не-JSON ответ:', text.substring(0, 200));
    throw new Error(`Сервер вернул не-JSON ответ: ${response.status} ${response.statusText}`);
  }
};

// Функция для получения карточек по категории
export const fetchCardsByCategory = async (
  categoryId: string, 
  page: number = 1, 
  limit: number = 20, 
  active?: boolean
): Promise<{ cards: CardItem[]; pagination: any }> => {
  try {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (active !== undefined) params.append('active', active.toString());
    
    // Используем новый API для карточек (layer = 0)
    params.append('parentId', categoryId);
    params.append('layer', '0');
    
    const url = `${API_BASE}/categories?${params.toString()}`;
    console.log(`🔄 Запрашиваем карточки: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }
    
    const data = await handleResponse(response);
    
    if (data && Array.isArray(data)) {
      // Преобразуем данные в формат CardItem
      const cards: CardItem[] = data.map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description || '',
        imageUrls: (item.attachments || []).map((att: any) => att.source),
        isActive: item.isActive,
        categoryId: categoryId,
        category: {
          id: categoryId,
          name: 'Категория' // TODO: получить название категории
        },
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }));
      
      console.log(`✅ Получено ${cards.length} карточек для категории ${categoryId} (страница ${page})`);
      return { 
        cards, 
        pagination: { 
          page, 
          limit, 
          total: cards.length, 
          totalPages: Math.ceil(cards.length / limit) 
        } 
      };
    } else {
      console.log('📭 Сервер вернул неожиданный формат:', data);
      return { cards: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } };
    }
  } catch (error) {
    console.error('❌ Ошибка при запросе карточек:', error);
    throw error;
  }
};

// Функция для получения всех карточек
export const fetchAllCards = async (): Promise<CardItem[]> => {
  try {
    const url = `${API_BASE}/cards`;
    console.log(`🔄 Запрашиваем все карточки: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }
    
    const data = await handleResponse(response);
    
    if (Array.isArray(data)) {
      console.log(`✅ Получено ${data.length} карточек всего`);
      return data;
    } else {
      console.log('📭 Сервер вернул не массив:', data);
      return [];
    }
  } catch (error) {
    console.error('❌ Ошибка при запросе всех карточек:', error);
    throw error;
  }
};

// Функция для получения активных карточек (для бота)
export const fetchActiveCards = async (): Promise<CardItem[]> => {
  try {
    const url = `${API_BASE}/cards/active`;
    console.log(`🔄 Запрашиваем активные карточки для бота: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }
    
    const data = await handleResponse(response);
    
    if (Array.isArray(data)) {
      console.log(`✅ Получено ${data.length} активных карточек для бота`);
      return data;
    } else {
      console.log('📭 Сервер вернул не массив:', data);
      return [];
    }
  } catch (error) {
    console.error('❌ Ошибка при запросе активных карточек:', error);
    throw error;
  }
};

// Функция для создания новой карточки с изображениями
export const createCard = async (cardData: {
  name: string;
  description: string;
  categoryId: string;
  isActive?: boolean;
  images?: File[];
}): Promise<CardItem> => {
  try {
    const url = `${API_BASE}/cards`;
    console.log('📝 Создаем карточку с изображениями...');

    const formData = new FormData();
    formData.append('name', cardData.name);
    formData.append('description', cardData.description);
    formData.append('categoryId', cardData.categoryId.toString());
    formData.append('isActive', (cardData.isActive ?? true).toString());
    
    if (cardData.images && cardData.images.length > 0) {
      // Добавляем все изображения
      cardData.images.forEach(image => {
        formData.append('images', image);
      });
      console.log(`📁 Добавлено ${cardData.images.length} изображений`);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await handleResponse(response);
    console.log('✅ Карточка создана:', data);
    
    // Преобразуем ответ в формат CardItem
    const card: CardItem = {
      id: data.id,
      name: data.name,
      description: data.description || '',
      imageUrls: data.imageUrl ? [data.imageUrl] : [],
      isActive: data.isActive,
      categoryId: cardData.categoryId,
      category: {
        id: cardData.categoryId,
        name: 'Категория' // TODO: получить название категории
      },
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
    
    return card;
  } catch (error) {
    console.error('❌ Ошибка при создании карточки:', error);
    throw error;
  }
};

// Функция для обновления карточки (только основные данные)
export const updateCard = async (id: string, cardData: Partial<{
  name: string;
  description: string;
  isActive: boolean;
  imageUrl: string;
  imageUrls: string[]; // Добавляем поле для порядка изображений
  categoryId: string;
  images?: File[]; // Добавляем поддержку новых изображений
}>): Promise<CardItem> => {
  try {
    const url = `${API_BASE}/cards/${id}`;
    console.log(`📝 Обновляем карточку ${id}:`, cardData);
    
    const formData = new FormData();
    if (cardData.name) formData.append('name', cardData.name);
    if (cardData.description !== undefined) formData.append('description', cardData.description);
    if (cardData.isActive !== undefined) formData.append('isActive', cardData.isActive.toString());
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const data = await handleResponse(response);
    console.log('✅ Карточка обновлена:', data);
    
    // Преобразуем ответ в формат CardItem
    const card: CardItem = {
      id: data.id,
      name: data.name,
      description: data.description || '',
      imageUrls: data.attachments ? data.attachments.map((att: any) => att.source) : [],
      isActive: data.isActive,
      categoryId: cardData.categoryId || '',
      category: {
        id: cardData.categoryId || '',
        name: 'Категория' // TODO: получить название категории
      },
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
    
    return card;
  } catch (error) {
    console.error('❌ Ошибка при обновлении карточки:', error);
    throw error;
  }
};

// Функция для обновления порядка изображений
export const updateCardImages = async (id: string, imageUrls: string[]): Promise<CardItem> => {
  try {
    const url = `${API_BASE}/cards/${id}/images/order`;
    console.log(`🖼️ Обновляем порядок изображений карточки ${id}:`, imageUrls);
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageUrls }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const data = await handleResponse(response);
    console.log('✅ Порядок изображений обновлен:', data);

    return data;
  } catch (error) {
    console.error('❌ Ошибка при обновлении изображений:', error);
    throw error;
  }
};

// Функция для добавления новых изображений к карточке
export const addCardImages = async (id: string, images: File[]): Promise<CardItem> => {
  try {
    const url = `${API_BASE}/cards/${id}/images`;
    console.log(`📤 Добавляем ${images.length} изображений к карточке ${id}`);

    const formData = new FormData();
    images.forEach((image) => {
      formData.append('images', image);
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await handleResponse(response);
    console.log('✅ Изображения добавлены:', data);
    return data;
  } catch (error) {
    console.error('❌ Ошибка при добавлении изображений:', error);
    throw error;
  }
};

// Функция для удаления изображения карточки
export const deleteCardImage = async (id: string, imageUrl: string): Promise<CardItem> => {
  try {
    const url = `${API_BASE}/cards/${id}/images`;
    console.log(`🗑️ Удаляем изображение карточки ${id}:`, imageUrl);
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageUrl }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const data = await handleResponse(response);
    console.log('✅ Изображение удалено:', data);

    return data;
  } catch (error) {
    console.error('❌ Ошибка при удалении изображения:', error);
    throw error;
  }
};

// Функция для переключения активности карточки
export const toggleCardActive = async (id: string, isActive: boolean): Promise<CardItem> => {
  try {
    const url = `${API_BASE}/cards/${id}`;
    
    const formData = new FormData();
    formData.append('isActive', isActive.toString());
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const data = await handleResponse(response);
    console.log('✅ Активность карточки обновлена:', data);
    
    // Преобразуем ответ в формат CardItem
    const card: CardItem = {
      id: data.id,
      name: data.name,
      description: data.description || '',
      imageUrls: data.imageUrl ? [data.imageUrl] : [],
      isActive: data.isActive,
      categoryId: '', // TODO: получить categoryId
      category: {
        id: '',
        name: 'Категория'
      },
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
    
    return card;
  } catch (error) {
    console.error('❌ Ошибка при переключении активности карточки:', error);
    throw error;
  }
};

// Функция для удаления карточки
export const deleteCard = async (id: string): Promise<void> => {
  try {
    const url = `${API_BASE}/cards/${id}`;
    console.log(`🗑️ Удаляем карточку ${id}...`);
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    await handleResponse(response);
    console.log('✅ Карточка удалена');
  } catch (error) {
    console.error('❌ Ошибка при удалении карточки:', error);
    throw error;
  }
};

// Хук для управления карточками
export function useCardStore() {
  const [cards, setCards] = useState<CardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  const loadCardsByCategory = useCallback(async (
    categoryId: string, 
    page: number = 1, 
    limit: number = 20, 
    active?: boolean
  ) => {
    try {
      setLoading(true);
      setError(null);
      console.log(`🎯 Начинаем загрузку карточек для категории ${categoryId} (страница ${page})`);
      
      const data = await fetchCardsByCategory(categoryId, page, limit, active);
      setCards(data.cards);
      setPagination(data.pagination);
      
      console.log(`🎉 Успешно загружено ${data.cards.length} карточек из ${data.pagination.total}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(errorMessage);
      console.error('💥 Ошибка загрузки карточек:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAllCards = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🎯 Начинаем загрузку всех карточек');
      
      const data = await fetchAllCards();
      setCards(data);
      
      console.log(`🎉 Успешно загружено ${data.length} карточек`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(errorMessage);
      console.error('💥 Ошибка загрузки всех карточек:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActiveCards = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🎯 Начинаем загрузку активных карточек для бота');
      
      const data = await fetchActiveCards();
      setCards(data);
      
      console.log(`🎉 Успешно загружено ${data.length} активных карточек`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(errorMessage);
      console.error('💥 Ошибка загрузки активных карточек:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const addCard = useCallback(async (cardData: {
    name: string;
    description: string;
    categoryId: string;
    isActive?: boolean;
    images?: File[];
  }) => {
    try {
      setLoading(true);
      setError(null);
      console.log('🎯 Добавляем новую карточку...');
      
      const newCard = await createCard(cardData);
      
      // Добавляем новую карточку в начало списка
      setCards(prev => [newCard, ...prev]);
      
      console.log('🎉 Карточка добавлена в состояние');
      return newCard;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(errorMessage);
      console.error('💥 Ошибка добавления карточки:', errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateCardInStore = useCallback(async (id: string, cardData: Partial<{
    name: string;
    description: string;
    isActive: boolean;
    imageUrl: string;
    categoryId: string;
  }>) => {
    try {
      setLoading(true);
      setError(null);
      console.log(`🎯 Обновляем карточку ${id}...`);
      
      const updatedCard = await updateCard(id, cardData);
      
      // Обновляем карточку в состоянии
      setCards(prev => prev.map(card => 
        card.id === id ? updatedCard : card
      ));
      
      console.log('🎉 Карточка обновлена в состоянии');
      return updatedCard;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(errorMessage);
      console.error('💥 Ошибка обновления карточки:', errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateCardImagesInStore = useCallback(async (id: string, imageUrls: string[]) => {
    try {
      setLoading(true);
      setError(null);
      console.log(`🎯 Обновляем изображения карточки ${id}...`);
      
      const updatedCard = await updateCardImages(id, imageUrls);
      
      // Обновляем карточку в состоянии
      setCards(prev => prev.map(card => 
        card.id === id ? updatedCard : card
      ));
      
      console.log('🎉 Изображения карточки обновлены в состоянии');
      return updatedCard;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(errorMessage);
      console.error('💥 Ошибка обновления изображений карточки:', errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const addCardImagesInStore = useCallback(async (id: string, images: File[]) => {
    try {
      setLoading(true);
      setError(null);
      console.log(`🎯 Добавляем изображения к карточке ${id}...`);
      
      const updatedCard = await addCardImages(id, images);
      
      // Обновляем карточку в состоянии
      setCards(prev => prev.map(card => 
        card.id === id ? updatedCard : card
      ));
      
      console.log('🎉 Изображения добавлены к карточке в состоянии');
      return updatedCard;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(errorMessage);
      console.error('💥 Ошибка добавления изображений к карточке:', errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteCardImageInStore = useCallback(async (id: string, imageUrl: string) => {
    try {
      setLoading(true);
      setError(null);
      console.log(`🎯 Удаляем изображение карточки ${id}...`);
      
      const updatedCard = await deleteCardImage(id, imageUrl);
      
      // Обновляем карточку в состоянии
      setCards(prev => prev.map(card => 
        card.id === id ? updatedCard : card
      ));
      
      console.log('🎉 Изображение удалено из карточки в состоянии');
      return updatedCard;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(errorMessage);
      console.error('💥 Ошибка удаления изображения карточки:', errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleCardActiveInStore = useCallback(async (id: string, isActive: boolean) => {
    try {
      setLoading(true);
      setError(null);
      console.log(`🎯 Переключаем активность карточки ${id}...`);
      
      const updatedCard = await toggleCardActive(id, isActive);
      
      // Обновляем карточку в состоянии
      setCards(prev => prev.map(card => 
        card.id === id ? updatedCard : card
      ));
      
      console.log('🎉 Активность карточки обновлена в состоянии');
      return updatedCard;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(errorMessage);
      console.error('💥 Ошибка переключения активности карточки:', errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const removeCard = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      console.log(`🎯 Удаляем карточку ${id}...`);
      
      await deleteCard(id);
      
      // Удаляем карточку из состояния
      setCards(prev => prev.filter(card => card.id !== id));
      
      console.log('🎉 Карточка удалена из состояния');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(errorMessage);
      console.error('💥 Ошибка удаления карточки:', errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    cards,
    loading,
    error,
    pagination,
    setCards,
    loadCardsByCategory,
    loadAllCards,
    loadActiveCards,
    addCard,
    updateCard: updateCardInStore,
    updateCardImages: updateCardImagesInStore,
    addCardImages: addCardImagesInStore,
    deleteCardImage: deleteCardImageInStore,
    toggleCardActive: toggleCardActiveInStore,
    removeCard
  };
}

// Экспорт всех функций для использования в компонентах
export default {
  fetchCardsByCategory,
  fetchAllCards,
  fetchActiveCards,
  createCard,
  updateCard,
  updateCardImages,
  addCardImages,
  deleteCardImage,
  toggleCardActive,
  deleteCard,
  useCardStore
};
