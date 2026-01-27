import { createContext, useEffect, useState, useRef } from "react";
import { API } from "../config/constants";
import { clearUserStorage } from "../utils/storage";

export type User = {
  id: string;
  name: string;
  branch: string;
  position: string;
  email: string;
  image: string;
  role: UserRole;
  login: string;
};

export type UserRole = 'DEVELOPER' | 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE';

type Props = {
  children?: React.ReactNode;
};

type UserContextTypes = {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  refreshAccessToken: () => Promise<string | null>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
};

export const UserContext = createContext<UserContextTypes | undefined>(undefined);

export const UserContextProvider = ({ children }: Props) => {
  const [user, setUser] = useState<User | null>(() => {
    const value = localStorage.getItem('user');
    return value ? JSON.parse(value) : null;
  });

  const [token, setToken] = useState<string | null>(() => {
    const storedToken = localStorage.getItem('token');
    const storedDomain = localStorage.getItem('domain');
    const currentDomain = window.location.host;
    
    // Если домен изменился, очищаем все токены
    if (storedDomain && storedDomain !== currentDomain) {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('domain');
      return null;
    }
    
    // Сохраняем текущий домен
    localStorage.setItem('domain', currentDomain);
    
    try {
      // Пытаемся распарсить как JSON (для совместимости со старым форматом)
      return storedToken ? JSON.parse(storedToken) : null;
    } catch {
      // Если не JSON, возвращаем как есть
      return storedToken;
    }
  });

  // Глобальная переменная для отслеживания процесса обновления токена в UserContext
  const refreshTokenPromiseRef = useRef<Promise<string | null> | null>(null);

  // Ref для отслеживания, что refresh token истек (чтобы не пытаться обновлять повторно)
  const refreshTokenExpiredRef = useRef(false);
  // Ref для хранения таймера автоматического обновления токена
  const tokenRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Функция для декодирования JWT токена и получения времени истечения
  const getTokenExpiration = (token: string): number | null => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      const payload = JSON.parse(atob(parts[1]));
      return payload.exp ? payload.exp * 1000 : null; // Конвертируем в миллисекунды
    } catch (error) {
      return null;
    }
  };

  // Функция для планирования автоматического обновления токена
  const scheduleTokenRefresh = (currentToken: string | null) => {
    // Очищаем предыдущий таймер, если он есть
    if (tokenRefreshTimerRef.current) {
      clearTimeout(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }

    if (!currentToken) return;

    const expirationTime = getTokenExpiration(currentToken);
    if (!expirationTime) return;

    const now = Date.now();
    const timeUntilExpiration = expirationTime - now;
    
    // Обновляем токен за 5 минут до истечения (или за 1 минуту, если до истечения меньше 5 минут)
    const refreshTime = Math.min(timeUntilExpiration - 5 * 60 * 1000, timeUntilExpiration - 60 * 1000);
    
    if (refreshTime > 0) {
      tokenRefreshTimerRef.current = setTimeout(() => {
        // Обновляем токен проактивно
        refreshAccessToken().catch((error) => {
          console.error('[UserContext] Error in proactive token refresh:', error);
        });
      }, refreshTime);
    } else if (timeUntilExpiration > 0) {
      // Если до истечения меньше минуты, обновляем сразу
      refreshAccessToken().catch((error) => {
        console.error('[UserContext] Error in immediate token refresh:', error);
      });
    }
  };

  const refreshAccessToken = async (): Promise<string | null> => {
    // Если refresh token уже истек, не пытаемся обновлять снова
    if (refreshTokenExpiredRef.current) {
      return null;
    }

    // Если уже идет процесс обновления, ждем его завершения
    if (refreshTokenPromiseRef.current) {
      return refreshTokenPromiseRef.current;
    }

    refreshTokenPromiseRef.current = (async () => {
      try {
        const response = await fetch(`${API}/refresh-token`, {
          method: 'POST',
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          const newToken = data.token || data.accessToken || data; // Поддержка разных форматов ответа
          if (newToken) {
            setToken(newToken);
            localStorage.setItem('token', newToken);
            // Сбрасываем флаг, если токен успешно обновлен
            refreshTokenExpiredRef.current = false;
            // Планируем следующее автоматическое обновление
            scheduleTokenRefresh(newToken);
            return newToken;
          }
        }
        
        // Если refresh не удался (401/403), помечаем что refresh token истек
        if (response.status === 401 || response.status === 403) {
          const errorData = await response.json().catch(() => ({ message: 'Refresh token expired or invalid' }));
          const errorMessage = errorData?.message || errorData || 'Refresh token expired';
          
          // Логируем только один раз при первой ошибке
          if (!refreshTokenExpiredRef.current) {
            console.warn('[UserContext] Не удалось обновить токен:', errorMessage);
            console.warn('[UserContext] Refresh token истек или недействителен. Требуется повторный вход.');
          }
          
          refreshTokenExpiredRef.current = true;
        } else {
          const errorData = await response.json().catch(() => ({ message: 'Failed to refresh token' }));
          console.warn('[UserContext] Ошибка при обновлении токена:', response.status, errorData);
        }
        
        setUser(null);
        setToken(null);
        clearUserStorage();
        
        // Очищаем таймер обновления
        if (tokenRefreshTimerRef.current) {
          clearTimeout(tokenRefreshTimerRef.current);
          tokenRefreshTimerRef.current = null;
        }
        
        // Перенаправляем на страницу входа только если мы не на странице входа
        // Используем setTimeout, чтобы избежать проблем с React StrictMode
        setTimeout(() => {
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }, 100);
        
        // Не выбрасываем ошибку, а возвращаем null для корректной обработки в useAuthFetch
        return null;
      } catch (error) {
        // Обработка сетевых ошибок
        console.error('[UserContext] Network error while refreshing token:', error);
        refreshTokenExpiredRef.current = true;
        setUser(null);
        setToken(null);
        clearUserStorage();
        
        // Очищаем таймер обновления
        if (tokenRefreshTimerRef.current) {
          clearTimeout(tokenRefreshTimerRef.current);
          tokenRefreshTimerRef.current = null;
        }
        
        // Перенаправляем на страницу входа только если мы не на странице входа
        // Используем setTimeout, чтобы избежать проблем с React StrictMode
        setTimeout(() => {
          if (window.location.pathname !== '/login') {
            console.info('[UserContext] Ошибка при обновлении токена. Перенаправление на страницу входа.');
            window.location.href = '/login';
          }
        }, 100);
        
        return null;
      } finally {
        refreshTokenPromiseRef.current = null;
      }
    })();

    return refreshTokenPromiseRef.current;
  };

  const refreshUserData = async () => {
    if (user) {
      try {
        // Проверяем, не вошли ли мы под другим пользователем
        const currentToken = localStorage.getItem('token');
        if (currentToken) {
          try {
            const base64Url = currentToken.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            const tokenData = JSON.parse(jsonPayload);
            // Если токен содержит impersonatedBy, не обновляем его
            if (tokenData?.impersonatedBy !== undefined && tokenData?.impersonatedBy !== null) {
              console.log('[UserContext] Пропускаем обновление токена - пользователь вошел под другим пользователем');
              console.log('[UserContext] impersonatedBy:', tokenData.impersonatedBy);
              // Обновляем токен в состоянии, если он еще не установлен
              if (token !== currentToken) {
                setToken(currentToken);
              }
              return;
            }
          } catch (e) {
            console.error('[UserContext] Ошибка декодирования токена:', e);
            // Если не удалось декодировать токен, продолжаем обновление
          }
        }

        let response = await fetch(`${API}/user/${user.id}`, {
          headers: {
            'Authorization': `Bearer ${currentToken || ''}`
          }
        });
        
        // Если получили 401, пытаемся обновить токен
        if (response.status === 401) {
          try {
            const newToken = await refreshAccessToken();
            if (newToken) {
              // Повторяем запрос с новым токеном
              response = await fetch(`${API}/user/${user.id}`, {
                headers: {
                  'Authorization': `Bearer ${newToken}`
                }
              });
            } else {
              // Если токен не обновился, очищаем данные и перенаправляем на страницу входа
              console.warn('[UserContext] Не удалось обновить токен, очищаем localStorage и перенаправляем на страницу входа');
              clearUserStorage();
              setUser(null);
              setToken(null);
              // Перенаправляем на страницу входа только если мы не на странице входа
              if (window.location.pathname !== '/login') {
                window.location.href = '/login';
              }
              return;
            }
          } catch (refreshError) {
            // Если refresh не удался, очищаем данные и перенаправляем на страницу входа
            console.warn('[UserContext] Ошибка при обновлении токена, очищаем localStorage:', refreshError);
            clearUserStorage();
            setUser(null);
            setToken(null);
            // Перенаправляем на страницу входа только если мы не на странице входа
            if (window.location.pathname !== '/login') {
              window.location.href = '/login';
            }
            return;
          }
        }
        
        // Проверяем статус перед парсингом JSON
        if (!response.ok) {
          if (response.status === 403) {
            // Доступ запрещен - очищаем данные
            console.warn('[UserContext] Доступ запрещен, очищаем localStorage');
            clearUserStorage();
            setUser(null);
            setToken(null);
            return;
          } else if (response.status === 400) {
            // Пользователь не найден в базе данных
            console.warn('[UserContext] Пользователь не найден в базе данных, очищаем localStorage');
            clearUserStorage();
            setUser(null);
            setToken(null);
            return;
          }
          // Для других ошибок пробуем получить JSON
          const errorText = await response.text();
          console.error('[UserContext] Ошибка при получении данных пользователя:', response.status, errorText);
          return;
        }
        
        const json = await response.json();
        if (response.ok && json) {
          // Проверяем новый токен перед сохранением
          try {
            const base64Url = json.token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            const newTokenData = JSON.parse(jsonPayload);
            // Если новый токен не содержит impersonatedBy, а старый содержал, не перезаписываем
            if (newTokenData?.impersonatedBy === undefined && currentToken) {
              const oldBase64Url = currentToken.split('.')[1];
              const oldBase64 = oldBase64Url.replace(/-/g, '+').replace(/_/g, '/');
              const oldJsonPayload = decodeURIComponent(atob(oldBase64).split('').map((c) => {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
              }).join(''));
              const oldTokenData = JSON.parse(oldJsonPayload);
              if (oldTokenData?.impersonatedBy !== undefined && oldTokenData?.impersonatedBy !== null) {
                console.log('[UserContext] Сохраняем старый токен с impersonatedBy, не перезаписываем');
                return;
              }
            }
          } catch (e) {
            // Если не удалось декодировать, продолжаем обновление
          }
          
          setToken(json.token)
          localStorage.setItem('user', JSON.stringify(json.user))
          localStorage.setItem('token', json.token)
          // Планируем автоматическое обновление нового токена
          scheduleTokenRefresh(json.token)
        } else if (response.status === 400) {
          // Пользователь не найден в базе данных, очищаем localStorage
          console.warn('Пользователь не найден в базе данных, очищаем localStorage')
          clearUserStorage()
          setUser(null)
          setToken(null)
        }
      } catch (error) {
        console.error('Ошибка при обновлении данных пользователя:', error)
      }
    }
  }

  useEffect(() => {
    refreshUserData()
  }, [])

  const login = (user: User, token: string) => {
    setUser(user);
    setToken(token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    // Планируем автоматическое обновление токена после логина
    scheduleTokenRefresh(token);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    clearUserStorage();
    // Очищаем таймер обновления токена
    if (tokenRefreshTimerRef.current) {
      clearTimeout(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }
  };

  // Планируем автоматическое обновление токена при изменении токена
  useEffect(() => {
    if (token) {
      scheduleTokenRefresh(token);
    } else {
      // Если токен удален, очищаем таймер
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
      }
    }
    
    // Очистка при размонтировании
    return () => {
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
      }
    };
  }, [token]);

  return (
    <UserContext.Provider value={{ user, token, login, logout, refreshAccessToken, setUser }}>
      {children}
    </UserContext.Provider>
  );
};
