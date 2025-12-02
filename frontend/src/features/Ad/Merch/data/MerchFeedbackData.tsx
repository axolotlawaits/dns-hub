import { API } from '../../../../config/constants';

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

export const fetchMerchFeedback = async (
  page: number = 1,
  limit: number = 50,
  isRead?: boolean
): Promise<MerchFeedbackResponse> => {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      tool: 'merch' // Фильтр по инструменту
    });
    
    if (isRead !== undefined) {
      params.append('isRead', isRead.toString());
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

