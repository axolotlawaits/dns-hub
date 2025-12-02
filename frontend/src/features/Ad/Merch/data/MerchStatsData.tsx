import { API } from '../../../../config/constants';

export interface MerchStatsResponse {
  period: number;
  summary: {
    totalUsers: number;
    activeUsers: number;
    activeUsersToday: number;
    activeUsersWeek: number;
    activeUsersMonth: number;
    newUsers: number;
    totalActions: number;
    feedbackRequests: number;
  };
  actions: Array<{
    action: string;
    count: number;
  }>;
  popularButtons: Array<{
    name: string;
    count: number;
  }>;
  popularSearches: Array<{
    query: string;
    count: number;
  }>;
  popularReactions?: Array<{
    emoji: string;
    count: number;
  }>;
  reactionStats?: {
    total: number;
    uniqueEmojis: number;
    topReactions: Array<{
      emoji: string;
      count: number;
    }>;
    topMessages?: Array<{
      messageId: number;
      chatId: number;
      totalReactions: number;
      reactions: Array<{
        emoji: string;
        count: number;
        lastReaction: Date;
        users: Array<{
          userId: number;
          username: string | null;
          firstName: string | null;
          lastName: string | null;
        }>;
      }>;
      messageText?: string;
      cardInfo?: {
        itemId: string;
        itemName: string;
        itemType: 'card' | 'category';
      } | null;
    }>;
    messagesWithReactions?: number;
    topCardsByReactions?: Array<{
      itemId: string;
      itemName: string;
      itemType: 'card' | 'category';
      totalReactions: number;
      topReactions: Array<{
        emoji: string;
        count: number;
      }>;
    }>;
  };
  categoryClicks: Array<{
    name: string;
    count: number;
  }>;
  dailyStats: Array<{
    date: string;
    totalActions: number;
    uniqueUsers: number;
    actions: Record<string, number>;
  }>;
  hourlyStats: Array<{
    hour: number;
    count: number;
  }>;
  topUsers: Array<{
    userId: number;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    actionsCount: number;
    registeredAt: Date | null;
  }>;
  weekdayStats?: Array<{
    day: number;
    dayName: string;
    count: number;
  }>;
  timeOfDayStats?: {
    morning: number;
    afternoon: number;
    evening: number;
    night: number;
  };
  searchLengthStats?: {
    short: number;
    medium: number;
    long: number;
  };
  funnelStats?: {
    started: number;
    clickedButton: number;
    searched: number;
    gaveFeedback: number;
  };
  retentionStats?: {
    day1: number;
    day7: number;
    day30: number;
  };
  popularCards?: Array<{
    name: string;
    count: number;
  }>;
  avgActionsPerUser?: number;
  returningUsers?: number;
  totalSessions?: number;
  avgSessionDuration?: number;
  avgActionsPerSession?: number;
}

export const fetchMerchStats = async (period: number = 30): Promise<MerchStatsResponse> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Токен не найден');
    }

    const url = `${API}/merch-bot/stats?period=${period}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    // Получаем текст ответа для проверки
    const responseText = await response.text();
    
    // Проверяем, что ответ действительно JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('❌ [MerchStats] Сервер вернул не JSON. Content-Type:', contentType);
      console.error('❌ [MerchStats] Ответ (первые 500 символов):', responseText.substring(0, 500));
      
      // Если это HTML (обычно страница ошибки или редирект)
      if (responseText.trim().toLowerCase().startsWith('<!doctype') || responseText.trim().toLowerCase().startsWith('<html')) {
        throw new Error(`Сервер вернул HTML вместо JSON. Возможно, проблема с аутентификацией или маршрутом. Статус: ${response.status}`);
      }
      
      throw new Error(`Сервер вернул не JSON. Статус: ${response.status}. Content-Type: ${contentType}`);
    }

    if (!response.ok) {
      // Пытаемся распарсить как JSON, если не получится - возвращаем текст
      try {
        const errorData = JSON.parse(responseText);
        throw new Error(`Ошибка HTTP: ${response.status} - ${errorData.error || errorData.message || responseText}`);
      } catch {
        throw new Error(`Ошибка HTTP: ${response.status} - ${responseText.substring(0, 200)}`);
      }
    }

    // Парсим JSON ответ
    try {
      const data = JSON.parse(responseText);
      return data;
    } catch (parseError) {
      console.error('❌ [MerchStats] Ошибка парсинга JSON:', parseError);
      console.error('❌ [MerchStats] Ответ:', responseText.substring(0, 500));
      throw new Error(`Не удалось распарсить JSON ответ: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }
  } catch (error) {
    console.error('❌ Ошибка при получении статистики:', error);
    throw error;
  }
};

