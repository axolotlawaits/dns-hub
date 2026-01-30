import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { useAccessContext } from '../../../hooks/useAccessContext';
import { usePageHeader } from '../../../contexts/PageHeaderContext';
import {
  Button,
  LoadingOverlay,
  Group,
  ActionIcon,
  Text,
  Stack,
  Paper,
  Badge,
  Alert,
  FileButton,
  Progress,
  Box,
  Modal,
  Anchor,
  Accordion,
} from '@mantine/core';
import {
  IconRefresh,
  IconAlertCircle,
  IconCheck,
  IconFileText,
  IconUpload,
  IconX,
  IconSparkles,
  IconDownload,
  IconChevronDown,
  IconChevronUp,
} from '@tabler/icons-react';
import { ColumnDef, ColumnFiltersState, SortingState } from '@tanstack/react-table';
import { TableComponent } from '../../../utils/table';
import { FilterGroup } from '../../../utils/filter';
import useAuthFetch from '../../../hooks/useAuthFetch';
import { fetchWithAuth } from '../../../utils/fetchWithAuth';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';

// Интерфейсы (список из Branch, документы из CleaningDocument)
interface CleaningBranch {
  id: string;
  branchId: string;
  branch: {
    id: string;
    name: string;
    code: string;
    address: string;
    division: string;
    status: number;
  };
  status: string;
  needsDocuments: boolean;
  nextDocumentDate: string | null;
  daysUntilNext: number | null;
  documentsCount: number;
}

export default function Cleaning() {
  const { user } = useUserContext();
  const { access } = useAccessContext();
  const { setHeader, clearHeader } = usePageHeader();
  const authFetch = useAuthFetch();

  // Проверка: является ли пользователь проверяющим
  const isChecker = useMemo(() => {
    // SUPERVISOR и DEVELOPER имеют полный доступ
    if (user?.role === 'SUPERVISOR' || user?.role === 'DEVELOPER') {
      return true;
    }
    
    // Проверяем доступ через useAccessContext - только FULL доступ для проверяющих
    return access.some(tool => 
      tool.link === 'accounting/cleaning' && 
      tool.accessLevel === 'FULL'
    );
  }, [access, user?.role]);

  const [state, setState] = useState({
    branches: [] as CleaningBranch[],
    loading: true,
    error: null as string | null,
    columnFilters: [] as ColumnFiltersState,
    sorting: [] as SortingState,
  });

  // Состояние для загрузки файлов (для обычных пользователей)
  const [uploadState, setUploadState] = useState({
    branchInfo: null as { id: string; name: string; code: string } | null,
    files: [] as File[],
    uploading: false,
    uploadProgress: 0,
    error: null as string | null,
    success: false,
  });

  // Состояние для документов по месяцам
  interface DocumentByMonth {
    monthKey: string;
    monthName: string;
    documents: Array<{
      id: string;
      fileName: string;
      fileUrl: string;
      fileSize: number;
      mimeType: string;
      uploadedAt: string;
      uploadedBy: {
        id: string;
        name: string;
      };
    }>;
    count: number;
  }

  const [documentsByMonths, setDocumentsByMonths] = useState<DocumentByMonth[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsExpanded, documentsHandlers] = useDisclosure(false);
  // ИСПРАВЛЕНО: Используем ref вместо state для отслеживания загрузки, чтобы избежать проблем с замыканием
  const documentsLoadedRef = useRef(false);
  
  // Модальное окно для просмотра документов (для проверяющих)
  const [selectedBranch, setSelectedBranch] = useState<CleaningBranch | null>(null);
  const [selectedBranchDocuments, setSelectedBranchDocuments] = useState<DocumentByMonth[]>([]);
  const [selectedBranchDocumentsLoading, setSelectedBranchDocumentsLoading] = useState(false);
  const [documentsModalOpened, documentsModalHandlers] = useDisclosure(false);

  // Загрузка документов по месяцам (объявляем раньше, чтобы использовать в loadUserBranch)
  // ИСПРАВЛЕНО: Убрана зависимость documentsLoaded из useCallback, чтобы избежать проблем с замыканием
  const loadDocumentsByMonths = useCallback(async (branchId: string) => {
    if (!branchId) return;

    setDocumentsLoading(true);
    try {
      const response = await authFetch(`${API}/accounting/cleaning/${branchId}/documents/months`);
      if (response?.ok) {
        const data = await response.json();
        setDocumentsByMonths(data.data || []);
        // Устанавливаем флаг после успешной загрузки
        documentsLoadedRef.current = true;
      }
    } catch (error) {
      console.error('[Cleaning] Error loading documents by months:', error);
    } finally {
      setDocumentsLoading(false);
    }
  }, [authFetch]);

  // Загрузка данных филиала пользователя (для обычных пользователей)
  const loadUserBranch = useCallback(async () => {
    if (!user?.branch) return;
    
    setUploadState((prev) => ({ ...prev, error: null }));
    try {
      const response = await authFetch(`${API}/accounting/cleaning/my-branch`);
      
      if (response?.ok) {
        const data = await response.json();
        if (data.data) {
          setUploadState((prev) => ({
            ...prev,
            branchInfo: {
              id: data.data.id,
              name: data.data.branch.name,
              code: data.data.branch.code,
            },
          }));
          // Загружаем документы по месяцам при первой загрузке филиала
          // Сбрасываем флаг загрузки, чтобы документы загрузились заново
          documentsLoadedRef.current = false;
          await loadDocumentsByMonths(data.data.id);
        }
      } else {
        throw new Error('Ошибка при загрузке данных филиала');
      }
    } catch (error) {
      console.error('[Cleaning] Error loading user branch:', error);
      setUploadState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      }));
    }
  }, [authFetch, user?.branch, loadDocumentsByMonths]);

  // Загрузка данных (для проверяющих) - загружаем все данные для TableComponent
  const loadBranches = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      // Загружаем все данные (большой лимит) для frontend пагинации
      const response = await authFetch(`${API}/accounting/cleaning?limit=1000`);
      if (!response?.ok) {
        throw new Error('Ошибка при загрузке данных');
      }

      const data = await response.json();
      setState((prev) => ({
        ...prev,
        branches: data.data || [],
        loading: false,
      }));
    } catch (error) {
      console.error('[Cleaning] Error loading branches:', error);
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
        loading: false,
      }));
    }
  }, [authFetch]);

  useEffect(() => {
    if (isChecker) {
      loadBranches();
    } else if (user?.branch) {
      loadUserBranch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChecker, user?.branch]); // Функции loadBranches и loadUserBranch стабильны благодаря useCallback

  // Установка заголовка
  // ИСПРАВЛЕНО: Мемоизируем иконку, чтобы избежать ререндеров
  const headerIcon = useMemo(() => <IconSparkles size={24} color="white" />, []);
  
  useEffect(() => {
    setHeader({
      title: 'Клининг',
      subtitle: 'Управление документами по клинингу',
      icon: headerIcon,
    });
    return () => clearHeader();
  }, [setHeader, clearHeader, headerIcon]);

  // Обработчики для загрузки файлов (для обычных пользователей)
  const handleFileSelect = useCallback((files: File[] | null) => {
    if (files) {
      setUploadState((prev) => ({
        ...prev,
        files: Array.from(files),
        error: null,
        success: false,
      }));
    }
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setUploadState((prev) => ({
      ...prev,
      files: prev.files.filter((_, i) => i !== index),
    }));
  }, []);

  const handleUploadFiles = useCallback(async () => {
    if (!uploadState.branchInfo || uploadState.files.length === 0) {
      setUploadState((prev) => ({ ...prev, error: 'Выберите файлы для загрузки' }));
      return;
    }

    setUploadState((prev) => ({ ...prev, uploading: true, error: null, uploadProgress: 0, success: false }));

    try {
      const branchId = uploadState.branchInfo.id;

      const formData = new FormData();
      uploadState.files.forEach((file) => {
        formData.append('files', file);
      });

      const response = await fetchWithAuth(`${API}/accounting/cleaning/${branchId}/documents`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка при загрузке файлов');
      }

      setUploadState((prev) => ({
        ...prev,
        uploading: false,
        uploadProgress: 100,
        success: true,
        files: [],
      }));

      // ИСПРАВЛЕНО: Сбрасываем флаг загрузки документов, чтобы обновить список после загрузки файлов
      documentsLoadedRef.current = false;
      await loadUserBranch();
    } catch (error) {
      console.error('[Cleaning] Error uploading files:', error);
      setUploadState((prev) => ({
        ...prev,
        uploading: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      }));
    }
  }, [uploadState.branchInfo, uploadState.files, loadUserBranch]);

  // Обработчик раскрытия списка документов
  // ИСПРАВЛЕНО: Используем ref для отслеживания загрузки, чтобы избежать проблем с замыканием
  const handleToggleDocuments = useCallback(() => {
    documentsHandlers.toggle();
    // Загружаем документы при раскрытии, если еще не загружены
    if (uploadState.branchInfo && !documentsExpanded && !documentsLoadedRef.current) {
      documentsLoadedRef.current = true;
      loadDocumentsByMonths(uploadState.branchInfo.id);
    }
  }, [uploadState.branchInfo, documentsExpanded, loadDocumentsByMonths, documentsHandlers]);

  // Статус бейдж
  const getStatusBadge = (status: string) => {
    const colorMap: Record<string, string> = {
      'Архив': 'gray',
      'В порядке': 'green',
      'Требуется загрузка': 'yellow',
      'Просрочено': 'red',
      'Неактивен': 'gray',
    };
    return (
      <Badge color={colorMap[status] || 'gray'} variant="light">
        {status}
      </Badge>
    );
  };

  // Конфигурация фильтров для FilterGroup
  const filtersConfig = useMemo(() => [
    {
      type: 'text' as const,
      columnId: 'search',
      label: 'Поиск',
      placeholder: 'Поиск по названию, коду, адресу...',
    },
    {
      type: 'select' as const,
      columnId: 'status',
      label: 'Статус',
      placeholder: 'Выберите статус',
      options: [
        { value: 'В порядке', label: 'В порядке' },
        { value: 'Требуется загрузка', label: 'Требуется загрузка' },
        { value: 'Просрочено', label: 'Просрочено' },
        { value: 'Неактивен', label: 'Неактивен' },
      ],
    },
  ], []);

  // Обработчик изменения фильтров (для FilterGroup)
  const handleColumnFiltersChange = useCallback((columnId: string, value: any) => {
    setState((prev) => ({
      ...prev,
      columnFilters: [
        ...prev.columnFilters.filter(f => f.id !== columnId),
        ...(value && (Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0 || typeof value === 'string') 
          ? [{ id: columnId, value }] 
          : [])
      ],
    }));
  }, []);

  // Обработчик изменения фильтров (для TableComponent - принимает updaterOrValue)
  const handleTableColumnFiltersChange = useCallback((updaterOrValue: ColumnFiltersState | ((prev: ColumnFiltersState) => ColumnFiltersState)) => {
    setState((prev) => ({
      ...prev,
      columnFilters: typeof updaterOrValue === 'function'
        ? updaterOrValue(prev.columnFilters)
        : updaterOrValue,
    }));
  }, []);

  // Обработчик изменения сортировки
  const handleSortingChange = useCallback((updaterOrValue: SortingState | ((prev: SortingState) => SortingState)) => {
    setState((prev) => ({
      ...prev,
      sorting: typeof updaterOrValue === 'function'
        ? updaterOrValue(prev.sorting)
        : updaterOrValue,
    }));
  }, []);

  // Фильтрация данных на основе columnFilters
  const filteredData = useMemo(() => {
    let filtered = state.branches;

    state.columnFilters.forEach((filter) => {
      if (filter.id === 'search' && filter.value) {
        const searchValue = Array.isArray(filter.value) ? filter.value[0] : filter.value;
        if (typeof searchValue === 'string' && searchValue.trim()) {
          const query = searchValue.toLowerCase();
          filtered = filtered.filter(branch =>
            branch.branch.name.toLowerCase().includes(query) ||
            branch.branch.code.toLowerCase().includes(query) ||
            branch.branch.address.toLowerCase().includes(query)
          );
        }
      } else if (filter.id === 'status' && filter.value) {
        const statusValues = Array.isArray(filter.value) ? filter.value : [filter.value];
        if (statusValues.length > 0) {
          filtered = filtered.filter(branch => statusValues.includes(branch.status));
        }
      }
    });

    return filtered;
  }, [state.branches, state.columnFilters]);

  // Обработчик открытия модального окна с документами
  const handleOpenDocumentsModal = useCallback(async (branch: CleaningBranch) => {
    setSelectedBranch(branch);
    documentsModalHandlers.open();
    setSelectedBranchDocumentsLoading(true);
    try {
      const response = await authFetch(`${API}/accounting/cleaning/${branch.id}/documents/months`);
      if (response?.ok) {
        const data = await response.json();
        setSelectedBranchDocuments(data.data || []);
      }
    } catch (error) {
      console.error('[Cleaning] Error loading documents for modal:', error);
    } finally {
      setSelectedBranchDocumentsLoading(false);
    }
  }, [documentsModalHandlers, authFetch]);

  // Определение колонок для TableComponent
  const columns = useMemo<ColumnDef<CleaningBranch>[]>(() => [
    {
      accessorKey: 'branch.code',
      header: 'Код',
      size: 100,
      cell: (info) => info.row.original.branch.code,
    },
    {
      accessorKey: 'branch.name',
      header: 'Филиал',
      size: 200,
      cell: (info) => info.row.original.branch.name,
    },
    {
      accessorKey: 'branch.address',
      header: 'Адрес',
      size: 250,
      cell: (info) => info.row.original.branch.address,
    },
    {
      accessorKey: 'status',
      header: 'Статус',
      size: 150,
      cell: (info) => getStatusBadge(info.row.original.status),
    },
    {
      id: 'documents',
      header: 'Документы',
      size: 120,
      cell: (info) => (
        <Group gap="xs">
          <ActionIcon
            variant="light"
            color="blue"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenDocumentsModal(info.row.original);
            }}
            title="Просмотр документов"
          >
            <IconFileText size={16} />
          </ActionIcon>
          <Text size="sm">{info.row.original.documentsCount}</Text>
        </Group>
      ),
    },
  ], [handleOpenDocumentsModal]);

  // Форматирование размера файла
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Если не проверяющий - показываем интерфейс загрузки файлов
  if (!isChecker) {
    return (
      <Stack gap="md">
        <Paper p="md">
          <Stack gap="md">
            <Text size="lg" fw={500}>
              Загрузка документов по клинингу
            </Text>
            {uploadState.branchInfo && (
              <Alert color="blue">
                <Text size="sm">
                  <strong>Филиал:</strong> {uploadState.branchInfo.name} ({uploadState.branchInfo.code})
                </Text>
              </Alert>
            )}
            {uploadState.error && (
              <Alert icon={<IconAlertCircle size={16} />} title="Ошибка" color="red">
                {uploadState.error}
              </Alert>
            )}
            {uploadState.success && (
              <Alert icon={<IconCheck size={16} />} title="Успешно" color="green">
                Файлы успешно загружены
              </Alert>
            )}
            <Group>
              <FileButton onChange={handleFileSelect} accept="*" multiple>
                {(props) => (
                  <Button {...props} leftSection={<IconUpload size={16} />}>
                    Выбрать файлы
                  </Button>
                )}
              </FileButton>
              {uploadState.files.length > 0 && (
                <Button
                  onClick={handleUploadFiles}
                  disabled={uploadState.uploading}
                  leftSection={<IconUpload size={16} />}
                >
                  Загрузить файлы
                </Button>
              )}
            </Group>
            {uploadState.uploading && (
              <Progress value={uploadState.uploadProgress} animated />
            )}
            {uploadState.files.length > 0 && (
              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  Выбранные файлы:
                </Text>
                {uploadState.files.map((file, index) => (
                  <Group key={index} justify="space-between" p="xs" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 4 }}>
                    <Text size="sm">{file.name}</Text>
                    <ActionIcon
                      variant="light"
                      color="red"
                      onClick={() => handleRemoveFile(index)}
                    >
                      <IconX size={16} />
                    </ActionIcon>
                  </Group>
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>

        {/* Список загруженных файлов по месяцам */}
        {uploadState.branchInfo && (
          <Paper p="md">
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Text size="lg" fw={500}>
                  Загруженные документы
                </Text>
                <ActionIcon
                  variant="light"
                  onClick={handleToggleDocuments}
                >
                  {documentsExpanded ? <IconChevronUp size={20} /> : <IconChevronDown size={20} />}
                </ActionIcon>
              </Group>
              
              {documentsExpanded && (
                <>
                  {documentsLoading ? (
                    <LoadingOverlay visible />
                  ) : documentsByMonths.length === 0 ? (
                    <Text size="sm" c="dimmed">Нет загруженных документов</Text>
                  ) : (
                    <Accordion key={`documents-${documentsByMonths.length}`}>
                      {documentsByMonths.map((month) => (
                        <Accordion.Item key={month.monthKey} value={month.monthKey}>
                          <Accordion.Control>
                            <Group justify="space-between" w="100%">
                              <Text fw={500}>{month.monthName}</Text>
                              <Badge variant="light" color="blue">{month.count}</Badge>
                            </Group>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Stack gap="xs">
                              {month.documents.map((doc) => {
                                const fileUrl = doc.fileUrl.startsWith('http') 
                                  ? doc.fileUrl 
                                  : `${API}${doc.fileUrl}`;
                                return (
                                  <Paper key={doc.id} p="sm" withBorder>
                                    <Group justify="space-between" align="center">
                                      <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
                                        <IconFileText size={20} />
                                        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                                          <Anchor
                                            href={fileUrl}
                                            download={doc.fileName}
                                            size="sm"
                                            style={{ textDecoration: 'none' }}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            <Text size="sm" fw={500} truncate>
                                              {doc.fileName}
                                            </Text>
                                          </Anchor>
                                          <Group gap="xs">
                                            <Text size="xs" c="dimmed">
                                              {formatFileSize(doc.fileSize)}
                                            </Text>
                                            <Text size="xs" c="dimmed">•</Text>
                                            <Text size="xs" c="dimmed">
                                              {dayjs(doc.uploadedAt).format('DD.MM.YYYY HH:mm')}
                                            </Text>
                                            <Text size="xs" c="dimmed">•</Text>
                                            <Text size="xs" c="dimmed">
                                              {doc.uploadedBy.name}
                                            </Text>
                                          </Group>
                                        </Stack>
                                      </Group>
                                      <ActionIcon
                                        component="a"
                                        href={fileUrl}
                                        download={doc.fileName}
                                        variant="light"
                                        color="blue"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <IconDownload size={16} />
                                      </ActionIcon>
                                    </Group>
                                  </Paper>
                                );
                              })}
                            </Stack>
                          </Accordion.Panel>
                        </Accordion.Item>
                      ))}
                    </Accordion>
                  )}
                </>
              )}
            </Stack>
          </Paper>
        )}
      </Stack>
    );
  }

  // Для проверяющих - показываем список филиалов
  if (state.loading && state.branches.length === 0) {
    return (
      <Box style={{ position: 'relative', minHeight: 400 }}>
        <LoadingOverlay visible />
      </Box>
    );
  }

  if (state.error) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} title="Ошибка" color="red">
        {state.error}
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {/* Фильтры */}
      <FilterGroup
        filters={filtersConfig}
        columnFilters={state.columnFilters}
        onColumnFiltersChange={handleColumnFiltersChange}
        title="Фильтры"
      />

      {/* Кнопка обновления */}
      <Group justify="flex-end">
        <ActionIcon variant="light" onClick={loadBranches} size="lg">
          <IconRefresh size={20} />
        </ActionIcon>
      </Group>

      {/* Таблица */}
      <TableComponent<CleaningBranch>
        data={filteredData}
        columns={columns}
        columnFilters={state.columnFilters}
        sorting={state.sorting}
        onColumnFiltersChange={handleTableColumnFiltersChange}
        onSortingChange={handleSortingChange}
        paginationOptions={[
          { value: '10', label: '10' },
          { value: '20', label: '20' },
          { value: '50', label: '50' },
          { value: '100', label: '100' },
        ]}
      />

      {/* Модальное окно с документами по месяцам */}
      <Modal
        opened={documentsModalOpened}
        onClose={documentsModalHandlers.close}
        title={
          selectedBranch ? (
            <Text fw={500}>
              Документы: {selectedBranch.branch.name} ({selectedBranch.branch.code})
            </Text>
          ) : (
            'Документы'
          )
        }
        size="xl"
      >
        {selectedBranchDocumentsLoading ? (
          <LoadingOverlay visible />
        ) : selectedBranchDocuments.length === 0 ? (
          <Text size="sm" c="dimmed">Нет загруженных документов</Text>
        ) : (
          <Accordion>
            {selectedBranchDocuments.map((month) => (
              <Accordion.Item key={month.monthKey} value={month.monthKey}>
              <Accordion.Control>
                <Group justify="space-between" w="100%">
                  <Text fw={500}>{month.monthName}</Text>
                  <Badge variant="light" color="blue">{month.count}</Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs">
                  {month.documents.map((doc) => {
                    const fileUrl = doc.fileUrl.startsWith('http') 
                      ? doc.fileUrl 
                      : `${API}${doc.fileUrl}`;
                    return (
                      <Paper key={doc.id} p="sm" withBorder>
                        <Group justify="space-between" align="center">
                          <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
                            <IconFileText size={20} />
                            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                              <Anchor
                                href={fileUrl}
                                download={doc.fileName}
                                size="sm"
                                style={{ textDecoration: 'none' }}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Text size="sm" fw={500} truncate>
                                  {doc.fileName}
                                </Text>
                              </Anchor>
                              <Group gap="xs">
                                <Text size="xs" c="dimmed">
                                  {formatFileSize(doc.fileSize)}
                                </Text>
                                <Text size="xs" c="dimmed">•</Text>
                                <Text size="xs" c="dimmed">
                                  {dayjs(doc.uploadedAt).format('DD.MM.YYYY HH:mm')}
                                </Text>
                                <Text size="xs" c="dimmed">•</Text>
                                <Text size="xs" c="dimmed">
                                  {doc.uploadedBy.name}
                                </Text>
                              </Group>
                            </Stack>
                          </Group>
                          <ActionIcon
                            component="a"
                            href={fileUrl}
                            download={doc.fileName}
                            variant="light"
                            color="blue"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <IconDownload size={16} />
                          </ActionIcon>
                        </Group>
                      </Paper>
                    );
                  })}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
        )}
      </Modal>
    </Stack>
  );
}
