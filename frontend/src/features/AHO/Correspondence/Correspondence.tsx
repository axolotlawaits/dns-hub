import { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { formatName } from '../../../utils/format';
import { dateRange, FilterGroup } from '../../../utils/filter';
import { Button, Title, Box, LoadingOverlay, Grid, Card, Group, ActionIcon } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { ColumnDef, ColumnFiltersState, SortingState} from '@tanstack/react-table';
import { DndProviderWrapper } from '../../../utils/dnd';
import { DynamicFormModal } from '../../../utils/formModal';
import { TableComponent } from '../../../utils/table';

// Types
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
  typeMail: string;
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

// Constants
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

// Utility functions
const formatTableData = (data: Correspondence[]): CorrespondenceWithFormattedData[] => {
  return data.map((item) => ({
    ...item,
    formattedReceiptDate: dayjs(item.ReceiptDate).format('DD.MM.YYYY HH:mm'),
    formattedCreatedAt: dayjs(item.createdAt).format('DD.MM.YYYY HH:mm'),
    userName: item.user?.name ? formatName(item.user.name) : 'Unknown',
    typeMail: item.typeMail
  }));
};

const getUserFilterOptions = (data: Correspondence[]) => {
  const uniqueNames = Array.from(
    new Set(data.map((c) => c.user?.name ? formatName(c.user.name) : 'Unknown'))
  );
  return uniqueNames.map((name) => ({ value: name, label: name }));
};

const getTypeFilterOptions = (data: Correspondence[]) => {
    const uniqueType = Array.from(
      new Set(data.map((c) => c.typeMail ? c.typeMail : 'Unknown')
    ));
    return uniqueType.map((typeMail) => ({ value: typeMail, label: typeMail }));
  };

// Main component
export default function CorrespondenceList() {
  const { user } = useUserContext();
  const [correspondence, setCorrespondence] = useState<Correspondence[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCorrespondence, setSelectedCorrespondence] = useState<Correspondence | null>(null);
  const [correspondenceForm, setCorrespondenceForm] = useState(DEFAULT_CORRESPONDENCE_FORM);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'formattedReceiptDate', desc: true }]);
  const [typeMailOptions, setTypeMailOptions] = useState<TypeMailOption[]>([]);

  const modals = {
    view: useDisclosure(false),
    edit: useDisclosure(false),
    create: useDisclosure(false),
    delete: useDisclosure(false),
  };

  // API functions
  const fetchData = useCallback(async (url: string, options?: RequestInit) => {
    try {
      const response = await fetch(url, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': options?.method === 'PATCH' ? 'application/json' : 'application/json'
        },
        ...options,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      return response.status !== 204 ? await response.json() : null;
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

  // Initial data loading
  useEffect(() => {
    const loadData = async () => {
      try {
        const [correspondenceData, typeOptions] = await Promise.all([
          fetchData(`${API}/aho/correspondence`),
          fetchTypeMailOptions(),
        ]);
        setCorrespondence(correspondenceData);
        setTypeMailOptions(typeOptions);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fetchData, fetchTypeMailOptions]);

  // Form configurations
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
        options: typeMailOptions,
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
      {
        name: 'attachments',
        label: 'Файлы',
        type: 'file' as const,
        withDnd: true,
        onRemove: (index: number, values: any, setFieldValue: any) => {
          const newAttachments = [...values.attachments];
          newAttachments.splice(index, 1);
          setFieldValue('attachments', newAttachments);
        }
      },
    ],
    initialValues: DEFAULT_CORRESPONDENCE_FORM,
  }), [typeMailOptions]);

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

  // Memoized data
  const tableData = useMemo(() => formatTableData(correspondence), [correspondence]);
  const userFilterOptions = useMemo(() => getUserFilterOptions(correspondence), [correspondence]);
  const typeFilterOptions = useMemo(() => getTypeFilterOptions(correspondence), [correspondence]);

  // Handlers
  const handleTableAction = useCallback((action: 'view' | 'edit' | 'delete', data: Correspondence) => {
    setSelectedCorrespondence(data);
    if (action === 'edit') {
      setCorrespondenceForm({
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
      });
    }
    modals[action][1].open();
  }, [modals]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!selectedCorrespondence) return;
    
    try {
      await fetchData(`${API}/aho/correspondence/${selectedCorrespondence.id}`, {
        method: 'DELETE',
      });
  
      setCorrespondence(prev => prev.filter(item => item.id !== selectedCorrespondence.id));
      modals.delete[1].close();
    } catch (error) {
      console.error('Failed to delete correspondence:', error);
      setUploadError(error instanceof Error ? error.message : 'Failed to delete correspondence');
    }
  }, [selectedCorrespondence, fetchData, modals.delete]);

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
  
      // Handle attachments
      if (values.attachments?.length > 0) {
        values.attachments.forEach((attachment: { id?: string; source: File | string }) => {
          if (attachment.source instanceof File) {
            formData.append('attachments', attachment.source);
          }
        });
      }
  
      // Handle removed attachments for edit mode
      if (mode === 'edit' && selectedCorrespondence) {
        const removedAttachments = selectedCorrespondence.attachments
          .filter(originalAttachment => 
            !values.attachments.some((a: { id?: string }) => a.id === originalAttachment.id)
          .map((a: { id: any; }) => a.id))
        
        if (removedAttachments.length > 0) {
          formData.append('removedAttachments', JSON.stringify(removedAttachments));
        }
      }
  
      const url = mode === 'create' 
        ? `${API}/aho/correspondence` 
        : `${API}/aho/correspondence/${selectedCorrespondence!.id}`;
      
      const response = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }
  
      const responseData = await response.json();
  
      setCorrespondence(prev => 
        mode === 'create' 
          ? [responseData, ...prev] 
          : prev.map(item => item.id === selectedCorrespondence!.id ? responseData : item)
      );
      setCorrespondenceForm(DEFAULT_CORRESPONDENCE_FORM);
      setUploadError(null);
      modals[mode][1].close();
    } catch (error) {
      console.error(`Failed to ${mode} correspondence:`, error);
      setUploadError(error instanceof Error ? error.message : 'Unknown error');
    }
  }, [user, selectedCorrespondence, modals]);

  // Table configuration
  const filters = useMemo(() => [
    {
      type: 'date' as const,
      columnId: 'formattedReceiptDate',
      label: 'Фильтр по дате',
      width: 200,
    },
    {
      type: 'select' as const,
      columnId: 'userName',
      label: 'Фильтр по пользователю',
      options: userFilterOptions,
      width: 200,
    },
    {
      type: 'select' as const,
      columnId: 'typeMail',
      options: typeFilterOptions,
      label: 'Фильтр по типу',
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

  if (loading) return <LoadingOverlay visible />;

  return (
    <DndProviderWrapper>
      <Box p="md">
        <Button
          fullWidth
          mt="xl"
          size="md"
          onClick={() => {
            setCorrespondenceForm(DEFAULT_CORRESPONDENCE_FORM);
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
              columnFilters={columnFilters}
              onColumnFiltersChange={(columnId, value) => 
                setColumnFilters(prev => [
                  ...prev.filter(f => f.id !== columnId),
                  ...(value ? [{ id: columnId, value }] : [])
                ])
              }
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Card withBorder shadow="sm" radius="md">
              <TableComponent<CorrespondenceWithFormattedData>
                data={tableData}
                columns={columns}
                columnFilters={columnFilters}
                sorting={sorting}
                onColumnFiltersChange={setColumnFilters}
                onSortingChange={setSorting}
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
          initialValues={selectedCorrespondence || {}}
          viewFieldsConfig={viewFieldsConfig}
        />
        <DynamicFormModal
          opened={modals.edit[0]}
          onClose={modals.edit[1].close}
          title="Редактировать корреспонденцию"
          mode="edit"
          fields={formConfig.fields}
          initialValues={correspondenceForm}
          onSubmit={(values) => handleFormSubmit(values, 'edit')}
          error={uploadError}
        />
        <DynamicFormModal
          opened={modals.create[0]}
          onClose={modals.create[1].close}
          title="Добавить корреспонденцию"
          mode="create"
          fields={formConfig.fields}
          initialValues={DEFAULT_CORRESPONDENCE_FORM}
          onSubmit={(values) => handleFormSubmit(values, 'create')}
          error={uploadError}
        />
        <DynamicFormModal
          opened={modals.delete[0]}
          onClose={modals.delete[1].close}
          title="Подтверждение удаления"
          mode="delete"
          initialValues={selectedCorrespondence || {}}
          onConfirm={handleDeleteConfirm}
        />
      </Box>
    </DndProviderWrapper>
  );
}