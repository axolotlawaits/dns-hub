import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { useAccessContext } from '../../../hooks/useAccessContext';
import { usePageHeader } from '../../../contexts/PageHeaderContext';
import { notificationSystem } from '../../../utils/Push';
import { Button, Box, LoadingOverlay, Group, ActionIcon, Text, Stack, Paper, Tabs, Alert, Select, Pagination, Accordion, Modal, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconClock, IconFileText, IconFilter, IconShield, IconFlame, IconCircleCheck, IconCircleX, IconAlertCircle, IconRefresh, IconQrcode, IconCalendar } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { FilePreviewModal } from '../../../utils/FilePreviewModal';
import { DynamicFormModal } from '../../../utils/formModal';
import { DndProviderWrapper } from '../../../utils/dnd';
import { type ColumnFiltersState, type SortingState } from '@tanstack/react-table';
import { Image } from '@mantine/core'
import tgBotQRImage from '../../../assets/images/tg_bot_journals.webp'
import tgBotQRImageDark from '../../../assets/images/tg_bot_journals_black.webp'
import { useThemeContext } from '../../../hooks/useThemeContext';
import BranchCard from './BranchCard';

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
  const canManageStatuses = useMemo(() => {
    // SUPERVISOR имеет полный доступ
    if (user?.role === 'SUPERVISOR') {
      return true;
    }
    
    // Проверяем доступ через useAccessContext - только FULL доступ для управления статусами
    return access.some(tool => 
      tool.link === 'jurists/safety' && 
      tool.accessLevel === 'FULL'
    );
  }, [access, user?.role]);

  // Деструктуризация для удобства
  const { branches, loading, error, activeTab } = state;

  // Функции для обновления состояния
  const updateState = useCallback((updates: Partial<typeof state>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const setActiveTab = useCallback((tab: string) => {
    updateState({ activeTab: tab });
  }, [updateState]);
  
  
  // Модальные окна
  const [filePreviewOpened, { close: closeFilePreview }] = useDisclosure(false);
  const [fileUploadOpened, { open: openFileUpload, close: closeFileUpload }] = useDisclosure(false);
  const [fileUploadLoading, setFileUploadLoading] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState<SafetyJournal | null>(null);
  const [journalFiles, setJournalFiles] = useState<any[]>([]);
  const [fileViewOpened, { open: openFileView, close: closeFileView }] = useDisclosure(false);
  const [deleteJournalOpened, { close: closeDeleteJournal }] = useDisclosure(false);
  const [qrOpened, { open: qrOpen, close: qrClose }] = useDisclosure(false)
  
  // Фильтры для филиалов
  const [branchFilters, setBranchFilters] = useState({
    rrs: '',
    branch: '',
    dateStart: '',
    dateEnd: ''
  });
  
  // Пагинация для филиалов
  const [branchPagination, setBranchPagination] = useState(() => {
    const saved = localStorage.getItem('safety-journal-page-size');
    return {
      page: 1,
      pageSize: saved ? parseInt(saved) : 5
    };
  });

  // Состояние для показа фильтров в аккордеоне
  const [showFilters, setShowFilters] = useState(false);
  
  // Состояние для отслеживания развернутых филиалов
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
  
  // Состояние для сохранения позиции скролла
  const [scrollPosition, setScrollPosition] = useState<number>(0);
  
  // Ref для отслеживания контейнера с филиалами
  const branchesContainerRef = useRef<HTMLDivElement>(null);


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
    let response = await fetch(url, {
      ...options,
      headers: {
        ...getAuthHeaders(!options.body || !(options.body instanceof FormData)),
        ...options.headers,
      },
    });

    if (response.status === 401) {
      console.warn('Unauthorized access, attempting to refresh token');
      
      // Попытка обновить токен
      const refreshResponse = await fetch(`${API}/refresh-token`, {
        method: 'POST',
        credentials: 'include'
      });
      
      console.log('Refresh token response status:', refreshResponse.status);

      if (refreshResponse.ok) {
        const newToken = await refreshResponse.json();
        localStorage.setItem('token', newToken);
        console.log('Token refreshed successfully');
        
        // Обновляем токен в контексте
        // Примечание: useUserContext должен автоматически обновить токен из localStorage
        
          // Повторяем запрос с новым токеном
          response = await fetch(url, {
            ...options,
            headers: {
            ...getAuthHeaders(!options.body || !(options.body instanceof FormData)),
              'Authorization': `Bearer ${newToken}`,
              ...options.headers,
            },
          });
        } else {
        console.warn('Token refresh failed, logging out user');
        logout();
        window.location.href = '/login';
      }
    }

    return response;
  }, [token, logout]);

  // Смена статуса журнала (по правам FULL)
  const handleChangeStatus = useCallback(async (journal: SafetyJournal, status: 'approved' | 'rejected' | 'under_review', rejectMessage? : string) => {
    console.log('handleChangeStatus called with:', { journalId: journal.id, status });
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
        console.log('API response OK, updating state...');
        // Обновляем локальное состояние вместо полной перезагрузки
        setState(prevState => {
          console.log('setState called, prevState:', prevState);
          const newState = {
            ...prevState,
            lastUpdate: Date.now(), // Принудительное обновление
            forceUpdate: Date.now(), // Принудительное обновление компонента
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
          };
          console.log('Status updated in state:', newState.branches.find(b => 
            b.journals.some(j => j.id === journal.id)
          )?.journals.find(j => j.id === journal.id)?.status);
          console.log('Force update triggered:', newState.forceUpdate);
          console.log('New state:', newState);
          
          return newState;
        });
        
        notificationSystem.addNotification('Успех', 'Статус обновлен', 'success');
      } else {
        const errorData = await response.json();
        notificationSystem.addNotification('Ошибка', errorData.message || 'Не удалось обновить статус', 'error');
      }
    } catch (err) {
      notificationSystem.addNotification('Ошибка', 'Ошибка соединения с сервером', 'error');
    }
  }, [fetchWithAuth, setState]);

  // Загрузка данных
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
      
      // Получаем филиалы с журналами для текущего пользователя
      const response = await fetchWithAuth(`${API}/jurists/safety/me/branches_with_journals`, {
        method: 'GET',
      });

      if (response.ok) {
        const data = await response.json();
        
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
        }
      } else {
        let errorMessage = 'Ошибка загрузки филиалов с журналами';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (jsonError) {
          // Если не удалось распарсить JSON, используем статус ответа
          if (response.status === 401) {
            errorMessage = 'Сессия истекла или домен изменился. Пожалуйста, войдите в систему заново.';
            // Автоматически выходим из системы при 401
            logout();
            window.location.href = '/login';
          } else if (response.status === 403) {
            errorMessage = 'Доступ запрещен';
          } else if (response.status === 500) {
            errorMessage = 'Внутренняя ошибка сервера';
          }
        }
        updateState({ error: errorMessage, loading: false });
      }
    } catch (err) {
      console.error('Error loading branches with journals:', err);
      updateState({ error: 'Ошибка соединения с сервером', loading: false });
    }
  }, [user, token, fetchWithAuth, updateState, logout]);

  // Загружаем данные только при монтировании компонента
  useEffect(() => {
    loadBranchesWithJournals();
  }, []); // Убираем зависимости, чтобы избежать самопроизвольных перезагрузок

  // Предотвращаем сброс позиции скролла при загрузке
  useEffect(() => {
    if (loading) {
      // Сохраняем текущую позицию при начале загрузки
      const currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
      if (currentScrollPosition > 0) {
        setScrollPosition(currentScrollPosition);
      }
    }
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

      // Загружаем файлы по одному, так как API принимает только один файл за раз
      const uploadedFiles: JournalFile[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('branchJournalId', branchJournalId);
        formData.append('file', file);

        const response = await fetchWithAuth(`${API}/jurists/safety/files/`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          notificationSystem.addNotification('Ошибка', errorData.message || 'Ошибка загрузки файла', 'error');
          return;
        }

        // Получаем данные загруженного файла из ответа API
        const responseData = await response.json();
        const uploadedFile: JournalFile = {
          file_id: responseData.file_id || `temp_${Date.now()}_${Math.random()}`,
          original_filename: responseData.original_filename || file.name,
          content_type: responseData.content_type || file.type,
          is_deleted: false,
          description: responseData.description || '',
          download_url: responseData.download_url || '#',
          view_url: responseData.view_url || '#'
        };
        uploadedFiles.push(uploadedFile);
      }

      // Обновляем локальное состояние - добавляем информацию о загруженных файлах и меняем статус
      console.log('Updating local state with uploaded files:', uploadedFiles);
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
        console.log('New state after file upload:', newState);
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
          console.log('Status updated to under_review successfully');
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
    console.log('Opening files for journal:', journal.journal_title, journal.files);
    setSelectedJournal(journal);
    
    if (!journal.filled_at) {
      console.log('No filled_at date for journal');
      notificationSystem.addNotification('Информация', 'Для этого журнала пока нет загруженных файлов', 'info');
      return;
    }
    
    // Проверяем, есть ли файлы в данных журнала
    if (journal.files && journal.files.length > 0) {
      // Фильтруем только неудаленные файлы
      const activeFiles = journal.files.filter(file => !file.is_deleted);
      console.log('Active files:', activeFiles);
      
      if (activeFiles.length > 0) {
        // Используем прокси бэкенда, чтобы обойти CORS и ускорить типизацию
        const files = activeFiles.map((file: JournalFile) => ({
          id: file.file_id,
          name: file.original_filename,
          mimeType: file.content_type,
          source: `${API}/jurists/safety/files/${file.file_id}/view`
        }));
        
        console.log('Setting journal files:', files);
        setJournalFiles(files);
        openFileView();
        return;
      }
    }
    
    // Если файлов нет в данных журнала, показываем информационное сообщение
    console.log('No files found in journal data');
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
      branch: value || ''
    }));
    setBranchPagination(prev => ({ ...prev, page: 1 })); // Сбрасываем на первую страницу
  }, []);

  const handleDateStartChange = useCallback((value: string) => {
    setBranchFilters(prev => ({
      ...prev,
      dateStart: value || ''
    }));
    setBranchPagination(prev => ({ ...prev, page: 1 })); // Сбрасываем на первую страницу
  }, []);

  const handleDateEndChange = useCallback((value: string) => {
    setBranchFilters(prev => ({
      ...prev,
      dateEnd: value || ''
    }));
    setBranchPagination(prev => ({ ...prev, page: 1 })); // Сбрасываем на первую страницу
  }, []);

  const handleBranchPageChange = useCallback((page: number) => {
    // Сохраняем текущую позицию скролла при смене страницы
    const currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    setScrollPosition(currentScrollPosition);
    
    setBranchPagination(prev => ({ ...prev, page }));
    
    // Плавно прокручиваем к началу списка филиалов
    setTimeout(() => {
      const filtersElement = document.querySelector('[data-sticky-filters]');
      if (filtersElement) {
        filtersElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }
    }, 100);
  }, []);

  // Функция для получения иконки файла


  // Списки для фильтров (мемоизированные)
  const rrsOptions = useMemo(() => {
    const uniqueRrs = [...new Set(branches.map(branch => branch.rrs_name))];
    return uniqueRrs.map(rrs => ({ value: rrs, label: rrs }));
  }, [branches]);

  const branchOptions = useMemo(() => {
    const filteredBranches = branchFilters.rrs 
      ? branches.filter(branch => branch.rrs_name === branchFilters.rrs)
      : branches;
    return filteredBranches.map(branch => ({ 
      value: branch.branch_id, 
      label: branch.branch_name 
    }));
  }, [branches, branchFilters.rrs]);

  // Фильтрация филиалов с журналами по вкладкам и фильтрам
  const filteredBranches = useMemo(() => {
    let result = branches;
    
    // Применяем фильтры
    if (branchFilters.rrs) {
      result = result.filter(branch => branch.rrs_name === branchFilters.rrs);
    }
    if (branchFilters.branch) {
      result = result.filter(branch => branch.branch_id === branchFilters.branch);
    }
    
    // Применяем фильтрацию по датам периода журнала (ориентируемся только на начало периода)
    if (branchFilters.dateStart || branchFilters.dateEnd) {
      const filterStart = branchFilters.dateStart ? dayjs(branchFilters.dateStart).startOf('day') : null;
      const filterEnd = branchFilters.dateEnd ? dayjs(branchFilters.dateEnd).endOf('day') : null;
      
      result = result.map(branch => ({
        ...branch,
        journals: branch.journals.filter(journal => {
          // Пропускаем журналы без начала периода
          if (!journal.period_start) return false;
          
          const periodStart = dayjs(journal.period_start).startOf('day');
          
          // Фильтрация по началу периода журнала (period_start)
          if (filterStart && filterEnd) {
            // Если указаны обе даты фильтра, проверяем попадает ли начало периода в диапазон
            return (periodStart.isAfter(filterStart) || periodStart.isSame(filterStart)) &&
                   (periodStart.isBefore(filterEnd) || periodStart.isSame(filterEnd));
          } else if (filterStart) {
            // Если указана только начальная дата фильтра
            // Показываем журналы, начало периода которых >= даты фильтра
            return periodStart.isAfter(filterStart) || periodStart.isSame(filterStart);
          } else if (filterEnd) {
            // Если указана только конечная дата фильтра
            // Показываем журналы, начало периода которых <= даты фильтра
            return periodStart.isBefore(filterEnd) || periodStart.isSame(filterEnd);
          }
          
          return true;
        })
      })).filter(branch => branch.journals.length > 0); // Скрываем филиалы без журналов
    }
    
    // Применяем фильтрацию по вкладкам
    if (activeTab !== 'all') {
      result = result.map(branch => ({
      ...branch,
      journals: branch.journals.filter(journal => {
        if (activeTab === 'ОТ' || activeTab === 'ПБ') {
          return journal.journal_type === activeTab;
        }
        return journal.status === activeTab;
      })
    })).filter(branch => branch.journals.length > 0); // Скрываем филиалы без журналов
    }
    
    // Сортировка журналов теперь происходит на backend
    
    return result;
  }, [branches, activeTab, branchFilters, state.forceUpdate]);

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
  const handleRefreshData = useCallback(async () => {
    // Сохраняем текущую позицию скролла
    const currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    setScrollPosition(currentScrollPosition);
    
    // Сохраняем состояние только для филиалов на текущей странице
    const currentPageBranches = paginatedBranches.map(branch => branch.branch_id);
    const currentPageExpanded = new Set(
      Array.from(expandedBranches).filter(branchId => 
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
  }, [paginatedBranches, expandedBranches, loadBranchesWithJournals]);

  // Устанавливаем заголовок страницы
  useEffect(() => {
    setHeader({
      title: 'Журналы охраны труда и пожарной безопасности',
      subtitle: 'Управление журналами по охране труда и пожарной безопасности',
      icon: <Text size="xl" fw={700} c="white">🛡️</Text>,
    });

    return () => clearHeader();
  }, [setHeader, clearHeader, handleRefreshData, loading]);

  // Восстанавливаем позицию скролла после обновления данных
  useEffect(() => {
    if (scrollPosition > 0 && !loading) {
      // Простая и надежная логика восстановления
      const restoreScroll = () => {
        window.scrollTo({
          top: scrollPosition,
          behavior: 'instant'
        });
      };

      // Пробуем восстановить позицию несколько раз с разными задержками
      const timeouts = [
        setTimeout(restoreScroll, 50),
        setTimeout(restoreScroll, 150),
        setTimeout(restoreScroll, 300)
      ];

      return () => {
        timeouts.forEach(clearTimeout);
      };
    }
  }, [scrollPosition, loading]);

  // Подсчет статистики для вкладок (мемоизированный с оптимизацией)
  const stats = useMemo(() => {
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
  }, [branches, state.forceUpdate]);

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
      <Box p="xl">
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
            marginBottom: '32px'
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
          <Group gap='sm'>
            <ActionIcon variant="outline" size={35} aria-label="Settings" onClick={handleRefreshData}>
              <IconRefresh  stroke={1.5} />
            </ActionIcon>
            <ActionIcon variant="outline" size={35} aria-label="Settings" onClick={qrOpen}>
              <IconQrcode style={{ width: '80%', height: '80%' }} stroke={1.5} />
            </ActionIcon>
          </Group>
          </Group>
        </Tabs>

              {/* Фильтры в аккордеоне */}
              <Accordion
                value={showFilters ? 'filters' : null}
                onChange={(value) => setShowFilters(value === 'filters')}
                styles={{
                  control: {
                    minHeight: '10px',
                    '&:hover': {
                      backgroundColor: 'var(--theme-bg-secondary)',
                    },
                  },
                  content: {
                    padding: '0 12px 12px 12px',
                  },
                  item: {
                    marginBottom: '0',
                  },
                }}
              >
                <Accordion.Item value="filters">
                  <Accordion.Control>
                    <Group gap="md" align="center">
                      <IconFilter size={20} />
                      <Text  fw={600}>Фильтры</Text>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Group gap="md" align="end">
                      <Select
                        label="РРС"
                        placeholder="Выберите РРС"
                        data={rrsOptions.sort((a, b) => a.label.localeCompare(b.label))}
                        value={branchFilters.rrs}
                        onChange={handleRrsFilterChange}
                        searchable
                        clearable
                        style={{ minWidth: 200 }}
                      />
                      <Select
                        label="Филиал"
                        placeholder="Выберите филиал"
                        data={branchOptions.sort((a, b) => a.label.localeCompare(b.label))}
                        value={branchFilters.branch}
                        onChange={handleBranchFilterChange}
                        searchable
                        clearable
                        style={{ minWidth: 200 }}
                      />
                      <TextInput
                        type="date"
                        label="Период с"
                        placeholder="Начало периода"
                        value={branchFilters.dateStart}
                        onChange={(e) => handleDateStartChange(e.target.value)}
                        leftSection={<IconCalendar size={16} />}
                        style={{ minWidth: 180 }}
                      />
                      <TextInput
                        type="date"
                        label="Период по"
                        placeholder="Конец периода"
                        value={branchFilters.dateEnd}
                        onChange={(e) => handleDateEndChange(e.target.value)}
                        leftSection={<IconCalendar size={16} />}
                        style={{ minWidth: 180 }}
                      />
                      <Button
                        variant="light"
                        onClick={() => {
                          setBranchFilters({ rrs: '', branch: '', dateStart: '', dateEnd: '' });
                          setBranchPagination({ page: 1, pageSize: 5 });
                        }}
                      >
                        Сбросить
                      </Button>
                    </Group>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
              
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
          <Stack gap="lg" ref={branchesContainerRef}>
            {paginatedBranches.map((branch) => (
              <BranchCard
                key={branch.branch_id}
                updateState={updateState}
                branch={branch}
                onApproveJournal={(journal) => handleChangeStatus(journal, 'approved')}
                onRejectJournal={handleChangeStatus}
                onViewFile={handleViewFiles}
                onUploadFiles={handleUploadFiles}
                forceUpdate={state.forceUpdate}
                canManageStatuses={canManageStatuses}
                expandedBranches={expandedBranches}
                setExpandedBranches={setExpandedBranches}
              />
            ))}
          </Stack>
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

      {/* Модальные окна */}
      <FilePreviewModal
        opened={filePreviewOpened}
        onClose={closeFilePreview}
        attachments={[]}
        initialIndex={0}
      />

      {/* Модальное окно для просмотра файлов журнала */}
      <FilePreviewModal
        opened={fileViewOpened}
        onClose={closeFileView}
        attachments={journalFiles}
        initialIndex={0}
        onDeleteFile={handleDeleteFile} // Кнопка удаления доступна всем пользователям
        requireAuth={true} // Для SafetyJournal требуется передача токена
      />

      {/* Модальное окно для загрузки файлов */}
      <DynamicFormModal
        opened={fileUploadOpened}
        onClose={closeFileUpload}
        title={`Загрузка файлов - ${selectedJournal?.journal_title || ''}`}
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

      {/* Модальное окно подтверждения удаления журнала */}
      <DynamicFormModal
        opened={deleteJournalOpened}
        onClose={closeDeleteJournal}
        title={`Удаление журнала - ${selectedJournal?.journal_title || ''}`}
        mode="delete"
        onConfirm={handleDeleteJournal}
        initialValues={{}}
      />
      <Modal opened={qrOpened} onClose={qrClose} title="QR-код телеграм бота" centered zIndex={99999} size="auto">
        <Image
          radius="md"
          h={200}
          w="auto"
          fit="contain"
          src={isDark ? tgBotQRImage : tgBotQRImageDark}
        />
      </Modal>
      </Box>
    </DndProviderWrapper>
  );
}
