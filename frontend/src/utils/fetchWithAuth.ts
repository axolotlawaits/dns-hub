import { API } from '../config/constants';

// Глобальная переменная для отслеживания процесса обновления токена
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

/**
 * Утилита для выполнения fetch запросов с автоматической обработкой 401 ошибок
 * и обновлением токена через refresh token
 * 
 * Используется для утилитных функций, которые не могут использовать React hook useAuthFetch
 * 
 * @param url - URL для запроса
 * @param options - Опции для fetch (headers, body, method и т.д.)
 * @returns Promise<Response> - Ответ от сервера
 */
export const fetchWithAuth = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  // Получаем токен из localStorage
  const getToken = (): string | null => {
    try {
      const storedToken = localStorage.getItem('token');
      if (!storedToken) return null;
      
      // Пытаемся распарсить как JSON (для совместимости)
      try {
        return JSON.parse(storedToken);
      } catch {
        return storedToken;
      }
    } catch {
      return null;
    }
  };

  // Сохраняем токен в localStorage
  const setToken = (token: string | null): void => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  };

  // Функция для обновления токена (с защитой от множественных вызовов)
  const refreshToken = async (): Promise<string | null> => {
    // Если уже идет процесс обновления, ждем его завершения
    if (isRefreshing && refreshPromise) {
      return refreshPromise;
    }

    // Если это запрос на refresh-token, не пытаемся обновлять токен снова
    if (url.includes('/refresh-token')) {
      return null;
    }

    isRefreshing = true;
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${API}/refresh-token`, {
          method: 'POST',
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          const newToken = data.token || data.accessToken || data;
          if (newToken) {
            setToken(newToken);
            return newToken;
          }
        }
        
        // Если refresh не удался (401/403), значит refresh token истек или отсутствует
        // Не логируем ошибку для каждого запроса, чтобы не засорять консоль
        // Очищаем токен и данные пользователя
        setToken(null);
        localStorage.removeItem('user');
        localStorage.removeItem('domain');
        return null;
      } catch (error) {
        // Сетевые ошибки логируем только один раз
        if (!isRefreshing) {
          console.error('[fetchWithAuth] Network error while refreshing token:', error);
        }
        setToken(null);
        localStorage.removeItem('user');
        localStorage.removeItem('domain');
        return null;
      } finally {
        isRefreshing = false;
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  };

  // Первая попытка с текущим токеном
  const token = getToken();
  const headers = new Headers(options.headers);
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Не устанавливаем Content-Type для FormData - браузер сделает это автоматически
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(url, {
    ...options,
    headers,
  });

  // Если получили 401, пробуем обновить токен и повторить запрос
  // НО только если это НЕ запрос на refresh-token
  if (response.status === 401 && !url.includes('/refresh-token')) {
    const newToken = await refreshToken();
    
    if (newToken) {
      // Повторяем запрос с новым токеном
      headers.set('Authorization', `Bearer ${newToken}`);
      response = await fetch(url, {
        ...options,
        headers,
      });
    } else {
      // Если токен не обновился, возвращаем исходный ответ 401
      // Компонент может обработать это и сделать logout
      return response;
    }
  }

  return response;
};

