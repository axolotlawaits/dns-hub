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

type Updater<T> = T | ((prev: T) => T);
const MODEL_UUID = 'dd6ec264-4e8c-477a-b2d6-c62a956422c0';
const CHAPTER = 'Тип медиа';

interface TypeContentOption {
  value: string;
  label: string;
}

interface User {
  id: string;
  name: string;
}

interface MediaAttachment {
  id: string;
  createdAt: Date;
  recordId: string;
  userAdd: string;
  source: string;
  user: User;
}

interface Type {
  id: string;
  name: string;
}

interface Media {
  id: string;
  createdAt: Date;
  updatedAt?: Date;
  name?: string;
  information?: string;
  urlMedia2?: string;
  typeContent?: Type | null;
  MediaAttachment: MediaAttachment[];
  userAdd: User;
  userUpdated?: User;
}

interface MediaWithFormattedData extends Media {
  formattedCreatedAt: string;
  formattedUpdatedAt: string;
  userName: string;
  updatedUserName: string;
  typeContentName: string;
}

interface MediaForm {
  name?: string;
  information?: string;
  urlMedia2?: string;
  typeContent?: string;
  attachments: Array<{ id?: string; userAdd?: string; source: File | string }>;
}

const DEFAULT_MEDIA_FORM: MediaForm = {
  name: '',
  information: '',
  urlMedia2: '',
  typeContent: '',
  attachments: [],
};

const formatTableData = (data: Media[]): MediaWithFormattedData[] => {
  return data.map((item) => ({
    ...item,
    formattedCreatedAt: dayjs(item.createdAt).format('DD.MM.YYYY HH:mm'),
    formattedUpdatedAt: item.updatedAt ? dayjs(item.updatedAt).format('DD.MM.YYYY HH:mm') : '-',
    userName: item.userAdd?.name ? formatName(item.userAdd.name) : 'Unknown',
    updatedUserName: item.userUpdated?.name ? formatName(item.userUpdated.name) : '-',
    typeContentName: item.typeContent?.name || 'Без типа',
  }));
};

const getFilterOptions = <T,>(data: T[], mapper: (item: T) => string) => {
  const values = data
    .map(mapper)
    .filter((v, i, a) => a.indexOf(v) === i);
  return values.map(value => ({ value, label: value }));
};

export default function MediaList() {
  const { user } = useUserContext();
  const [state, setState] = useState({
    media: [] as Media[],
    loading: true,
    selectedMedia: null as Media | null,
    mediaForm: DEFAULT_MEDIA_FORM,
    uploadError: null as string | null,
    columnFilters: [] as ColumnFiltersState,
    sorting: [{ id: 'formattedCreatedAt', desc: true }] as SortingState,
    typeContentOptions: [] as TypeContentOption[],
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

  const fetchTypeOptions = useCallback(async () => {
    const data = await fetchData(`${API}/type/sub?model_uuid=${MODEL_UUID}&chapter=${CHAPTER}`);
    return data.map((type: any) => ({ value: type.id, label: type.name }));
  }, [fetchData]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [mediaData, typeOptions] = await Promise.all([
          fetchData(`${API}/add/media`),
          fetchTypeOptions()
        ]);
        setState(prev => ({
          ...prev,
          media: mediaData,
          typeContentOptions: typeOptions,
          loading: false
        }));
      } catch (error) {
        console.error('Failed to load data:', error);
        setState(prev => ({ ...prev, loading: false }));
      }
    };
    loadData();
  }, [fetchData, fetchTypeOptions]);

  const formConfig = useMemo(() => ({
    fields: [
      {
        name: 'name',
        label: 'Название',
        type: 'text' as const,
        required: true
      },
      {
        name: 'information',
        label: 'Информация',
        type: 'textarea' as const,
      },
      {
        name: 'urlMedia2',
        label: 'Ссылка на медиа',
        type: 'text' as const,
      },
      {
        name: 'typeContent',
        label: 'Тип контента',
        type: 'select' as const,
        options: state.typeContentOptions,
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
    initialValues: DEFAULT_MEDIA_FORM,
  }), [state.typeContentOptions]);

  const viewFieldsConfig = useMemo(() => [
    { label: 'Название', value: (item: MediaWithFormattedData) => item.name || null },
    { label: 'Тип контента', value: (item: MediaWithFormattedData) => item.typeContentName || null },
    { label: 'Создал', value: (item: MediaWithFormattedData) => item.userName || null },
    { label: 'Обновил', value: (item: MediaWithFormattedData) => item.updatedUserName || null },
    { label: 'Дата создания', value: (item: MediaWithFormattedData) => item.formattedCreatedAt },
    { label: 'Последнее обновление', value: (item: MediaWithFormattedData) => item.formattedUpdatedAt },
  ], []);

  const tableData = useMemo(() => formatTableData(state.media), [state.media]);

  const filterOptions = useMemo(() => ({
    user: getFilterOptions(state.media, m => m.userAdd?.name ? formatName(m.userAdd.name) : 'Unknown'),
    type: getFilterOptions(state.media, m => m.typeContent?.name || 'Без типа')
  }), [state.media]);

  const filters = useMemo(() => [
    {
      type: 'date' as const,
      columnId: 'formattedCreatedAt',
      label: 'Дата создания',
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
      columnId: 'typeContentName',
      label: 'Тип контента',
      placeholder: 'Выберите тип',
      options: filterOptions.type,
      width: 200,
    },
  ], [filterOptions]);

  const columns = useMemo<ColumnDef<MediaWithFormattedData>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Название',
      filterFn: 'includesString',
    },
    {
      accessorKey: 'typeContentName',
      header: 'Тип контента',
      filterFn: 'includesString',
    },
    {
      accessorKey: 'userName',
      header: 'Автор',
      filterFn: 'includesString',
    },
    {
      accessorKey: 'formattedCreatedAt',
      header: 'Дата создания',
      filterFn: dateRange,
      sortingFn: 'datetime',
    },
    {
      accessorKey: 'formattedUpdatedAt',
      header: 'Обновлено',
      filterFn: dateRange,
      sortingFn: 'datetime',
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

  const handleTableAction = useCallback((action: 'view' | 'edit' | 'delete', data: Media) => {
    setState(prev => ({ ...prev, selectedMedia: data }));
    if (action === 'edit') {
      setState(prev => ({
        ...prev,
        mediaForm: {
          name: data.name,
          information: data.information,
          urlMedia2: data.urlMedia2,
          typeContent: data.typeContent?.id || '',
          attachments: data.MediaAttachment.map(a => ({
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
    if (!state.selectedMedia) return;
    try {
      await fetchData(`${API}/add/media/${state.selectedMedia.id}`, {
        method: 'DELETE'
      });
      setState(prev => ({
        ...prev,
        media: prev.media.filter(m => m.id !== state.selectedMedia!.id),
        uploadError: null
      }));
      modals.delete[1].close();
      showNotification('success', 'Медиа успешно удалено');
    } catch (error) {
      console.error('Failed to delete media:', error);
      const errorMsg = error instanceof Error ? error.message : 'Ошибка удаления';
      setState(prev => ({ ...prev, uploadError: errorMsg }));
      showNotification('error', errorMsg);
    }
  }, [state.selectedMedia, fetchData, modals.delete, showNotification]);

  const handleColumnFiltersChange = useCallback((updaterOrValue: Updater<ColumnFiltersState>) => {
    setState(prev => ({
      ...prev,
      columnFilters: typeof updaterOrValue === 'function'
        ? updaterOrValue(prev.columnFilters)
        : updaterOrValue
    }));
  }, []);

  const handleSortingChange = useCallback((updaterOrValue: Updater<SortingState>) => {
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

    formData.append(mode === 'create' ? 'userAdd' : 'userUpdated', user!.id);
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

      if (mode === 'edit' && state.selectedMedia) {
        const removedAttachments = state.selectedMedia.MediaAttachment
          .filter(a => !attachments.some((va: any) => va.id === a.id))
          .map(a => a.id);

        if (removedAttachments.length) {
          formData.append('removedAttachments', JSON.stringify(removedAttachments));
        }
      }
    }

    try {
      const url = mode === 'create'
        ? `${API}/add/media`
        : `${API}/add/media/${state.selectedMedia!.id}`;

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
        userAdd: user,
        userUpdated: mode === 'edit' ? user : result.userUpdated,
      };

      setState(prev => ({
        ...prev,
        media: mode === 'create'
          ? [updatedResult, ...prev.media]
          : prev.media.map(m => m.id === state.selectedMedia!.id ? updatedResult : m),
        uploadError: null
      }));

      modals[mode][1].close();
      showNotification(
        'success',
        mode === 'create' ? 'Медиа успешно создано' : 'Медиа успешно обновлено'
      );
    } catch (error) {
      console.error(`Media ${mode} error:`, error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, uploadError: errorMsg }));
      showNotification('error', errorMsg);
    }
  }, [user, state.selectedMedia, modals, showNotification]);

  if (state.loading) return <LoadingOverlay visible />;

  return (
    <DndProviderWrapper>
      <Box p="md">
        <Button
          fullWidth
          mt="xl"
          size="md"
          onClick={() => modals.create[1].open()}
        >
          Добавить медиа
        </Button>
        <Title order={2} mt="md" mb="lg">
          Медиа библиотека
        </Title>
        <Grid>
          <Grid.Col span={12}>
            <FilterGroup
              filters={filters}
              columnFilters={state.columnFilters}
              onColumnFiltersChange={(columnId, value) =>
                setState(prev => ({
                  ...prev,
                  columnFilters: [
                    ...prev.columnFilters.filter(f => f.id !== columnId),
                    ...(value ? [{ id: columnId, value }] : [])
                  ]
                }))
              }
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Card withBorder shadow="sm">
              <TableComponent<MediaWithFormattedData>
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
          title="Просмотр медиа"
          mode="view"
          initialValues={{
            ...state.selectedMedia,
            attachments: state.selectedMedia?.MediaAttachment || [],
          }}
          viewFieldsConfig={viewFieldsConfig}
        />
        <DynamicFormModal
          opened={modals.edit[0]}
          onClose={modals.edit[1].close}
          title="Редактирование медиа"
          mode="edit"
          fields={formConfig.fields}
          initialValues={state.mediaForm}
          onSubmit={(values: Record<string, any>) => handleFormSubmit(values, 'edit')}
          error={state.uploadError}
        />
        <DynamicFormModal
          opened={modals.create[0]}
          onClose={modals.create[1].close}
          title="Новое медиа"
          mode="create"
          fields={formConfig.fields}
          initialValues={DEFAULT_MEDIA_FORM}
          onSubmit={(values: Record<string, any>) => handleFormSubmit(values, 'create')}
          error={state.uploadError}
        />
        <DynamicFormModal
          opened={modals.delete[0]}
          onClose={modals.delete[1].close}
          title="Подтвердите удаление"
          mode="delete"
          onConfirm={handleDeleteConfirm}
          initialValues={state.selectedMedia || {}}
        />
      </Box>
    </DndProviderWrapper>
  );
}
