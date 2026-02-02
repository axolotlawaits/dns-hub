import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import { useSearchParams } from 'react-router-dom';
import { API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { useAccessContext } from '../../../hooks/useAccessContext';
import { usePageHeader } from '../../../contexts/PageHeaderContext';
import { notificationSystem } from '../../../utils/Push';
import { Button, Box, LoadingOverlay, Group, ActionIcon, Text, Stack, Paper, Tabs, Alert, Select, Pagination, Modal, Tooltip, SegmentedControl, Grid } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconClock, IconFileText, IconFilter, IconShield, IconFlame, IconCircleCheck, IconCircleX, IconAlertCircle, IconRefresh, IconQrcode, IconBell, IconList, IconApps } from '@tabler/icons-react';
import { FilePreviewModal } from '../../../utils/FilePreviewModal';
import { DynamicFormModal } from '../../../utils/formModal';
import { DndProviderWrapper } from '../../../utils/dnd';
import { type ColumnFiltersState, type SortingState } from '@tanstack/react-table';
import { Image } from '@mantine/core'
import tgBotQRImage from '../../../assets/images/tg_bot_journals.webp'
import tgBotQRImageDark from '../../../assets/images/tg_bot_journals_black.webp'
import { useThemeContext } from '../../../hooks/useThemeContext';
import BranchCard from './BranchCard';
import SafetyJournalChat from './SafetyJournalChat';
import DraggableChatModal from './DraggableChatModal';

// Интерфейсы для работы с API
interface UserInfo {
  userId: string;
  userName: string;
  userCode: string;
  email: string | null;
  positionName: string;
  positionId: string;
  branchId: string;
  branchName: string;
  phoneNumber: string | null;
  counterpartyId: string;
  isManager: boolean;
}

interface ResponsibleEmployeeType {
  employee_id: string
  employee_name: string
}

interface ResponsibilitiesType {
  ot: ResponsibleEmployeeType[]
  pb: ResponsibleEmployeeType[]
}

interface BranchWithJournals {
  branch_id: string;
  branch_name: string;
  rrs_id: string;
  rrs_name: string;
  closed_at: string | null;
  territory_id: string | null;
  territory_name: string | null;
  branch_address: string;
  city_name: string;
  journals: JournalInfo[];
  responsibilities: ResponsibilitiesType
}

interface JournalFile {
  file_id: string;
  original_filename: string;
  content_type: string;
  is_deleted: boolean;
  description: string;
  download_url: string;
  view_url: string;
}

interface JournalInfo {
  id: string;
  journal_id: string;
  branch_journal_id?: string; // ID журнала филиала для внешнего API
  journal_title: string;
  journal_type: 'ОТ' | 'ПБ';
  branch_id: string;
  branch_name: string;
  status: 'approved' | 'pending' | 'rejected' | 'under_review';
  comment?: string
  filled_at: string | null;
  approved_at: string | null;
  period_start: string;
  period_end: string;
  files?: JournalFile[]; // Массив файлов журнала
  files_count?: number; // Количество файлов для журнала
  is_current?: boolean; // Флаг актуальности журнала в текущем периоде
}

export type SafetyJournal = JournalInfo;
export type Branch = BranchWithJournals;

export default function SafetyJournal() {
  const { user, token, logout } = useUserContext();
  const { access } = useAccessContext();
  const { isDark } = useThemeContext()
  const { setHeader, clearHeader } = usePageHeader();
  
  // ИСПРАВЛЕНО: Мемоизируем access, чтобы избежать ререндеров при изменении ссылки на массив
  // Используем ref для хранения предыдущего значения и сравнения по содержимому
  const accessStableRef = useRef<typeof access>([]);
  const accessHashRef = useRef<string>('');
  
  const stableAccess = useMemo(() => {
    // Вычисляем хеш текущего access
    const currentHash = JSON.stringify(
      [...access]
        .sort((a, b) => `${a.toolId}:${a.link}:${a.accessLevel}`.localeCompare(`${b.toolId}:${b.link}:${b.accessLevel}`))
    );
    
    // Если хеш не изменился, возвращаем предыдущий массив (та же ссылка = нет ререндера)
    if (accessHashRef.current === currentHash && accessStableRef.current.length > 0) {
      return accessStableRef.current;
    }
    
    // Хеш изменился или это первая загрузка - обновляем refs и возвращаем новый массив
    accessHashRef.current = currentHash;
    accessStableRef.current = access;
    return access;
  }, [access]);

  // Объединенное состояние для лучшей производительности
  const [state, setState] = useState({
    branches: [] as BranchWithJournals[],
    loading: true,
    error: null as string | null,
    activeTab: 'all' as string,
    userInfo: null as UserInfo | null,
    lastUpdate: 0,
    forceUpdate: 0,
    tableState: {
      columnFilters: [] as ColumnFiltersState,
      sorting: [] as SortingState
    }
  });

  // Мемоизированная проверка доступа к управлению статусами
  // ИСПРАВЛЕНО: Используем стабильный access для предотвращения ререндеров
  const canManageStatuses = useMemo(() => {
    // SUPERVISOR имеет полный доступ
    if (user?.role === 'SUPERVISOR') {
      return true;
    }
    
    // Используем стабильный access вместо прямого доступа
    return stableAccess.some(tool => 
      tool.link === 'jurists/safety' && 
      tool.accessLevel === 'FULL'
    );
  }, [stableAccess, user?.role]);

  // Деструктуризация для удобства
  const { branches, loading, error, activeTab } = state;

  // Функции для обновления состояния
  const updateState = useCallback((updates: Partial<typeof state>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const setActiveTab = useCallback((tab: string) => {
    updateState({ activeTab: tab });
  }, [updateState]);
  
  
  // Параметры URL для навигации из уведомлений
  const [searchParams, setSearchParams] = useSearchParams();
  const targetBranchId = searchParams.get('branchId');
  const targetMessageId = searchParams.get('messageId') || undefined;

  // Модальные окна
  const [filePreviewOpened, { close: closeFilePreview }] = useDisclosure(false);
  const [fileUploadOpened, { open: openFileUpload, close: closeFileUpload }] = useDisclosure(false);
  const [fileUploadLoading, setFileUploadLoading] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState<SafetyJournal | null>(null);
  const [journalFiles, setJournalFiles] = useState<any[]>([]);
  const [fileViewOpened, { open: openFileView, close: closeFileView }] = useDisclosure(false);
  const [deleteJournalOpened, { close: closeDeleteJournal }] = useDisclosure(false);
  const [qrOpened, { open: qrOpen, close: qrClose }] = useDisclosure(false);
  const [chatOpened, { open: openChat, close: closeChat }] = useDisclosure(false);
  // Флаг для отслеживания намеренного закрытия чата (чтобы не открывать его снова из-за задержки обновления URL)
  const chatClosedIntentionallyRef = useRef(false);
  const [chatPreviewOpened, setChatPreviewOpened] = useState(false);
  const [chatPreviewFiles, setChatPreviewFiles] = useState<Array<{ id: string; source: File | string; name?: string; mimeType?: string }>>([]);
  const [chatPreviewIndex, setChatPreviewIndex] = useState(0);
  
  // Фильтры для филиалов
  const [branchFilters, setBranchFilters] = useState({
    rrs: '',
    branch: '',
    journalType: '' as '' | 'ОТ' | 'ПБ',
    status: '' as '' | 'approved' | 'pending' | 'rejected' | 'under_review'
  });
  
  // Debounce для фильтров (300ms задержка) - оптимизация производительности
  const [debouncedFilters] = useDebouncedValue(branchFilters, 300);

  // ОПТИМИЗАЦИЯ: Ref для отслеживания предыдущего targetBranchId, чтобы избежать лишних проверок
  const prevTargetBranchIdRef = useRef<string | undefined>(undefined);
  const prevSelectedBranchIdRef = useRef<string | undefined>(undefined);
  const branchesRef = useRef<BranchWithJournals[]>([]);
  
  // Синхронизируем ref с branches
  useEffect(() => {
    branchesRef.current = branches;
  }, [branches]);
  
  // ОПТИМИЗАЦИЯ: Ref для хранения таймаутов, чтобы их можно было очистить
  const urlParamsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Обработка URL параметров для открытия чата из уведомления
  useEffect(() => {
    // Очищаем предыдущие таймауты при изменении зависимостей
    if (urlParamsTimeoutRef.current) {
      clearTimeout(urlParamsTimeoutRef.current);
      urlParamsTimeoutRef.current = null;
    }
    
    // Если чат был намеренно закрыт, не открываем его снова из-за задержки обновления URL
    if (chatClosedIntentionallyRef.current && !targetBranchId) {
      // Сбрасываем флаг, если URL параметры уже очищены
      chatClosedIntentionallyRef.current = false;
      return;
    }
    
    // Если чат был намеренно закрыт, но URL параметры еще не очищены - игнорируем
    if (chatClosedIntentionallyRef.current) {
      return;
    }
    
    // ОПТИМИЗАЦИЯ: Проверяем, изменился ли targetBranchId или selectedJournal.branch_id
    const currentSelectedBranchId = selectedJournal?.branch_id;
    const targetBranchIdChanged = prevTargetBranchIdRef.current !== targetBranchId;
    const selectedBranchIdChanged = prevSelectedBranchIdRef.current !== currentSelectedBranchId;
    
    // Если ничего не изменилось и чат уже открыт - не делаем ничего
    if (!targetBranchIdChanged && !selectedBranchIdChanged && chatOpened && currentSelectedBranchId === targetBranchId) {
      return;
    }
    
    // Обновляем refs
    prevTargetBranchIdRef.current = targetBranchId || undefined;
    prevSelectedBranchIdRef.current = currentSelectedBranchId;
    
    // ОПТИМИЗАЦИЯ: Используем ref для branches, чтобы избежать зависимости от всего массива
    const currentBranches = branchesRef.current;
    if (targetBranchId && currentBranches.length > 0) {
      const branch = currentBranches.find(b => b.branch_id === targetBranchId);
      if (branch) {
        // Проверяем, нужно ли обновить чат (если branchId изменился или чат не открыт)
        const branchIdChanged = currentSelectedBranchId && currentSelectedBranchId !== targetBranchId;
        
        if (!chatOpened || branchIdChanged) {
          const firstJournal = branch.journals?.[0];
          if (firstJournal) {
            setSelectedJournal({
              ...firstJournal,
              branch_id: targetBranchId,
              branch_name: branch.branch_name
            });
          } else {
            setSelectedJournal({
              id: '',
              journal_id: '',
              journal_title: '',
              journal_type: 'ОТ',
              branch_id: targetBranchId,
              branch_name: branch.branch_name,
              status: 'pending',
              filled_at: null,
              approved_at: null,
              period_start: '',
              period_end: ''
            } as SafetyJournal);
          }
          
          // Если чат уже открыт, но branchId изменился - закрываем и открываем заново
          if (chatOpened && branchIdChanged) {
            closeChat();
            // Используем setTimeout, чтобы дать время чату закрыться перед открытием
            urlParamsTimeoutRef.current = setTimeout(() => {
              openChat();
              urlParamsTimeoutRef.current = null;
            }, 50);
          } else if (!chatOpened) {
            // Если чат не открыт - просто открываем
            openChat();
          }
          
          // Очищаем параметры URL после открытия чата (кроме messageId, он нужен для прокрутки)
          // Используем setTimeout, чтобы дать время чату открыться
          urlParamsTimeoutRef.current = setTimeout(() => {
            if (!targetMessageId) {
              setSearchParams({});
            }
            urlParamsTimeoutRef.current = null;
          }, 100);
        }
      }
    }
    
    // ИСПРАВЛЕНО: Один cleanup для всех таймаутов
    return () => {
      if (urlParamsTimeoutRef.current) {
        clearTimeout(urlParamsTimeoutRef.current);
        urlParamsTimeoutRef.current = null;
      }
    };
  }, [targetBranchId, targetMessageId, chatOpened, openChat, closeChat, setSearchParams, selectedJournal?.branch_id]);
  
  // Пагинация для филиалов
  const [branchPagination, setBranchPagination] = useState(() => {
    const saved = localStorage.getItem('safety-journal-page-size');
    return {
      page: 1,
      pageSize: saved ? parseInt(saved) : 5
    };
  });

  // Состояние для отслеживания развернутых филиалов
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
  
  // Состояние для сохранения позиции скролла
  const [scrollPosition, setScrollPosition] = useState<number>(0);
  
  // Ref для отслеживания контейнера с филиалами
  const branchesContainerRef = useRef<HTMLDivElement>(null);

  // Состояние для последних оповещений
  const [lastNotifications, setLastNotifications] = useState<Record<string, any>>({});
  const [notifying, setNotifying] = useState(false);
  // ИСПРАВЛЕНО: Кэш для ответственных по филиалам, чтобы избежать множественных запросов
  const [responsiblesCache, setResponsiblesCache] = useState<Record<string, any>>({});

  // Состояние для режима отображения (список/карточки)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    try {
      return (localStorage.getItem('safety-journal-view-mode') as 'list' | 'grid') || 'list';
    } catch {
      return 'list';
    }
  });
  
  // Флаг для отслеживания, была ли загрузка viewMode из API
  const viewModeLoadedRef = useRef(false);

  // Загружаем предпочтение пользователя из UserSettings (только один раз при монтировании)
  useEffect(() => {
    const loadViewMode = async () => {
      if (!user?.id || viewModeLoadedRef.current) return;
      
      try {
        const response = await fetch(`${API}/user/settings/${user.id}/safety_journal_view_mode`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (response && response.ok) {
          const data = await response.json();
          const savedMode = data?.value;
          if (savedMode === 'list' || savedMode === 'grid') {
            setViewMode(savedMode);
            viewModeLoadedRef.current = true;
          }
        }
      } catch (error) {
        console.error('Ошибка при загрузке настройки отображения:', error);
        // В случае ошибки используем базовый вариант - список
        setViewMode('list');
        viewModeLoadedRef.current = true;
      }
    };

    loadViewMode();
  }, [user?.id, token]);

  // ОПТИМИЗАЦИЯ: Ref для отслеживания предыдущего viewMode и предотвращения частых сохранений
  const prevViewModeRef = useRef<'list' | 'grid'>(viewMode);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Сохраняем предпочтение пользователя в UserSettings с защитой от частых вызовов
  useEffect(() => {
    // ОПТИМИЗАЦИЯ: Не сохраняем, если viewMode не изменился или это первая загрузка
    if (prevViewModeRef.current === viewMode || !viewModeLoadedRef.current) {
      prevViewModeRef.current = viewMode;
      return;
    }
    
    // Отменяем предыдущий таймаут если есть
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Откладываем сохранение на 1 секунду чтобы избежать частых запросов
    saveTimeoutRef.current = setTimeout(() => {
      const saveViewMode = async () => {
        if (!user?.id || !token) return;
        
        try {
          const response = await fetch(`${API}/user/settings`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              userId: user.id,
              parameter: 'safety_journal_view_mode',
              value: viewMode,
            }),
          });
          
          if (!response || !response.ok) {
            console.error('Ошибка при сохранении настройки отображения');
          }
        } catch (error) {
          console.error('Ошибка при сохранении настройки отображения:', error);
        }
      };

      // Сохраняем только если пользователь загружен и это не первая инициализация
      if (user?.id && token) {
        prevViewModeRef.current = viewMode;
        saveViewMode();
      }
    }, 1000); // Задержка 1 секунда
  }, [viewMode, user?.id, token]);


  // Получение заголовков для API запросов
  const getAuthHeaders = (includeContentType: boolean = true): HeadersInit => {
    const headers: HeadersInit = {};

    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  };

  // Функция для выполнения запросов с автоматическим обновлением токена
  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    let response: Response;
    
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          ...getAuthHeaders(!options.body || !(options.body instanceof FormData)),
          ...options.headers,
        },
      });
    } catch (networkError: any) {
      // Обрабатываем ошибки сети (ERR_CONNECTION_REFUSED, ERR_NETWORK_CHANGED и т.д.)
      console.error('[SafetyJournal] fetchWithAuth network error:', networkError);
      
      // Если запрос был прерван через AbortController, пробрасываем AbortError как есть
      if (networkError?.name === 'AbortError') {
        throw networkError;
      }
      
      throw new Error(
        networkError?.message?.includes('Failed to fetch') || networkError?.message?.includes('ERR_CONNECTION_REFUSED')
          ? 'Сервер недоступен. Проверьте подключение к сети и убедитесь, что сервер запущен.'
          : networkError?.message || 'Ошибка соединения с сервером'
      );
    }

    if (response.status === 401) {
      // Unauthorized access, attempting to refresh token
      
      try {
        // Попытка обновить токен
        const refreshResponse = await fetch(`${API}/refresh-token`, {
          method: 'POST',
          credentials: 'include'
        });
        
        console.log('Refresh token response status:', refreshResponse.status);

        if (refreshResponse.ok) {
          const newToken = await refreshResponse.json();
          localStorage.setItem('token', newToken);
          // Token refreshed successfully
          
          // Обновляем токен в контексте
          // Примечание: useUserContext должен автоматически обновить токен из localStorage
          
          // Повторяем запрос с новым токеном
          try {
            response = await fetch(url, {
              ...options,
              headers: {
                ...getAuthHeaders(!options.body || !(options.body instanceof FormData)),
                'Authorization': `Bearer ${newToken}`,
                ...options.headers,
              },
            });
          } catch (retryError: any) {
            console.error('[SafetyJournal] fetchWithAuth retry network error:', retryError);
            
            // Если запрос был прерван через AbortController, пробрасываем AbortError как есть
            if (retryError?.name === 'AbortError') {
              throw retryError;
            }
            
            throw new Error(
              retryError?.message?.includes('Failed to fetch') || retryError?.message?.includes('ERR_CONNECTION_REFUSED')
                ? 'Сервер недоступен. Проверьте подключение к сети и убедитесь, что сервер запущен.'
                : retryError?.message || 'Ошибка соединения с сервером'
            );
          }
        } else {
          // Token refresh failed, logging out user
          logout();
          window.location.href = '/login';
          throw new Error('Сессия истекла. Пожалуйста, войдите в систему заново.');
        }
      } catch (refreshError: any) {
        // Если ошибка при обновлении токена - это тоже сетевая ошибка
        if (refreshError?.message?.includes('Failed to fetch') || refreshError?.message?.includes('ERR_CONNECTION_REFUSED')) {
          throw new Error('Сервер недоступен. Проверьте подключение к сети и убедитесь, что сервер запущен.');
        }
        throw refreshError;
      }
    }

    return response;
  }, [token, logout]);

  // Смена статуса журнала (по правам FULL)
  // ИСПРАВЛЕНО: Убрали console.log и state.forceUpdate
  const handleChangeStatus = useCallback(async (journal: SafetyJournal, status: 'approved' | 'rejected' | 'under_review', rejectMessage? : string) => {
    try {
      const journalId = journal.branch_journal_id || journal.id;
      const response = await fetchWithAuth(`${API}/jurists/safety/branch_journals/${journalId}/decision`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status, comment: rejectMessage }),
      });

      if (response.ok) {
        // ИСПРАВЛЕНО: Обновляем локальное состояние без forceUpdate
        // Компоненты автоматически обновятся при изменении branches
        setState(prevState => ({
          ...prevState,
          lastUpdate: Date.now(),
          branches: prevState.branches.map(branch => ({
            ...branch,
            journals: branch.journals.map(j => 
              j.id === journal.id ? { 
                ...j, 
                status,
                // Обновляем время одобрения для одобренных журналов
                approved_at: status === 'approved' ? new Date().toISOString() : j.approved_at
              } : j
            )
          }))
        }));
        
        notificationSystem.addNotification('Успех', 'Статус обновлен', 'success');
      } else {
        const errorData = await response.json();
        notificationSystem.addNotification('Ошибка', errorData.message || 'Не удалось обновить статус', 'error');
      }
    } catch (err) {
      notificationSystem.addNotification('Ошибка', 'Ошибка соединения с сервером', 'error');
    }
  }, [fetchWithAuth, setState]);

  // ИСПРАВЛЕНО: Загрузка ответственных для всех филиалов батчами для оптимизации
  // Перемещено перед loadBranchesWithJournals, чтобы избежать ошибки инициализации
  const loadResponsiblesBatch = useCallback(async (branchIds: string[]) => {
    if (!branchIds.length) return;
    
    try {
      // Загружаем ответственных параллельно, но с ограничением (по 5 одновременно)
      const batchSize = 5;
      const batches: string[][] = [];
      for (let i = 0; i < branchIds.length; i += batchSize) {
        batches.push(branchIds.slice(i, i + batchSize));
      }
      
      const cache: Record<string, any> = {};
      
      for (const batch of batches) {
        const promises = batch.map(async (branchId) => {
          try {
            const response = await fetchWithAuth(`${API}/jurists/safety/branch/responsible?branchId=${branchId}`);
            if (response.ok) {
              const json = await response.json();
              // API возвращает массив [{ branch_id, branch_name, responsibles: [...] }]
              if (Array.isArray(json) && json.length > 0) {
                const branchData = json.find((item: any) => item.branch_id === branchId) || json[0];
                cache[branchId] = branchData;
              } else if (json && typeof json === 'object') {
                cache[branchId] = json;
              }
            }
          } catch (error) {
            console.error(`[SafetyJournal] Error loading responsibles for branch ${branchId}:`, error);
          }
        });
        
        await Promise.all(promises);
      }
      
      // Обновляем кэш
      setResponsiblesCache(prev => ({ ...prev, ...cache }));
    } catch (error) {
      console.error('[SafetyJournal] Error loading responsibles batch:', error);
    }
  }, [fetchWithAuth]);

  // Объединенная загрузка данных (филиалы + уведомления)
  const loadBranchesWithJournals = useCallback(async () => {
    try {
      updateState({ loading: true, error: null });
      
      // Проверяем, что пользователь авторизован
      if (!user || !token) {
        updateState({ error: 'Пользователь не авторизован', loading: false });
        return;
      }
      
      // Используем пользователя из контекста
      const userInfo = {
        userId: user.id || '',
        userName: user.name || '',
        userCode: user.login || '',
        email: user.email || '',
        positionName: user.position || '',
        positionId: user.position || '',
        branchId: user.branch || '',
        branchName: user.branch || '',
        phoneNumber: '',
        counterpartyId: '',
        isManager: false
      };
      
      // Загружаем только филиалы с журналами
      // Уведомления загружаются отдельно при монтировании и автоматически обновляются
      // после отправки уведомлений через handleNotifyUnfilled/handleNotifyBranch
      const branchesResponse = await fetchWithAuth(`${API}/jurists/safety/me/branches_with_journals`, {
        method: 'GET',
      });

      // Обработка ответа филиалов
      if (branchesResponse.ok) {
        const data = await branchesResponse.json();
        
        // Если API недоступен, показываем сообщение об ошибке
        if (data.apiUnavailable) {
          updateState({ 
            branches: [], 
            userInfo, 
            loading: false,
            error: data.error || 'Внешний API недоступен'
          });
        } else {
          // Простая сортировка журналов по алфавиту на frontend
          const sortedBranches = (data.branches || []).map((branch: any) => ({
            ...branch,
            journals: [...(branch.journals || [])].sort((a: any, b: any) => {
              return a.journal_title.localeCompare(b.journal_title, 'ru');
            })
          }));
          
          updateState({ 
            branches: sortedBranches, 
            userInfo, 
            loading: false 
          });
          
          // ИСПРАВЛЕНО: НЕ загружаем ответственных здесь - они должны загружаться индивидуально в BranchCard
          // Это предотвращает тысячи запросов при инициализации
        }
      } else {
        let errorMessage = 'Ошибка загрузки филиалов с журналами';
        try {
          const errorData = await branchesResponse.json();
          errorMessage = errorData.message || errorMessage;
        } catch (jsonError) {
          // Если не удалось распарсить JSON, используем статус ответа
          if (branchesResponse.status === 401) {
            errorMessage = 'Сессия истекла или домен изменился. Пожалуйста, войдите в систему заново.';
            // Автоматически выходим из системы при 401
            logout();
            window.location.href = '/login';
          } else if (branchesResponse.status === 403) {
            errorMessage = 'Доступ запрещен';
          } else if (branchesResponse.status === 500) {
            errorMessage = 'Внутренняя ошибка сервера';
          }
        }
        updateState({ error: errorMessage, loading: false });
      }
    } catch (err) {
      console.error('Error loading branches with journals:', err);
      updateState({ error: 'Ошибка соединения с сервером', loading: false });
    }
  }, [user, token, fetchWithAuth, updateState, logout, loadResponsiblesBatch]);

  // Загрузка информации о последних оповещениях
  // Вызывается при монтировании компонента и автоматически после отправки уведомлений
  // через handleNotifyUnfilled/handleNotifyBranch
  const loadLastNotifications = useCallback(async () => {
    try {
      const response = await fetchWithAuth(`${API}/jurists/safety/last-notifications`);
      // Проверяем, что response не null (может быть null при ошибке сети)
      if (!response) {
        console.warn('[SafetyJournal] loadLastNotifications: Server unavailable, skipping');
        return;
      }
      if (response.ok) {
        const data = await response.json();
        const notificationsMap: Record<string, any> = {};
        data.forEach((n: any) => {
          notificationsMap[n.branchId] = n;
        });
        setLastNotifications(notificationsMap);
      }
    } catch (error: any) {
      // Не показываем ошибку пользователю - это фоновое обновление
      console.error('[SafetyJournal] Error loading last notifications:', error);
    }
  }, [fetchWithAuth]);

  // Оповещение филиалов с не заполненными журналами
  const handleNotifyUnfilled = useCallback(async () => {
    setNotifying(true);
    try {
      console.log('[SafetyJournal] Sending notifications for all unfilled branches');
      const response = await fetchWithAuth(`${API}/jurists/safety/notify-unfilled`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Проверяем, что response не null (может быть null при ошибке сети в useAuthFetch)
      if (!response) {
        notificationSystem.addNotification(
          'Ошибка',
          'Сервер недоступен. Проверьте подключение к сети и убедитесь, что сервер запущен.',
          'error'
        );
        return;
      }

      console.log('[SafetyJournal] Notifications response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('[SafetyJournal] Notifications sent successfully:', data);
        notificationSystem.addNotification('Успех', data.message || 'Оповещения отправлены', 'success');
        // ИСПРАВЛЕНО: Обновляем только информацию о последних оповещениях без полной перезагрузки данных
        // Это предотвращает ненужные ререндеры всех компонентов
        // Оборачиваем в try-catch, чтобы ошибка загрузки уведомлений не блокировала выполнение
        try {
          await loadLastNotifications();
        } catch (notifError) {
          console.error('[SafetyJournal] Error loading last notifications after sending:', notifError);
          // Не показываем ошибку пользователю - основная операция выполнена успешно
        }
        // Не перезагружаем все данные филиалов - они не изменились после отправки уведомления
      } else {
        let errorMessage = 'Не удалось отправить оповещения';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
          console.error('[SafetyJournal] Notifications error:', errorData);
        } catch (jsonError) {
          // Если ответ не является JSON, используем статус
          errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
          console.error('[SafetyJournal] Notifications error (non-JSON response):', {
            status: response.status,
            statusText: response.statusText
          });
        }
        notificationSystem.addNotification('Ошибка', errorMessage, 'error');
      }
    } catch (error: any) {
      console.error('[SafetyJournal] Notifications request failed:', error);
      // Проверяем тип ошибки для более информативного сообщения
      const errorMessage = error?.message || 
        (error?.name === 'TypeError' && error?.message?.includes('Failed to fetch')
          ? 'Сервер недоступен. Проверьте подключение к сети и убедитесь, что сервер запущен.'
          : 'Ошибка соединения с сервером');
      
      notificationSystem.addNotification('Ошибка', errorMessage, 'error');
    } finally {
      setNotifying(false);
    }
  }, [fetchWithAuth]); // УБРАЛИ loadLastNotifications из зависимостей

  // Оповещение одного филиала с не заполненными журналами
  const handleNotifyBranch = useCallback(async (branchId: string) => {
    try {
      console.log('[SafetyJournal] Sending notification for branch:', branchId);
      
      // Добавляем таймаут для предотвращения зависания запроса
      // Используем более короткий таймаут (10 секунд) для быстрого отклика при недоступном сервере
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn('[SafetyJournal] Request timeout, aborting...');
        controller.abort();
      }, 10000); // 10 секунд таймаут
      
      let response: Response | null = null;
      try {
        response = await fetchWithAuth(`${API}/jurists/safety/notify-unfilled/${branchId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError?.name === 'AbortError') {
          throw new Error('Превышено время ожидания ответа от сервера');
        }
        throw fetchError;
      }

      // Проверяем, что response не null (может быть null при ошибке сети в useAuthFetch)
      if (!response) {
        notificationSystem.addNotification(
          'Ошибка',
          'Сервер недоступен. Проверьте подключение к сети и убедитесь, что сервер запущен.',
          'error'
        );
        return;
      }

      console.log('[SafetyJournal] Notification response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('[SafetyJournal] Notification sent successfully:', data);
        notificationSystem.addNotification('Успех', data.message || 'Оповещение отправлено', 'success');
        // ИСПРАВЛЕНО: Обновляем только информацию о последних оповещениях без полной перезагрузки данных
        // Это предотвращает ненужные ререндеры всех компонентов
        // Оборачиваем в try-catch, чтобы ошибка загрузки уведомлений не блокировала выполнение
        try {
          await loadLastNotifications();
        } catch (notifError) {
          console.error('[SafetyJournal] Error loading last notifications after sending:', notifError);
          // Не показываем ошибку пользователю - основная операция выполнена успешно
        }
        // Не перезагружаем все данные филиалов - они не изменились после отправки уведомления
      } else {
        let errorMessage = 'Не удалось отправить оповещение';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
          console.error('[SafetyJournal] Notification error:', errorData);
        } catch (jsonError) {
          // Если ответ не является JSON, используем статус
          errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
          console.error('[SafetyJournal] Notification error (non-JSON response):', {
            status: response.status,
            statusText: response.statusText
          });
        }
        notificationSystem.addNotification('Ошибка', errorMessage, 'error');
      }
    } catch (error: any) {
      console.error('[SafetyJournal] Notification request failed:', error);
      // Проверяем тип ошибки для более информативного сообщения
      const errorMessage = error?.message || 
        (error?.name === 'TypeError' && error?.message?.includes('Failed to fetch')
          ? 'Сервер недоступен. Проверьте подключение к сети и убедитесь, что сервер запущен.'
          : 'Ошибка соединения с сервером');
      
      notificationSystem.addNotification('Ошибка', errorMessage, 'error');
    }
  }, [fetchWithAuth]); // УБРАЛИ loadLastNotifications из зависимостей

  // ОПТИМИЗАЦИЯ: Ref для отслеживания, была ли выполнена начальная загрузка
  const initialLoadDoneRef = useRef(false);
  
  // Загружаем данные только при монтировании компонента
  useEffect(() => {
    // ОПТИМИЗАЦИЯ: Загружаем только один раз при монтировании
    if (initialLoadDoneRef.current) return;
    
    if (user && token) {
      loadBranchesWithJournals();
      loadLastNotifications();
      initialLoadDoneRef.current = true;
    }
  }, [user, token]); // УБРАЛИ loadBranchesWithJournals и loadLastNotifications из зависимостей

  // ОПТИМИЗАЦИЯ: Ref для отслеживания предыдущего состояния loading
  const prevLoadingRef = useRef<boolean>(false);
  
  // Предотвращаем сброс позиции скролла при загрузке
  useEffect(() => {
    // ОПТИМИЗАЦИЯ: Сохраняем позицию только при переходе loading: false -> true
    if (loading && !prevLoadingRef.current) {
      // Сохраняем текущую позицию при начале загрузки
      const currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
      if (currentScrollPosition > 0) {
        setScrollPosition(currentScrollPosition);
      }
    }
    
    prevLoadingRef.current = loading;
  }, [loading]);



  // Обработчик загрузки файлов
  const handleUploadFiles = useCallback((journal: SafetyJournal) => {
    setSelectedJournal(journal);
    openFileUpload();
  }, [openFileUpload]);

  // Функция валидации файлов
  const validateFile = useCallback((file: File): { valid: boolean; error?: string } => {
    const maxSize = 50 * 1024 * 1024; //50mb
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.gif'];
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif'
    ];

    if (file.size > maxSize) {
      return { valid: false, error: 'Размер файла не должен превышать 10MB' };
    }

    // Проверяем расширение файла
    const fileName = file.name.toLowerCase();
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
    
    // Проверяем MIME-тип
    const hasValidMimeType = allowedMimeTypes.includes(file.type);

    if (!hasValidExtension && !hasValidMimeType) {
      return { 
        valid: false, 
        error: `Неподдерживаемый тип файла. Разрешены: ${allowedExtensions.join(', ')}` 
      };
    }

    return { valid: true };
  }, []);

  const handleFileUpload = useCallback(async (values: Record<string, any>) => {
    if (!selectedJournal) return;

    setFileUploadLoading(true);
    try {
      // Извлекаем файлы из структуры DynamicFormModal
      const fileAttachments = values.files || [];
      const files = fileAttachments.map((attachment: any) => attachment.source).filter(Boolean);

      if (files.length === 0) {
        notificationSystem.addNotification('Ошибка', 'Не выбрано ни одного файла', 'error');
        return;
      }

      // Валидация файлов
      for (const file of files) {
        const validation = validateFile(file);
        if (!validation.valid) {
          notificationSystem.addNotification('Ошибка', validation.error || 'Неверный файл', 'error');
          return;
        }
      }

      // Используем branch_journal_id вместо journal_id
      const branchJournalId = selectedJournal.branch_journal_id || selectedJournal.journal_id;

      // Если журнал был отклонен, сначала помечаем старые файлы на удаление
      if (selectedJournal.status === 'rejected' && selectedJournal.files && selectedJournal.files.length > 0) {
        const oldFiles = selectedJournal.files.filter(f => !f.is_deleted);
        for (const oldFile of oldFiles) {
          try {
            await fetchWithAuth(`${API}/jurists/safety/files/${oldFile.file_id}`, {
              method: 'DELETE',
            });
          } catch (err) {
            console.error('Error deleting old file:', err);
            // Продолжаем загрузку даже если не удалось удалить старый файл
          }
        }
      }

      // Загружаем файлы параллельно для лучшей производительности
      const uploadPromises = files.map(async (file: File) => {
        const formData = new FormData();
        formData.append('branchJournalId', branchJournalId);
        formData.append('file', file);

        const response = await fetchWithAuth(`${API}/jurists/safety/files/`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Ошибка загрузки файла');
        }

        // Получаем данные загруженного файла из ответа API
        const responseData = await response.json();
        return {
          file_id: responseData.file_id || `temp_${Date.now()}_${Math.random()}`,
          original_filename: responseData.original_filename || file.name,
          content_type: responseData.content_type || file.type,
          is_deleted: false,
          description: responseData.description || '',
          download_url: responseData.download_url || '#',
          view_url: responseData.view_url || '#'
        } as JournalFile;
      });

      // Ждем завершения всех загрузок
      const uploadedFiles = await Promise.all(uploadPromises);

      // Обновляем локальное состояние - добавляем информацию о загруженных файлах и меняем статус
      // Updating local state with uploaded files
      setState(prevState => {
        const newState = {
          ...prevState,
          lastUpdate: Date.now(), // Принудительное обновление
          branches: prevState.branches.map(branch => ({
            ...branch,
            journals: branch.journals.map(j => 
              j.id === selectedJournal.id 
                ? { 
                    ...j, 
                    filled_at: new Date().toISOString(), // Обновляем время заполнения
                    // Обновляем счетчик файлов в зависимости от статуса
                    files_count: j.status === 'rejected' 
                      ? files.length // Для отклоненных журналов считаем только новые файлы
                      : (j.files_count || 0) + files.length, // Для остальных увеличиваем счетчик
                    status: 'under_review' as const, // Автоматически устанавливаем статус "На проверке"
                    // Если журнал был отклонен, помечаем старые файлы на удаление
                    files: j.status === 'rejected' 
                      ? [
                          ...(j.files || []).map(file => ({ ...file, is_deleted: true })), // Помечаем старые файлы на удаление
                          ...uploadedFiles // Добавляем новые файлы
                        ]
                      : [...(j.files || []), ...uploadedFiles] // Обычное добавление файлов
                  } 
                : j
            )
          }))
        };
        // New state after file upload
        return newState;
      });
      
      // Показываем разное уведомление в зависимости от предыдущего статуса
      const previousStatus = selectedJournal.status;
      if (previousStatus === 'rejected') {
        notificationSystem.addNotification(
          'Успех', 
          'Новые файлы загружены. Старые файлы помечены на удаление. Статус изменен на "На проверке"', 
          'success'
        );
      } else {
        notificationSystem.addNotification('Успех', 'Файлы успешно загружены. Статус изменен на "На проверке"', 'success');
      }
      
      // Отправляем статус на сервер после успешной загрузки файлов (для всех пользователей)
      try {
        const formData = new FormData();
        formData.append('status', 'under_review');
        formData.append('decision', 'under_review');
        
        const statusResponse = await fetchWithAuth(`${API}/jurists/safety/branch_journals/${branchJournalId}/decision`, {
          method: 'PATCH',
          body: formData
        });
        
        if (statusResponse.ok) {
          // Status updated to under_review successfully
        } else {
          console.error('Failed to update status:', statusResponse.status);
        }
      } catch (err) {
        console.error('Error updating status to under_review:', err);
      }
      
      closeFileUpload();
      
    } catch (err) {
      notificationSystem.addNotification('Ошибка', 'Ошибка соединения с сервером', 'error');
    } finally {
      setFileUploadLoading(false);
    }
  }, [selectedJournal, fetchWithAuth, closeFileUpload, validateFile]);


  // Функция для просмотра файлов журнала
  const handleViewFiles = useCallback(async (journal: SafetyJournal) => {
    // Opening files for journal
    setSelectedJournal(journal);
    
    if (!journal.filled_at) {
      // No filled_at date for journal
      notificationSystem.addNotification('Информация', 'Для этого журнала пока нет загруженных файлов', 'info');
      return;
    }
    
    // Проверяем, есть ли файлы в данных журнала
    if (journal.files && journal.files.length > 0) {
      // Фильтруем только неудаленные файлы
      const activeFiles = journal.files.filter(file => !file.is_deleted);
      // Active files found
      
      if (activeFiles.length > 0) {
        // Подготавливаем файлы для FilePreviewModal
        // Передаём человекочитаемое имя и тип, а source оставляем относительным путём
        const files = activeFiles.map((file: JournalFile) => ({
          id: file.file_id,
          name: file.original_filename || `Журнал-${file.file_id}`,
          mimeType: file.content_type,
          // Относительный путь, FilePreviewModal сам подставит API при необходимости
          source: `jurists/safety/files/${file.file_id}/view`
        }));
        
        // Setting journal files
        setJournalFiles(files);
        openFileView();
        return;
      }
    }
    
    // Если файлов нет в данных журнала, показываем информационное сообщение
    // No files found in journal data
    notificationSystem.addNotification(
      'Информация', 
      'Для этого журнала пока нет загруженных файлов', 
      'info'
    );
  }, [openFileView]);

  // Функция для удаления файла
  const handleDeleteFile = useCallback(async (fileId: string) => {
    try {
      const response = await fetchWithAuth(`${API}/jurists/safety/files/${fileId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        notificationSystem.addNotification('Успех', 'Файл удален', 'success');
        
        // Обновляем локальное состояние - помечаем файл как удаленный
        setJournalFiles(prevFiles => 
          prevFiles.map(file => 
            file.id === fileId ? { ...file, is_deleted: true } : file
          ).filter(file => !file.is_deleted) // Скрываем удаленные файлы
        );
        
        // Обновляем данные журнала
        setState(prevState => ({
          ...prevState,
          lastUpdate: Date.now(), // Принудительное обновление
          branches: prevState.branches.map(branch => ({
            ...branch,
            journals: branch.journals.map(j => {
              if (j.id === selectedJournal?.id) {
                // Обновляем файлы - помечаем удаленный файл и фильтруем удаленные
                const updatedFiles = j.files?.map(f => 
                  f.file_id === fileId ? { ...f, is_deleted: true } : f
                ).filter(f => !f.is_deleted) || [];
                
                // Обновляем только файлы, статус не меняем при удалении файла
                return {
                  ...j,
                  files: updatedFiles
                  // Статус остается прежним - удаление файла не должно автоматически отклонять журнал
                };
              }
              return j;
            })
          }))
        }));
        
        // Статус не меняется при удалении файла - это правильное поведение

        // Закрываем превью после удаления файла
        closeFileView();
      } else {
        const errorData = await response.json();
        notificationSystem.addNotification('Ошибка', errorData.message || 'Не удалось удалить файл', 'error');
      }
    } catch (err) {
      notificationSystem.addNotification('Ошибка', 'Ошибка соединения с сервером', 'error');
    }
  }, [fetchWithAuth, selectedJournal]);

  // Функция для удаления журнала
  const handleDeleteJournal = useCallback(async () => {
    if (!selectedJournal) return;

    try {
      const branchJournalId = selectedJournal.branch_journal_id || selectedJournal.journal_id;
      const response = await fetchWithAuth(`${API}/jurists/safety/branch_journals/${branchJournalId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        notificationSystem.addNotification('Успех', 'Журнал удален', 'success');
        
        // Обновляем локальное состояние - удаляем журнал
        setState(prevState => ({
          ...prevState,
          branches: prevState.branches.map(branch => ({
            ...branch,
            journals: branch.journals.filter(j => j.id !== selectedJournal.id)
          }))
        }));
        
        // Закрываем модальное окно
        closeFileView();
      } else {
        notificationSystem.addNotification('Ошибка', 'Не удалось удалить журнал', 'error');
      }
    } catch (error) {
      console.error('Error deleting journal:', error);
      notificationSystem.addNotification('Ошибка', 'Ошибка при удалении журнала', 'error');
    }
  }, [selectedJournal, fetchWithAuth, closeFileView]);

  // Функция для открытия чата по филиалу
  const handleOpenChat = useCallback((branchId: string, branchName: string) => {
    // Создаем временный объект журнала для совместимости с модалкой
    // Используем первый журнал филиала или создаем минимальный объект
    const branch = branches.find(b => b.branch_id === branchId);
    const firstJournal = branch?.journals?.[0];
    
    if (firstJournal) {
      setSelectedJournal({
        ...firstJournal,
        branch_id: branchId,
        branch_name: branchName
      });
    } else {
      // Если журналов нет, создаем минимальный объект
      setSelectedJournal({
        id: '',
        journal_id: '',
        journal_title: '',
        journal_type: 'ОТ',
        branch_id: branchId,
        branch_name: branchName,
        status: 'pending',
        filled_at: null,
        approved_at: null,
        period_start: '',
        period_end: ''
      } as SafetyJournal);
    }
    openChat();
  }, [openChat, branches]);

  // Обработчик фильтров

  // Обработчики фильтров филиалов
  const handleRrsFilterChange = useCallback((value: string | null) => {
    setBranchFilters(prev => ({
      ...prev,
      rrs: value || '',
      branch: '' // Сбрасываем фильтр филиала при изменении РРС
    }));
    setBranchPagination(prev => ({ ...prev, page: 1 })); // Сбрасываем на первую страницу
  }, []);

  const handleBranchFilterChange = useCallback((value: string | null) => {
    setBranchFilters(prev => ({
      ...prev,
      branch: value ?? '' // Используем ?? вместо || для правильной обработки пустой строки
    }));
    setBranchPagination(prev => ({ ...prev, page: 1 })); // Сбрасываем на первую страницу
  }, []);

  // ИСПРАВЛЕНО: Ref для хранения таймаута прокрутки
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleBranchPageChange = useCallback((page: number) => {
    // Очищаем предыдущий таймаут, если он существует
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Сохраняем текущую позицию скролла при смене страницы
    const currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    setScrollPosition(currentScrollPosition);
    
    setBranchPagination(prev => ({ ...prev, page }));
    
    // Плавно прокручиваем к началу списка филиалов
    scrollTimeoutRef.current = setTimeout(() => {
      const filtersElement = document.querySelector('[data-sticky-filters]');
      if (filtersElement) {
        filtersElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }
      scrollTimeoutRef.current = null;
    }, 100);
  }, []);

  // Функция для получения иконки файла


  // Списки для фильтров (мемоизированные)
  const rrsOptions = useMemo(() => {
    const uniqueRrs = [...new Set(branches.map(branch => branch.rrs_name))];
    return uniqueRrs.map(rrs => ({ value: rrs, label: rrs }));
  }, [branches]);

  const branchOptions = useMemo(() => {
    const filteredBranches = debouncedFilters.rrs 
      ? branches.filter(branch => branch.rrs_name === debouncedFilters.rrs)
      : branches;
    return filteredBranches.map(branch => ({ 
      value: branch.branch_id, 
      label: branch.branch_name 
    }));
  }, [branches, debouncedFilters.rrs]);

  // Фильтрация филиалов с журналами по вкладкам и фильтрам (используем debounced фильтры)
  const filteredBranches = useMemo(() => {
    let result = branches;
    
    // Применяем фильтры (используем debounced значения)
    if (debouncedFilters.rrs) {
      result = result.filter(branch => branch.rrs_name === debouncedFilters.rrs);
    }
    if (debouncedFilters.branch) {
      result = result.filter(branch => branch.branch_id === debouncedFilters.branch);
    }
    
    // Применяем фильтрацию по вкладкам (если не используются отдельные фильтры)
    const useTabFilter = activeTab !== 'all' && !debouncedFilters.journalType && !debouncedFilters.status;
    
    if (useTabFilter) {
      result = result.map(branch => ({
        ...branch,
        journals: branch.journals.filter(journal => {
          if (activeTab === 'ОТ' || activeTab === 'ПБ') {
            return journal.journal_type === activeTab;
          }
          return journal.status === activeTab;
        })
      })).filter(branch => branch.journals.length > 0);
    } else {
      // Применяем фильтры по виду журнала и состоянию
      result = result.map(branch => ({
        ...branch,
        journals: branch.journals.filter(journal => {
          let matches = true;
          
          // Фильтр по виду журнала
          if (debouncedFilters.journalType) {
            matches = matches && journal.journal_type === debouncedFilters.journalType;
          }
          
          // Фильтр по состоянию
          if (debouncedFilters.status) {
            matches = matches && journal.status === debouncedFilters.status;
          }
          
          return matches;
        })
      })).filter(branch => branch.journals.length > 0);
    }
    
    // Сортировка журналов теперь происходит на backend
    
    return result;
  }, [branches, activeTab, debouncedFilters]);

  // Пагинация филиалов
  const paginatedBranches = useMemo(() => {
    if (filteredBranches.length <= 1) {
      return filteredBranches;
    }
    
    const startIndex = (branchPagination.page - 1) * branchPagination.pageSize;
    const endIndex = startIndex + branchPagination.pageSize;
    return filteredBranches.slice(startIndex, endIndex);
  }, [filteredBranches, branchPagination]);

  const totalPages = useMemo(() => {
    if (filteredBranches.length <= 1) return 1;
    return Math.ceil(filteredBranches.length / branchPagination.pageSize);
  }, [filteredBranches.length, branchPagination.pageSize]);

  // Функция для обновления данных с сохранением состояния текущей страницы
  // ИСПРАВЛЕНО: Используем refs для paginatedBranches и expandedBranches, чтобы избежать зависимости
  const paginatedBranchesRef = useRef<BranchWithJournals[]>([]);
  const expandedBranchesRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    paginatedBranchesRef.current = paginatedBranches;
  }, [paginatedBranches]);
  
  useEffect(() => {
    expandedBranchesRef.current = expandedBranches;
  }, [expandedBranches]);
  
  const handleRefreshData = useCallback(async () => {
    // Сохраняем текущую позицию скролла
    const currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    setScrollPosition(currentScrollPosition);
    
    // ИСПРАВЛЕНО: Используем refs вместо прямых зависимостей
    const currentPageBranches = paginatedBranchesRef.current.map(branch => branch.branch_id);
    const currentPageExpanded = new Set(
      Array.from(expandedBranchesRef.current).filter(branchId => 
        currentPageBranches.includes(branchId)
      )
    );
    
    // Обновляем данные
    await loadBranchesWithJournals();
    
    // Восстанавливаем состояние только для текущей страницы
    setExpandedBranches(currentPageExpanded);
    
    // Восстанавливаем позицию скролла после обновления DOM
    // Используем requestAnimationFrame для более надежного восстановления
    requestAnimationFrame(() => {
      window.scrollTo({
        top: currentScrollPosition,
        behavior: 'instant'
      });
    });
  }, []); // УБРАЛИ loadBranchesWithJournals и loadResponsiblesBatch из зависимостей

  // Устанавливаем заголовок страницы
  // ИСПРАВЛЕНО: Убраны лишние зависимости и мемоизирован icon, чтобы избежать ререндеров
  const headerIcon = useMemo(() => <Text size="xl" fw={700} c="white">🛡️</Text>, []);
  
  useEffect(() => {
    setHeader({
      title: 'Журналы охраны труда и пожарной безопасности',
      subtitle: 'Управление журналами по охране труда и пожарной безопасности',
      icon: headerIcon,
    });

    return () => clearHeader();
  }, [setHeader, clearHeader, headerIcon]);

  // ОПТИМИЗАЦИЯ: Ref для отслеживания предыдущей позиции скролла
  const prevScrollPositionRef = useRef<number>(0);
  const scrollRestoreTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Восстанавливаем позицию скролла после обновления данных
  useEffect(() => {
    // ОПТИМИЗАЦИЯ: Не восстанавливаем, если позиция не изменилась или идет загрузка
    if (scrollPosition === prevScrollPositionRef.current || loading) {
      return;
    }
    
    if (scrollPosition > 0 && !loading) {
      // Очищаем предыдущий таймаут, если он есть
      if (scrollRestoreTimeoutRef.current) {
        clearTimeout(scrollRestoreTimeoutRef.current);
      }
      
      // Простая и надежная логика восстановления
      const restoreScroll = () => {
        window.scrollTo({
          top: scrollPosition,
          behavior: 'instant'
        });
        prevScrollPositionRef.current = scrollPosition;
      };

      // ОПТИМИЗАЦИЯ: Используем один таймаут вместо трех
      scrollRestoreTimeoutRef.current = setTimeout(restoreScroll, 100);

      return () => {
        if (scrollRestoreTimeoutRef.current) {
          clearTimeout(scrollRestoreTimeoutRef.current);
          scrollRestoreTimeoutRef.current = null;
        }
      };
    }
  }, [scrollPosition, loading]);

  // Подсчет статистики для вкладок (мемоизированный с оптимизацией)
  // ИСПРАВЛЕНО: Используем стабильные зависимости, чтобы избежать лишних ререндеров
  // Используем ref для отслеживания предыдущего значения и предотвращения лишних пересчетов
  const prevStatsRef = useRef<{
    hash: string;
    stats: ReturnType<typeof calculateStats>;
  } | null>(null);
  
  const calculateStats = useCallback(() => {
    const totalJournalsCount = branches.reduce((sum, branch) => sum + branch.journals.length, 0);
    
    // Если нет журналов, возвращаем нули
    if (totalJournalsCount === 0) {
      return {
        total: 0,
        labor_protection: 0,
        fire_safety: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        under_review: 0,
      };
    }
    
    const allJournals = branches.flatMap(branch => branch.journals);
    
    // Используем reduce для более эффективного подсчета
    return allJournals.reduce((acc, journal) => {
      acc.total++;
      
      // Подсчет по типам
      if (journal.journal_type === 'ОТ') acc.labor_protection++;
      if (journal.journal_type === 'ПБ') acc.fire_safety++;
      
      // Подсчет по статусам
      if (journal.status === 'pending') acc.pending++;
      if (journal.status === 'approved') acc.approved++;
      if (journal.status === 'rejected') acc.rejected++;
      if (journal.status === 'under_review') acc.under_review++;
      
      return acc;
    }, {
      total: 0,
      labor_protection: 0,
      fire_safety: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      under_review: 0,
    });
  }, [branches]);
  
  const stats = useMemo(() => {
    // ИСПРАВЛЕНО: Убрали зависимость от state.forceUpdate - используем только данные из branches
    // Вычисляем простой хеш для отслеживания изменений без создания новых массивов
    // Используем цикл вместо map для оптимизации
    let hashParts: string[] = [];
    hashParts.push(`${branches.length}`);
    for (const b of branches) {
      const journalStatuses: string[] = [];
      for (const j of b.journals) {
        journalStatuses.push(j.status);
      }
      hashParts.push(`${b.branch_id}:${b.journals.length}:${journalStatuses.join(',')}`);
    }
    const hash = hashParts.join('|');
    
    // Если хеш не изменился, возвращаем предыдущее значение
    if (prevStatsRef.current && prevStatsRef.current.hash === hash) {
      return prevStatsRef.current.stats;
    }
    
    // Пересчитываем статистику
    const newStats = calculateStats();
    prevStatsRef.current = { hash, stats: newStats };
    return newStats;
  }, [branches, calculateStats]);

  if (loading) {
    return (
      <Box style={{ position: 'relative', minHeight: '400px' }}>
        <LoadingOverlay visible={loading} />
      </Box>
    );
  }

  return (
    <DndProviderWrapper>
      <Box
        style={{
          background: 'var(--theme-bg-primary)',
          minHeight: '50vh'
        }}
      >
        {loading && <LoadingOverlay visible />}

      {/* Контент */}
      <Box>
        {/* Закрепленные фильтры - показываем только если филиалов больше одного */}
        {branches.length > 1 && (
        <Box
          data-sticky-filters
          style={{
            position: 'sticky',
            top: '0',
            zIndex: 1,
            background: 'var(--theme-bg-primary)',
            borderBottom: '1px solid var(--theme-border-primary)',
            boxShadow: 'var(--theme-shadow-md)',
            padding: 'var(--space-md)',
          }}
        >
          {/* Зафиксированное меню с вкладками и фильтрами */}
          <Paper withBorder radius="md" p="md" style={{ background: 'var(--theme-bg-elevated)' }}>
          <Stack gap="md">
        {/* Вкладки */}
        <Tabs value={activeTab} onChange={(value) => {setActiveTab(value || 'all'), setBranchPagination( prev => ({ ...prev, page: 1 }))}}>
          <Group justify='space-between'>
          <Tabs.List>
            <Tabs.Tab value="all" leftSection={<IconFileText size={16} />}>
              Все журналы ({stats.total})
            </Tabs.Tab>
                  <Tabs.Tab value="ОТ" leftSection={<IconShield size={16} />}>
              Охрана труда ({stats.labor_protection || 0})
            </Tabs.Tab>
                  <Tabs.Tab value="ПБ" leftSection={<IconFlame size={16} />}>
              Пожарная безопасность ({stats.fire_safety || 0})
            </Tabs.Tab>
            <Tabs.Tab value="pending" leftSection={<IconClock size={16} />}>
              В ожидании файлов ({stats.pending})
            </Tabs.Tab>
                  <Tabs.Tab value="approved" leftSection={<IconCircleCheck size={16} />}>
              Одобрено ({stats.approved})
            </Tabs.Tab>
                  <Tabs.Tab value="rejected" leftSection={<IconCircleX size={16} />}>
              Отклонено ({stats.rejected})
            </Tabs.Tab>
                  <Tabs.Tab value="under_review" leftSection={<IconAlertCircle size={16} />}>
              На проверке ({stats.under_review || 0})
            </Tabs.Tab>
          </Tabs.List>
          <Group gap='sm' wrap="nowrap">
            <SegmentedControl
              value={viewMode}
              onChange={(value) => {
                const newMode = value as 'list' | 'grid';
                setViewMode(newMode);
                // Сохраняем в localStorage для немедленного применения
                try {
                  localStorage.setItem('safety-journal-view-mode', newMode);
                } catch (error) {
                  console.error('Ошибка при сохранении viewMode в localStorage:', error);
                }
              }}
              data={[
                { label: <IconList size={16} />, value: 'list' },
                { label: <IconApps size={16} />, value: 'grid' }
              ]}
              size="sm"
            />
            {/* Фильтры в одном ряду */}
            <Select
              placeholder="РРС"
              data={rrsOptions.sort((a, b) => a.label.localeCompare(b.label))}
              value={branchFilters.rrs || null}
              onChange={handleRrsFilterChange}
              searchable
              clearable
              style={{ minWidth: 150 }}
              leftSection={<IconFilter size={16} />}
            />
            <Select
              placeholder="Филиал"
              data={branchOptions.sort((a, b) => a.label.localeCompare(b.label))}
              value={branchFilters.branch || null}
              onChange={handleBranchFilterChange}
              searchable
              clearable
              style={{ minWidth: 150 }}
            />
            {(branchFilters.rrs || branchFilters.branch) && (
              <Button
                variant="light"
                size="sm"
                onClick={() => {
                  setBranchFilters({ rrs: '', branch: '', journalType: '', status: '' });
                  setBranchPagination({ page: 1, pageSize: 5 });
                }}
              >
                Сбросить
              </Button>
            )}
            <Tooltip label="Оповестить филиалы с не заполненными журналами">
              <ActionIcon 
                variant="outline" 
                size={35} 
                aria-label="Notify unfilled" 
                onClick={handleNotifyUnfilled}
                loading={notifying}
                color="orange"
              >
                <IconBell stroke={1.5} />
              </ActionIcon>
            </Tooltip>
            <ActionIcon variant="outline" size={35} aria-label="Settings" onClick={handleRefreshData}>
              <IconRefresh  stroke={1.5} />
            </ActionIcon>
            <ActionIcon variant="outline" size={35} aria-label="Settings" onClick={qrOpen}>
              <IconQrcode style={{ width: '80%', height: '80%' }} stroke={1.5} />
            </ActionIcon>
          </Group>
          </Group>
        </Tabs>
              
            </Stack>
          </Paper>
          </Box>
        )}


        {/* Ошибка */}
        {error && (
          <Alert color="red" mb="xl">
            {error}
          </Alert>
        )}

        {/* Список филиалов с журналами */}
        {paginatedBranches.length === 0 ? (
          <Paper withBorder radius="md" p="xl" style={{ textAlign: 'center' }}>
            <Stack gap="md" align="center">
              <Box
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: 'var(--theme-bg-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px'
                }}
              >
                🏢
              </Box>
              <Text size="lg" fw={500} style={{ color: 'var(--theme-text-secondary)' }}>
                Филиалы не найдены
              </Text>
              <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
                {activeTab === 'all' ? 'Нет филиалов с журналами для отображения' : 
                 activeTab === 'pending' ? 'Нет филиалов с журналами на рассмотрении' :
                 activeTab === 'approved' ? 'Нет филиалов с одобренными журналами' : 'Нет филиалов с отклоненными журналами'}
              </Text>
            </Stack>
          </Paper>
        ) : (
          viewMode === 'list' ? (
            <Stack gap="lg" ref={branchesContainerRef}>
              {paginatedBranches.map((branch) => (
                <BranchCard
                  key={branch.branch_id}
                  branch={branch}
                  onApproveJournal={handleChangeStatus}
                  onRejectJournal={handleChangeStatus}
                  onViewFile={handleViewFiles}
                  onUploadFiles={handleUploadFiles}
                  onOpenChat={(branchId: string, branchName: string) => handleOpenChat(branchId, branchName)}
                  onNotifyBranch={handleNotifyBranch}
                  onResponsibleChange={() => {}} // ИСПРАВЛЕНО: Убираем вызов refreshBranchesSilently чтобы предотвратить спам
                  canManageStatuses={canManageStatuses}
                  expandedBranches={expandedBranches}
                  setExpandedBranches={setExpandedBranches}
                  lastNotification={lastNotifications[branch.branch_id]}
                  viewMode={viewMode}
                />
              ))}
            </Stack>
          ) : (
            <Grid gutter="md" ref={branchesContainerRef}>
              {paginatedBranches.map((branch) => (
                <Grid.Col key={branch.branch_id} span={{ base: 12, sm: 6, lg: 4, xl: 3 }}>
                  <BranchCard
                    branch={branch}
                    onApproveJournal={handleChangeStatus}
                    onRejectJournal={handleChangeStatus}
                    onViewFile={handleViewFiles}
                    onUploadFiles={handleUploadFiles}
                    onOpenChat={(branchId: string, branchName: string) => handleOpenChat(branchId, branchName)}
                    onNotifyBranch={handleNotifyBranch}
                    onResponsibleChange={() => {}} // ИСПРАВЛЕНО: Убираем вызов refreshBranchesSilently чтобы предотвратить спам
                    canManageStatuses={canManageStatuses}
                    expandedBranches={expandedBranches}
                    setExpandedBranches={setExpandedBranches}
                    lastNotification={lastNotifications[branch.branch_id]}
                    viewMode={viewMode}
                    responsibleData={responsiblesCache[branch.branch_id]}
                    onResponsibleDataChange={(branchId, data) => {
                      setResponsiblesCache(prev => ({ ...prev, [branchId]: data }));
                    }}
                  />
                </Grid.Col>
              ))}
            </Grid>
          )
        )}

        {/* Пагинация филиалов - размещаем под списком филиалов */}
        {filteredBranches.length > 1 && (
          <Box mt="lg" mb="lg">
            <Stack gap="md">
              {/* Селектор количества элементов на странице - слева внизу */}
              <Group gap="md" align="center" justify="flex-start">
                <Text size="sm" c="var(--theme-text-secondary)">
                  Показать на странице:
                </Text>
                <Select
                  value={branchPagination.pageSize.toString()}
                  onChange={(value) => {
                    const newPageSize = parseInt(value || '5');
                    localStorage.setItem('safety-journal-page-size', newPageSize.toString());
                    setBranchPagination(prev => ({
                      ...prev,
                      pageSize: newPageSize,
                      page: 1 // Сбрасываем на первую страницу при изменении размера
                    }));
                  }}
                  data={[
                    { value: '3', label: '3' },
                    { value: '5', label: '5' },
                    { value: '10', label: '10' },
                    { value: '15', label: '15' },
                    { value: '20', label: '20' }
                  ]}
                  size="sm"
                  style={{ width: 80 }}
                />
                <Text size="sm" c="var(--theme-text-tertiary)">
                  из {filteredBranches.length} филиалов
                </Text>
              </Group>

              {/* Пагинация - поднята выше */}
              {totalPages > 1 && (
                <Group justify="flex-start">
                  <Pagination
                    value={branchPagination.page}
                    onChange={handleBranchPageChange}
                    total={totalPages}
                    size="md"
                  />
                </Group>
              )}
            </Stack>
          </Box>
        )}

      </Box>

      {/* Модальные окна - условный рендеринг для оптимизации */}
      {filePreviewOpened && (
      <FilePreviewModal
        opened={filePreviewOpened}
        onClose={closeFilePreview}
        attachments={[]}
        initialIndex={0}
      />
      )}

      {/* Модальное окно для просмотра файлов журнала */}
      {fileViewOpened && (
      <FilePreviewModal
        opened={fileViewOpened}
        onClose={closeFileView}
        attachments={journalFiles}
        initialIndex={0}
        onDeleteFile={handleDeleteFile} // Кнопка удаления доступна всем пользователям
        requireAuth={true} // Для SafetyJournal требуется передача токена
      />
      )}

      {/* Модальное окно для загрузки файлов */}
      {fileUploadOpened && selectedJournal && (
      <DynamicFormModal
        opened={fileUploadOpened}
        onClose={closeFileUpload}
          title={`Загрузка файлов - ${selectedJournal.journal_title}`}
        mode="create"
        fields={[
          {
            name: 'files',
            label: 'Файлы',
            type: 'file',
            required: true,
            withDnd: true,
            accept: "image/png, image/jpeg, image/webp, application/pdf"
          }
        ]}
        initialValues={{ files: [] }}
        onSubmit={handleFileUpload}
        submitButtonText="Загрузить"
        loading={fileUploadLoading}
      />
      )}

      {/* Модальное окно подтверждения удаления журнала */}
      {deleteJournalOpened && selectedJournal && (
      <DynamicFormModal
        opened={deleteJournalOpened}
        onClose={closeDeleteJournal}
          title={`Удаление журнала - ${selectedJournal.journal_title}`}
        mode="delete"
        onConfirm={handleDeleteJournal}
        initialValues={{}}
      />
      )}
      
      {qrOpened && (
      <Modal opened={qrOpened} onClose={qrClose} title="QR-код телеграм бота" centered zIndex={99999} size="auto">
        <Image
          radius="md"
          h={200}
          w="auto"
          fit="contain"
          src={isDark ? tgBotQRImage : tgBotQRImageDark}
        />
      </Modal>
      )}

      {/* Модальное окно чата по филиалу - draggable */}
      {chatOpened && selectedJournal && (
        <ChatModalWithParticipants
          branchName={selectedJournal.branch_name}
          branchId={selectedJournal.branch_id}
          onClose={() => {
            // Устанавливаем флаг намеренного закрытия перед очисткой URL
            chatClosedIntentionallyRef.current = true;
            closeChat();
            // Очищаем параметры URL при закрытии чата
            setSearchParams({});
          }}
          isDark={isDark}
          targetMessageId={targetMessageId || undefined}
          onPreviewFiles={(files, index) => {
            setChatPreviewFiles(files);
            setChatPreviewIndex(index);
            setChatPreviewOpened(true);
          }}
        />
      )}

      {/* Модальное окно предпросмотра файлов из чата - на уровне выше, чтобы не закрывалось при сворачивании */}
      <FilePreviewModal
        opened={chatPreviewOpened}
        onClose={() => setChatPreviewOpened(false)}
        attachments={chatPreviewFiles}
        initialIndex={chatPreviewIndex}
        requireAuth={true}
      />
      </Box>
    </DndProviderWrapper>
  );
}

// Компонент-обертка для передачи участников в DraggableChatModal
function ChatModalWithParticipants({ 
  branchName, 
  branchId, 
  onClose, 
  isDark, 
  onPreviewFiles,
  targetMessageId
}: { 
  branchName: string; 
  branchId: string; 
  onClose: () => void; 
  isDark: boolean; 
  onPreviewFiles: (files: Array<{ id: string; source: File | string; name?: string; mimeType?: string }>, index: number) => void;
  targetMessageId?: string;
}) {
  const getImageSrc = useCallback((image: string | null | undefined): string => {
    if (!image) return '';
    if (image.startsWith('data:')) return image;
    if (image.startsWith('/9j/') || image.startsWith('iVBORw0KGgo') || image.length > 100) {
      const imageType = image.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
      return `data:${imageType};base64,${image}`;
    }
    return image;
  }, []);

  const handleParticipantsChange = useCallback((_newParticipants: Array<{ id: string; name: string; email: string; image: string | null; position: string; branch: string; responsibilityTypes?: string[]; isChecker?: boolean }>) => {
    // Участники обрабатываются внутри SafetyJournalChat
  }, []);

  return (
    <DraggableChatModal
      onClose={onClose}
      isDark={isDark}
    >
      <SafetyJournalChat
        branchId={branchId}
        branchName={branchName}
        onClose={onClose}
        onPreviewFiles={onPreviewFiles}
        onParticipantsChange={handleParticipantsChange}
        getImageSrc={getImageSrc}
        targetMessageId={targetMessageId}
      />
    </DraggableChatModal>
  );
}
