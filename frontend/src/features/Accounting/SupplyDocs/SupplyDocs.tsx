import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUserContext } from '../../../hooks/useUserContext';
import { formatName } from '../../../utils/format';
import { dateRange, FilterGroup } from '../../../utils/filter';
import { Button, Title, Box, LoadingOverlay, Grid, Card, Group, ActionIcon, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { IconPencil, IconTrash, IconX } from '@tabler/icons-react';
import { ColumnDef, ColumnFiltersState, SortingState } from '@tanstack/react-table';
import { DndProviderWrapper } from '../../../utils/dnd';
import { DynamicFormModal } from '../../../utils/formModal';
import { TableComponent } from '../../../utils/table';
import { API } from '../../../config/constants';
import { getTypesFlat } from '../../../utils/typesData';

// Типы
interface User {
  id: string;
  name: string;
}

interface TypeOption {
  value: string;
  label: string;
}

interface Type {
  id: string;
  model_uuid: string;
  chapter: string;
  name: string;
  colorHex?: string;
}

interface SupplyDocsAttachment {
  id: string;
  createdAt: Date;
  recordId: string;
  userAdd: string;
  source: string;
  type: string;
  user: User;
}

interface SupplyDoc {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  addedById: string;
  inn: number | null;
  counterParty: string;
  demandsForPayment: string;
  statusRequirements: Type | null;
  fileInvoicePayment: string;
  costBranchId: string;
  settlementSpecialistId: string | null;
  statusOfPTiU: Type | null;
  filePTiU: string;
  note: string;
  fileNote: string;
  requirementNumber: string;
  attachments: SupplyDocsAttachment[];
  addedBy: User;
  costBranch: { uuid: string; name: string };
  settlementSpecialist: User | null;
}

interface SupplyDocWithFormattedData extends SupplyDoc {
  formattedCreatedAt: string;
  formattedUpdatedAt: string;
  userName: string;
  branchName: string;
  specialistName: string;
}

interface SupplyDocForm {
  inn: number | null;
  counterParty: string;
  demandsForPayment: string;
  statusRequirements: string;
  fileInvoicePayment: File | string | null;
  costBranchId: string;
  settlementSpecialistId: string | null;
  statusOfPTiU: string;
  filePTiU: File | string | null;
  note: string;
  fileNote: File | string | null;
  requirementNumber: string;
}

// Константы
const DEFAULT_SUPPLY_DOC_FORM: SupplyDocForm = {
  inn: null,
  counterParty: '',
  demandsForPayment: '',
  statusRequirements: '',
  fileInvoicePayment: null,
  costBranchId: '',
  settlementSpecialistId: null,
  statusOfPTiU: '',
  filePTiU: null,
  note: '',
  fileNote: null,
  requirementNumber: ''
};

const MODEL_UUID = '19c576c5-f51a-41af-a87b-34d2d936134f';

const CHAPTERS = {
  REQUIREMENT: 'Статус требования',
  PTIU: 'Статус ПТиУ',
} as const;

const RETURN_DS_STATUSES = {
  requirement: 'bc90c5ee-e9ef-4170-b79e-3aead020ee01',
  ptiu: '5758fab6-dbe4-4bba-9526-1ba3f3a3c0b4',
} as const;

const DEFAULT_STATUSES = {
  requirement: 'cf2cb563-30a7-48cd-889d-90891187b566',
  ptiu: 'ddc0d295-40ee-4c37-8185-782ee449720a',
} as const;

// Вспомогательные функции
const formatTableData = (data: SupplyDoc[]): SupplyDocWithFormattedData[] =>
  data?.map((item) => ({
    ...item,
    formattedCreatedAt: dayjs(item.createdAt).format('DD.MM.YYYY HH:mm'),
    formattedUpdatedAt: dayjs(item.updatedAt).format('DD.MM.YYYY HH:mm'),
    userName: item.addedBy?.name ? formatName(item.addedBy.name) : 'Unknown',
    branchName: item.costBranch?.name || 'Unknown',
    specialistName: item.settlementSpecialist?.name
      ? formatName(item.settlementSpecialist.name)
      : 'Not assigned',
  })) || [];

const getUserFilterOptions = (data: SupplyDoc[]): TypeOption[] => {
  const uniqueNames = new Set(
    data.map((d) => d.addedBy?.name ? formatName(d.addedBy.name) : 'Unknown')
  );
  return Array.from(uniqueNames).map((name) => ({ value: name, label: name }));
};

const getBranchFilterOptions = (data: SupplyDoc[]): TypeOption[] => {
  const branches = new Map<string, TypeOption>();
  data.forEach(doc => {
    if (doc.costBranch) {
      branches.set(doc.costBranch.uuid, {
        value: doc.costBranch.uuid,
        label: doc.costBranch.name
      });
    }
  });
  return Array.from(branches.values());
};

// Основной компонент
export default function SupplyDocsList() {
  const { user } = useUserContext();
  const [supplyDocs, setSupplyDocs] = useState<SupplyDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSupplyDoc, setSelectedSupplyDoc] = useState<SupplyDoc | null>(null);
  const [supplyDocForm, setSupplyDocForm] = useState(DEFAULT_SUPPLY_DOC_FORM);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [typeOptions, setTypeOptions] = useState({
    ptiu: [] as TypeOption[],
    requirement: [] as TypeOption[],
  });
  const [branches, setBranches] = useState<TypeOption[]>([]);
  const [filters, setFilters] = useState({
    column: [] as ColumnFiltersState,
    sorting: [{ id: 'formattedCreatedAt', desc: true }] as SortingState,
  });
  const [isRecordOpen, setIsRecordOpen] = useState(false);

  const [editModalOpened, editModalHandlers] = useDisclosure(false);
  const [createModalOpened, createModalHandlers] = useDisclosure(false);
  const [deleteModalOpened, deleteModalHandlers] = useDisclosure(false);

  // Унифицированный запрос данных
  const fetchData = useCallback(async <T,>(url: string, options?: RequestInit): Promise<T | null> => {
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          ...(options?.method !== 'POST' && options?.method !== 'PUT' && {
            'Content-Type': 'application/json'
          })
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

  // Загрузка данных с использованием Promise.all для параллельных запросов
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [supplyDocsData, ptiuTypes, requirementTypes, branchesData] = await Promise.all([
        fetchData<SupplyDoc[]>(`${API}/accounting/supply-docs?include=statusRequirements,statusOfPTiU`),
        getTypesFlat(CHAPTERS.PTIU, MODEL_UUID),
        getTypesFlat(CHAPTERS.REQUIREMENT, MODEL_UUID),
        fetchData<Array<{ uuid: string; name: string }>>(`${API}/search/branch`),
      ]);

      if (!supplyDocsData || !ptiuTypes || !requirementTypes || !branchesData) {
        throw new Error('One of the fetched data is null');
      }

      // Обогащаем данные статусами
      const supplyDocsWithStatuses = supplyDocsData.map(doc => ({
        ...doc,
        statusRequirements: requirementTypes.find(type => type.id === doc.statusRequirements?.id) || null,
        statusOfPTiU: ptiuTypes.find(type => type.id === doc.statusOfPTiU?.id) || null,
      }));

      setSupplyDocs(supplyDocsWithStatuses);
      setTypeOptions({
        ptiu: ptiuTypes.map(type => ({ value: type.id, label: type.name })),
        requirement: requirementTypes.map(type => ({ value: type.id, label: type.name })),
      });
      setBranches(branchesData.map(branch => ({
        value: branch.uuid,
        label: branch.name,
      })));
    } catch (error) {
      console.error('Failed to load data:', error);
      setUploadError(error instanceof Error ? error.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Обработчик возврата ДС
  const handleReturnDS = useCallback(async () => {
    if (!selectedSupplyDoc) return;

    try {
      const formData = new FormData();
      formData.append('statusRequirements', RETURN_DS_STATUSES.requirement);
      formData.append('statusOfPTiU', RETURN_DS_STATUSES.ptiu);

      const updatedDoc = await fetchData<SupplyDoc>(
        `${API}/accounting/supply-docs/${selectedSupplyDoc.id}`,
        {
          method: 'PUT',
          body: formData,
        }
      );

      if (updatedDoc) {
        // Обновляем статусы в локальном состоянии
        const updatedWithStatuses = {
          ...updatedDoc,
          statusRequirements: typeOptions.requirement.find(t => t.value === RETURN_DS_STATUSES.requirement) 
            ? { id: RETURN_DS_STATUSES.requirement, name: 'Возврат ДС', model_uuid: MODEL_UUID, chapter: CHAPTERS.REQUIREMENT }
            : null,
          statusOfPTiU: typeOptions.ptiu.find(t => t.value === RETURN_DS_STATUSES.ptiu)
            ? { id: RETURN_DS_STATUSES.ptiu, name: 'Возврат ДС', model_uuid: MODEL_UUID, chapter: CHAPTERS.PTIU }
            : null
        };

        setSupplyDocs(prev =>
          prev.map(item => item.id === selectedSupplyDoc.id ? updatedWithStatuses : item)
        );
        setSelectedSupplyDoc(updatedWithStatuses);
      }
    } catch (error) {
      console.error('Failed to update statuses:', error);
      setUploadError(error instanceof Error ? error.message : 'Failed to update statuses');
    }
  }, [selectedSupplyDoc, fetchData, typeOptions]);

  // Мемоизированные данные для таблицы
  const { tableData, userFilterOptions, branchOptions, specialistOptions } = useMemo(() => {
    const formattedData = formatTableData(supplyDocs);
    const userOptions = getUserFilterOptions(supplyDocs);
    const branchOptions = getBranchFilterOptions(supplyDocs);

    const specialists = new Map<string, TypeOption>();
    supplyDocs.forEach(doc => {
      if (doc.settlementSpecialist) {
        specialists.set(doc.settlementSpecialist.id, {
          value: doc.settlementSpecialist.id,
          label: formatName(doc.settlementSpecialist.name)
        });
      }
    });

    return {
      tableData: formattedData,
      userFilterOptions: userOptions,
      branchOptions,
      specialistOptions: [
        { value: '', label: 'Не назначен' },
        ...Array.from(specialists.values())
      ],
    };
  }, [supplyDocs]);

  // Конфигурация форм
  const formConfigEditCreate = useMemo(() => ({
    fields: [
      {
        name: 'inn',
        label: 'ИНН',
        type: 'number' as const,
        required: true,
        validate: (value: any) => {
          if (value === null || value === '') return 'Поле обязательно для заполнения';
          if (isNaN(Number(value))) return 'ИНН должен содержать только цифры';
          if (Number(value) > 2147483647) return 'ИНН слишком большое';
          return null;
        }
      },
      {
        name: 'counterParty',
        label: 'Контрагент',
        type: 'text' as const,
        required: true,
      },
      {
        name: 'demandsForPayment',
        label: 'Требования к оплате',
        type: 'text' as const,
        required: true,
      },
      {
        name: 'statusRequirements',
        label: 'Статус требований',
        type: 'selectSearch' as const,
        options: typeOptions.requirement,
        required: true,
      },
      {
        name: 'fileInvoicePayment',
        label: 'Файл счета на оплату',
        type: 'file' as const,
      },
      {
        name: 'costBranchId',
        label: 'Филиал затрат',
        type: 'selectSearch' as const,
        required: true,
        options: branches,
      },
      {
        name: 'settlementSpecialistId',
        label: 'Специалист по расчетам',
        type: 'select' as const,
        options: specialistOptions,
      },
      {
        name: 'statusOfPTiU',
        label: 'Статус ПТиУ',
        type: 'selectSearch' as const,
        options: typeOptions.ptiu,
        required: true,
      },
      {
        name: 'filePTiU',
        label: 'Файл ПТиУ',
        type: 'file' as const,
      },
      {
        name: 'note',
        label: 'Примечание',
        type: 'textarea' as const,
      },
      {
        name: 'fileNote',
        label: 'Файл примечания',
        type: 'file' as const,
      },
      {
        name: 'requirementNumber',
        label: 'Номер требования',
        type: 'text' as const,
        required: true,
      },
    ],
    initialValues: DEFAULT_SUPPLY_DOC_FORM,
  }), [branches, typeOptions, specialistOptions]);

  const formConfigCreate = useMemo(() => ({
    fields: [
      {
        name: 'inn',
        label: 'ИНН',
        type: 'number' as const,
        required: true,
        validate: (value: any) => {
          if (value === null || value === '') return 'Поле обязательно для заполнения';
          if (isNaN(Number(value))) return 'ИНН должен содержать только цифры';
          if (Number(value) > 2147483647) return 'ИНН слишком большое';
          return null;
        }
      },
      {
        name: 'counterParty',
        label: 'Контрагент',
        type: 'text' as const,
        required: true,
      },
      {
        name: 'fileInvoicePayment',
        label: 'Файл счета на оплату',
        type: 'file' as const,
      },
      {
        name: 'costBranchId',
        label: 'Филиал затрат',
        type: 'selectSearch' as const,
        required: true,
        options: branches,
      },
      {
        name: 'note',
        label: 'Примечание',
        type: 'textarea' as const,
      },
      {
        name: 'fileNote',
        label: 'Файл примечания',
        type: 'file' as const,
      },
    ],
    initialValues: DEFAULT_SUPPLY_DOC_FORM,
  }), [branches]);

  const viewFieldsConfig = useMemo(() => [
    { label: 'ИНН', value: (item: SupplyDoc) => item.inn },
    { label: 'Контрагент', value: (item: SupplyDoc) => item.counterParty },
    { label: 'Требования к оплате', value: (item: SupplyDoc) => item.demandsForPayment },
    {
      label: 'Статус требований',
      value: (item: SupplyDoc) => item.statusRequirements?.name || 'Не указан'
    },
    { label: 'Филиал затрат', value: (item: SupplyDoc) => item.costBranch?.name || 'Unknown' },
    {
      label: 'Специалист по расчетам',
      value: (item: SupplyDoc) =>
        item.settlementSpecialist?.name ? formatName(item.settlementSpecialist.name) : 'Не назначен'
    },
    {
      label: 'Статус ПТиУ',
      value: (item: SupplyDoc) => item.statusOfPTiU?.name || 'Не указан'
    },
    { label: 'Примечание', value: (item: SupplyDoc) => item.note },
    { label: 'Номер требования', value: (item: SupplyDoc) => item.requirementNumber },
    { label: 'Добавил', value: (item: SupplyDoc) => item.addedBy?.name || 'Unknown' },
    { label: 'Дата создания', value: (item: SupplyDoc) => dayjs(item.createdAt).format('DD.MM.YYYY HH:mm') },
    { label: 'Дата обновления', value: (item: SupplyDoc) => dayjs(item.updatedAt).format('DD.MM.YYYY HH:mm') },
  ], []);

  // Обработчики действий
  const handleTableAction = useCallback((action: 'view' | 'edit' | 'delete', data: SupplyDoc) => {
    setSelectedSupplyDoc(data);

    if (action === 'edit') {
      setSupplyDocForm({
        inn: data.inn,
        counterParty: data.counterParty,
        demandsForPayment: data.demandsForPayment,
        statusRequirements: data.statusRequirements?.id || '',
        fileInvoicePayment: data.fileInvoicePayment,
        costBranchId: data.costBranchId,
        settlementSpecialistId: data.settlementSpecialistId,
        statusOfPTiU: data.statusOfPTiU?.id || '',
        filePTiU: data.filePTiU,
        note: data.note,
        fileNote: data.fileNote,
        requirementNumber: data.requirementNumber,
      });
      editModalHandlers.open();
    } else if (action === 'delete') {
      deleteModalHandlers.open();
    } else if (action === 'view') {
      setIsRecordOpen(true);
    }
  }, [editModalHandlers, deleteModalHandlers]);

  const handleCloseRecord = useCallback(() => {
    setSelectedSupplyDoc(null);
    setIsRecordOpen(false);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!selectedSupplyDoc) return;

    try {
      await fetchData(`${API}/accounting/supply-docs/${selectedSupplyDoc.id}`, {
        method: 'DELETE',
      });

      setSupplyDocs(prev =>
        prev.filter(item => item.id !== selectedSupplyDoc.id)
      );
      setSelectedSupplyDoc(null);
      deleteModalHandlers.close();
    } catch (error) {
      console.error('Failed to delete supply doc:', error);
      setUploadError(error instanceof Error ? error.message : 'Failed to delete document');
    }
  }, [selectedSupplyDoc, fetchData, deleteModalHandlers]);

  // Обработчик отправки формы
  const handleFormSubmit = useCallback(async (values: Record<string, any>, mode: 'create' | 'edit') => {
    if (!user && mode === 'create') return;

    try {
      const innValue = values.inn !== null && values.inn !== ''
        ? Number(values.inn)
        : null;

      // Валидация
      if (innValue === null || isNaN(innValue)) {
        setUploadError('ИНН должно быть числом');
        return;
      }

      if (!branches.some(b => b.value === values.costBranchId)) {
        setUploadError('Филиал затрат не существует');
        return;
      }

      // Установка статусов по умолчанию при создании
      if (mode === 'create') {
        values.statusRequirements = DEFAULT_STATUSES.requirement;
        values.statusOfPTiU = DEFAULT_STATUSES.ptiu;
      }

      // Подготовка FormData
      const formData = new FormData();
      if (mode === 'create' && user) {
        formData.append('addedById', user.id);
      }

      formData.append('inn', innValue.toString());
      formData.append('counterParty', values.counterParty);
      formData.append('demandsForPayment', values.demandsForPayment);
      formData.append('statusRequirements', values.statusRequirements);
      formData.append('costBranchId', values.costBranchId);
      formData.append('statusOfPTiU', values.statusOfPTiU);
      formData.append('note', values.note);
      formData.append('requirementNumber', values.requirementNumber);

      if (values.settlementSpecialistId) {
        formData.append('settlementSpecialistId', values.settlementSpecialistId);
      }

      // Обработка файлов
      const handleFile = (fieldName: string, value: any) => {
        if (value instanceof File) {
          formData.append(fieldName, value);
        } else if (typeof value === 'string' && value) {
          formData.append(fieldName, value);
        }
      };

      handleFile('fileInvoicePayment', values.fileInvoicePayment);
      handleFile('filePTiU', values.filePTiU);
      handleFile('fileNote', values.fileNote);

      // Отправка данных
      const url = mode === 'create'
        ? `${API}/accounting/supply-docs`
        : `${API}/accounting/supply-docs/${selectedSupplyDoc!.id}`;

      const responseData = await fetchData<SupplyDoc>(url, {
        method: mode === 'create' ? 'POST' : 'PUT',
        body: formData,
      });

      // Обновление состояния
      if (responseData) {
        // Находим соответствующие статусы для обновленного документа
        const statusRequirements = typeOptions.requirement.find(t => t.value === responseData.statusRequirements?.id) 
          ? { 
              id: responseData.statusRequirements?.id || '', 
              name: typeOptions.requirement.find(t => t.value === responseData.statusRequirements?.id)?.label || '',
              model_uuid: MODEL_UUID,
              chapter: CHAPTERS.REQUIREMENT
            }
          : null;

        const statusOfPTiU = typeOptions.ptiu.find(t => t.value === responseData.statusOfPTiU?.id)
          ? {
              id: responseData.statusOfPTiU?.id || '',
              name: typeOptions.ptiu.find(t => t.value === responseData.statusOfPTiU?.id)?.label || '',
              model_uuid: MODEL_UUID,
              chapter: CHAPTERS.PTIU
            }
          : null;

        const updatedDoc = {
          ...responseData,
          statusRequirements,
          statusOfPTiU
        };

        setSupplyDocs(prev =>
          mode === 'create'
            ? [updatedDoc, ...prev]
            : prev.map(item => item.id === selectedSupplyDoc!.id ? updatedDoc : item)
        );
        
        if (mode === 'edit') {
          setSelectedSupplyDoc(updatedDoc);
        }

        setSupplyDocForm(DEFAULT_SUPPLY_DOC_FORM);
        setUploadError(null);

        if (mode === 'create') {
          createModalHandlers.close();
        } else {
          editModalHandlers.close();
        }
      }
    } catch (error) {
      console.error(`Failed to ${mode} supply document:`, error);
      setUploadError(error instanceof Error ? error.message : 'Unknown error');
    }
  }, [user, selectedSupplyDoc, branches, typeOptions, fetchData, createModalHandlers, editModalHandlers]);

  // Конфигурация фильтров таблицы
  const tableFilters = useMemo(() => [
    {
      type: 'date' as const,
      columnId: 'formattedCreatedAt',
      label: 'Фильтр по дате',
      width: 200,
    },
    {
      type: 'select' as const,
      columnId: 'userName',
      label: 'Фильтр по пользователю',
      placeholder: 'Выберите пользователя',
      options: userFilterOptions,
      width: 200,
    },
    {
      type: 'select' as const,
      columnId: 'branchName',
      label: 'Фильтр по филиалу',
      placeholder: 'Выберите филиал',
      options: branchOptions,
      width: 200,
    },
  ], [userFilterOptions, branchOptions]);

  // Колонки таблицы
  const columns = useMemo<ColumnDef<SupplyDocWithFormattedData>[]>(
    () => [
      {
        accessorKey: 'formattedCreatedAt',
        header: 'Дата создания',
        cell: (info) => info.getValue<string>(),
        filterFn: dateRange,
        sortingFn: 'datetime',
      },
      {
        accessorKey: 'counterParty',
        header: 'Контрагент',
        size: 150,
        filterFn: 'includesString',
      },
      {
        accessorKey: 'inn',
        header: 'ИНН',
        size: 100,
      },
      {
        accessorKey: 'requirementNumber',
        header: 'Номер требования',
        size: 150,
      },
      {
        accessorKey: 'statusRequirements.name',
        header: 'Статус требований',
        size: 150,
        cell: (info) => info.row.original.statusRequirements?.name || 'Не указан',
      },
      {
        accessorKey: 'statusOfPTiU.name',
        header: 'Статус ПТиУ',
        size: 150,
        cell: (info) => info.row.original.statusOfPTiU?.name || 'Не указан',
      },
      {
        accessorKey: 'branchName',
        header: 'Филиал затрат',
        size: 150,
      },
      {
        accessorKey: 'specialistName',
        header: 'Специалист',
        size: 150,
      },
      {
        accessorKey: 'userName',
        header: 'Добавил',
        size: 150,
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
            setSupplyDocForm(DEFAULT_SUPPLY_DOC_FORM);
            createModalHandlers.open();
          }}
        >
          Добавить документ поставки
        </Button>

        <Title order={2} mt="md" mb="lg">
          Документы поставки
        </Title>

        <Grid>
          <Grid.Col span={isRecordOpen ? 4 : 12}>
            <FilterGroup
              filters={tableFilters}
              columnFilters={filters.column}
              onColumnFiltersChange={(columnId, value) =>
                setFilters(prev => ({
                  ...prev,
                  column: [
                    ...prev.column.filter(f => f.id !== columnId),
                    ...(value ? [{ id: columnId, value }] : [])
                  ]
                }))
              }
            />

            <Card withBorder shadow="sm" radius="md">
              <TableComponent<SupplyDocWithFormattedData>
                data={tableData}
                columns={columns}
                columnFilters={filters.column}
                sorting={filters.sorting}
                onColumnFiltersChange={(f) => setFilters(prev => ({ ...prev, column: f as ColumnFiltersState }))}
                onSortingChange={(s) => setFilters(prev => ({ ...prev, sorting: s as SortingState }))}
                filterFns={{ dateRange }}
                onRowClick={(rowData) => handleTableAction('view', rowData)}
              />
            </Card>
          </Grid.Col>

          {isRecordOpen && selectedSupplyDoc && (
            <Grid.Col span={8}>
              <Card withBorder shadow="sm" radius="md" p="md">
                <Group justify="space-between">
                  <Title order={3} mb="md">Детали записи</Title>
                  <Group>
                    <Button
                      variant="outline"
                      color="red"
                      onClick={handleReturnDS}
                    >
                      Возврат ДС
                    </Button>
                    <ActionIcon color="red" variant="subtle" onClick={handleCloseRecord}>
                      <IconX size={18} />
                    </ActionIcon>
                  </Group>
                </Group>

                {viewFieldsConfig.map((field) => (
                  <Box key={field.label} mb="sm">
                    <Text fw={500}>{field.label}</Text>
                    <Text>{field.value(selectedSupplyDoc)}</Text>
                  </Box>
                ))}
              </Card>
            </Grid.Col>
          )}
        </Grid>

        <DynamicFormModal
          opened={editModalOpened}
          onClose={editModalHandlers.close}
          title="Редактировать документ поставки"
          mode="edit"
          fields={formConfigEditCreate.fields}
          initialValues={supplyDocForm}
          onSubmit={(values) => handleFormSubmit(values, 'edit')}
          error={uploadError}
        />

        <DynamicFormModal
          opened={createModalOpened}
          onClose={createModalHandlers.close}
          title="Добавить документ поставки"
          mode="create"
          fields={formConfigCreate.fields}
          initialValues={DEFAULT_SUPPLY_DOC_FORM}
          onSubmit={(values) => handleFormSubmit(values, 'create')}
          error={uploadError}
        />

        <DynamicFormModal
          opened={deleteModalOpened}
          onClose={deleteModalHandlers.close}
          title="Подтверждение удаления"
          mode="delete"
          initialValues={selectedSupplyDoc || {}}
          onConfirm={handleDeleteConfirm}
        />
      </Box>
    </DndProviderWrapper>
  );
}