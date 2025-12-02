import { API } from '../../../../config/constants';

export type FeedbackStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';
export type FeedbackPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface FeedbackResponse {
  id: string;
  feedbackId: string;
  userId: string;
  user?: {
    name: string;
    email: string;
  };
  text: string;
  createdAt: string;
  sentAt: string | null;
  sentEmail: boolean;
}

export interface MerchFeedback {
  id: string;
  tool: string;
  userId: string;
  email: string;
  text: string;
  photos: string[];
  createdAt: string;
  isRead: boolean;
  readAt: string | null;
  readBy: string | null;
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
  tags?: string[];
  assignedTo?: string | null;
  assignedToUser?: {
    name: string;
    email: string;
  } | null;
  pinned?: boolean;
  responses?: FeedbackResponse[];
  user: {
    userId: number;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    dbName: string | null; // ФИО из базы данных (User или UserData)
    tgName: string | null; // ФИО из Telegram metadata
  };
}

export interface MerchFeedbackResponse {
  feedbacks: MerchFeedback[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface MerchFeedbackStats {
  total: number;
  unread: number;
  read: number;
  byStatus?: {
    NEW: number;
    IN_PROGRESS: number;
    RESOLVED: number;
    REJECTED: number;
  };
  byPriority?: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    CRITICAL: number;
  };
  avgResponseTime?: number; // Среднее время ответа в часах
}

// Функция для выполнения запросов с автоматическим обновлением токена при 401
const fetchWithAuthRetry = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const token = localStorage.getItem('token');
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

export interface FeedbackFilters {
  page?: number;
  limit?: number;
  isRead?: boolean;
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
  tags?: string[];
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  assignedTo?: string;
  pinned?: boolean;
}

export const fetchMerchFeedback = async (
  filters: FeedbackFilters = {}
): Promise<MerchFeedbackResponse> => {
  try {
    const {
      page = 1,
      limit = 50,
      isRead,
      status,
      priority,
      tags,
      search,
      dateFrom,
      dateTo,
      assignedTo,
      pinned
    } = filters;

    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      tool: 'merch' // Фильтр по инструменту
    });
    
    if (isRead !== undefined) {
      params.append('isRead', isRead.toString());
    }
    if (status) {
      params.append('status', status);
    }
    if (priority) {
      params.append('priority', priority);
    }
    if (tags && tags.length > 0) {
      tags.forEach(tag => params.append('tags', tag));
    }
    if (search) {
      params.append('search', search);
    }
    if (dateFrom) {
      params.append('dateFrom', dateFrom);
    }
    if (dateTo) {
      params.append('dateTo', dateTo);
    }
    if (assignedTo) {
      params.append('assignedTo', assignedTo);
    }
    if (pinned !== undefined) {
      params.append('pinned', pinned.toString());
    }

    const url = `${API}/merch-bot/feedback?${params.toString()}`;
    
    const response = await fetchWithAuthRetry(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка HTTP: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Ошибка при получении обратной связи:', error);
    throw error;
  }
};

export const markFeedbackAsRead = async (feedbackId: string): Promise<MerchFeedback> => {
  try {
    const url = `${API}/merch-bot/feedback/${feedbackId}/read`;
    
    const response = await fetchWithAuthRetry(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка HTTP: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Ошибка при отметке обратной связи как прочитанной:', error);
    throw error;
  }
};

export const fetchMerchFeedbackStats = async (): Promise<MerchFeedbackStats> => {
  try {
    const url = `${API}/merch-bot/feedback/stats?tool=merch`;
    
    const response = await fetchWithAuthRetry(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка HTTP: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Ошибка при получении статистики обратной связи:', error);
    throw error;
  }
};

// Обновление статуса обратной связи
export const updateFeedbackStatus = async (
  feedbackId: string,
  status: FeedbackStatus
): Promise<MerchFeedback> => {
  try {
    const url = `${API}/merch-bot/feedback/${feedbackId}/status`;
    
    const response = await fetchWithAuthRetry(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка HTTP: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Ошибка при обновлении статуса:', error);
    throw error;
  }
};

// Обновление приоритета обратной связи
export const updateFeedbackPriority = async (
  feedbackId: string,
  priority: FeedbackPriority
): Promise<MerchFeedback> => {
  try {
    const url = `${API}/merch-bot/feedback/${feedbackId}/priority`;
    
    const response = await fetchWithAuthRetry(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ priority })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка HTTP: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Ошибка при обновлении приоритета:', error);
    throw error;
  }
};

// Добавление/удаление тегов
export const updateFeedbackTags = async (
  feedbackId: string,
  tags: string[]
): Promise<MerchFeedback> => {
  try {
    const url = `${API}/merch-bot/feedback/${feedbackId}/tags`;
    
    const response = await fetchWithAuthRetry(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tags })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка HTTP: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Ошибка при обновлении тегов:', error);
    throw error;
  }
};

// Назначение ответственного
export const assignFeedback = async (
  feedbackId: string,
  userId: string | null
): Promise<MerchFeedback> => {
  try {
    const url = `${API}/merch-bot/feedback/${feedbackId}/assign`;
    
    const response = await fetchWithAuthRetry(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignedTo: userId })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка HTTP: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Ошибка при назначении ответственного:', error);
    throw error;
  }
};

// Закрепление/открепление обратной связи
export const toggleFeedbackPin = async (
  feedbackId: string,
  pinned: boolean
): Promise<MerchFeedback> => {
  try {
    const url = `${API}/merch-bot/feedback/${feedbackId}/pin`;
    
    const response = await fetchWithAuthRetry(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pinned })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка HTTP: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Ошибка при закреплении:', error);
    throw error;
  }
};

// Добавление ответа на обратную связь
export const addFeedbackResponse = async (
  feedbackId: string,
  text: string,
  sendEmail: boolean = false
): Promise<FeedbackResponse> => {
  try {
    const url = `${API}/merch-bot/feedback/${feedbackId}/response`;
    
    const response = await fetchWithAuthRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, sendEmail })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка HTTP: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Ошибка при добавлении ответа:', error);
    throw error;
  }
};

// Получение истории переписки с пользователем
export const getFeedbackHistory = async (
  email: string
): Promise<MerchFeedback[]> => {
  try {
    const url = `${API}/merch-bot/feedback/history?email=${encodeURIComponent(email)}&tool=merch`;
    
    const response = await fetchWithAuthRetry(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка HTTP: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.feedbacks || [];
  } catch (error) {
    console.error('❌ Ошибка при получении истории:', error);
    throw error;
  }
};

// Экспорт обратной связи
export const exportFeedback = async (
  filters: FeedbackFilters,
  format: 'excel' | 'csv' = 'excel'
): Promise<Blob> => {
  try {
    const params = new URLSearchParams({
      tool: 'merch',
      format
    });
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => params.append(key, v.toString()));
        } else {
          params.append(key, value.toString());
        }
      }
    });

    const url = `${API}/merch-bot/feedback/export?${params.toString()}`;
    
    const response = await fetchWithAuthRetry(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка HTTP: ${response.status} - ${errorText}`);
    }

    const blob = await response.blob();
    return blob;
  } catch (error) {
    console.error('❌ Ошибка при экспорте:', error);
    throw error;
  }
};

