import { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { usePageHeader } from '../../../contexts/PageHeaderContext';
import { notificationSystem } from '../../../utils/Push';
import { formatName } from '../../../utils/format';
import { dateRange, FilterGroup } from '../../../utils/filter';
import { Box, LoadingOverlay, Group, ActionIcon, Text, Badge, Avatar, Card, Tooltip, Loader, Stepper, Stack, ScrollArea, SimpleGrid, ThemeIcon } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { IconPencil, IconTrash, IconPlus, IconSearch, IconCheck, IconX, IconFile, IconCalendar, IconUser, IconFileText, IconMessage, IconUserCheck, IconClock, IconPackage } from '@tabler/icons-react';
import { ColumnDef, ColumnFiltersState, SortingState } from '@tanstack/react-table';
import { DndProviderWrapper } from '../../../utils/dnd';
import { DynamicFormModal } from '../../../utils/formModal';
import { TableComponent } from '../../../utils/table';
import FloatingActionButton from '../../../components/FloatingActionButton';
import { CustomModal } from '../../../utils/CustomModal';
import { FilePreviewModal } from '../../../utils/FilePreviewModal';

interface User {
  id: string;
  name: string;
  email?: string;
  image?: string | null;
}


interface CorrespondenceAttachment {
  id: string;
  createdAt: Date;
  record_id: string;
  userAdd: string;
  source: string;
  user: User;
}

interface Type {
  id: string;
  name: string;
  chapter: string;
  parent_type?: string | null;
  children?: Type[];
}

interface Correspondence {
  id: string;
  createdAt: Date;
  ReceiptDate: Date;
  userAdd: string;
  senderTypeId: string;
  senderType?: Type;
  senderSubTypeId?: string;
  senderSubType?: Type;
  senderSubSubTypeId?: string;
  senderSubSubType?: Type;
  senderName: string;
  documentTypeId: string;
  documentType?: Type;
  comments?: string;
  responsibleId: string;
  responsible?: User;
  documentNumber?: number;
  trackNumber?: string;
  // Старые поля для обратной совместимости
  from?: string;
  to?: string;
  content?: string;
  typeMail?: string;
  numberMail?: string; // Для обратной совместимости
  attachments: CorrespondenceAttachment[];
  user: User;
}

interface CorrespondenceWithFormattedData extends Correspondence {
  formattedReceiptDate: string;
  formattedCreatedAt: string;
  userName: string;
  typeMailName: string;
  senderTypeLabel: string;
  documentTypeLabel: string;
  responsibleName: string;
}

interface CorrespondenceForm {
  ReceiptDate: string;
  senderTypeId: string;
  senderSubTypeId?: string;
  senderSubSubTypeId?: string;
  senderName: string;
  documentTypeId: string;
  trackNumber?: string;
  comments?: string;
  responsibleId: string;
  attachments: Array<{ id?: string; userAdd?: string; source: File | string }>;
}

const DEFAULT_CORRESPONDENCE_FORM: CorrespondenceForm = {
  ReceiptDate: dayjs().format('YYYY-MM-DDTHH:mm'),
  senderTypeId: '',
  senderSubTypeId: undefined,
  senderSubSubTypeId: undefined,
  senderName: '',
  documentTypeId: '',
  trackNumber: '',
  comments: '',
  responsibleId: '',
  attachments: [],
};

const getSenderTypeLabel = (senderType?: Type, senderSubType?: Type, senderSubSubType?: Type): string => {
  if (!senderType) return 'Не указан';
  const senderLabel = senderType.name;
  if (senderSubType) {
    const subTypeLabel = senderSubType.name;
    if (senderSubSubType) {
      const subSubTypeLabel = senderSubSubType.name;
      return `${senderLabel} - ${subTypeLabel} - ${subSubTypeLabel}`;
    }
    return `${senderLabel} - ${subTypeLabel}`;
  }
  return senderLabel;
};

const formatTableData = (data: Correspondence[]): CorrespondenceWithFormattedData[] => {
  return data.map((item) => {
    const senderTypeLabel = getSenderTypeLabel(item.senderType, item.senderSubType, item.senderSubSubType);
    const documentTypeLabel = item.documentType?.name || 'Не указан';
    return {
      ...item,
      formattedReceiptDate: dayjs(item.ReceiptDate).format('DD.MM.YYYY HH:mm'),
      formattedCreatedAt: dayjs(item.createdAt).format('DD.MM.YYYY HH:mm'),
      userName: item.user?.name ? formatName(item.user.name) : 'Unknown',
      typeMailName: documentTypeLabel,
      senderTypeLabel,
      documentTypeLabel,
      responsibleName: item.responsible?.name ? formatName(item.responsible.name) : 'Не указан',
      comments: item.comments || '',
    };
  });
};

const getFilterOptions = <T,>(data: T[], mapper: (item: T) => string) => {
  const values = data
    .map(mapper)
    .filter((v, i, a) => a.indexOf(v) === i);
  return values.map(value => ({ value, label: value }));
};


export default function CorrespondenceList() {
  const { user } = useUserContext();
  const { setHeader, clearHeader } = usePageHeader();
  const [state, setState] = useState({
    correspondence: [] as Correspondence[],
    loading: true,
    selectedCorrespondence: null as Correspondence | null,
    correspondenceForm: DEFAULT_CORRESPONDENCE_FORM,
    uploadError: null as string | null,
    columnFilters: [] as ColumnFiltersState,
    sorting: [{ id: 'formattedReceiptDate', desc: true }] as SortingState,
    senderTypes: [] as Type[],
    documentTypes: [] as Type[],
    users: [] as User[],
    loadingUsers: false,
    senderNames: [] as string[],
    loadingSenderNames: false,
    trackingStatus: null as { status: string; date?: string; location?: string; error?: boolean } | null,
    trackingLoading: false,
    trackingData: null as { trackNumber: string; events?: Array<{ date: string; description: string; location?: string }>; lastStatus?: { status: string; date: string; location?: string }; error?: { code: string; description: string } } | null,
    trackingCache: {} as Record<string, { status: string; date?: string; location?: string; error?: boolean; loading?: boolean }>,
    previewId: null as string | null,
  });

  const modals = {
    view: useDisclosure(false),
    edit: useDisclosure(false),
    create: useDisclosure(false),
    delete: useDisclosure(false),
    tracking: useDisclosure(false),
  };

  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    notificationSystem.addNotification(
      type === 'success' ? 'Успех' : 'Ошибка',
      message,
      type
    );
  }, []);

  const fetchData = useCallback(async (url: string, options?: RequestInit) => {
    try {
      let token = localStorage.getItem('token');
      let response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          ...(options?.method !== 'DELETE' && { 'Content-Type': 'application/json' })
        },
        ...options,
      });

      // Если получили 401, пробуем обновить токен
      if (response.status === 401) {
        try {
          const refreshResponse = await fetch(`${API}/refresh-token`, {
            method: 'POST',
            credentials: 'include',
          });

          if (refreshResponse.ok) {
            const newToken = await refreshResponse.json();
            localStorage.setItem('token', newToken);
            token = newToken;
            
            // Повторяем запрос с новым токеном
            response = await fetch(url, {
              headers: {
                'Authorization': `Bearer ${token}`,
                ...(options?.method !== 'DELETE' && { 'Content-Type': 'application/json' })
              },
              ...options,
            });
          }
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        showNotification('error', `Ошибка запроса: ${errorText}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      if (options?.method === 'DELETE') {
        return {};
      }
      return await response.json();
    } catch (error) {
      console.error(`Error fetching data from ${url}:`, error);
      throw error;
    }
  }, [showNotification]);

  const fetchUsers = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loadingUsers: true }));
      const usersData = await fetchData(`${API}/user/users-for-responsible`);
      setState(prev => ({ ...prev, users: usersData, loadingUsers: false }));
      return usersData;
    } catch (error) {
      console.error('Failed to load users:', error);
      setState(prev => ({ ...prev, loadingUsers: false }));
      return [];
    }
  }, [fetchData]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const { getTypes } = await import('../../../utils/typesData');
        const { getToolByLink } = await import('../../../utils/toolUtils');
        
        // Получаем tool для correspondence чтобы получить model_uuid
        const correspondenceTool = await getToolByLink('aho/correspondence');
        
        const [correspondenceData, usersData, senderNamesData] = await Promise.all([
          fetchData(`${API}/aho/correspondence`),
          fetchUsers(),
          fetchData(`${API}/aho/correspondence/sender-names`).catch(() => []) // Загружаем существующие наименования
        ]);

        // Загружаем типы через универсальную систему
        let senderTypesData: Type[] = [];
        let documentTypesData: Type[] = [];
        
        if (correspondenceTool) {
          [senderTypesData, documentTypesData] = await Promise.all([
            getTypes('Отправитель', correspondenceTool.id, undefined, true), // tree=true для иерархии
            getTypes('Тип документа', correspondenceTool.id, undefined, false) // плоский список
          ]);
        }

        setState(prev => ({
          ...prev,
          correspondence: correspondenceData,
          users: usersData,
          senderTypes: senderTypesData,
          documentTypes: documentTypesData,
          senderNames: Array.isArray(senderNamesData) ? senderNamesData.sort() : [],
          loading: false
        }));
      } catch (error) {
        console.error('Failed to load data:', error);
        setState(prev => ({ ...prev, loading: false }));
      }
    };
    loadData();
  }, [fetchData, fetchUsers]);

  // Устанавливаем заголовок страницы
  useEffect(() => {
    setHeader({
      title: 'Корреспонденция',
      subtitle: 'Управление входящей и исходящей корреспонденцией',
      icon: <Text size="xl" fw={700} c="white">📮</Text>,
      actionButton: {
        text: 'Добавить корреспонденцию',
        onClick: () => modals.create[1].open(),
        icon: <IconPlus size={18} />
      }
    });

    return () => clearHeader();
  }, [setHeader, clearHeader]);

  const userOptions = useMemo(() => {
    return state.users
      .filter(u => u.name) // Фильтруем пользователей без имени
      .map(u => ({
        value: u.id,
        label: formatName(u.name)
      }));
  }, [state.users]);

  const senderTypeOptions = useMemo(() => {
    return state.senderTypes.map(t => ({
      value: t.id,
      label: t.name
    }));
  }, [state.senderTypes]);

  const documentTypeOptions = useMemo(() => {
    return state.documentTypes.map(t => ({
      value: t.id,
      label: t.name
    }));
  }, [state.documentTypes]);

  const formConfig = useMemo(() => ({
    fields: [
      {
        name: 'ReceiptDate',
        label: 'Дата получения',
        type: 'datetime' as const,
        required: true
      },
      {
        name: 'senderTypeId',
        label: 'Отправитель',
        type: 'select' as const,
        options: senderTypeOptions,
        required: true,
        groupWith: ['senderSubTypeId'],
        groupSize: 2 as const,
        onChange: (val: string, setFieldValue: any) => {
          // Устанавливаем новое значение типа отправителя
          setFieldValue('senderTypeId', val);
          // Сбрасываем подтипы сразу же - используем пустую строку для Select
          setFieldValue('senderSubTypeId', '');
          setFieldValue('senderSubSubTypeId', '');
        }
      },
      {
        name: 'senderSubTypeId',
        label: 'Подтип отправителя',
        type: 'select' as const,
        options: (values: any) => {
          // Показываем подтипы только если у выбранного типа есть дочерние элементы
          const selectedType = state.senderTypes.find(t => t.id === values.senderTypeId);
          if (selectedType && selectedType.children && selectedType.children.length > 0) {
            return selectedType.children.map((child: Type) => ({ 
              value: child.id, 
              label: child.name 
            }));
          }
          return [];
        },
        required: false,
        disabled: (values: any) => {
          const selectedType = state.senderTypes.find(t => t.id === values.senderTypeId);
          return !selectedType || !selectedType.children || selectedType.children.length === 0;
        },
        onChange: (val: string, setFieldValue: any) => {
          setFieldValue('senderSubTypeId', val);
          // Сбрасываем подподтип при смене подтипа
          setFieldValue('senderSubSubTypeId', '');
        }
      },
      {
        name: 'senderSubSubTypeId',
        label: 'Подподтип отправителя',
        type: 'select' as const,
        options: (values: any) => {
          // Показываем подподтипы только если у выбранного подтипа есть дочерние элементы
          const selectedType = state.senderTypes.find(t => t.id === values.senderTypeId);
          if (selectedType && selectedType.children) {
            const selectedSubType = selectedType.children.find(t => t.id === values.senderSubTypeId);
            if (selectedSubType && selectedSubType.children && selectedSubType.children.length > 0) {
              return selectedSubType.children.map((child: Type) => ({ 
                value: child.id, 
                label: child.name 
              }));
            }
          }
          return [];
        },
        required: false,
        disabled: (values: any) => {
          const selectedType = state.senderTypes.find(t => t.id === values.senderTypeId);
          if (selectedType && selectedType.children) {
            const selectedSubType = selectedType.children.find(t => t.id === values.senderSubTypeId);
            return !selectedSubType || !selectedSubType.children || selectedSubType.children.length === 0;
          }
          return true;
        },
        groupWith: ['senderName'],
        groupSize: 2 as const,
      },
      {
        name: 'senderName',
        label: (values: any) => {
          const selectedType = state.senderTypes.find(t => t.id === values.senderTypeId);
          if (selectedType?.name === 'Физическое лицо') {
            return 'ФИО';
          }
          return 'Отправитель';
        },
        type: 'text' as const,
        required: true,
        placeholder: (values: any) => {
          const selectedType = state.senderTypes.find(t => t.id === values.senderTypeId);
          if (selectedType?.name === 'Физическое лицо') {
            return 'Введите ФИО физического лица';
          }
          return 'Введите наименование отправителя';
        },
        description: 'Пример: ООО "Ромашка", ИП Иванов И.И., Судебный участок №123, Иванов Иван Иванович'
      },
      {
        name: 'documentTypeId',
        label: 'Тип документа',
        type: 'select' as const,
        options: documentTypeOptions,
        required: true,
        groupWith: ['trackNumber'],
        groupSize: 2 as const,
      },
      {
        name: 'trackNumber',
        label: 'Трек-номер',
        type: 'text' as const,
        required: false,
        placeholder: 'Введите трек-номер Почты России (13-14 цифр)',
        description: 'Для отслеживания посылок введите трек-номер',
        onChange: async (value: string) => {
          // Сбрасываем статус при изменении значения
          if (!value || !/^\d{13,14}$/.test(value.replace(/\s+/g, ''))) {
            setState(prev => ({ ...prev, trackingStatus: null }));
          }
        },
      },
      {
        name: 'comments',
        label: 'Комментарии',
        type: 'textarea' as const,
        required: false,
        placeholder: 'Номер дела, ФИО стороны для судебной корреспонденции или иные комментарии'
      },
      {
        name: 'responsibleId',
        label: 'Ответственный',
        type: 'selectSearch' as const,
        options: userOptions,
        required: true,
        searchable: true,
        placeholder: 'Выберите ответственного за обработку'
      },
      {
        name: 'attachments',
        label: 'Вложения',
        type: 'file' as const,
        withDnd: true,
        onRemove: (index: number, values: any, setFieldValue: any) => {
          const newAttachments = [...values.attachments];
          newAttachments.splice(index, 1);
          setFieldValue('attachments', newAttachments);
        }
      }
    ],
    initialValues: DEFAULT_CORRESPONDENCE_FORM,
  }), [userOptions, senderTypeOptions, documentTypeOptions, state.senderTypes, state.senderNames, fetchData]);



  const tableData = useMemo(() => formatTableData(state.correspondence), [state.correspondence]);

  const filterOptions = useMemo(() => ({
    senderType: getFilterOptions(state.correspondence, c => {
      return getSenderTypeLabel(c.senderType, c.senderSubType, c.senderSubSubType);
    }),
    documentType: getFilterOptions(state.correspondence, c => {
      return c.documentType?.name || 'Не указан';
    }),
    responsible: getFilterOptions(state.correspondence, c => {
      return c.responsible?.name ? formatName(c.responsible.name) : 'Не указан';
    })
  }), [state.correspondence]);

  const filters = useMemo(() => [
    {
      type: 'date' as const,
      columnId: 'formattedReceiptDate',
      label: 'Дата получения',
      width: 200,
    },
    {
      type: 'select' as const,
      columnId: 'senderTypeLabel',
      label: 'Отправитель',
      placeholder: 'Выберите отправителя',
      options: filterOptions.senderType,
      width: 250,
    },
    {
      type: 'text' as const,
      columnId: 'senderName',
      label: 'Отправитель/ФИО',
      placeholder: 'Поиск по отправителю',
      width: 250,
    },
    {
      type: 'select' as const,
      columnId: 'documentTypeLabel',
      label: 'Тип документа',
      placeholder: 'Выберите тип',
      options: filterOptions.documentType,
      width: 200,
    },
    {
      type: 'text' as const,
      columnId: 'documentNumber',
      label: 'Номер документа',
      placeholder: 'Поиск по номеру документа',
      width: 200,
    },
    {
      type: 'text' as const,
      columnId: 'trackNumber',
      label: 'Трек-номер',
      placeholder: 'Поиск по трек-номеру',
      width: 200,
    },
    {
      type: 'text' as const,
      columnId: 'comments',
      label: 'Комментарии',
      placeholder: 'Поиск по комментариям',
      width: 250,
    },
    {
      type: 'select' as const,
      columnId: 'responsibleName',
      label: 'Ответственный',
      placeholder: 'Выберите ответственного',
      options: filterOptions.responsible,
      width: 200,
    },
  ], [filterOptions]);

  const columns = useMemo<ColumnDef<CorrespondenceWithFormattedData>[]>(() => [
    {
      accessorKey: 'formattedReceiptDate',
      header: 'Дата получения',
      filterFn: dateRange,
      sortingFn: 'datetime',
      cell: ({ getValue }) => (
        <Text size="sm" fw={500} c="var(--theme-text-primary)">
          {getValue() as string}
        </Text>
      ),
    },
    {
      accessorKey: 'senderTypeLabel',
      header: 'Отправитель',
      filterFn: 'includesString',
      cell: ({ row }) => {
        const item = row.original;
        const senderTypeLabel = item.senderTypeLabel;
        return (
          <Tooltip
            label={senderTypeLabel}
            disabled={!senderTypeLabel}
            withArrow
            position="top"
            openDelay={300}
            multiline
            w={300}
          >
            <Text 
              size="sm" 
              c="var(--theme-text-primary)"
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '200px',
                cursor: senderTypeLabel ? 'help' : 'default'
              }}
            >
              {senderTypeLabel}
        </Text>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: 'senderName',
      header: 'Отправитель/ФИО',
      filterFn: 'includesString',
      cell: ({ getValue }) => {
        const senderName = getValue() as string;
        return (
          <Tooltip
            label={senderName}
            disabled={!senderName}
            withArrow
            position="top"
            openDelay={300}
            multiline
            w={300}
          >
            <Text 
              size="sm" 
              c="var(--theme-text-primary)"
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '250px',
                cursor: senderName ? 'help' : 'default'
              }}
            >
              {senderName || '-'}
        </Text>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: 'documentTypeLabel',
      header: 'Тип документа',
      filterFn: 'includesString',
      cell: ({ getValue }) => {
        const type = getValue() as string;
        return (
          <Tooltip
            label={type}
            disabled={!type}
            withArrow
            position="top"
            openDelay={300}
            multiline
            w={300}
          >
            <Badge 
              color="blue" 
              variant="light" 
              size="sm"
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '200px',
                cursor: type ? 'help' : 'default'
              }}
            >
            {type}
          </Badge>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: 'documentNumber',
      header: 'Номер документа',
      filterFn: 'includesString',
      cell: ({ getValue }) => {
        const documentNumber = getValue() as number;
        const displayValue = documentNumber ? documentNumber.toString() : '';
        return (
          <Tooltip
            label={displayValue}
            disabled={!displayValue}
            withArrow
            position="top"
            openDelay={300}
          >
            <Text 
              size="sm" 
              c="var(--theme-text-primary)"
              style={{ 
                cursor: displayValue ? 'help' : 'default',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100px',
                display: 'block'
              }}
            >
              {displayValue || '-'}
        </Text>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: 'trackNumber',
      header: 'Трек-номер',
      filterFn: 'includesString',
      cell: ({ getValue, row }) => {
        const trackNumber = getValue() as string;
        const cleanTrackNumber = trackNumber?.trim().replace(/\s+/g, '');
        const isTrackNumber = cleanTrackNumber && /^\d{13,14}$/.test(cleanTrackNumber);
        const trackingInfo = isTrackNumber ? state.trackingCache[cleanTrackNumber] : null;
        
        const handleMouseEnter = async () => {
          if (!isTrackNumber) return;
          
          // Проверяем, нужно ли загружать данные
          const cached = state.trackingCache[cleanTrackNumber];
          if (cached?.loading) {
            // Уже загружается
            return;
          }
          if (cached && cached.status && !cached.loading && !cached.error) {
            // Уже загружено успешно
            return;
          }
          
          // Устанавливаем флаг загрузки
          setState(prev => ({
            ...prev,
            trackingCache: {
              ...prev.trackingCache,
              [cleanTrackNumber]: { 
                status: 'Загрузка...',
                loading: true 
              }
            }
          }));
          
          try {
            // Загружаем данные только для этого конкретного трек-номера при наведении
            const correspondenceId = row.original.id;
            const response = await fetchData(`${API}/aho/correspondence/track?trackNumber=${encodeURIComponent(cleanTrackNumber)}&correspondenceId=${correspondenceId}`);
            
            // Обрабатываем события
            const events = response.events || response.trackingEvents || [];
            
            // Получаем последний статус из ответа или из первого события
            let lastStatus = response.lastStatus;
            if (!lastStatus && events.length > 0) {
              const firstEvent = events[0];
              lastStatus = {
                status: firstEvent.description || 
                        firstEvent.operationParameters?.operationType?.name || 
                        'Информация получена',
                date: firstEvent.date,
                location: firstEvent.addressParameters?.operationAddress?.description || 
                         firstEvent.addressParameters?.destinationAddress?.description ||
                         firstEvent.location,
              };
            }

            // Текущий статус - это последний статус из ответа
            const currentStatus = lastStatus?.status || 
                                 (response.error ? 'Ошибка при получении информации' : 'Информация получена');

            setState(prev => ({
              ...prev,
              trackingCache: {
                ...prev.trackingCache,
                [cleanTrackNumber]: {
                  status: currentStatus,
                  date: lastStatus?.date,
                  location: lastStatus?.location,
                  error: response.error ? true : false,
                  loading: false,
                }
              }
            }));
          } catch (error) {
            setState(prev => ({
              ...prev,
              trackingCache: {
                ...prev.trackingCache,
                [cleanTrackNumber]: {
                  status: 'Ошибка при получении информации',
                  error: true,
                  loading: false,
                }
              }
            }));
          }
        };

        return (
          <Tooltip
            label={
              isTrackNumber ? (
                <Box style={{ maxWidth: 250 }}>
                  <Stack gap="xs" p="xs">
                    <Text size="sm" fw={500}>Текущий статус</Text>
                    {trackingInfo?.loading ? (
                      <Loader size="sm" />
                    ) : trackingInfo?.error ? (
                      <Text size="xs" c="red">Ошибка при получении информации</Text>
                    ) : trackingInfo ? (
                      <>
                        <Text size="sm" fw={500} c={trackingInfo.error ? 'red' : 'green'}>
                          {trackingInfo.status}
                        </Text>
                        {trackingInfo.date && (
                          <Text size="xs" c="dimmed">
                            Дата: {dayjs(trackingInfo.date).format('DD.MM.YYYY HH:mm')}
                          </Text>
                        )}
                        {trackingInfo.location && (
                          <Text size="xs" c="dimmed">
                            Место: {trackingInfo.location}
                          </Text>
                        )}
                      </>
                    ) : (
                      <Text size="xs" c="dimmed">Загрузка информации...</Text>
                    )}
                  </Stack>
                </Box>
              ) : trackNumber ? (
                trackNumber
              ) : null
            }
            disabled={!isTrackNumber && !trackNumber}
            withArrow
            position="top"
            openDelay={300}
            multiline={!isTrackNumber}
            w={!isTrackNumber ? 300 : undefined}
          >
          <Text 
            size="sm" 
            c="var(--theme-text-primary)"
              style={{ 
                cursor: (isTrackNumber || trackNumber) ? 'help' : 'default',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '200px',
                display: 'block'
              }}
              onMouseEnter={handleMouseEnter}
            >
              {trackNumber || '-'}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: 'responsibleName',
      header: 'Ответственный',
      filterFn: 'includesString',
      cell: ({ getValue }) => {
        const responsibleName = getValue() as string;
        return (
          <Tooltip
            label={responsibleName}
            disabled={!responsibleName}
            withArrow
            position="top"
            openDelay={300}
            multiline
            w={300}
          >
            <Text 
              size="sm" 
              c="var(--theme-text-secondary)"
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '200px',
                cursor: responsibleName ? 'help' : 'default'
              }}
            >
              {responsibleName || '-'}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: 'comments',
      header: 'Комментарии',
      filterFn: 'includesString',
      cell: ({ getValue }) => {
        const comments = getValue() as string;
        return (
          <Tooltip
            label={comments}
            disabled={!comments}
            withArrow
            position="top"
            openDelay={300}
            multiline
            w={400}
          >
            <Text 
              size="sm" 
              c="var(--theme-text-secondary)"
            style={{ 
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.4,
                maxWidth: '300px',
                cursor: comments ? 'help' : 'default'
            }}
          >
              {comments || '-'}
          </Text>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: 'attachments',
      header: 'Вложения',
      cell: ({ getValue }) => {
        const attachments = getValue() as CorrespondenceAttachment[];
        const getFileIcon = (filename: string) => {
          const ext = filename.split('.').pop()?.toLowerCase();
          const icons: Record<string, string> = {
            'pdf': '📄',
            'doc': '📝',
            'docx': '📝',
            'xls': '📊',
            'xlsx': '📊',
            'jpg': '🖼️',
            'jpeg': '🖼️',
            'png': '🖼️',
            'gif': '🖼️',
            'zip': '📦',
            'rar': '📦',
            'txt': '📄'
          };
          return icons[ext || ''] || '📎';
        };
        
        if (attachments.length === 0) {
          return <Text size="sm" c="var(--theme-text-secondary)">Нет</Text>;
        }
        
        return (
          <Group gap="xs">
            {attachments.slice(0, 2).map((attachment, index) => (
              <Box
                key={index}
                style={{
                  background: 'var(--theme-bg-secondary)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  border: '1px solid var(--theme-border-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Text size="xs">{getFileIcon(attachment.source)}</Text>
                <Text size="xs" c="var(--theme-text-secondary)">
                  {attachment.source.split('/').pop()?.split('\\').pop()?.substring(0, 8) || 'Файл'}
                </Text>
              </Box>
            ))}
            {attachments.length > 2 && (
              <Text size="xs" c="var(--theme-text-secondary)">
                +{attachments.length - 2}
              </Text>
            )}
          </Group>
        );
      },
    },
    {
      accessorKey: 'userName',
      header: 'Автор',
      filterFn: 'includesString',
      cell: ({ row }) => {
        const userName = row.original.userName;
        const userImage = row.original.user?.image;
        // Если изображение есть, формируем data URL (если это base64 строка без префикса)
        const avatarSrc = userImage 
          ? (userImage.startsWith('data:') ? userImage : `data:image/jpeg;base64,${userImage}`)
          : null;
        return (
        <Group gap="sm">
            <Avatar 
              size="sm" 
              radius="md" 
              color="blue"
              src={avatarSrc || undefined}
            >
              {userName.charAt(0).toUpperCase()}
          </Avatar>
          <Text size="sm" c="var(--theme-text-primary)">
              {userName}
          </Text>
        </Group>
        );
      },
    },
    {
      id: 'actions',
      header: 'Действия',
      cell: ({ row }) => (
        <Group gap="xs">
          <ActionIcon
            color="blue"
            variant="light"
            onClick={(e) => {
              e.stopPropagation();
              handleTableAction('edit', row.original);
            }}
            size="sm"
          >
            <IconPencil size={16} />
          </ActionIcon>
          <ActionIcon
            color="red"
            variant="light"
            onClick={(e) => {
              e.stopPropagation();
              handleTableAction('delete', row.original);
            }}
            size="sm"
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      ),
    },
  ], []);

  const handleTableAction = useCallback((action: 'view' | 'edit' | 'delete', data: Correspondence) => {
    setState(prev => ({ ...prev, selectedCorrespondence: data }));
    if (action === 'edit') {
      setState(prev => ({
        ...prev,
        correspondenceForm: {
          ReceiptDate: dayjs(data.ReceiptDate).format('YYYY-MM-DDTHH:mm'),
          senderTypeId: data.senderTypeId,
          senderSubTypeId: data.senderSubTypeId,
          senderSubSubTypeId: data.senderSubSubTypeId,
          senderName: data.senderName,
          documentTypeId: data.documentTypeId,
          trackNumber: data.trackNumber || (data.numberMail && /^\d{13,14}$/.test(data.numberMail.trim().replace(/\s+/g, '')) ? data.numberMail : '') || '',
          comments: data.comments || '',
          responsibleId: data.responsibleId,
          attachments: data.attachments.map(a => ({
            id: a.id,
            userAdd: a.userAdd,
            source: a.source,
            previewUrl: `${API}/public/aho/correspondence/${a.source}`,
          })),
        }
      }));
    }
    modals[action][1].open();
  }, [modals]);

  const handleTrackMail = useCallback(async (trackNumber: string, silent = false) => {
    if (!trackNumber || !/^\d{13,14}$/.test(trackNumber.replace(/\s+/g, ''))) {
      return;
    }

    const cleanTrackNumber = trackNumber.trim().replace(/\s+/g, '');
    setState(prev => ({ ...prev, trackingLoading: true }));
    try {
      // Добавляем correspondenceId, если есть выбранная корреспонденция
      const correspondenceId = state.selectedCorrespondence?.id;
      const url = `${API}/aho/correspondence/track?trackNumber=${encodeURIComponent(cleanTrackNumber)}${correspondenceId ? `&correspondenceId=${correspondenceId}` : ''}`;
      const response = await fetchData(url);
      
      // Обрабатываем события для таймлайна
      const events = response.events || response.trackingEvents || [];
      const processedEvents = events.map((event: any) => ({
        date: event.date,
        description: event.description || event.operationParameters?.operationType?.name || 'Событие',
        location: event.addressParameters?.operationAddress?.description || 
                 event.addressParameters?.destinationAddress?.description ||
                 event.operationParameters?.operationAttribute?.name,
      }));

      // Обрабатываем последний статус
      const lastStatus = response.lastStatus || (events.length > 0 ? {
        status: events[0].description || events[0].operationParameters?.operationType?.name || 'Информация получена',
        date: events[0].date,
        location: events[0].addressParameters?.operationAddress?.description || 
                 events[0].addressParameters?.destinationAddress?.description,
      } : null);

      setState(prev => ({
        ...prev,
        trackingStatus: lastStatus ? {
          status: lastStatus.status || 'Информация получена',
          date: lastStatus.date,
          location: lastStatus.location,
          error: response.error ? true : false,
        } : {
          status: response.error ? 'Ошибка при получении информации' : 'Информация получена',
          error: response.error ? true : false,
        },
        trackingData: {
          ...response,
          events: processedEvents,
        },
        trackingLoading: false,
      }));
      if (!silent) {
        if (response.error) {
          showNotification('error', response.error.description || 'Не удалось получить информацию об отправлении');
        } else {
          showNotification('success', 'Информация об отправлении получена');
        }
      }
    } catch (error) {
      console.error('Failed to track mail:', error);
      setState(prev => ({
        ...prev,
        trackingStatus: {
          status: 'Ошибка при получении информации',
          error: true,
        },
        trackingData: null,
        trackingLoading: false,
      }));
      if (!silent) {
        showNotification('error', 'Не удалось получить информацию об отправлении');
      }
    }
  }, [fetchData, showNotification]);

  // Загружаем данные об отслеживании при открытии модального окна просмотра
  useEffect(() => {
    if (!modals.view[0]) {
      // При закрытии модального окна сбрасываем данные
      setState(prev => ({ ...prev, trackingData: null, trackingStatus: null, trackingLoading: false }));
      return;
    }

    // Загружаем только при открытии модального окна и наличии трек-номера
    const trackNumber = state.selectedCorrespondence?.trackNumber || 
                       (state.selectedCorrespondence?.numberMail ? state.selectedCorrespondence.numberMail.trim().replace(/\s+/g, '') : null);
    if (trackNumber && /^\d{13,14}$/.test(trackNumber)) {
      // Сбрасываем данные при открытии нового модального окна
      setState(prev => ({ ...prev, trackingData: null, trackingStatus: null, trackingLoading: false }));
      // Загружаем данные только для этого конкретного трек-номера
      handleTrackMail(trackNumber, true); // Загружаем без уведомлений
    } else {
      // Если это не трек-номер, сбрасываем данные
      setState(prev => ({ ...prev, trackingData: null, trackingStatus: null, trackingLoading: false }));
    }
  }, [modals.view[0], state.selectedCorrespondence?.id]); // Убрали handleTrackMail из зависимостей

  const handleDeleteConfirm = useCallback(async () => {
    if (!state.selectedCorrespondence) return;
    try {
      await fetchData(`${API}/aho/correspondence/${state.selectedCorrespondence.id}`, {
        method: 'DELETE'
      });
      setState(prev => ({
        ...prev,
        correspondence: prev.correspondence.filter(c => c.id !== state.selectedCorrespondence!.id),
        uploadError: null
      }));
      modals.delete[1].close();
      showNotification('success', 'Корреспонденция успешно удалена');
    } catch (error) {
      console.error('Failed to delete correspondence:', error);
      const errorMsg = error instanceof Error ? error.message : 'Ошибка удаления';
      setState(prev => ({ ...prev, uploadError: errorMsg }));
      showNotification('error', errorMsg);
    }
  }, [state.selectedCorrespondence, fetchData, modals.delete, showNotification]);

  const handleColumnFiltersChange = useCallback((updaterOrValue: any) => {
    setState(prev => ({
      ...prev,
      columnFilters: typeof updaterOrValue === 'function'
        ? updaterOrValue(prev.columnFilters)
        : updaterOrValue
    }));
  }, []);


  const handleFormSubmit = useCallback(async (values: Record<string, any>, mode: 'create' | 'edit') => {
    const formData = new FormData();
    const { attachments, ...cleanedValues } = values;
  
    if (cleanedValues.ReceiptDate) {
      cleanedValues.ReceiptDate = dayjs(cleanedValues.ReceiptDate).toISOString();
    }
  
    // Удаляем пустые подтипы
    if (!cleanedValues.senderSubType) {
      delete cleanedValues.senderSubType;
    }
    if (!cleanedValues.senderSubSubType) {
      delete cleanedValues.senderSubSubType;
    }
    if (!cleanedValues.comments) {
      delete cleanedValues.comments;
    }
  
    formData.append('userAdd', user!.id);
    Object.entries(cleanedValues).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        formData.append(key, String(value));
      }
    });
  
    if (attachments) {
      attachments.forEach((attachment: { source: File | string }) => {
        if (attachment.source instanceof File) {
          formData.append('attachments', attachment.source);
        }
      });
    
      if (mode === 'edit' && state.selectedCorrespondence) {
        const removedAttachments = state.selectedCorrespondence.attachments
          .filter(a => !attachments.some((va: any) => va.id === a.id))
          .map(a => a.id);
      
        if (removedAttachments.length) {
          formData.append('removedAttachments', JSON.stringify(removedAttachments));
        }
      }
    }
  
    try {
      const url = mode === 'create'
        ? `${API}/aho/correspondence`
        : `${API}/aho/correspondence/${state.selectedCorrespondence!.id}`;
    
      const response = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
    
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
    
      const result = await response.json();
    
      // Обновляем состояние с учетом данных пользователя
      const updatedResult = {
        ...result,
        user: user // Убедитесь, что данные пользователя включены
      };
    
      setState(prev => ({
        ...prev,
        correspondence: mode === 'create'
          ? [updatedResult, ...prev.correspondence]
          : prev.correspondence.map(c => c.id === state.selectedCorrespondence!.id ? updatedResult : c),
        uploadError: null
      }));
    
      modals[mode][1].close();
      showNotification(
        'success',
        mode === 'create' ? 'Корреспонденция успешно создана' : 'Корреспонденция успешно обновлена'
      );
    } catch (error) {
      console.error(`Correspondence ${mode} error:`, error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, uploadError: errorMsg }));
      showNotification('error', errorMsg);
    }
  }, [user, state.selectedCorrespondence, modals, showNotification]);


  if (state.loading) return <LoadingOverlay visible />;

  return (
    <DndProviderWrapper>
      <Box style={{ background: 'var(--theme-bg-primary)', minHeight: '100vh' }}>
          {/* Фильтры */}
            <FilterGroup
              filters={filters}
              columnFilters={state.columnFilters}
              onColumnFiltersChange={handleColumnFiltersChange}
            />
        {/* Таблица корреспонденции */}

          <TableComponent<CorrespondenceWithFormattedData>
            data={tableData}
            columns={columns}
            columnFilters={state.columnFilters}
            sorting={state.sorting}
            onColumnFiltersChange={handleColumnFiltersChange}
            onSortingChange={(updaterOrValue) => {
              setState(prev => ({
                ...prev,
                sorting: typeof updaterOrValue === 'function'
                  ? updaterOrValue(prev.sorting)
                  : updaterOrValue
              }));
            }}
            filterFns={{ dateRange }}
            onRowClick={(rowData) => handleTableAction('view', rowData)}
            paginationOptions={[
              { value: '10', label: '10' },
              { value: '20', label: '20' },
              { value: '50', label: '50' },
              { value: '100', label: '100' },
            ]}
          />
        
        <CustomModal
          opened={modals.view[0]}
          onClose={() => {
            modals.view[1].close();
            setState(prev => ({ ...prev, trackingData: null, trackingStatus: null, trackingLoading: false }));
          }}
          title="Просмотр корреспонденции"
          size="xl"
          width="95vw"
          maxWidth="1400px"
          height="90vh"
          maxHeight="90vh"
          styles={{
            body: {
              overflow: 'hidden',
              padding: 0,
              height: 'calc(90vh - 80px)',
              display: 'flex',
              flexDirection: 'column'
            }
          }}
        >
          <ScrollArea h="100%" style={{ flex: 1 }}>
            <Stack gap="xl" p="xl">
              {(() => {
                const item = state.selectedCorrespondence;
                if (!item) return null;
                const formattedItem = formatTableData([item])[0];
                
                // Группируем поля по категориям
                const fieldGroups = [
                  {
                    title: 'Основная информация',
                    icon: IconFileText,
                    color: 'blue',
                    fields: [
                      { label: 'Дата получения', value: formattedItem.formattedReceiptDate, icon: IconCalendar },
                      { label: 'Тип документа', value: formattedItem.documentTypeLabel, icon: IconFileText },
                      { label: 'Номер документа', value: formattedItem.documentNumber ? formattedItem.documentNumber.toString() : (formattedItem.numberMail || 'Не указан'), icon: IconFileText },
                      { label: 'Трек-номер', value: formattedItem.trackNumber || (formattedItem.numberMail && /^\d{13,14}$/.test(formattedItem.numberMail.trim().replace(/\s+/g, '')) ? formattedItem.numberMail : null) || 'Не указан', icon: IconPackage },
                    ]
                  },
                  {
                    title: 'Отправитель',
                    icon: IconUser,
                    color: 'green',
                    fields: [
                      { 
                        label: 'Тип отправителя', 
                        value: formattedItem.senderType?.name || 'Не указан', 
                        icon: IconUser,
                        show: true
                      },
                      { 
                        label: 'Подтип отправителя', 
                        value: formattedItem.senderSubType?.name, 
                        icon: IconUser,
                        show: !!formattedItem.senderSubType
                      },
                      { 
                        label: 'Подподтип отправителя', 
                        value: formattedItem.senderSubSubType?.name, 
                        icon: IconUser,
                        show: !!formattedItem.senderSubSubType
                      },
                      { 
                        label: 'Отправитель/ФИО', 
                        value: formattedItem.senderName, 
                        icon: IconUser,
                        show: !!formattedItem.senderName
                      },
                    ]
                  },
                  {
                    title: 'Ответственность',
                    icon: IconUserCheck,
                    color: 'orange',
                    fields: [
                      { label: 'Ответственный', value: formattedItem.responsibleName, icon: IconUserCheck },
                      { label: 'Создал', value: formattedItem.user?.name ? formatName(formattedItem.user.name) : 'Unknown', icon: IconUser },
                      { label: 'Дата создания', value: formattedItem.formattedCreatedAt, icon: IconClock },
                    ]
                  },
                  {
                    title: 'Дополнительно',
                    icon: IconMessage,
                    color: 'violet',
                    fields: [
                      { label: 'Комментарии', value: formattedItem.comments || 'Нет комментариев', icon: IconMessage },
                    ]
                  }
                ];

                return (
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                    {fieldGroups.map((group, groupIndex) => (
                      <Card 
                        key={groupIndex}
                        p="lg" 
                        withBorder 
                        radius="md"
                        style={{
                          background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
                          border: '1px solid var(--theme-border)',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                        }}
                      >
                        <Group gap="sm" mb="md">
                          <ThemeIcon 
                            size="lg" 
                            radius="md" 
                            variant="light"
                            color={group.color}
                          >
                            <group.icon size={20} />
                          </ThemeIcon>
                          <Text fw={600} size="lg" c="var(--theme-text-primary)">
                            {group.title}
                          </Text>
                        </Group>
                        <Stack gap="md">
                          {group.fields
                            .filter((field: any) => field.show !== false)
                            .map((field: any, fieldIndex: number) => (
                            <Box key={fieldIndex}>
                              <Group gap="xs" mb={4}>
                                <field.icon size={16} style={{ color: 'var(--theme-text-secondary)' }} />
                                <Text size="xs" fw={500} c="var(--theme-text-secondary)" tt="uppercase" style={{ letterSpacing: '0.5px' }}>
                                  {field.label}
                                </Text>
                              </Group>
                              <Text 
                                size="sm" 
                                c="var(--theme-text-primary)"
                                style={{ 
                                  padding: '8px 12px',
                                  background: 'var(--theme-bg-primary)',
                                  borderRadius: '6px',
                                  border: '1px solid var(--theme-border)',
                                  minHeight: '32px',
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                              >
                                {field.value || '-'}
                              </Text>
                            </Box>
                          ))}
                        </Stack>
                      </Card>
                    ))}
                  </SimpleGrid>
                );
              })()}

              {/* Вложения */}
              {state.selectedCorrespondence?.attachments && state.selectedCorrespondence.attachments.length > 0 && (
                <Card 
                  p="lg" 
                  withBorder 
                  radius="md"
                  style={{
                    background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
                    border: '1px solid var(--theme-border)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                  }}
                >
                  <Group gap="sm" mb="md">
                    <ThemeIcon 
                      size="lg" 
                      radius="md" 
                      variant="light"
                      color="cyan"
                    >
                      <IconFile size={20} />
                    </ThemeIcon>
                    <Text fw={600} size="lg" c="var(--theme-text-primary)">
                      Приложения ({state.selectedCorrespondence.attachments.length})
                    </Text>
                  </Group>
                  <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                    {state.selectedCorrespondence.attachments.map((attachment) => {
                      const fileName = typeof attachment.source === 'string'
                        ? attachment.source.split('\\').pop()?.split('/').pop() || 'Файл'
                        : 'Файл';
                      const fileUrl = `${API}/public/aho/correspondence/${attachment.source}`;
                      const fileId = attachment.id || `attachment-${Math.random().toString(36).slice(2, 11)}`;
                      const isImage = fileName.toLowerCase().match(/\.(jpg|jpeg|png|gif|bmp|svg|webp|ico)$/);
                      
                      return (
                        <Card 
                          key={fileId} 
                          p="md" 
                          withBorder
                          radius="md"
                          style={{
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            border: '1px solid var(--theme-border)',
                            background: 'var(--theme-bg-primary)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                          onClick={() => {
                            setState(prev => ({ ...prev, previewId: fileId }));
                          }}
                        >
                          <Stack gap="sm" align="center">
                            {isImage ? (
                              <img 
                                src={fileUrl} 
                                alt={fileName}
                                style={{ 
                                  height: 100, 
                                  width: '100%', 
                                  objectFit: 'contain',
                                  borderRadius: '8px',
                                  border: '1px solid var(--theme-border)'
                                }} 
                              />
                            ) : (
                              <ThemeIcon 
                                size={60} 
                                radius="md" 
                                variant="light"
                                color="blue"
                              >
                                <IconFile size={32} />
                              </ThemeIcon>
                            )}
                            <Text 
                              size="sm" 
                              fw={500} 
                              c="var(--theme-text-primary)"
                              ta="center"
                              lineClamp={2}
                              style={{ wordBreak: 'break-word' }}
                            >
                              {fileName}
                            </Text>
                          </Stack>
                        </Card>
                      );
                    })}
                  </SimpleGrid>
                </Card>
              )}

              {/* Отслеживание посылки */}
              {(() => {
                const trackNumber = state.selectedCorrespondence?.trackNumber?.trim().replace(/\s+/g, '') || 
                                  (state.selectedCorrespondence?.numberMail ? state.selectedCorrespondence.numberMail.trim().replace(/\s+/g, '') : null);
                if (!trackNumber || !/^\d{13,14}$/.test(trackNumber)) {
                  return null;
                }

                const events = state.trackingData?.events || [];
                const sortedEvents = [...events].sort((a, b) => 
                  new Date(a.date).getTime() - new Date(b.date).getTime()
                );

                return (
                  <Card 
                    p="lg" 
                    withBorder 
                    radius="md"
                    style={{
                      background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
                      border: '1px solid var(--theme-border)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                    }}
                  >
                    <Group justify="space-between" mb="md">
                      <Group gap="sm">
                        <ThemeIcon 
                          size="lg" 
                          radius="md" 
                          variant="light"
                          color="teal"
                        >
                          <IconPackage size={20} />
                        </ThemeIcon>
                        <Box>
                          <Text fw={600} size="lg" c="var(--theme-text-primary)">
                            Отслеживание посылки
                          </Text>
                          <Text size="xs" c="var(--theme-text-secondary)">
                            Трек-номер: {trackNumber}
                          </Text>
                        </Box>
                      </Group>
                      <Group gap="xs">
                        {state.trackingLoading ? (
                          <Loader size="sm" />
                        ) : (
                          <ActionIcon
                            variant="light"
                            color="teal"
                            onClick={() => handleTrackMail(trackNumber)}
                            radius="md"
                          >
                            <IconSearch size={18} />
                          </ActionIcon>
                        )}
                      </Group>
                    </Group>
                    {state.trackingData?.error ? (
                      <Text size="sm" c="red">
                        {state.trackingData.error.description || 'Ошибка при получении информации'}
                      </Text>
                    ) : state.trackingStatus ? (
                      <Box>
                        <Group gap="xs" mb="xs">
                          {state.trackingStatus.error ? (
                            <IconX size={16} color="red" />
                          ) : (
                            <IconCheck size={16} color="green" />
                          )}
                          <Text size="sm" c={state.trackingStatus.error ? 'red' : 'green'}>
                            {state.trackingStatus.status}
                          </Text>
                        </Group>
                        {state.trackingStatus.date && (
                          <Text size="xs" c="dimmed">
                            Дата: {dayjs(state.trackingStatus.date).format('DD.MM.YYYY HH:mm')}
                          </Text>
                        )}
                        {state.trackingStatus.location && (
                          <Text size="xs" c="dimmed">
                            Место: {state.trackingStatus.location}
                          </Text>
                        )}
                        {sortedEvents.length > 0 && (
                          <Box mt="md">
                            <Text fw={500} mb="sm">История событий</Text>
                            <Stepper active={sortedEvents.length - 1} orientation="horizontal" size="sm">
                              {sortedEvents.map((event, index) => {
                                const eventWithParams = event as any;
                                const location = event.location || 
                                  eventWithParams.addressParameters?.operationAddress?.description || 
                                  eventWithParams.addressParameters?.destinationAddress?.description;
                                return (
                                  <Stepper.Step
                                    key={index}
                                    label={event.description || 'Событие'}
                                    description={
                                      <Box>
                                        <Text size="xs" c="dimmed">
                                          {dayjs(event.date).format('DD.MM.YYYY HH:mm')}
                                        </Text>
                                        {location && (
                                          <Text size="xs" c="dimmed">
                                            {location}
                                          </Text>
                                        )}
                                      </Box>
                                    }
                                    icon={<IconCheck size={16} />}
                                  />
                                );
                              })}
                            </Stepper>
                          </Box>
                        )}
                      </Box>
                    ) : state.trackingLoading ? (
                      <Loader size="sm" />
                    ) : (
                      <Text size="sm" c="dimmed">
                        Нажмите на иконку поиска для получения информации об отправлении
                      </Text>
                    )}
                  </Card>
                );
              })()}
            </Stack>
          </ScrollArea>
        </CustomModal>
        <FilePreviewModal
          opened={!!state.previewId}
          onClose={() => setState(prev => ({ ...prev, previewId: null }))}
          attachments={state.selectedCorrespondence?.attachments?.map(a => ({
            ...a,
            previewUrl: `${API}/public/aho/correspondence/${a.source}`,
          })) || []}
          initialIndex={state.selectedCorrespondence?.attachments?.findIndex(a => 
            (a.id || `attachment-${Math.random().toString(36).slice(2, 11)}`) === state.previewId
          ) || 0}
        />
        <DynamicFormModal
          opened={modals.edit[0]}
          onClose={() => {
            modals.edit[1].close();
            setState(prev => ({ ...prev, trackingStatus: null, trackingLoading: false }));
          }}
          title="Редактирование корреспонденции"
          mode="edit"
          fields={formConfig.fields}
          initialValues={state.correspondenceForm}
          onSubmit={(values) => handleFormSubmit(values, 'edit')}
          error={state.uploadError}
          viewExtraContent={(values) => {
            const trackNumber = values.trackNumber?.trim().replace(/\s+/g, '') || 
                               (values.numberMail ? values.numberMail.trim().replace(/\s+/g, '') : null);
            if (!trackNumber || !/^\d{13,14}$/.test(trackNumber)) {
              return <></>;
            }
            return (
              <Card mt="md" p="md" withBorder>
                <Group justify="space-between" mb="xs">
                  <Text fw={500}>Отслеживание посылки</Text>
                  <Group gap="xs">
                    {state.trackingLoading ? (
                      <Loader size="sm" />
                    ) : (
                      <ActionIcon
                        variant="light"
                        onClick={() => handleTrackMail(trackNumber)}
                      >
                        <IconSearch size={16} />
                      </ActionIcon>
                    )}
                  </Group>
                </Group>
                {state.trackingStatus && (
                  <Box>
                    <Group gap="xs" mb="xs">
                      {state.trackingStatus.error ? (
                        <IconX size={16} color="red" />
                      ) : (
                        <IconCheck size={16} color="green" />
                      )}
                      <Text size="sm" c={state.trackingStatus.error ? 'red' : 'green'}>
                        {state.trackingStatus.status}
                      </Text>
                    </Group>
                    {state.trackingStatus.date && (
                      <Text size="xs" c="dimmed">
                        Дата: {dayjs(state.trackingStatus.date).format('DD.MM.YYYY HH:mm')}
                      </Text>
                    )}
                    {state.trackingStatus.location && (
                      <Text size="xs" c="dimmed">
                        Место: {state.trackingStatus.location}
                      </Text>
                    )}
                  </Box>
                )}
                {!state.trackingStatus && !state.trackingLoading && (
                  <Text size="sm" c="dimmed">
                    Нажмите на иконку поиска для получения информации об отправлении
                  </Text>
                )}
              </Card>
            );
          }}
        />
        <DynamicFormModal
          opened={modals.create[0]}
          onClose={() => {
            modals.create[1].close();
            setState(prev => ({ ...prev, trackingStatus: null, trackingLoading: false }));
          }}
          title="Добавить корреспонденцию"
          mode="create"
          fields={formConfig.fields}
          initialValues={state.correspondenceForm}
          onSubmit={(values) => handleFormSubmit(values, 'create')}
          error={state.uploadError}
          viewExtraContent={(values) => {
            const trackNumber = values.trackNumber?.trim().replace(/\s+/g, '') || 
                               (values.numberMail ? values.numberMail.trim().replace(/\s+/g, '') : null);
            if (!trackNumber || !/^\d{13,14}$/.test(trackNumber)) {
              return <></>;
            }
            return (
              <Card mt="md" p="md" withBorder>
                <Group justify="space-between" mb="xs">
                  <Text fw={500}>Отслеживание посылки</Text>
                  <Group gap="xs">
                    {state.trackingLoading ? (
                      <Loader size="sm" />
                    ) : (
                      <ActionIcon
                        variant="light"
                        onClick={() => handleTrackMail(trackNumber)}
                      >
                        <IconSearch size={16} />
                      </ActionIcon>
                    )}
                  </Group>
                </Group>
                {state.trackingStatus && (
                  <Box>
                    <Group gap="xs" mb="xs">
                      {state.trackingStatus.error ? (
                        <IconX size={16} color="red" />
                      ) : (
                        <IconCheck size={16} color="green" />
                      )}
                      <Text size="sm" c={state.trackingStatus.error ? 'red' : 'green'}>
                        {state.trackingStatus.status}
                      </Text>
                    </Group>
                    {state.trackingStatus.date && (
                      <Text size="xs" c="dimmed">
                        Дата: {dayjs(state.trackingStatus.date).format('DD.MM.YYYY HH:mm')}
                      </Text>
                    )}
                    {state.trackingStatus.location && (
                      <Text size="xs" c="dimmed">
                        Место: {state.trackingStatus.location}
                      </Text>
                    )}
                  </Box>
                )}
                {!state.trackingStatus && !state.trackingLoading && (
                  <Text size="sm" c="dimmed">
                    Нажмите на иконку поиска для получения информации об отправлении
                  </Text>
                )}
              </Card>
            );
          }}
        />
        <DynamicFormModal
          opened={modals.delete[0]}
          onClose={modals.delete[1].close}
          title="Подтверждение удаления"
          mode="delete"
          initialValues={state.selectedCorrespondence || {}}
          onConfirm={handleDeleteConfirm}
        />
        <CustomModal
          opened={modals.tracking[0]}
          onClose={modals.tracking[1].close}
          title="Таймлайн отслеживания посылки"
          size="xl"
          width="95vw"
          maxWidth="1400px"
        >
          {(() => {
            const trackNumber = state.selectedCorrespondence?.trackNumber?.trim().replace(/\s+/g, '') || 
                               (state.selectedCorrespondence?.numberMail ? state.selectedCorrespondence.numberMail.trim().replace(/\s+/g, '') : null);
            if (!trackNumber || !/^\d{13,14}$/.test(trackNumber)) {
              return <Text>Неверный номер отслеживания</Text>;
            }

            const events = state.trackingData?.events || [];
            const sortedEvents = [...events].sort((a, b) => 
              new Date(a.date).getTime() - new Date(b.date).getTime()
            );

            if (state.trackingData?.error) {
              return (
                <Text size="sm" c="red">
                  {state.trackingData.error.description || 'Ошибка при получении информации'}
                </Text>
              );
            }

            if (sortedEvents.length === 0) {
              return (
                <Text size="sm" c="dimmed">
                  События отслеживания отсутствуют
                </Text>
              );
            }

            return (
              <Box>
                <Group justify="space-between" mb="md">
                  <Text fw={500}>Трек-номер: {trackNumber}</Text>
                  <ActionIcon
                    variant="light"
                    onClick={() => handleTrackMail(trackNumber)}
                  >
                    <IconSearch size={16} />
                  </ActionIcon>
                </Group>
                <Stepper active={sortedEvents.length - 1} orientation="horizontal" size="sm">
                  {sortedEvents.map((event, index) => (
                    <Stepper.Step
                      key={index}
                      label={event.description || 'Событие'}
                      description={
                        <Box>
                          <Text size="xs" c="dimmed">
                            {dayjs(event.date).format('DD.MM.YYYY HH:mm')}
                          </Text>
                          {event.location && (
                            <Text size="xs" c="dimmed">
                              {event.location}
                            </Text>
                          )}
                        </Box>
                      }
                      icon={<IconCheck size={16} />}
                    />
                  ))}
                </Stepper>
              </Box>
            );
          })()}
        </CustomModal>
      </Box>
      <FloatingActionButton />
    </DndProviderWrapper>
  );
}

