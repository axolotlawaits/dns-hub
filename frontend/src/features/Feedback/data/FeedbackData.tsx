import { API } from '../../../config/constants';

export type FeedbackStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';
export type FeedbackPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface FeedbackResponseItem {
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
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
  tags?: string[];
  assignedTo?: string | null;
  assignedToUser?: {
    name: string;
    email: string;
  } | null;
  pinned?: boolean;
  responses?: FeedbackResponseItem[];
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

export interface FeedbackFilters {
  page?: number;
  limit?: number;
  isRead?: boolean;
  tool?: string;
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
  tags?: string[];
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  assignedTo?: string;
  pinned?: boolean;
}

export const fetchFeedback = async (
  filters: FeedbackFilters = {}
): Promise<FeedbackResponse> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Токен не найден');
    }

    const {
      page = 1,
      limit = 50,
      isRead,
      tool,
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
      limit: limit.toString()
    });
    
    if (isRead !== undefined) {
      params.append('isRead', isRead.toString());
    }
    if (tool) {
      params.append('tool', tool);
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

// Обновление статуса обратной связи
export const updateFeedbackStatus = async (
  feedbackId: string,
  status: FeedbackStatus
): Promise<Feedback> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Токен не найден');
    }

    const url = `${API}/merch-bot/feedback/${feedbackId}/status`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
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
): Promise<Feedback> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Токен не найден');
    }

    const url = `${API}/merch-bot/feedback/${feedbackId}/priority`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
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
): Promise<Feedback> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Токен не найден');
    }

    const url = `${API}/merch-bot/feedback/${feedbackId}/tags`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
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
): Promise<Feedback> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Токен не найден');
    }

    const url = `${API}/merch-bot/feedback/${feedbackId}/assign`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
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
): Promise<Feedback> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Токен не найден');
    }

    const url = `${API}/merch-bot/feedback/${feedbackId}/pin`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
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
): Promise<FeedbackResponseItem> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Токен не найден');
    }

    const url = `${API}/merch-bot/feedback/${feedbackId}/response`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
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
  email: string,
  tool?: string
): Promise<Feedback[]> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Токен не найден');
    }

    const params = new URLSearchParams({
      email: email
    });
    if (tool) {
      params.append('tool', tool);
    }

    const url = `${API}/merch-bot/feedback/history?${params.toString()}`;
    
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
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Токен не найден');
    }

    const params = new URLSearchParams({
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

    const blob = await response.blob();
    return blob;
  } catch (error) {
    console.error('❌ Ошибка при экспорте:', error);
    throw error;
  }
};

