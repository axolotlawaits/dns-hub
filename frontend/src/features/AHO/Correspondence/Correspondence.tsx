import { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { notificationSystem } from '../../../utils/Push';
import { formatName } from '../../../utils/format';
import { dateRange, FilterGroup } from '../../../utils/filter';
import { Button, Title, Box, LoadingOverlay, Grid, Card, Group, ActionIcon } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { ColumnDef, ColumnFiltersState, SortingState } from '@tanstack/react-table';
import { DndProviderWrapper } from '../../../utils/dnd';
import { DynamicFormModal } from '../../../utils/formModal';
import { TableComponent } from '../../../utils/Table';

interface TypeMailOption {
  value: string;
  label: string;
}

interface User {
  id: string;
  name: string;
}

interface CorrespondenceAttachment {
  id: string;
  createdAt: Date;
  record_id: string;
  userAdd: string;
  source: string;
  user: User;
}

interface Correspondence {
  id: string;
  createdAt: Date;
  ReceiptDate: Date;
  userAdd: string;
  from: string;
  to: string;
  content: string;
  typeMail: string;
  numberMail: string;
  attachments: CorrespondenceAttachment[];
  user: User;
}

interface CorrespondenceWithFormattedData extends Correspondence {
  formattedReceiptDate: string;
  formattedCreatedAt: string;
  userName: string;
  typeMailName: string;
}

interface CorrespondenceForm {
  ReceiptDate: string;
  from: string;
  to: string;
  content: string;
  typeMail: string;
  numberMail: string;
  attachments: Array<{ id?: string; userAdd?: string; source: File | string }>;
}

const DEFAULT_CORRESPONDENCE_FORM: CorrespondenceForm = {
  ReceiptDate: dayjs().format('YYYY-MM-DDTHH:mm'),
  from: '',
  to: '',
  content: '',
  typeMail: '',
  numberMail: '',
  attachments: [],
};

const formatTableData = (data: Correspondence[], typeMailOptions: TypeMailOption[]): CorrespondenceWithFormattedData[] => {
  return data.map((item) => {
    const typeMailName = typeMailOptions.find(option => option.value === item.typeMail)?.label || 'Без типа';
    return {
      ...item,
      formattedReceiptDate: dayjs(item.ReceiptDate).format('DD.MM.YYYY HH:mm'),
      formattedCreatedAt: dayjs(item.createdAt).format('DD.MM.YYYY HH:mm'),
      userName: item.user?.name ? formatName(item.user.name) : 'Unknown',
      typeMailName,
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
  const [state, setState] = useState({
    correspondence: [] as Correspondence[],
    loading: true,
    selectedCorrespondence: null as Correspondence | null,
    correspondenceForm: DEFAULT_CORRESPONDENCE_FORM,
    uploadError: null as string | null,
    columnFilters: [] as ColumnFiltersState,
    sorting: [{ id: 'formattedReceiptDate', desc: true }] as SortingState,
    typeMailOptions: [] as TypeMailOption[],
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

  const fetchTypeMailOptions = useCallback(async () => {
    const data = await fetchData(`${API}/type/sub?model_uuid=${MODEL_UUID}&chapter=${CHAPTER}`);
    return data.map((type: any) => ({ value: type.id, label: type.name }));
  }, [fetchData]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [correspondenceData, typeOptions] = await Promise.all([
          fetchData(`${API}/aho/correspondence`),
          fetchTypeMailOptions()
        ]);
        setState(prev => ({
          ...prev,
          correspondence: correspondenceData,
          typeMailOptions: typeOptions,
          loading: false
        }));
      } catch (error) {
        console.error('Failed to load data:', error);
        setState(prev => ({ ...prev, loading: false }));
      }
    };
    loadData();
  }, [fetchData, fetchTypeMailOptions]);

  const formConfig = useMemo(() => ({
    fields: [
      {
        name: 'ReceiptDate',
        label: 'Дата получения',
        type: 'datetime' as const,
        required: true
      },
      {
        name: 'from',
        label: 'От',
        type: 'text' as const,
        required: true
      },
      {
        name: 'to',
        label: 'Кому',
        type: 'text' as const,
        required: true
      },
      {
        name: 'content',
        label: 'Содержание',
        type: 'textarea' as const,
        required: true
      },
      {
        name: 'typeMail',
        label: 'Тип письма',
        type: 'select' as const,
        options: state.typeMailOptions,
        required: true
      },
      {
        name: 'numberMail',
        label: 'Номер письма',
        type: 'text' as const,
        required: true
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
  }), [state.typeMailOptions]);

  const viewFieldsConfig = useMemo(() => [
    { label: 'Дата получения', value: (item: CorrespondenceWithFormattedData) => item.formattedReceiptDate },
    { label: 'От', value: (item: CorrespondenceWithFormattedData) => item.from },
    { label: 'Кому', value: (item: CorrespondenceWithFormattedData) => item.to },
    { label: 'Тип письма', value: (item: CorrespondenceWithFormattedData) => item.typeMailName },
    { label: 'Номер письма', value: (item: CorrespondenceWithFormattedData) => item.numberMail },
    { label: 'Содержание', value: (item: CorrespondenceWithFormattedData) => item.content },
    { label: 'Создал', value: (item: CorrespondenceWithFormattedData) => item.user?.name || 'Unknown' },
    { label: 'Дата создания', value: (item: CorrespondenceWithFormattedData) => item.formattedCreatedAt },
  ], []);


  const tableData = useMemo(() => formatTableData(state.correspondence, state.typeMailOptions), [state.correspondence, state.typeMailOptions]);

  const filterOptions = useMemo(() => ({
    user: getFilterOptions(state.correspondence, c => c.user?.name ? formatName(c.user.name) : 'Unknown'),
    type: getFilterOptions(state.correspondence, c => {
      const typeMailName = state.typeMailOptions.find(option => option.value === c.typeMail)?.label || 'Без типа';
      return typeMailName;
    })
  }), [state.correspondence, state.typeMailOptions]);

  const filters = useMemo(() => [
    {
      type: 'date' as const,
      columnId: 'formattedReceiptDate',
      label: 'Дата получения',
      width: 200,
    },
    {
      type: 'select' as const,
      columnId: 'userName',
      label: 'Автор',
      placeholder: 'Выберите пользователя',
      options: filterOptions.user,
      width: 200,
    },
    {
      type: 'select' as const,
      columnId: 'typeMailName',
      label: 'Тип письма',
      placeholder: 'Выберите тип',
      options: filterOptions.type,
      width: 200,
    },
  ], [filterOptions]);

  const columns = useMemo<ColumnDef<CorrespondenceWithFormattedData>[]>(() => [
    {
      accessorKey: 'formattedReceiptDate',
      header: 'Дата получения',
      filterFn: dateRange,
      sortingFn: 'datetime',
    },
    {
      accessorKey: 'from',
      header: 'От',
      filterFn: 'includesString',
    },
    {
      accessorKey: 'to',
      header: 'Кому',
      filterFn: 'includesString',
    },
    {
      accessorKey: 'typeMailName',
      header: 'Тип письма',
      filterFn: 'includesString',
    },
    {
      accessorKey: 'numberMail',
      header: 'Номер письма',
      filterFn: 'includesString',
    },
    {
      accessorKey: 'userName',
      header: 'Автор',
      filterFn: 'includesString',
    },
    {
      id: 'actions',
      header: 'Действия',
      cell: ({ row }) => (
        <Group wrap="nowrap">
          <ActionIcon
            color="blue"
            onClick={(e) => {
              e.stopPropagation();
              handleTableAction('edit', row.original);
            }}
          >
            <IconPencil size={18} />
          </ActionIcon>
          <ActionIcon
            color="red"
            onClick={(e) => {
              e.stopPropagation();
              handleTableAction('delete', row.original);
            }}
          >
            <IconTrash size={18} />
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
          from: data.from,
          to: data.to,
          content: data.content,
          typeMail: data.typeMail,
          numberMail: data.numberMail,
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

  const handleSortingChange = useCallback((updaterOrValue: any) => {
    setState(prev => ({
      ...prev,
      sorting: typeof updaterOrValue === 'function'
        ? updaterOrValue(prev.sorting)
        : updaterOrValue
    }));
  }, []);

  const handleFormSubmit = useCallback(async (values: Record<string, any>, mode: 'create' | 'edit') => {
    const formData = new FormData();
    const { attachments, ...cleanedValues } = values;
  
    if (cleanedValues.ReceiptDate) {
      cleanedValues.ReceiptDate = dayjs(cleanedValues.ReceiptDate).toISOString();
    }
  
    formData.append('userAdd', user!.id);
    Object.entries(cleanedValues).forEach(([key, value]) => {
      if (value !== undefined) {
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
      <Box p="md">
        <Button
          fullWidth
          mt="xl"
          size="md"
          onClick={() => {
            setState(prev => ({
              ...prev,
              correspondenceForm: {
                ...DEFAULT_CORRESPONDENCE_FORM,
                ReceiptDate: dayjs().format('YYYY-MM-DDTHH:mm')
              }
            }));
            modals.create[1].open();
          }}
        >
          Добавить корреспонденцию
        </Button>
        <Title order={2} mt="md" mb="lg">
          Корреспонденция
        </Title>
        <Grid>
          <Grid.Col span={12}>
            <FilterGroup
              filters={filters}
              columnFilters={state.columnFilters}
              onColumnFiltersChange={handleColumnFiltersChange}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Card withBorder shadow="sm">
              <TableComponent<CorrespondenceWithFormattedData>
                data={tableData}
                columns={columns}
                columnFilters={state.columnFilters}
                sorting={state.sorting}
                onColumnFiltersChange={handleColumnFiltersChange}
                onSortingChange={handleSortingChange}
                filterFns={{ dateRange }}
                onRowClick={(rowData) => handleTableAction('view', rowData)}
              />
            </Card>
          </Grid.Col>
        </Grid>
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
    </DndProviderWrapper>
  );
}

const MODEL_UUID = '7be62529-3fb5-430d-9017-48b752841e54';
const CHAPTER = 'Тип письма';
