// CardData.ts - API для работы с карточками
import { useState, useCallback } from 'react';
import { API } from '../../../../config/constants';

// Тип для карточки с бэкенда
export interface CardItem {
  id: string;
  name: string;
  description: string;
  imageUrls: string[];
  attachments?: Array<{
    id: string;
    source: string;
    type: string;
  }>;
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
const API_BASE = `${API}/retail/merch`;

// Вспомогательная функция для получения токена
const getAuthToken = (): string | null => {
  return localStorage.getItem('token');
};

// Функция для выполнения запросов с автоматическим обновлением токена при 401
const fetchWithAuthRetry = async (url: string, options: RequestInit = {}): Promise<Response> => {
  // Первая попытка с текущим токеном
  const token = getAuthToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  let response = await fetch(url, {
    ...options,
    headers,
  });

  // Если получили 401, пробуем обновить токен и повторить запрос
  if (response.status === 401) {
    try {
      const refreshResponse = await fetch(`${API}/refresh-token`, {
        method: 'POST',
        credentials: 'include',
      });

      if (refreshResponse.ok) {
        const newToken = await refreshResponse.json();
        localStorage.setItem('token', newToken);
        
        // Повторяем запрос с новым токеном
        headers.set('Authorization', `Bearer ${newToken}`);
        response = await fetch(url, {
          ...options,
          headers,
        });
      } else if (refreshResponse.status === 403) {
        // Токен не может быть обновлен, нужно перелогиниться
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        throw new Error('Session expired. Please login again.');
      }
    } catch (refreshError) {
      console.error('Token refresh failed:', refreshError);
      throw refreshError;
    }
  }

  return response;
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
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }
    
    const data = await handleResponse(response);
    
    if (data && Array.isArray(data)) {
      // Преобразуем данные в формат CardItem
      const cards: CardItem[] = data.map((item: any) => {
        // Используем imageUrls если они есть (полные URL), иначе формируем из attachments
        const imageUrls = item.imageUrls || (item.attachments || []).map((att: any) => 
          att.source.startsWith('http') ? att.source : `${API}/public/add/merch/${att.source}`
        );
        
        return {
          id: item.id,
          name: item.name,
          description: item.description || '',
          imageUrls: imageUrls,
          attachments: item.attachments || [], // Сохраняем полную информацию об attachments
          isActive: item.isActive,
          categoryId: categoryId,
          category: {
            id: categoryId,
            name: 'Категория' // TODO: получить название категории
          },
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        };
      });
      
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
    
    const response = await fetchWithAuthRetry(url, {
      method: 'GET',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }
    
    const data = await handleResponse(response);
    
    if (Array.isArray(data)) {
      return data;
    } else {
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
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }
    
    const data = await handleResponse(response);
    
    if (Array.isArray(data)) {
      return data;
    } else {
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
    }

    const response = await fetchWithAuthRetry(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await handleResponse(response);
    
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
    
    const formData = new FormData();
    if (cardData.name) formData.append('name', cardData.name);
    if (cardData.description !== undefined) formData.append('description', cardData.description);
    if (cardData.isActive !== undefined) formData.append('isActive', cardData.isActive.toString());
    
    const response = await fetchWithAuthRetry(url, {
      method: 'PUT',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const data = await handleResponse(response);
    
    // Преобразуем ответ в формат CardItem
    // Используем imageUrls если они есть (полные URL), иначе формируем из attachments
    const imageUrls = data.imageUrls || (data.attachments || []).map((att: any) => 
      att.source.startsWith('http') ? att.source : `${API}/public/add/merch/${att.source}`
    );
    
    const card: CardItem = {
      id: data.id,
      name: data.name,
      description: data.description || '',
      imageUrls: imageUrls,
      attachments: data.attachments || [],
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
    
    const response = await fetchWithAuthRetry(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageUrls }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const data = await handleResponse(response);

    return data;
  } catch (error) {
    console.error('❌ Ошибка при обновлении изображений:', error);
    throw error;
  }
};

// Функция для добавления новых изображений к карточке
export const addCardImages = async (id: string, images: File[]): Promise<{ attachments: Array<{ id: string; source: string; type: string }> }> => {
  try {
    const url = `${API_BASE}/cards/${id}/images`;

    const formData = new FormData();
    images.forEach((image) => {
      formData.append('images', image);
    });

    const response = await fetchWithAuthRetry(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP Error: ${response.status} - ${errorText}`);
    }

    const data = await handleResponse(response);
    
    // Возвращаем attachments для обновления состояния на фронтенде
    return {
      attachments: data.attachments || []
    };
  } catch (error) {
    console.error('❌ Ошибка при добавлении изображений:', error);
    throw error;
  }
};

// Функция для удаления изображения карточки
// Обновить порядок attachments карточки
export const updateCardAttachmentsOrder = async (cardId: string, attachmentIds: string[]): Promise<void> => {
  try {
    const url = `${API_BASE}/attachments/${cardId}/order`;
    
    const response = await fetchWithAuthRetry(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ attachmentIds }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
  } catch (error) {
    console.error('❌ Ошибка при обновлении порядка attachments:', error);
    throw error;
  }
};

// Обновить порядок карточек в категории
export const updateCardsOrder = async (categoryId: string, cardIds: string[]): Promise<void> => {
  try {
    const url = `${API_BASE}/cards/${categoryId}/order`;
    
    const response = await fetchWithAuthRetry(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cardIds }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
  } catch (error) {
    console.error('❌ Ошибка при обновлении порядка карточек:', error);
    throw error;
  }
};

// Переместить карточку в другую категорию
export const moveCardToCategory = async (cardId: string, newCategoryId: string): Promise<CardItem> => {
  try {
    const url = `${API_BASE}/cards/${cardId}/move`;
    
    const response = await fetchWithAuthRetry(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newCategoryId }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const data = await handleResponse(response);
    
    // Преобразуем ответ в формат CardItem
    const card: CardItem = {
      id: data.card.id,
      name: data.card.name,
      description: data.card.description || '',
      imageUrls: data.card.attachments?.map((att: any) => 
        att.source.startsWith('http') ? att.source : `${API}/public/add/merch/${att.source}`
      ) || [],
      attachments: data.card.attachments || [],
      isActive: data.card.isActive,
      categoryId: data.card.parentId || '',
      category: {
        id: data.card.parentId || '',
        name: 'Категория'
      },
      createdAt: data.card.createdAt,
      updatedAt: data.card.updatedAt
    };
    
    return card;
  } catch (error) {
    console.error('❌ Ошибка при перемещении карточки:', error);
    throw error;
  }
};

export const deleteCardImage = async (id: string, imageUrl: string): Promise<CardItem> => {
  try {
    const url = `${API_BASE}/cards/${id}/images`;
    
    const response = await fetchWithAuthRetry(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageUrl }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const data = await handleResponse(response);

    // Преобразуем ответ в формат CardItem
    const card: CardItem = {
      id: data.id,
      name: data.name,
      description: data.description || '',
      imageUrls: data.imageUrls || [],
      isActive: data.isActive,
      categoryId: data.categoryId || '',
      category: data.category || {
        id: data.categoryId || '',
        name: 'Категория'
      },
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };

    return card;
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
    
    const response = await fetchWithAuthRetry(url, {
      method: 'PUT',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const data = await handleResponse(response);
    
    // Преобразуем ответ в формат CardItem
    // Используем imageUrls если они есть (полные URL), иначе формируем из attachments
    const imageUrls = data.imageUrls || (data.attachments || []).map((att: any) => 
      att.source && att.source.startsWith('http') ? att.source : `${API}/public/add/merch/${att.source || ''}`
    ).filter((url: string) => url);
    
    const card: CardItem = {
      id: data.id,
      name: data.name,
      description: data.description || '',
      imageUrls: imageUrls,
      attachments: data.attachments || [],
      isActive: data.isActive,
      categoryId: data.categoryId || '',
      category: data.category || {
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
    
    const response = await fetchWithAuthRetry(url, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    await handleResponse(response);
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
      
      const data = await fetchCardsByCategory(categoryId, page, limit, active);
      setCards(data.cards);
      setPagination(data.pagination);
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
      
      const data = await fetchAllCards();
      setCards(data);
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
      
      const data = await fetchActiveCards();
      setCards(data);
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
      
      const newCard = await createCard(cardData);
      
      // Добавляем новую карточку в начало списка
      setCards(prev => [newCard, ...prev]);
      
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
      
      const updatedCard = await updateCard(id, cardData);
      
      // Обновляем карточку в состоянии
      setCards(prev => prev.map(card => 
        card.id === id ? updatedCard : card
      ));
      
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
      
      const updatedCard = await updateCardImages(id, imageUrls);
      
      // Обновляем карточку в состоянии
      setCards(prev => prev.map(card => 
        card.id === id ? updatedCard : card
      ));
      
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
      
      const result = await addCardImages(id, images);
      
      // Обновляем карточку в состоянии, добавляя новые attachments
      let updatedCard: CardItem | undefined;
      setCards(prev => prev.map(card => {
        if (card.id === id) {
          const newAttachments = result.attachments.map(att => ({
            id: att.id,
            source: att.source,
            type: att.type
          }));
          updatedCard = {
            ...card,
            attachments: [...(card.attachments || []), ...newAttachments],
            imageUrls: [
              ...(card.imageUrls || []),
              ...newAttachments.map(att => 
                att.source.startsWith('http') ? att.source : `${API}/public/add/merch/${att.source}`
              )
            ]
          };
          return updatedCard;
        }
        return card;
      }));
      
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
      
      const updatedCard = await deleteCardImage(id, imageUrl);
      
      // Обновляем карточку в состоянии
      setCards(prev => prev.map(card => 
        card.id === id ? updatedCard : card
      ));
      
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
      
      const updatedCard = await toggleCardActive(id, isActive);
      
      // Обновляем карточку в состоянии
      setCards(prev => prev.map(card => 
        card.id === id ? updatedCard : card
      ));
      
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
      
      await deleteCard(id);
      
      // Удаляем карточку из состояния
      setCards(prev => prev.filter(card => card.id !== id));
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
