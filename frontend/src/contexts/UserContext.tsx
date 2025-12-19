import { createContext, useEffect, useState } from "react";
import { API } from "../config/constants";

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
  refreshAccessToken: () => void;
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

        const response = await fetch(`${API}/user/${user.id}`, {
          headers: {
            'Authorization': `Bearer ${currentToken || ''}`
          }
        });
        
        // Проверяем статус перед парсингом JSON
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            // Неавторизован - очищаем данные
            console.warn('[UserContext] Пользователь не авторизован, очищаем localStorage');
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            setUser(null);
            setToken(null);
            return;
          } else if (response.status === 400) {
            // Пользователь не найден в базе данных
            console.warn('[UserContext] Пользователь не найден в базе данных, очищаем localStorage');
            localStorage.removeItem('user');
            localStorage.removeItem('token');
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
        } else if (response.status === 400) {
          // Пользователь не найден в базе данных, очищаем localStorage
          console.warn('Пользователь не найден в базе данных, очищаем localStorage')
          localStorage.removeItem('user')
          localStorage.removeItem('token')
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
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('domain');
  };

  const refreshAccessToken = async () => {
    const response = await fetch(`${API}/refresh-token`, {
      method: 'POST',
      credentials: 'include'
    });

    if (response.ok) {
      const newToken = await response.json(); // Backend возвращает токен напрямую
      setToken(newToken);
      localStorage.setItem('token', newToken);
      return newToken;
    } else {
      // Если refresh не удался, делаем logout и выбрасываем ошибку
      logout();
      throw new Error('Failed to refresh token');
    }
  };

  return (
    <UserContext.Provider value={{ user, token, login, logout, refreshAccessToken, setUser }}>
      {children}
    </UserContext.Provider>
  );
};
