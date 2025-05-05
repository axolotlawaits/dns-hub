import { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { formatName } from '../../../utils/format';
import { dateRange } from '../../../utils/filter';
import { Button, Title, Box, LoadingOverlay, Grid, Card, Group, ActionIcon } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { ColumnDef, ColumnFiltersState, SortingState, OnChangeFn } from '@tanstack/react-table';
import { DndProviderWrapper } from '../../../utils/dnd';
import { DynamicFormModal } from '../../../utils/formModal';
import { TableComponent } from '../../../utils/table';
import { FilterGroup } from '../../../utils/filter';

// Типы вынесены в отдельный интерфейс для лучшей читаемости
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
}

interface CorrespondenceForm {
  ReceiptDate: string;
  userAdd: string;
  from: string;
  to: string;
  content: string;
  typeMail: string;
  numberMail: string;
  attachments: Array<{ id?: string; userAdd: string; source: File | string }>;
}

// Константы вынесены в начало для лучшей видимости
const DEFAULT_CORRESPONDENCE_FORM: CorrespondenceForm = {
  ReceiptDate: dayjs().format('YYYY-MM-DDTHH:mm'),
  userAdd: '',
  from: '',
  to: '',
  content: '',
  typeMail: '',
  numberMail: '',
  attachments: [],
};

const MODEL_UUID = '7be62529-3fb5-430d-9017-48b752841e54';
const CHAPTER = 'Тип письма';

// Вынесена функция для форматирования данных таблицы
const formatTableData = (data: Correspondence[]): CorrespondenceWithFormattedData[] => {
  return data.map((item) => ({
    ...item,
    formattedReceiptDate: dayjs(item.ReceiptDate).format('DD.MM.YYYY HH:mm'),
    formattedCreatedAt: dayjs(item.createdAt).format('DD.MM.YYYY HH:mm'),
    userName: item.user?.name ? formatName(item.user.name) : 'Unknown',
  }));
};

// Вынесена функция для получения опций фильтра пользователей
const getUserFilterOptions = (data: Correspondence[]) => {
  const uniqueNames = Array.from(
    new Set(data.map((c) => c.user?.name ? formatName(c.user.name) : 'Unknown')
  ));
  return uniqueNames.map((name) => ({ value: name, label: name }));
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

  // Унифицированная функция для обновления состояния
  const updateState = (newState: Partial<typeof state>) => {
    setState(prev => ({ ...prev, ...newState }));
  };

  const fetchData = useCallback(async (url: string, options?: RequestInit) => {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        ...options,
      });
      if (!response.ok) throw new Error(`Failed to fetch data from ${url}`);
      return await response.json();
    } catch (error) {
      console.error(`Error fetching data from ${url}:`, error);
      throw error;
    }
  }, []);

  const fetchTypeMailOptions = useCallback(async () => {
    const data = await fetchData(`${API}/type/sub?model_uuid=${MODEL_UUID}&chapter=${CHAPTER}`);
    return data.map((type: any) => ({
      value: type.name,
      label: type.name,
    }));
  }, [fetchData]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [correspondenceData, typeOptions] = await Promise.all([
          fetchData(`${API}/aho/correspondence`),
          fetchTypeMailOptions(),
        ]);
        updateState({ 
          correspondence: correspondenceData,
          typeMailOptions: typeOptions,
          loading: false 
        });
      } catch (error) {
        console.error('Failed to load data:', error);
        updateState({ loading: false });
      }
    };
    fetchInitialData();
  }, [fetchData, fetchTypeMailOptions]);

  const formConfig = useMemo(() => ({
    fields: [
      {
        name: 'ReceiptDate',
        label: 'Дата получения',
        type: 'datetime' as const,
        required: true,
      },
      {
        name: 'from',
        label: 'От',
        type: 'text' as const,
        required: true,
      },
      {
        name: 'to',
        label: 'Кому',
        type: 'text' as const,
        required: true,
      },
      {
        name: 'typeMail',
        label: 'Тип письма',
        type: 'select' as const,
        required: true,
        options: state.typeMailOptions,
      },
      {
        name: 'numberMail',
        label: 'Номер письма',
        type: 'text' as const,
        required: true,
      },
      {
        name: 'content',
        label: 'Содержание',
        type: 'textarea' as const,
        required: true,
      },
    ],
    initialValues: DEFAULT_CORRESPONDENCE_FORM,
  }), [state.typeMailOptions]);
  
  const viewFieldsConfig = useMemo(() => [
    { label: 'Дата получения', value: (item: Correspondence) => dayjs(item.ReceiptDate).format('DD.MM.YYYY HH:mm') },
    { label: 'От', value: (item: Correspondence) => item.from },
    { label: 'Кому', value: (item: Correspondence) => item.to },
    { label: 'Тип письма', value: (item: Correspondence) => item.typeMail },
    { label: 'Номер письма', value: (item: Correspondence) => item.numberMail },
    { label: 'Содержание', value: (item: Correspondence) => item.content },
    { label: 'Добавил', value: (item: Correspondence) => item.user?.name || 'Unknown' },
    { label: 'Дата создания', value: (item: Correspondence) => dayjs(item.createdAt).format('DD.MM.YYYY HH:mm') },
  ], []);

  const tableData = useMemo(() => formatTableData(state.correspondence), [state.correspondence]);
  const userFilterOptions = useMemo(() => getUserFilterOptions(state.correspondence), [state.correspondence]);

  const handleTableAction = useCallback((action: 'view' | 'edit' | 'delete', data: Correspondence) => {
    updateState({ selectedCorrespondence: data });
    if (action === 'edit') {
      updateState({
        correspondenceForm: {
          ReceiptDate: dayjs(data.ReceiptDate).format('YYYY-MM-DDTHH:mm'),
          userAdd: data.userAdd,
          from: data.from,
          to: data.to,
          content: data.content,
          typeMail: data.typeMail,
          numberMail: data.numberMail,
          attachments: data.attachments.map((a) => ({
            id: a.id,
            userAdd: a.userAdd,
            source: a.source,
          })),
        }
      });
    }
    modals[action][1].open();
  }, [modals]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!state.selectedCorrespondence) return;
    try {
      await fetchData(`${API}/aho/correspondence/${state.selectedCorrespondence.id}`, {
        method: 'DELETE',
      });
      updateState({ 
        correspondence: state.correspondence.filter(item => item.id !== state.selectedCorrespondence?.id)
      });
      modals.delete[1].close();
    } catch (error) {
      console.error('Failed to delete correspondence:', error);
    }
  }, [state.selectedCorrespondence, state.correspondence, modals.delete, fetchData]);

  const handleFormSubmit = useCallback(async (values: Record<string, any>, mode: 'create' | 'edit') => {
    if (!user && mode === 'create') return;
    try {
      const formData = new FormData();
      formData.append('ReceiptDate', new Date(values.ReceiptDate).toISOString());
      formData.append('userAdd', mode === 'create' ? user!.id : values.userAdd);
      formData.append('from', values.from);
      formData.append('to', values.to);
      formData.append('content', values.content);
      formData.append('typeMail', values.typeMail);
      formData.append('numberMail', values.numberMail);
  
      if (values.attachments?.length > 0) {
        values.attachments.forEach((attachment: { id?: string; source: File | string }) => {
          if (attachment.source instanceof File) {
            formData.append('attachments', attachment.source);
          } else if (attachment.id && mode === 'edit') {
            formData.append('existingAttachments', attachment.id);
          }
        });
      }
  
      if (mode === 'edit' && state.selectedCorrespondence) {
        const removedAttachments = state.selectedCorrespondence.attachments
          .filter(originalAttachment => 
            !values.attachments.some((a: { id?: string }) => a.id === originalAttachment.id)
          )
          .map(a => a.id);
        
        removedAttachments.forEach(id => formData.append('removedAttachments', id));
      }
  
      const url = mode === 'create' 
        ? `${API}/aho/correspondence` 
        : `${API}/aho/correspondence/${state.selectedCorrespondence!.id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';
  
      const responseData = await fetchData(url, {
        method,
        body: formData,
      });
  
      updateState({
        correspondence: mode === 'create'
          ? [responseData, ...state.correspondence]
          : state.correspondence.map(item =>
              item.id === state.selectedCorrespondence!.id ? responseData : item
            ),
        correspondenceForm: mode === 'create' ? DEFAULT_CORRESPONDENCE_FORM : state.correspondenceForm
      });
  
      modals[mode][1].close();
    } catch (error) {
      console.error(`Failed to ${mode} correspondence:`, error);
      updateState({ uploadError: error instanceof Error ? error.message : 'Unknown error' });
    }
  }, [user, state.selectedCorrespondence, state.correspondence, modals, fetchData]);

  const handleColumnFiltersChange: OnChangeFn<ColumnFiltersState> = useCallback(
    (updaterOrValue) => {
      updateState({ 
        columnFilters: typeof updaterOrValue === 'function' 
          ? updaterOrValue(state.columnFilters) 
          : updaterOrValue
      });
    },
    [state.columnFilters]
  );

  const handleSortingChange: OnChangeFn<SortingState> = useCallback(
    (updaterOrValue) => {
      updateState({ 
        sorting: typeof updaterOrValue === 'function' 
          ? updaterOrValue(state.sorting) 
          : updaterOrValue
      });
    },
    [state.sorting]
  );

  const handleFilterChange = useCallback((columnId: string, value: any) => {
    updateState({
      columnFilters: [
        ...state.columnFilters.filter(f => f.id !== columnId),
        ...(value ? [{ id: columnId, value }] : [])
      ]
    });
  }, [state.columnFilters]);

  const filters = useMemo(() => [
    {
      type: 'date' as const,
      columnId: 'formattedReceiptDate',
      label: 'Фильтр по дате получения',
      width: 200,
    },
    {
      type: 'user' as const,
      columnId: 'userName',
      label: 'Фильтр по пользователю',
      options: userFilterOptions,
      width: 200,
    },
  ], [userFilterOptions]);

  const columns = useMemo<ColumnDef<CorrespondenceWithFormattedData>[]>(
    () => [
      {
        accessorKey: 'formattedReceiptDate',
        header: 'Дата получения',
        cell: (info) => info.getValue<string>(),
        filterFn: dateRange,
        sortingFn: 'datetime',
      },
      {
        accessorKey: 'from',
        header: 'От',
        size: 150,
        filterFn: 'includesString',
      },
      {
        accessorKey: 'to',
        header: 'Кому',
        size: 150,
        filterFn: 'includesString',
      },
      {
        accessorKey: 'typeMail',
        header: 'Тип письма',
        size: 150,
        filterFn: 'includesString',
      },
      {
        accessorKey: 'numberMail',
        header: 'Номер письма',
        size: 150,
        filterFn: 'includesString',
      },
      {
        accessorKey: 'userName',
        header: 'Добавил',
        size: 150,
        filterFn: 'includesString',
      },
      {
        id: 'actions',
        header: 'Действия',
        cell: ({ row }) => (
          <Group wrap="nowrap" align="center">
            <ActionIcon
              color="blue"
              variant="subtle"
              onClick={(e) => {
                e.stopPropagation();
                handleTableAction('edit', row.original);
              }}
            >
              <IconPencil size={18} />
            </ActionIcon>
            <ActionIcon
              color="red"
              variant="subtle"
              onClick={(e) => {
                e.stopPropagation();
                handleTableAction('delete', row.original);
              }}
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
        ),
        size: 100,
        enableSorting: false,
      },
    ],
    [handleTableAction]
  );

  if (state.loading) return <LoadingOverlay visible />;

  return (
    <DndProviderWrapper>
      <Box p="md">
        <Button
          fullWidth
          mt="xl"
          size="md"
          onClick={() => {
            updateState({ correspondenceForm: DEFAULT_CORRESPONDENCE_FORM });
            modals.create[1].open();
          }}
        >
          Добавить корреспонденцию
        </Button>
        <Title order={2} mt="md" mb="lg">
          Корреспонденции
        </Title>
        <Grid>
          <Grid.Col span={12}>
            <FilterGroup
              filters={filters}
              columnFilters={state.columnFilters}
              onColumnFiltersChange={handleFilterChange}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Card withBorder shadow="sm" radius="md">
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
          initialValues={state.selectedCorrespondence || {}}
          viewFieldsConfig={viewFieldsConfig}
        />
        <DynamicFormModal
          opened={modals.edit[0]}
          onClose={modals.edit[1].close}
          title="Редактировать корреспонденцию"
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
          initialValues={DEFAULT_CORRESPONDENCE_FORM}
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