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

export const fetchMerchFeedback = async (
  page: number = 1,
  limit: number = 50,
  isRead?: boolean
): Promise<MerchFeedbackResponse> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Токен не найден');
    }

    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      tool: 'merch' // Фильтр по инструменту
    });
    
    if (isRead !== undefined) {
      params.append('isRead', isRead.toString());
    }

    const url = `${API}/merch-bot/feedback?${params.toString()}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
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
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Токен не найден');
    }

    const url = `${API}/merch-bot/feedback/${feedbackId}/read`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
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
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Токен не найден');
    }

    const url = `${API}/merch-bot/feedback/stats?tool=merch`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
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

