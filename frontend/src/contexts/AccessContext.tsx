import { createContext, useEffect, useState, useCallback, useRef } from "react";
import { useUserContext } from "../hooks/useUserContext";
import { API, APIWebSocket } from "../config/constants";
import { AccessLevel } from "../app/profile/Management";
import { io, Socket } from "socket.io-client";

type Props = {
  children?: React.ReactNode
}

type ToolAccessType = {
  toolId: string
  link: string
  accessLevel: AccessLevel
}

type AccessContextTypes = {
  access: ToolAccessType[]
  loading: Boolean
  refresh: () => Promise<void>
}

export const AccessContext = createContext<AccessContextTypes | undefined>(undefined)
 
export const AccessContextProvider = ({ children }: Props) => {
  const { user } = useUserContext()
  const [access, setAccess] = useState<ToolAccessType[]>([])
  const [loading, setLoading] = useState<Boolean>(true)
  const socketRef = useRef<Socket | null>(null)

  // Ref для отслеживания последнего времени загрузки (для предотвращения частых запросов)
  const lastFetchTimeRef = useRef<number>(0);
  const FETCH_COOLDOWN = 5000; // Минимум 5 секунд между запросами при фокусе
  
  const getAccessedTools = useCallback(async (skipLoading: boolean = false) => {
    if (!user?.id || !user?.email) return
    
    // Проверяем cooldown для запросов при фокусе
    const now = Date.now();
    if (skipLoading && (now - lastFetchTimeRef.current) < FETCH_COOLDOWN) {
      console.log('[AccessContext] Skipping fetch - too soon after last fetch');
      return;
    }
    
    if (!skipLoading) {
      setLoading(true);
    }
    
    try {
      const response = await fetch(`${API}/access/${user.id}?email=${user.email}`)
      if (!response.ok) throw new Error("Failed to fetch access")
      const json = await response.json();
      
      lastFetchTimeRef.current = now;
      
      // ИСПРАВЛЕНО: Обновляем состояние только если данные действительно изменились
      // Это предотвращает лишние ререндеры при возврате фокуса окна
      setAccess(prevAccess => {
        // Если предыдущий массив пустой и новый тоже пустой, не обновляем
        if (prevAccess.length === 0 && json.length === 0) {
          return prevAccess;
        }
        
        // Сравниваем по содержимому, а не по ссылке
        // Создаем копии для сортировки, чтобы не мутировать оригиналы
        const prevSorted = [...prevAccess].sort((a, b) => {
          const aKey = `${a.toolId}:${a.link}:${a.accessLevel}`;
          const bKey = `${b.toolId}:${b.link}:${b.accessLevel}`;
          return aKey.localeCompare(bKey);
        });
        const newSorted = [...json].sort((a: ToolAccessType, b: ToolAccessType) => {
          const aKey = `${a.toolId}:${a.link}:${a.accessLevel}`;
          const bKey = `${b.toolId}:${b.link}:${b.accessLevel}`;
          return aKey.localeCompare(bKey);
        });
        
        // Сравниваем длины и содержимое
        if (prevSorted.length !== newSorted.length) {
          return json;
        }
        
        // Сравниваем каждый элемент
        for (let i = 0; i < prevSorted.length; i++) {
          const prev = prevSorted[i];
          const curr = newSorted[i];
          if (prev.toolId !== curr.toolId || 
              prev.link !== curr.link || 
              prev.accessLevel !== curr.accessLevel) {
            return json;
          }
        }
        
        // Данные не изменились, возвращаем предыдущее значение для предотвращения ререндера
        console.log('[AccessContext] Access data unchanged, skipping state update');
        return prevAccess;
      });
    } catch (error) {
      setAccess(prevAccess => {
        // Обновляем только если текущее состояние не пустое
        if (prevAccess.length === 0) return prevAccess;
        return [];
      });
      console.error(error)
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
    }
  }, [user?.id, user?.email])

  // Функция для ручного обновления доступа
  const refresh = useCallback(async () => {
    await getAccessedTools()
  }, [getAccessedTools])

  // Загружаем доступы при изменении пользователя
  useEffect(() => {
    getAccessedTools()
  }, [getAccessedTools])

  // Подключаемся к Socket.IO для получения обновлений доступа
  useEffect(() => {
    if (!user?.id) return

    const connectSocket = () => {
      // Закрываем предыдущее соединение
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      socketRef.current = io(APIWebSocket, {
        query: { userId: user.id },
        path: '/socket.io',
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        autoConnect: true,
        forceNew: false // Используем существующее соединение, если есть
      });

      const socket = socketRef.current;

      // Слушаем событие обновления доступа
      socket.on('access_updated', () => {
        console.log('[AccessContext] Access updated event received, refreshing...');
        getAccessedTools();
      });

      socket.on('connect', () => {
        console.log('[AccessContext] Socket connected');
      });

      socket.on('disconnect', () => {
        console.log('[AccessContext] Socket disconnected');
      });
    };

    connectSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.off('access_updated');
        // Не отключаем сокет полностью, так как он может использоваться другими компонентами
      }
    };
  }, [user?.id, getAccessedTools]);

  // Обновляем доступ при фокусе окна (на случай, если пользователь получил доступ в другой вкладке)
  // ИСПРАВЛЕНО: Используем skipLoading=true и debounce для предотвращения лишних ререндеров
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    
    const handleFocus = () => {
      // Отменяем предыдущий запрос, если он еще не выполнен
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Debounce: ждем 300ms перед запросом, чтобы не делать запрос при быстром переключении вкладок
      timeoutId = setTimeout(() => {
        console.log('[AccessContext] Window focused, checking access (silent)...');
        // Используем skipLoading=true, чтобы не показывать loading и не вызывать ререндеры
        getAccessedTools(true);
      }, 300);
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [getAccessedTools]);

  return (
    <AccessContext.Provider value={{access, loading, refresh}}>
      {children}
    </AccessContext.Provider>
  )
}