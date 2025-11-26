import { API } from '../../../config/constants';

export interface Feedback {
  id: string;
  tool: string;
  userId: string | null;
  email: string;
  text: string;
  photos: string[];
  metadata: any;
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

export interface FeedbackResponse {
  feedbacks: Feedback[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface FeedbackStats {
  total: number;
  unread: number;
  read: number;
  byTool?: Record<string, { total: number; unread: number; read: number }>;
}

export const fetchFeedback = async (
  page: number = 1,
  limit: number = 50,
  isRead?: boolean,
  tool?: string
): Promise<FeedbackResponse> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Токен не найден');
    }

    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });
    
    if (isRead !== undefined) {
      params.append('isRead', isRead.toString());
    }
    
    if (tool) {
      params.append('tool', tool);
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

export const markFeedbackAsRead = async (feedbackId: string): Promise<Feedback> => {
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

export const fetchFeedbackStats = async (tool?: string): Promise<FeedbackStats> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Токен не найден');
    }

    const params = new URLSearchParams();
    if (tool) {
      params.append('tool', tool);
    }

    const url = `${API}/merch-bot/feedback/stats?${params.toString()}`;
    
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

