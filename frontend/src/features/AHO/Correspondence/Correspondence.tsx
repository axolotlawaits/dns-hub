import { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { usePageHeader } from '../../../contexts/PageHeaderContext';
import { notificationSystem } from '../../../utils/Push';
import { formatName } from '../../../utils/format';
import { dateRange, FilterGroup } from '../../../utils/filter';
import { Box, LoadingOverlay, Group, ActionIcon, Text, Badge, Avatar, Card } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { IconPencil, IconTrash, IconPlus } from '@tabler/icons-react';
import { ColumnDef, ColumnFiltersState, SortingState } from '@tanstack/react-table';
import { DndProviderWrapper } from '../../../utils/dnd';
import { DynamicFormModal } from '../../../utils/formModal';
import { TableComponent } from '../../../utils/table';
import FloatingActionButton from '../../../components/FloatingActionButton';

interface User {
  id: string;
  name: string;
  email?: string;
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
  // Старые поля для обратной совместимости
  from?: string;
  to?: string;
  content?: string;
  typeMail?: string;
  numberMail?: string;
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
    senderSubTypes: [] as Type[],
    senderSubSubTypes: [] as Type[],
    documentTypes: [] as Type[],
    users: [] as User[],
    loadingUsers: false,
  });

  const modals = {
    view: useDisclosure(false),
    edit: useDisclosure(false),
    create: useDisclosure(false),
    delete: useDisclosure(false),
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
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          ...(options?.method !== 'DELETE' && { 'Content-Type': 'application/json' })
        },
        ...options,
      });
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
      const usersData = await fetchData(`${API}/user/users-with-email`);
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
        const [correspondenceData, usersData, senderTypesData, documentTypesData] = await Promise.all([
          fetchData(`${API}/aho/correspondence`),
          fetchUsers(),
          fetchData(`${API}/aho/correspondence/types/sender`),
          fetchData(`${API}/aho/correspondence/types/document`)
        ]);
        
        // Извлекаем подтипы и подподтипы из иерархии senderTypes
        const senderSubTypes: Type[] = [];
        const senderSubSubTypes: Type[] = [];
        senderTypesData.forEach((type: Type & { children?: Type[] }) => {
          if (type.children) {
            type.children.forEach((subType: Type & { children?: Type[] }) => {
              senderSubTypes.push(subType);
              if (subType.children) {
                senderSubSubTypes.push(...subType.children);
              }
            });
          }
        });

        setState(prev => ({
          ...prev,
          correspondence: correspondenceData,
          users: usersData,
          senderTypes: senderTypesData,
          senderSubTypes,
          senderSubSubTypes,
          documentTypes: documentTypesData,
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
    return state.users.map(u => ({
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
          setFieldValue('senderTypeId', val);
          // Сбрасываем подтипы при смене типа отправителя
          const selectedType = state.senderTypes.find(t => t.id === val);
          if (selectedType?.name !== 'Суд') {
            setFieldValue('senderSubTypeId', undefined);
            setFieldValue('senderSubSubTypeId', undefined);
          } else {
            setFieldValue('senderSubSubTypeId', undefined);
          }
        }
      },
      {
        name: 'senderSubTypeId',
        label: 'Подтип отправителя',
        type: 'select' as const,
        options: state.senderSubTypes.map(t => ({ value: t.id, label: t.name })),
        required: false,
        onChange: (val: string, setFieldValue: any) => {
          setFieldValue('senderSubTypeId', val);
          // Сбрасываем подподтип при смене подтипа
          const selectedSubType = state.senderSubTypes.find(t => t.id === val);
          if (selectedSubType?.name !== 'Федеральные суды') {
            setFieldValue('senderSubSubTypeId', undefined);
          }
        }
      },
      {
        name: 'senderSubSubTypeId',
        label: 'Подподтип отправителя',
        type: 'select' as const,
        options: state.senderSubSubTypes.map(t => ({ value: t.id, label: t.name })),
        required: false,
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
          return 'Наименование';
        },
        type: 'text' as const,
        required: true,
        placeholder: (values: any) => {
          const selectedType = state.senderTypes.find(t => t.id === values.senderTypeId);
          if (selectedType?.name === 'Физическое лицо') {
            return 'Введите ФИО физического лица';
          }
          return 'Введите наименование отправителя';
        }
      },
      {
        name: 'documentTypeId',
        label: 'Тип документа',
        type: 'select' as const,
        options: documentTypeOptions,
        required: true,
        groupWith: ['responsibleId'],
        groupSize: 2 as const,
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
  }), [userOptions, senderTypeOptions, documentTypeOptions, state.senderTypes, state.senderSubTypes, state.senderSubSubTypes]);

  const viewFieldsConfig = useMemo(() => [
    { label: 'Дата получения', value: (item: CorrespondenceWithFormattedData) => item.formattedReceiptDate },
    { label: 'Отправитель', value: (item: CorrespondenceWithFormattedData) => `${item.senderTypeLabel} - ${item.senderName}` },
    { label: 'Тип документа', value: (item: CorrespondenceWithFormattedData) => item.documentTypeLabel },
    { label: 'Комментарии', value: (item: CorrespondenceWithFormattedData) => item.comments || 'Нет комментариев' },
    { label: 'Ответственный', value: (item: CorrespondenceWithFormattedData) => item.responsibleName },
    { label: 'Создал', value: (item: CorrespondenceWithFormattedData) => item.user?.name ? formatName(item.user.name) : 'Unknown' },
    { label: 'Дата создания', value: (item: CorrespondenceWithFormattedData) => item.formattedCreatedAt },
  ], []);


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
      type: 'select' as const,
      columnId: 'documentTypeLabel',
      label: 'Тип документа',
      placeholder: 'Выберите тип',
      options: filterOptions.documentType,
      width: 200,
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
        return (
          <Text size="sm" c="var(--theme-text-primary)">
            {item.senderTypeLabel}
          </Text>
        );
      },
    },
    {
      accessorKey: 'senderName',
      header: 'Наименование/ФИО',
      filterFn: 'includesString',
      cell: ({ getValue }) => (
        <Text size="sm" c="var(--theme-text-primary)">
          {getValue() as string}
        </Text>
      ),
    },
    {
      accessorKey: 'documentTypeLabel',
      header: 'Тип документа',
      filterFn: 'includesString',
      cell: ({ getValue }) => {
        const type = getValue() as string;
        return (
          <Badge color="blue" variant="light" size="sm">
            {type}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'responsibleName',
      header: 'Ответственный',
      filterFn: 'includesString',
      cell: ({ getValue }) => (
        <Text size="sm" c="var(--theme-text-secondary)">
          {getValue() as string}
        </Text>
      ),
    },
    {
      accessorKey: 'comments',
      header: 'Комментарии',
      cell: ({ getValue }) => {
        const content = getValue() as string;
        return (
          <Text 
            size="sm" 
            c="var(--theme-text-primary)"
            style={{ 
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.4,
              maxWidth: '300px'
            }}
          >
            {content}
          </Text>
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
      cell: ({ getValue }) => (
        <Group gap="sm">
          <Avatar size="sm" radius="md" color="blue">
            {(getValue() as string).charAt(0).toUpperCase()}
          </Avatar>
          <Text size="sm" c="var(--theme-text-primary)">
            {getValue() as string}
          </Text>
        </Group>
      ),
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
          comments: data.comments || '',
          responsibleId: data.responsibleId,
          attachments: data.attachments.map(a => ({
            id: a.id,
            userAdd: a.userAdd,
            source: a.source,
          })),
        }
      }));
    }
    modals[action][1].open();
  }, [modals]);

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
        <Card style={{
          background: 'var(--theme-bg-elevated)',
          borderRadius: '16px',
          border: '1px solid var(--theme-border-primary)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
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
        </Card>
        <DynamicFormModal
          opened={modals.view[0]}
          onClose={modals.view[1].close}
          title="Просмотр корреспонденции"
          mode="view"
          initialValues={{
            ...state.selectedCorrespondence,
            attachments: state.selectedCorrespondence?.attachments || [],
          }}
          viewFieldsConfig={viewFieldsConfig}
        />
        <DynamicFormModal
          opened={modals.edit[0]}
          onClose={modals.edit[1].close}
          title="Редактирование корреспонденции"
          mode="edit"
          fields={formConfig.fields}
          initialValues={state.correspondenceForm}
          onSubmit={(values) => handleFormSubmit(values, 'edit')}
          error={state.uploadError}
        />
        <DynamicFormModal
          opened={modals.create[0]}
          onClose={modals.create[1].close}
          title="Добавить корреспонденцию"
          mode="create"
          fields={formConfig.fields}
          initialValues={state.correspondenceForm}
          onSubmit={(values) => handleFormSubmit(values, 'create')}
          error={state.uploadError}
        />
        <DynamicFormModal
          opened={modals.delete[0]}
          onClose={modals.delete[1].close}
          title="Подтверждение удаления"
          mode="delete"
          initialValues={state.selectedCorrespondence || {}}
          onConfirm={handleDeleteConfirm}
        />
      </Box>
      <FloatingActionButton />
    </DndProviderWrapper>
  );
}

