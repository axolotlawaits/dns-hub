import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { useAccessContext } from '../../../hooks/useAccessContext';
import { notificationSystem } from '../../../utils/Push';
import { Button, Title, Box, LoadingOverlay, Group, ActionIcon, Text, Stack, Paper, Badge, Tabs, Tooltip, Alert, Divider, Select, Flex, Pagination, Popover } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { IconEye, IconClock, IconBell, IconFileText, IconChevronDown, IconChevronUp, IconUpload, IconFilter, IconShield, IconFlame, IconCircleCheck, IconCircleX, IconAlertCircle, IconUsers, IconHelp, IconMaximize, IconMinimize } from '@tabler/icons-react';
import { FilePreviewModal } from '../../../utils/FilePreviewModal';
import { TableComponent } from '../../../utils/table';
import { DynamicFormModal } from '../../../utils/formModal';
import { FilterGroup } from '../../../utils/filter';
import { formatName } from '../../../utils/format';
import { DndProviderWrapper } from '../../../utils/dnd';
import { type ColumnDef, type ColumnFiltersState, type SortingState, type OnChangeFn } from '@tanstack/react-table';

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
  journal_type: 'labor_protection' | 'fire_safety';
  branch_id: string;
  branch_name: string;
  status: 'approved' | 'pending' | 'rejected' | 'under_review';
  filled_at: string | null;
  approved_at: string | null;
  period_start: string;
  period_end: string;
  files?: JournalFile[]; // Массив файлов журнала
  files_count?: number; // Количество файлов для журнала
  is_current?: boolean; // Флаг актуальности журнала в текущем периоде
}

type SafetyJournal = JournalInfo;
type Branch = BranchWithJournals;


// Константы для статусов журналов
const JOURNAL_STATUS = {
  approved: { label: 'Одобрен', icon: IconCircleCheck, color: 'green' },
  pending: { label: 'На рассмотрении', icon: IconClock, color: 'yellow' },
  rejected: { label: 'Отклонен', icon: IconCircleX, color: 'red' },
  under_review: { label: 'На проверке', icon: IconAlertCircle, color: 'blue' }
};


// Стили для оптимизации рендеринга
const STYLES = {
  branchIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px'
  },
  buttonHover: {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
    }
  }
} as const;

// Компонент карточки филиала с журналами (мемоизированный)
  const BranchCard = React.memo(function BranchCard({ 
    branch, 
    onApproveJournal, 
    onRejectJournal, 
    onViewFile,
    createJournalColumns,
    columnFilters,
    sorting,
    setColumnFilters,
    setSorting
  }: { 
    branch: Branch;
    onApproveJournal: (journal: SafetyJournal) => void;
    onRejectJournal: (journal: SafetyJournal) => void;
    onViewFile: (journal: SafetyJournal) => void;
    createJournalColumns: (onApprove: (journal: SafetyJournal) => void, onReject: (journal: SafetyJournal) => void, onViewFile: (journal: SafetyJournal) => void, onUploadFiles: (journal: SafetyJournal) => void) => ColumnDef<SafetyJournal>[];
    columnFilters: ColumnFiltersState;
    sorting: SortingState;
    setColumnFilters: OnChangeFn<ColumnFiltersState>;
    setSorting: OnChangeFn<SortingState>;
  }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Paper withBorder radius="md" p="lg" style={{ background: 'var(--theme-bg-primary)' }}>
      <Stack gap="md">
        {/* Заголовок филиала */}
        <Group justify="space-between" align="center">
          <Group gap="md">
                  <Box style={STYLES.branchIcon}>
              🏢
            </Box>
            <Stack gap="xs">
              <Text size="lg" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
                {branch.branch_name}
              </Text>
              <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
                {branch.branch_address}
              </Text>
              <Group gap="xs">
                <Badge size="sm" variant="outline" color="blue">
                  {branch.rrs_name}
                </Badge>
                <Badge size="sm" variant="outline" color="gray">
                  {branch.journals.length} журналов
                </Badge>
                <Popover width={300} position="bottom" withArrow shadow="md">
                  <Popover.Target>
                    <Tooltip label="Ответственные по ПБ и ОТ">
                      <ActionIcon
                        size="sm"
                        variant="outline"
                        color="blue"
                        style={{ cursor: 'pointer' }}
                      >
                        <IconUsers size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <Stack gap="sm">
                      <Text size="sm" fw={600}>Ответственные</Text>
                      <Divider />
                      <Stack gap="xs">
                        <Text size="xs" fw={500} c="blue">По пожарной безопасности:</Text>
                        <Text size="xs" c="dimmed">Информация будет добавлена</Text>
                      </Stack>
                      <Stack gap="xs">
                        <Text size="xs" fw={500} c="green">По охране труда:</Text>
                        <Text size="xs" c="dimmed">Информация будет добавлена</Text>
                      </Stack>
                    </Stack>
                  </Popover.Dropdown>
                </Popover>
              </Group>
            </Stack>
          </Group>
            <Button
              size="sm"
              leftSection={isExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
              onClick={() => setIsExpanded(!isExpanded)}
              variant="outline"
            >
              {isExpanded ? 'Свернуть' : 'Развернуть'}
            </Button>
        </Group>

        {/* Список журналов */}
        {isExpanded && (
          <Box>
            <Divider mb="md" />
            {branch.journals.length === 0 ? (
              <Text size="sm" style={{ color: 'var(--theme-text-secondary)', textAlign: 'center', padding: '1rem' }}>
                Нет журналов в этом филиале
              </Text>
            ) : (
                     <TableComponent
                       key={`${branch.branch_id}-${branch.journals.length}-${branch.journals.map(j => j.status).join(',')}`}
                       data={branch.journals}
                       columns={createJournalColumns(onApproveJournal, onRejectJournal, onViewFile, () => {})}
                       columnFilters={columnFilters}
                       sorting={sorting}
                       onColumnFiltersChange={setColumnFilters}
                       onSortingChange={setSorting}
                     />
            )}
          </Box>
        )}
      </Stack>
    </Paper>
  );
}, (prevProps, nextProps) => {
  // Мемоизация: перерендерим только если изменились ключевые данные
  return (
    prevProps.branch.branch_id === nextProps.branch.branch_id &&
    prevProps.branch.journals.length === nextProps.branch.journals.length &&
    prevProps.columnFilters === nextProps.columnFilters &&
    prevProps.sorting === nextProps.sorting
  );
});

// Основной компонент
export default function SafetyJournal() {
  const { user, token, logout } = useUserContext();
  const { access } = useAccessContext();
  
  // Объединенное состояние для лучшей производительности
  const [state, setState] = useState({
    branches: [] as BranchWithJournals[],
    loading: true,
    error: null as string | null,
    activeTab: 'all' as string,
    userInfo: null as UserInfo | null,
    tableState: {
      columnFilters: [] as ColumnFiltersState,
      sorting: [] as SortingState
    }
  });

  // Мемоизированная проверка доступа к управлению статусами
  const canManageStatuses = useMemo(() => {
    // Проверяем доступ только через useAccessContext
    return access.some(tool => tool.link === 'jurists/safety' && tool.accessLevel === 'FULL');
  }, [access]);

  // Деструктуризация для удобства
  const { branches, loading, error, activeTab, userInfo, tableState } = state;
  const { columnFilters, sorting } = tableState;

  // Функции для обновления состояния
  const updateState = useCallback((updates: Partial<typeof state>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const updateTableState = useCallback((updates: Partial<typeof tableState>) => {
    setState(prev => ({
      ...prev,
      tableState: { ...prev.tableState, ...updates }
    }));
  }, []);

  const setColumnFilters = useCallback((updaterOrValue: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState)) => {
    const filters = typeof updaterOrValue === 'function' ? updaterOrValue(columnFilters) : updaterOrValue;
    updateTableState({ columnFilters: filters });
  }, [updateTableState, columnFilters]);

  const setSorting = useCallback((updaterOrValue: SortingState | ((old: SortingState) => SortingState)) => {
    const sort = typeof updaterOrValue === 'function' ? updaterOrValue(sorting) : updaterOrValue;
    updateTableState({ sorting: sort });
  }, [updateTableState, sorting]);

  const setActiveTab = useCallback((tab: string) => {
    updateState({ activeTab: tab });
  }, [updateState]);
  
  
  // Модальные окна
  const [filePreviewOpened, { close: closeFilePreview }] = useDisclosure(false);
  const [fileUploadOpened, { open: openFileUpload, close: closeFileUpload }] = useDisclosure(false);
  const [selectedJournal, setSelectedJournal] = useState<SafetyJournal | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [journalFiles, setJournalFiles] = useState<any[]>([]);
  const [fileViewOpened, { open: openFileView, close: closeFileView }] = useDisclosure(false);
  
  // Фильтры для филиалов
  const [branchFilters, setBranchFilters] = useState({
    rrs: '',
    branch: ''
  });
  
  // Пагинация для филиалов
  const [branchPagination, setBranchPagination] = useState({
    page: 1,
    pageSize: 5
  });

  // Состояние для прилипающих фильтров
  const [isFiltersSticky, setIsFiltersSticky] = useState(false);

  // Состояние для скрытия футера и хедера
  const [isFullscreen, setIsFullscreen] = useState(false);

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
  const handleChangeStatus = useCallback(async (journal: SafetyJournal, status: 'approved' | 'rejected' | 'under_review') => {
    try {
      const response = await fetchWithAuth(`${API}/jurists/safety/branch_journals/${journal.id}/decision`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        // Обновляем локальное состояние вместо полной перезагрузки
        setState(prevState => ({
          ...prevState,
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
        
        // Принудительно обновляем состояние для немедленного отображения изменений
        setTimeout(() => {
          setState(prevState => ({ ...prevState }));
        }, 100);
      } else {
        const errorData = await response.json();
        notificationSystem.addNotification('Ошибка', errorData.message || 'Не удалось обновить статус', 'error');
      }
    } catch (err) {
      notificationSystem.addNotification('Ошибка', 'Ошибка соединения с сервером', 'error');
    }
  }, [fetchWithAuth]);

  // Создание колонок для таблицы журналов (мемоизированное)
  const createJournalColumns = useCallback((
    _onApprove: (journal: SafetyJournal) => void,
    _onReject: (journal: SafetyJournal) => void,
    onViewFile: (journal: SafetyJournal) => void,
    onUploadFiles: (journal: SafetyJournal) => void
  ): ColumnDef<SafetyJournal>[] => {
    const baseColumns: ColumnDef<SafetyJournal>[] = [
    {
      id: 'journal_title',
      header: 'Журнал',
      accessorKey: 'journal_title',
      cell: ({ getValue }) => {
        const title = getValue() as string;
        return (
          <Text size="sm" fw={500}>
            {title}
          </Text>
        );
      },
      size: 300,
    },
    {
      id: 'status',
      header: 'Статус',
      accessorKey: 'status',
      cell: ({ getValue }) => {
        const status = getValue() as string;
        const statusInfo = JOURNAL_STATUS[status as keyof typeof JOURNAL_STATUS];
        const IconComponent = statusInfo?.icon;
        return (
          <Group gap="xs" align="center">
            {IconComponent && <IconComponent size={16} color={`var(--mantine-color-${statusInfo?.color}-6)`} />}
            <Text size="sm">{statusInfo?.label}</Text>
          </Group>
        );
      },
      size: 120,
    },
    {
      id: 'last_check',
      header: 'Дата последней проверки',
      accessorKey: 'filled_at',
      cell: ({ getValue }) => {
        const filledAt = getValue() as string | null;
        const lastCheck = filledAt ? dayjs(filledAt).format('YYYY-MM-DD') : '-';
        return (
          <Text size="sm" c="dimmed">
            {lastCheck}
          </Text>
        );
      },
      size: 180,
    },
    {
      id: 'next_check',
      header: 'Дата следующей проверки',
      accessorKey: 'period_end',
      cell: ({ getValue }) => {
        const periodEnd = getValue() as string;
        const nextCheck = dayjs(periodEnd).format('YYYY-MM-DD');
        return (
          <Text size="sm" c="dimmed">
            {nextCheck}
          </Text>
        );
      },
      size: 180,
    },
    {
      id: 'last_notification',
      header: 'Последнее уведомление',
      accessorKey: 'filled_at',
      cell: ({ getValue }) => {
        const filledAt = getValue() as string | null;
        const lastNotification = filledAt ? dayjs(filledAt).format('YYYY-MM-DD') : '2025-06-01';
        return (
          <Text size="sm" c="dimmed">
            {lastNotification}
          </Text>
        );
      },
      size: 180,
    },
    {
      id: 'file_verification',
      header: 'Файл для проверки',
      cell: ({ row }) => {
        const journal = row.original;
        const hasFiles = journal.filled_at !== null && journal.files && journal.files.length > 0;
        const activeFilesCount = journal.files ? journal.files.filter(f => !f.is_deleted).length : 0;
        const deletedFilesCount = journal.files ? journal.files.filter(f => f.is_deleted).length : 0;
        
        return (
          <Group gap="xs" align="center">
            {hasFiles && activeFilesCount > 0 ? (
              <Tooltip label={
                deletedFilesCount > 0 
                  ? `Просмотреть файлы (${activeFilesCount} активных, ${deletedFilesCount} помечены на удаление)`
                  : `Просмотреть файлы (${activeFilesCount})`
              }>
                <ActionIcon
                  size="sm"
                  color="blue"
                  variant="light"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewFile(journal);
                  }}
                >
                  <IconEye size={16} />
                </ActionIcon>
              </Tooltip>
            ) : (
              <Tooltip label="Загрузить файлы">
                <ActionIcon
                  size="sm"
                  color="gray"
                  variant="light"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUploadFiles(journal);
                  }}
                >
                  <IconUpload size={16} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        );
      },
      size: 120,
    },
    ];

    // Добавляем колонку управления статусом только для пользователей с полным доступом
    if (canManageStatuses) {
      baseColumns.push({
        id: 'interaction',
        header: 'Управление статусом',
        accessorKey: 'status',
        cell: ({ row }) => {
          const journal = row.original;
          
          // Проверяем наличие файлов для журнала
          const hasFiles = journal.filled_at !== null && journal.files && journal.files.length > 0;
          const activeFilesCount = journal.files ? journal.files.filter(f => !f.is_deleted).length : 0;
          
          // Если нет файлов, показываем сообщение
          if (!hasFiles || activeFilesCount === 0) {
            return (
              <Group gap="xs" align="center">
                <Text size="xs" c="dimmed">
                  Загрузите файлы
                </Text>
              </Group>
            );
          }
          
          return (
            <Group gap="xs" align="center">
              <Tooltip label="Одобрить">
                <ActionIcon 
                  size="sm" 
                  color="green" 
                  variant={journal.status === 'approved' ? 'filled' : 'light'} 
                  onClick={(e) => { e.stopPropagation(); handleChangeStatus(journal, 'approved'); }}
                >
                  <IconCircleCheck size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Отклонить">
                <ActionIcon 
                  size="sm" 
                  color="red" 
                  variant={journal.status === 'rejected' ? 'filled' : 'light'} 
                  onClick={(e) => { e.stopPropagation(); handleChangeStatus(journal, 'rejected'); }}
                >
                  <IconCircleX size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="На проверке">
                <ActionIcon 
                  size="sm" 
                  color="blue" 
                  variant={journal.status === 'under_review' ? 'filled' : 'light'} 
                  onClick={(e) => { e.stopPropagation(); handleChangeStatus(journal, 'under_review'); }}
                >
                  <IconAlertCircle size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          );
        },
        size: 200,
      });
    }

    return baseColumns;
  }, [canManageStatuses, handleChangeStatus]);

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
        updateState({ 
          branches: data.branches || [], 
          userInfo, 
          loading: false 
        });
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

  // Отслеживание скролла для прилипающих фильтров
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      setIsFiltersSticky(scrollTop > 200); // Прилипают после 200px скролла
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Управление скрытием футера и хедера SafetyJournal
  useEffect(() => {
    const footer = document.querySelector('footer');
    
    if (isFullscreen) {
      if (footer) footer.style.display = 'none';
      document.body.style.overflow = 'hidden';
    } else {
      if (footer) footer.style.display = '';
      document.body.style.overflow = '';
    }

    return () => {
      if (footer) footer.style.display = '';
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  // Обработчики (мемоизированные) - удалены старые функции, используется handleChangeStatus

  // Обработчик загрузки файлов
  const handleUploadFiles = useCallback((journal: SafetyJournal) => {
    setSelectedJournal(journal);
    openFileUpload();
  }, [openFileUpload]);

  // Функция валидации файлов
  const validateFile = useCallback((file: File): { valid: boolean; error?: string } => {
    const maxSize = 10 * 1024 * 1024; // 10MB
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
      
      // Принудительно обновляем состояние для немедленного отображения изменений
      setTimeout(() => {
        setState(prevState => ({ ...prevState }));
      }, 100);
      
      // Дополнительное принудительное обновление через 200ms
      setTimeout(() => {
        setState(prevState => ({ ...prevState }));
      }, 200);
      
      // Сначала обновляем статус журнала на "under_review"
      try {
        // Используем FormData как в других местах кода
        const formData = new FormData();
        formData.append('status', 'under_review');
        formData.append('decision', 'under_review');
        
        const statusResponse = await fetchWithAuth(`${API}/jurists/safety/branch_journals/${branchJournalId}/decision`, {
          method: 'PATCH',
          body: formData
        });
        
        if (statusResponse.ok) {
          console.log('Status updated to under_review successfully');
          
          // Ждем немного, чтобы backend успел обновить данные
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Теперь обновляем данные с сервера для получения актуальной информации
          const response = await fetchWithAuth(`${API}/jurists/safety/me/branches_with_journals`, {
            method: 'GET',
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log('Refreshed data from server after status update:', data);
            
            // Проверяем, изменился ли статус конкретного журнала
            const updatedJournal = data.branches
              ?.flatMap((branch: any) => branch.journals)
              ?.find((journal: any) => journal.id === selectedJournal.id);
            
            if (updatedJournal) {
              console.log('Updated journal status:', updatedJournal.status);
              console.log('Updated journal files:', updatedJournal.files);
            }
            
            setState(prevState => ({
              ...prevState,
              branches: data.branches || prevState.branches
            }));
          }
        } else {
          console.error('Failed to update status:', statusResponse.status);
        }
      } catch (err) {
        console.error('Error updating status to under_review:', err);
      }
      
      closeFileUpload();
    } catch (err) {
      notificationSystem.addNotification('Ошибка', 'Ошибка соединения с сервером', 'error');
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
          name: journal.journal_title,
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
        
        // Принудительно обновляем состояние для немедленного отображения изменений
        setTimeout(() => {
          setState(prevState => ({ ...prevState }));
        }, 100);
        
        // Обновляем локальное состояние - помечаем файл как удаленный
        setJournalFiles(prevFiles => 
          prevFiles.map(file => 
            file.id === fileId ? { ...file, is_deleted: true } : file
          ).filter(file => !file.is_deleted) // Скрываем удаленные файлы
        );
        
        // Обновляем данные журнала
        setState(prevState => ({
          ...prevState,
          branches: prevState.branches.map(branch => ({
            ...branch,
            journals: branch.journals.map(j => 
              j.id === selectedJournal?.id 
                ? { 
                    ...j, 
                    files: j.files?.map(f => 
                      f.file_id === fileId ? { ...f, is_deleted: true } : f
                    ).filter(f => !f.is_deleted) // Скрываем удаленные файлы
                  } 
                : j
            )
          }))
        }));
      } else {
        const errorData = await response.json();
        notificationSystem.addNotification('Ошибка', errorData.message || 'Не удалось удалить файл', 'error');
      }
    } catch (err) {
      notificationSystem.addNotification('Ошибка', 'Ошибка соединения с сервером', 'error');
    }
  }, [fetchWithAuth, selectedJournal]);

  // Обработчик фильтров
  const handleColumnFiltersChange = useCallback((columnId: string, value: any) => {
    setColumnFilters(prev => {
      const existing = prev.find(f => f.id === columnId);
      if (existing) {
        return prev.map(f => f.id === columnId ? { ...f, value } : f);
      } else {
        return [...prev, { id: columnId, value }];
      }
    });
  }, [setColumnFilters]);

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

  const handleBranchPageChange = useCallback((page: number) => {
    setBranchPagination(prev => ({ ...prev, page }));
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
    
    // Применяем фильтрацию по вкладкам
    if (activeTab !== 'all') {
      result = result.map(branch => ({
        ...branch,
        journals: branch.journals.filter(journal => {
          if (activeTab === 'labor_protection' || activeTab === 'fire_safety') {
            return journal.journal_type === activeTab;
          }
          return journal.status === activeTab;
        })
      }));
    }
    
    return result;
  }, [branches, activeTab, branchFilters]);

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

  // Подсчет статистики для вкладок (мемоизированный с оптимизацией)
  const stats = useMemo(() => {
    const allJournals = branches.flatMap(branch => branch.journals);
    
    // Используем reduce для более эффективного подсчета
    return allJournals.reduce((acc, journal) => {
      acc.total++;
      
      // Подсчет по типам
      if (journal.journal_type === 'labor_protection') acc.labor_protection++;
      if (journal.journal_type === 'fire_safety') acc.fire_safety++;
      
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

  if (loading) {
    return (
      <Box style={{ position: 'relative', minHeight: '400px' }}>
        <LoadingOverlay visible={loading} />
      </Box>
    );
  }

  return (
    <DndProviderWrapper>
      <Box style={{ background: 'var(--theme-bg-primary)', minHeight: '100vh' }}>
      {/* Заголовок */}
      {!isFullscreen && (
        <Box
          style={{
            background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-600) 100%)',
            padding: '2rem',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
        <Box
          style={{
            position: 'absolute',
            top: '-50%',
            right: '-10%',
            width: '200px',
            height: '200px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            zIndex: 1
          }}
        />
        <Box
          style={{
            position: 'absolute',
            bottom: '-30%',
            left: '-5%',
            width: '150px',
            height: '150px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '50%',
            zIndex: 1
          }}
        />
        <Stack gap="md" style={{ position: 'relative', zIndex: 2 }}>
          <Group gap="md" align="center">
            <Box
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '16px',
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                color: 'white',
                fontWeight: '600'
              }}
            >
              🛡️
            </Box>
            <Stack gap="xs">
              <Title order={1} style={{ color: 'white', margin: 0 }}>
                Журналы охраны труда и пожарной безопасности
              </Title>
              <Text style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                Управление журналами по охране труда и пожарной безопасности
              </Text>
              {userInfo && (
              <Text size="sm" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                Пользователь: {formatName(userInfo.userName)} • Филиал: {userInfo.branchName}
              </Text>
              )}
            </Stack>
          </Group>
          <Group gap="md">
            <Button
              leftSection={<IconFilter size={20} />}
              onClick={() => setShowFilters(!showFilters)}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: 'white'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
            >
              {showFilters ? 'Скрыть фильтры' : 'Показать фильтры'}
            </Button>
            <Button
              leftSection={<IconBell size={20} />}
              onClick={() => loadBranchesWithJournals()}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: 'white'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
            >
              Обновить данные
            </Button>
            <Popover width={400} position="bottom" withArrow shadow="md">
              <Popover.Target>
                <Tooltip label="Примеры заполнения журналов">
                  <ActionIcon
                    size="lg"
                    variant="outline"
                    color="white"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.2)',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <IconHelp size={20} />
                  </ActionIcon>
                </Tooltip>
              </Popover.Target>
              <Popover.Dropdown>
                <Stack gap="md">
                  <Text size="sm" fw={600}>Примеры заполнения журналов</Text>
                  <Divider />
                  <Stack gap="sm">
                    <Text size="xs" fw={500} c="blue">Охрана труда:</Text>
                    <Text size="xs" c="dimmed">
                      • Журнал вводного инструктажа по охране труда<br/>
                      • Журнал регистрации несчастных случаев<br/>
                      • Журнал учета выдачи средств индивидуальной защиты
                    </Text>
                  </Stack>
                  <Stack gap="sm">
                    <Text size="xs" fw={500} c="red">Пожарная безопасность:</Text>
                    <Text size="xs" c="dimmed">
                      • Журнал учета первичных средств пожаротушения<br/>
                      • Журнал проведения противопожарных инструктажей<br/>
                      • Журнал проверки пожарных кранов и гидрантов
                    </Text>
                  </Stack>
                  <Alert color="blue" variant="light">
                    <Text size="xs">
                      Подробные примеры будут добавлены после консультации с сотрудниками ОТ и ПБ
                    </Text>
                  </Alert>
                </Stack>
              </Popover.Dropdown>
            </Popover>
            <Tooltip label={isFullscreen ? "Показать хедер и футер" : "Скрыть хедер и футер"}>
              <ActionIcon
                size="lg"
                variant="outline"
                color="white"
                style={{ 
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: 'white',
                  cursor: 'pointer'
                }}
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                {isFullscreen ? <IconMinimize size={20} /> : <IconMaximize size={20} />}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Stack>
        </Box>
      )}

      {/* Плавающая кнопка для выхода из полноэкранного режима */}
      {isFullscreen && (
        <Box
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 1000
          }}
        >
          <Tooltip label="Показать заголовок и футер">
            <ActionIcon
              size="lg"
              variant="filled"
              color="blue"
              onClick={() => setIsFullscreen(false)}
              style={{ 
                boxShadow: 'var(--theme-shadow-lg)',
                cursor: 'pointer'
              }}
            >
              <IconMinimize size={20} />
            </ActionIcon>
          </Tooltip>
        </Box>
      )}

      {/* Контент */}
      <Box p="xl">
        {/* Фильтры */}
        {showFilters && (
          <Paper withBorder radius="md" p="md" mb="xl">
            <FilterGroup
              filters={[
                {
                  type: 'select',
                  columnId: 'journal_type',
                  label: 'Тип журнала',
                  options: [
                    { value: 'labor_protection', label: 'Охрана труда' },
                    { value: 'fire_safety', label: 'Пожарная безопасность' }
                  ]
                },
                {
                  type: 'select',
                  columnId: 'status',
                  label: 'Статус',
                  options: [
                    { value: 'pending', label: 'На рассмотрении' },
                    { value: 'approved', label: 'Одобрен' },
                    { value: 'rejected', label: 'Отклонен' },
                    { value: 'under_review', label: 'На проверке' }
                  ]
                }
              ]}
              columnFilters={columnFilters}
              onColumnFiltersChange={handleColumnFiltersChange}
            />
          </Paper>
        )}


        {/* Прилипающие фильтры */}
        <Box
          style={{
            position: isFiltersSticky ? 'fixed' : 'static',
            top: isFiltersSticky ? '0' : 'auto',
            left: '0',
            right: '0',
            zIndex: isFiltersSticky ? 1000 : 'auto',
            background: isFiltersSticky ? 'var(--theme-bg-primary)' : 'transparent',
            borderBottom: isFiltersSticky ? '1px solid var(--theme-border-primary)' : 'none',
            boxShadow: isFiltersSticky ? 'var(--theme-shadow-md)' : 'none',
            padding: isFiltersSticky ? 'var(--space-md)' : '0',
            marginBottom: isFiltersSticky ? '0' : 'var(--space-xl)'
          }}
        >
          {/* Вкладки */}
          <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'all')} mb={isFiltersSticky ? "md" : "xl"}>
            <Tabs.List>
              <Tabs.Tab value="all" leftSection={<IconFileText size={16} />}>
                Все журналы ({stats.total})
              </Tabs.Tab>
              <Tabs.Tab value="labor_protection" leftSection={<IconShield size={16} />}>
                Охрана труда ({stats.labor_protection || 0})
              </Tabs.Tab>
              <Tabs.Tab value="fire_safety" leftSection={<IconFlame size={16} />}>
                Пожарная безопасность ({stats.fire_safety || 0})
              </Tabs.Tab>
              <Tabs.Tab value="pending" leftSection={<IconClock size={16} />}>
                На рассмотрении ({stats.pending})
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
          </Tabs>
        </Box>

        {/* Фильтры филиалов */}
        {branches.length > 1 && (
          <Paper withBorder radius="md" p="md" mb="xl">
            <Stack gap="md">
              <Group gap="md" align="center">
                <IconFilter size={20} />
                <Text size="lg" fw={600}>Фильтры филиалов</Text>
              </Group>
              <Group gap="md" align="end">
                <Select
                  label="РРС"
                  placeholder="Выберите РРС"
                  data={rrsOptions}
                  value={branchFilters.rrs}
                  onChange={handleRrsFilterChange}
                  clearable
                  style={{ minWidth: 200 }}
                />
                <Select
                  label="Филиал"
                  placeholder="Выберите филиал"
                  data={branchOptions}
                  value={branchFilters.branch}
                  onChange={handleBranchFilterChange}
                  clearable
                  disabled={!branchFilters.rrs}
                  style={{ minWidth: 200 }}
                />
                <Button
                  variant="light"
                  onClick={() => {
                    setBranchFilters({ rrs: '', branch: '' });
                    setBranchPagination({ page: 1, pageSize: 5 });
                  }}
                >
                  Сбросить
                </Button>
              </Group>
            </Stack>
          </Paper>
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
          <Stack gap="lg">
            {paginatedBranches.map((branch) => (
              <BranchCard
                key={branch.branch_id}
                branch={branch}
                onApproveJournal={() => {}} // Не используется, так как управление статусом встроено в колонки
                onRejectJournal={() => {}} // Не используется, так как управление статусом встроено в колонки
                onViewFile={handleViewFiles}
                createJournalColumns={(onApprove, onReject) => createJournalColumns(onApprove, onReject, handleViewFiles, handleUploadFiles)}
                columnFilters={columnFilters}
                sorting={sorting}
                setColumnFilters={setColumnFilters}
                setSorting={setSorting}
              />
            ))}
          </Stack>
        )}

        {/* Пагинация филиалов */}
        {filteredBranches.length > 1 && totalPages > 1 && (
          <Flex justify="center" mt="xl">
            <Pagination
              value={branchPagination.page}
              onChange={handleBranchPageChange}
              total={totalPages}
              size="md"
            />
          </Flex>
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
        onDeleteFile={canManageStatuses ? handleDeleteFile : undefined}
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
            accept: '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif'
          }
        ]}
        initialValues={{ files: [] }}
        onSubmit={handleFileUpload}
      />

      </Box>
    </DndProviderWrapper>
  );
}
