import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { notificationSystem } from '../../../utils/Push';
import { Button, Title, Box, LoadingOverlay, Group, ActionIcon, Text, Stack, Paper, Modal, Badge, Image } from '@mantine/core';
import RKCalendarModal from './RKCalendar';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { IconPencil, IconTrash, IconUpload, IconFile, IconDownload } from '@tabler/icons-react';
import { DynamicFormModal, type FormConfig } from '../../../utils/formModal';
import { DndProviderWrapper } from '../../../utils/dnd';

interface User {
  id: string;
  name: string;
}

interface RKAttachment {
  id: string;
  source: string;
  type: string;
  sizeXY: string;
  clarification: string;
  createdAt: Date;
  agreedTo?: string | Date;
  typeStructure?: { id: string; name: string; colorHex?: string };
  approvalStatus?: { id: string; name: string; colorHex?: string };
  typeAttachment?: string;
}

const AttachmentCard = React.memo(function AttachmentCard({
  att,
  apiBase,
  onOpenImage,
}: {
  att: RKAttachment;
  apiBase: string;
  onOpenImage: (url: string) => void;
}) {
  const fileName = (att.source || '').split('/').pop() || 'Файл';
  const agreed = att.agreedTo ? dayjs(att.agreedTo).startOf('day') : null;
  const today = dayjs().startOf('day');
  const diff = agreed ? agreed.diff(today, 'day') : null;
  const normalizedPath = String(att.source || '').replace(/\\/g, '/');
  const fileUrl = `${apiBase}/${normalizedPath}`;
  const isDocument = att.typeAttachment === 'DOCUMENT';

  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      shadow="xs"
      onClick={() => onOpenImage(fileUrl)}
      style={{ cursor: 'pointer', position: 'relative' }}
    >
      <ActionIcon
        component="a"
        href={fileUrl}
        download
        variant="light"
        color="blue"
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'absolute', top: 8, right: 8 }}
        aria-label="Скачать"
      >
        <IconDownload size={16} />
      </ActionIcon>
      <Group justify="flex-start" align="center">
        <Group gap={12} align="center">
          <Image src={fileUrl} h={70} w={100} fit="contain" radius="sm" alt={fileName} />
        </Group>
      </Group>
      <Group gap="sm" mt={6} wrap="wrap" align="center">
        {att.sizeXY && <Text size="xs" c="dimmed">Размер: {att.sizeXY}</Text>}
        {att.clarification && <Text size="xs" c="dimmed">{att.clarification}</Text>}
        {isDocument && (
          <Badge color="gray" variant="light" style={{ textTransform: 'none' }}>
            Документ
          </Badge>
        )}
        {!isDocument && att.typeStructure?.name && (
          <Badge color={att.typeStructure?.colorHex || 'blue'} variant="outline" style={{ textTransform: 'none' }}>
            {att.typeStructure.name}
          </Badge>
        )}
        {!isDocument && att.approvalStatus?.name && (
          <Badge color={att.approvalStatus?.colorHex || 'gray'} variant="light" style={{ textTransform: 'none' }}>
            {att.approvalStatus.name}
          </Badge>
        )}
        {!isDocument && diff === null && (
          <Text size="xs" c="dimmed">Срок: не указан</Text>
        )}
        {!isDocument && typeof diff === 'number' && diff >= 0 && (
          <Text size="xs" c="dimmed">Осталось: {diff} дн.</Text>
        )}
        {!isDocument && typeof diff === 'number' && diff < 0 && (
          <Text size="xs" c="red">Просрочено: {Math.abs(diff)} дн.</Text>
        )}
      </Group>
    </Paper>
  );
});

interface Branch {
  uuid: string;
  name: string;
  code: string;
  city: string;
  rrs: string | null;
  status: number;
  address: string;
}

interface RKData {
  id: string;
  userAddId: string;
  userUpdatedId: string;
  branchId: string;
  agreedTo: Date;
  typeStructureId: string;
  approvalStatusId: string;
  createdAt: Date;
  updatedAt?: Date;
  attachments?: RKAttachment[];
  rkAttachment?: RKAttachment[];
  userAdd?: User;
  userUpdated?: User;
  branch?: Branch;
  typeStructure?: { id: string; name: string; colorHex?: string };
  approvalStatus?: { id: string; name: string; colorHex?: string };
}

interface RKFormValues {
  userAddId: string;
  userUpdatedId?: string;
  rrs: string;
  branchId: string;
  agreedTo: string;
  attachments: Array<{
    id?: string;
    source: File | string;
    sizeXY?: string;
    clarification?: string;
    meta?: Record<string, any>;
  }>;
  removedAttachments?: string[];
}

interface SelectOption {
  value: string;
  label: string;
  color?: string;
  rrs?: string | null;
  city?: string;
  code?: string;
}

const DEFAULT_PAGE_SIZE = 10;

const DEFAULT_RK_FORM: RKFormValues = {
  userAddId: '',
  userUpdatedId: '',
  rrs: '',
  branchId: '',
  agreedTo: dayjs().format('YYYY-MM-DDTHH:mm'),
  attachments: [],
  removedAttachments: [],
};

const RKList: React.FC = () => {
  const { user } = useUserContext();
  const [rkData, setRkData] = useState<RKData[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedRK, setSelectedRK] = useState<RKData | null>(null);
  const [rkForm, setRkForm] = useState<RKFormValues>(DEFAULT_RK_FORM);
  const [typeOptions, setTypeOptions] = useState<SelectOption[]>([]);
  const [approvalOptions, setApprovalOptions] = useState<SelectOption[]>([]);
  const [branchOptions, setBranchOptions] = useState<SelectOption[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [fileUploading, setFileUploading] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [calendarOpened, calendarHandlers] = useDisclosure(false);

  const modals = {
    view: useDisclosure(false),
    edit: useDisclosure(false),
    create: useDisclosure(false),
    delete: useDisclosure(false),
  };

  const [imagePreviewSrc, setImagePreviewSrc] = useState<string | null>(null);
  const [imagePreviewOpened, imagePreviewHandlers] = useDisclosure(false);

  const maskSizeXY = useCallback((raw: string) => {
    const input = String(raw || '').toLowerCase();
    let output = '';
    let separators = 0; // количество 'x' уже вставлено

    const pushX = () => {
      if (output.length === 0) return; // не начинаем со 'x'
      if (!/\d$/.test(output)) return; // перед 'x' должна быть цифра
      if (separators >= 2) return; // максимум 2 разделителя (3 секции)
      if (output.endsWith('x')) return; // не дублировать подряд
      output += 'x';
      separators += 1;
    };

    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      if (/[0-9]/.test(ch)) {
        output += ch;
        continue;
      }
      if (ch === ' ' || ch === 'x' || ch === 'х' || ch === '×' || ch === '*') {
        // пробел или любой вариант x → единая логика вставки 'x'
        pushX();
        continue;
      }
      // игнорируем прочие символы
    }

    // если получилось больше 3 секций из-за ручного ввода, обрежем по секциям
    const parts = output.split('x');
    if (parts.length > 3) {
      output = parts.slice(0, 3).join('x');
    }

    return output;
  }, []);

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
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        ...options,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error fetching data from ${url}:`, error);
      throw error;
    }
  }, []);

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      

      const [rkList, types, statuses, branches] = await Promise.all([
        fetchData(`${API}/add/rk`),
        fetchData(`${API}/add/rk/types/list`),
        fetchData(`${API}/add/rk/statuses/list`),
        fetchData(`${API}/add/rk/branches/list`)
      ]);

      console.log('Получены филиалы:', branches);

      setRkData(Array.isArray(rkList) ? rkList : []);

      setTypeOptions(types.map((t: any) => ({
        value: t.id,
        label: t.name,
        color: t.colorHex
      })));

      setApprovalOptions(statuses.map((s: any) => ({
        value: s.id,
        label: s.name,
        color: s.colorHex
      })));

      const formattedBranches = branches.map((b: Branch) => ({
        value: b.uuid,
        label: `${b.name} (${b.code}) ${b.city ? `- ${b.city}` : ''}`,
        rrs: b.rrs || null,
        city: b.city,
        code: b.code
      }));

      console.log('Форматированные филиалы:', formattedBranches);

      setBranchOptions(formattedBranches);
    } catch (error) {
      console.error('Failed to load initial data:', error);
      showNotification('error', 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
      
    }
  }, [fetchData, showNotification]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleRrsChange = useCallback((value: string) => {
    console.log('Изменение РРС:', value);
    setRkForm(prev => ({ 
      ...prev, 
      rrs: value, 
      branchId: '' // Сбрасываем выбор филиала
    }));
  }, []);

  // Получаем уникальные значения РРС
  const rrsOptions = useMemo(() => {
    const rrsSet = new Set<string>();
    branchOptions.forEach(branch => {
      if (branch.rrs) {
        rrsSet.add(branch.rrs);
      }
    });
    return Array.from(rrsSet).map(rrs => ({
      value: rrs,
      label: rrs
    }));
  }, [branchOptions]);

  // Фильтруем филиалы по выбранному РРС
  const filteredBranchOptions = useMemo(() => {
    if (!rkForm.rrs) return [];
    return branchOptions.filter(branch => branch.rrs === rkForm.rrs);
  }, [rkForm.rrs, branchOptions]);

  const formConfigCreate: FormConfig = useMemo(() => ({
    fields: [
      {
        name: 'rrs',
        label: 'РРС',
        type: 'select',
        options: rrsOptions,
        required: true,
        onChange: handleRrsChange,
        searchable: true,
        placeholder: 'Выберите РРС'
      },
      {
        name: 'branchId',
        label: 'Филиал',
        type: 'select',
        options: filteredBranchOptions,
        required: true,
        disabled: !rkForm.rrs,
        searchable: true,
        placeholder: 'Выберите филиал'
      },
      {
        name: 'attachments',
        label: 'Конструкции',
        type: 'file',
        multiple: true,
        withDnd: true,
        accept: 'image/*,.pdf,.doc,.docx,.xls,.xlsx',
        leftSection: <IconUpload size={18} />,
            fileFields: [
              {
                name: 'typeAttachment',
                label: 'Тип вложения',
                type: 'select',
            required: true,
                options: [
                  { value: 'CONSTRUCTION', label: 'Конструкция' },
                  { value: 'DOCUMENT', label: 'Документ' },
                ],
                placeholder: 'Выберите тип'
              },
          {
            name: 'sizeXY',
            label: 'Размер',
            type: 'text',
            required: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION',
            placeholder: '35 | 35x35 | 35x35x35',
            mask: maskSizeXY,
            visible: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION'
          },
          {
            name: 'clarification',
            label: 'Пояснение',
            type: 'text',
            required: false,
            placeholder: 'Описание файла',
            visible: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION'
          },
          {
            name: 'typeStructureId',
                label: 'Тип конструкции (для файла)',
            type: 'select',
            required: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION',
            options: typeOptions,
            visible: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION',
            placeholder: 'Выберите тип конструкции'
          },
          {
            name: 'approvalStatusId',
            label: 'Статус утверждения (для файла)',
            type: 'select',
            required: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION',
            options: approvalOptions,
            visible: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION',
            placeholder: 'Выберите статус'
          },
          {
            name: 'agreedTo',
            label: 'Дата согласования (для файла)',
            type: 'date',
            required: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION',
            visible: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION'
          }
        ],
      },
    ],
    initialValues: rkForm,
  }), [rrsOptions, filteredBranchOptions, rkForm, handleRrsChange]);

  const formConfigEdit: FormConfig = useMemo(() => ({
    fields: [
      {
        name: 'rrs',
        label: 'РРС',
        type: 'select',
        options: rrsOptions,
        required: true,
        onChange: handleRrsChange,
        searchable: true
      },
      {
        name: 'branchId',
        label: 'Филиал',
        type: 'select',
        options: filteredBranchOptions,
        required: true,
        disabled: !rkForm.rrs,
        searchable: true
      },
      {
        name: 'attachments',
        label: 'Конструкции',
        type: 'file',
        multiple: true,
        withDnd: true,
        accept: 'image/*,.pdf,.doc,.docx,.xls,.xlsx',
        leftSection: <IconUpload size={18} />,
         fileFields: [
          {
            name: 'typeAttachment',
            label: 'Тип вложения',
            type: 'select',
            required: true,
            options: [
              { value: 'CONSTRUCTION', label: 'Конструкция' },
              { value: 'DOCUMENT', label: 'Документ' },
            ]
          },
          {
            name: 'sizeXY',
            label: 'Размер',
            type: 'text',
            required: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION',
            placeholder: '35 | 35x35 | 35x35x35',
            mask: (raw: string) => {
              let next = String(raw || '')
                .toLowerCase()
                .replace(/[\s,_:+\-]+/g, 'x')
                .replace(/[х×*]/g, 'x')
                .replace(/[^0-9x]/g, '');
              next = next.replace(/x{2,}/g, 'x');
              next = next.replace(/^x+|x+$/g, '');
              const parts = next.split('x').filter(Boolean);
              return parts.slice(0, 3).join('x');
            },
            visible: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION'
          },
          {
            name: 'clarification',
            label: 'Пояснение',
            type: 'text',
            required: false,
            placeholder: 'Описание файла',
            visible: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION'
          },
          {
            name: 'typeStructureId',
            label: 'Тип конструкции (для файла)',
            type: 'select',
            required: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION',
            options: typeOptions,
            visible: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION'
          },
          {
            name: 'approvalStatusId',
            label: 'Статус утверждения (для файла)',
            type: 'select',
            required: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION',
            options: approvalOptions,
            visible: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION'
          },
          {
            name: 'agreedTo',
            label: 'Дата согласования (для файла)',
            type: 'date',
            required: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION',
            visible: (meta: any) => meta?.typeAttachment === 'CONSTRUCTION'
          }
        ],
      },
    ],
    initialValues: rkForm,
  }), [rrsOptions, filteredBranchOptions, rkForm, handleRrsChange]);

  const openCreateModal = useCallback(() => {
    setRkForm(DEFAULT_RK_FORM);
    modals.create[1].open();
  }, [modals.create]);

  const openEditModal = useCallback((rk: RKData) => {
    setSelectedRK(rk);
    setRkForm({
      userAddId: rk.userAddId,
      userUpdatedId: rk.userUpdatedId,
      rrs: rk.branch?.rrs || '',
      branchId: rk.branchId,
      agreedTo: dayjs(rk.agreedTo).format('YYYY-MM-DDTHH:mm'),
      attachments: ((rk as any).attachments || (rk as any).rkAttachment || []).map((a: any) => ({
        id: a.id,
        source: a.source,
        meta: {
        typeAttachment: a.typeAttachment,
        sizeXY: a.sizeXY,
          clarification: a.clarification,
          typeStructureId: a.typeStructureId,
          approvalStatusId: a.approvalStatusId,
          agreedTo: a.agreedTo ? dayjs(a.agreedTo).format('YYYY-MM-DD') : '',
        },
      })),
      removedAttachments: []
    });
    modals.edit[1].open();
  }, [modals.edit]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!selectedRK) return;
    try {
      await fetchData(`${API}/add/rk/${selectedRK.id}`, {
        method: 'DELETE',
      });
      setRkData(prev => prev.filter(item => item.id !== selectedRK.id));
      modals.delete[1].close();
      showNotification('success', 'Запись успешно удалена');
    } catch (error) {
      console.error('Failed to delete RK:', error);
      showNotification('error', 'Ошибка при удалении записи');
    }
  }, [selectedRK, modals.delete, showNotification, fetchData]);

  const handleFormSubmit = useCallback(async (values: RKFormValues, mode: 'create' | 'edit') => {
    if (!user) {
      showNotification('error', 'Пользователь не авторизован');
      return;
    }
    setFileUploading(true);
    try {
      const formData = new FormData();
      formData.append('userAddId', user.id);
      formData.append('branchId', values.branchId);
      formData.append('agreedTo', values.agreedTo);

      // Prepare metadata for newly added files (source is File)
      const attachmentsMeta = values.attachments
        .filter(att => att.source instanceof File)
        .map(att => ({
          typeAttachment: att.meta?.typeAttachment || 'DOCUMENT',
          sizeXY: att.meta?.typeAttachment === 'CONSTRUCTION' ? (att.meta?.sizeXY ?? '') : '',
          clarification: att.meta?.clarification ?? '',
          typeStructureId: att.meta?.typeAttachment === 'CONSTRUCTION' ? (att.meta?.typeStructureId || '') : '',
          approvalStatusId: att.meta?.typeAttachment === 'CONSTRUCTION' ? (att.meta?.approvalStatusId || '') : '',
          agreedTo: att.meta?.agreedTo || '',
        }));

      // For create vs edit, backend expects different field names
      if (mode === 'create') {
        formData.append('attachmentsMeta', JSON.stringify(attachmentsMeta));
      } else {
        formData.append('newAttachmentsMeta', JSON.stringify(attachmentsMeta));
        formData.append('userUpdatedId', user.id);

        // Обновление метаданных существующих вложений
        const existingAttachmentsMeta = values.attachments
          .filter(att => !(att.source instanceof File) && att.id)
          .map(att => ({
            id: att.id as string,
            typeAttachment: att.meta?.typeAttachment || (att.meta?.agreedTo ? 'CONSTRUCTION' : 'DOCUMENT'),
            sizeXY: att.meta?.typeAttachment === 'CONSTRUCTION' ? (att.meta?.sizeXY ?? undefined) : undefined,
            clarification: att.meta?.clarification ?? undefined,
            typeStructureId: att.meta?.typeAttachment === 'CONSTRUCTION' ? (att.meta?.typeStructureId ?? undefined) : undefined,
            approvalStatusId: att.meta?.typeAttachment === 'CONSTRUCTION' ? (att.meta?.approvalStatusId ?? undefined) : undefined,
            agreedTo: att.meta?.agreedTo ?? undefined,
          }));
        if (existingAttachmentsMeta.length > 0) {
          formData.append('existingAttachmentsMeta', JSON.stringify(existingAttachmentsMeta));
        }
      }

      values.attachments.forEach(attachment => {
        if (attachment.source instanceof File) {
          formData.append('files', attachment.source);
        }
      });

      // Примечание: обновление метаданных существующих вложений пока не поддержано бекендом

      if (mode === 'edit' && values.removedAttachments?.length) {
        formData.append('removedAttachments', JSON.stringify(values.removedAttachments));
      }

      const url = mode === 'create' ? `${API}/add/rk` : `${API}/add/rk/${selectedRK!.id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (mode === 'create') {
        setRkData(prev => [result, ...prev]);
      } else {
        setRkData(prev => prev.map(item => item.id === selectedRK!.id ? result : item));
      }

      setRkForm(DEFAULT_RK_FORM);
      modals[mode][1].close();
      showNotification('success', mode === 'create' ? 'Запись успешно добавлена' : 'Запись успешно обновлена');
    } catch (error) {
      console.error(`Failed to ${mode} RK:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      showNotification('error', `Ошибка: ${errorMessage}`);
    } finally {
      setFileUploading(false);
    }
  }, [user, selectedRK, modals, showNotification]);

  

  const isArchivedBranch = (rk: RKData) => {
    const status = rk.branch?.status;
    return status === 2 || status === 3;
  };

  const baseList = useMemo(() => {
    // Активные по умолчанию, Архив при включенном флаге
    return (rkData || []).filter(rk => showArchive ? isArchivedBranch(rk) : !isArchivedBranch(rk));
  }, [rkData, showArchive]);

  const filteredData = useMemo(() => {
    const startIdx = (currentPage - 1) * DEFAULT_PAGE_SIZE;
    return baseList.slice(startIdx, startIdx + DEFAULT_PAGE_SIZE);
  }, [baseList, currentPage]);

  const PaginationControls = useCallback(() => {
    const totalPages = Math.ceil(baseList.length / DEFAULT_PAGE_SIZE);
    return (
      <Group justify="center" mt="md">
        <Button
          variant="outline"
          disabled={currentPage === 1}
          onClick={() => setCurrentPage(p => p - 1)}
        >
          Назад
        </Button>
        <Text>
          {currentPage} из {totalPages}
        </Text>
        <Button
          variant="outline"
          disabled={currentPage * DEFAULT_PAGE_SIZE >= baseList.length}
          onClick={() => setCurrentPage(p => p + 1)}
        >
          Вперед
        </Button>
      </Group>
    );
  }, [currentPage, baseList.length]);


  const EmptyState = useCallback(() => (
    <Paper withBorder p="xl" radius="md" shadow="xs" style={{ textAlign: 'center' }}>
      <Text c="dimmed" mb="md">Нет данных для отображения</Text>
      <Button onClick={openCreateModal}>
        Создать первую запись
      </Button>
    </Paper>
  ), [openCreateModal]);

  const getBranchStatusBadge = (status?: number) => {
    if (status === 0) {
      return {
        label: 'Новый',
        color: 'blue' as const,
        variant: 'light' as const,
        style: {},
      };
    }
    if (status === 1) {
      return {
        label: 'Действующий',
        color: 'green' as const,
        variant: 'filled' as const,
        style: {},
      };
    }
    if (status === 2) {
      return {
        label: 'Закрыт',
        color: 'red' as const,
        variant: 'filled' as const,
        style: {},
      };
    }
    // 3: Процедура закрытия — белый бейдж с рамкой
    return {
      label: 'Процедура закрытия',
      color: 'gray' as const,
      variant: 'outline' as const,
      style: { backgroundColor: '#fff' },
    };
  };

  if (loading) {
    return (
      <Box style={{ height: '200px', position: 'relative' }}>
        <LoadingOverlay visible loaderProps={{ size: 'lg' }} />
      </Box>
    );
  }

  // Helper: compute days remaining until the latest agreedTo among attachments
  const getDaysInfo = (rk: RKData) => {
    const today = dayjs().startOf('day');
    const agreedDates = Array.isArray(rk.rkAttachment)
      ? rk.rkAttachment
          .map((att: any) => att.agreedTo ? dayjs(att.agreedTo).startOf('day') : null)
          .filter((d: any) => d && d.isValid())
      : [];

    if (agreedDates.length === 0) {
      return { label: 'Срок: не указан' };
    }

    // Берём максимальную дату согласования как дату окончания
    const end = agreedDates.reduce((max: any, d: any) => (d.isAfter(max) ? d : max), agreedDates[0]);
    const daysLeft = end.diff(today, 'day');
    if (daysLeft >= 0) {
      return { label: `Осталось: ${daysLeft} дн.` };
    }
    return { label: `Просрочено: ${Math.abs(daysLeft)} дн.` };
  };

  // Per-attachment helpers will be computed inline during render

return (
  <DndProviderWrapper>
    <Box p="md">
      <Group justify="space-between" mb="md">
        <Title order={2}>Реестр конструкций</Title>
        <Group>
          <Button
            variant={showArchive ? 'filled' : 'outline'}
            onClick={() => { setCurrentPage(1); setShowArchive(v => !v); }}
          >
            Архив
          </Button>
          <Button variant="outline" onClick={calendarHandlers.open}>
            Календарь
          </Button>
          <Button
            size="md"
            onClick={openCreateModal}
            loading={fileUploading}
          >
            Добавить конструкцию
          </Button>
        </Group>
      </Group>
      <Stack gap="md">
        {Array.isArray(rkData) && rkData.length > 0 ? (
          <>
            {filteredData.map((rk) => (
              <Paper key={rk.id} withBorder p="md" radius="md" shadow="xs">
                <Stack gap="xs">
                  <Group justify="space-between" align="flex-start">
                    <Box style={{ flex: 1 }}>
                      {/* Адрес и город филиала */}
                      <Text fw={600} mb={4}>
                        {rk.branch?.name || 'Филиал не указан'}
                      </Text>
                      <Text size="sm" c="dimmed" mb="xs">
                        {rk.branch?.rrs || 'РРС не указан'}
                      </Text>
                      
                      {/* Основная информация */}
                      <Text size="sm" mb={4}>
                        <Text span fw={500}>Город:</Text> {rk.branch?.city || 'не указан'}
                      </Text>
                      <Text size="sm">
                        <Text span fw={500}>Адрес:</Text> {rk.branch?.address|| 'не указан'} 
                        {rk.branch?.code}
                      </Text>
                    </Box>
                    
                    {/* Статус филиала и кнопки действий */}
                    <Stack gap="xs" align="flex-end">
                      {rk.branch?.status !== undefined && (
                        (() => {
                          const { label, color, variant, style } = getBranchStatusBadge(rk.branch?.status);
                          return (
                            <Badge
                              color={color}
                              variant={variant}
                              style={{ textTransform: 'none', ...style }}
                            >
                              {label}
                            </Badge>
                          );
                        })()
                      )}
                      <Group>
                        <ActionIcon
                          color="blue"
                          onClick={() => {
                            setSelectedRK(rk);
                            modals.view[1].open();
                          }}
                          disabled={fileUploading}
                        >
                          <IconFile size={18} />
                        </ActionIcon>
                        <ActionIcon
                          color="blue"
                          onClick={() => openEditModal(rk)}
                          disabled={fileUploading}
                        >
                          <IconPencil size={18} />
                        </ActionIcon>
                        <ActionIcon
                          color="red"
                          onClick={() => {
                            setSelectedRK(rk);
                            modals.delete[1].open();
                          }}
                          disabled={fileUploading}
                        >
                          <IconTrash size={18} />
                        </ActionIcon>
                      </Group>
                    </Stack>
                  </Group>

                  {/* Список конструкций */}
                  {Array.isArray(rk.rkAttachment) && rk.rkAttachment.length > 0 && (
                    <Box mt="sm">
                      <Text size="sm" fw={500} mb="xs">Конструкции:</Text>
                      <Stack gap="sm">
                        {rk.rkAttachment.map((att) => (
                          <AttachmentCard
                            key={att.id}
                            att={att as any}
                            apiBase={API}
                            onOpenImage={(url) => {
                              setImagePreviewSrc(url);
                              imagePreviewHandlers.open();
                            }}
                          />
                        ))}
                      </Stack>
                    </Box>
                  )}

                  {/* Футер карточки */}
                  <Group justify="space-between" mt="sm" pt="sm" style={{ borderTop: '1px solid #eee' }}>
                    <Text size="xs" c="dimmed">
                      Автор: {rk.userAdd?.name || 'Неизвестный пользователь'}
                    </Text>
                    <Group gap="md">
                      <Text size="xs" c="dimmed">{getDaysInfo(rk).label}</Text>
                      <Text size="xs" c="dimmed">
                        {dayjs(rk.agreedTo).format('DD.MM.YYYY HH:mm')}
                      </Text>
                    </Group>
                  </Group>
                </Stack>
              </Paper>
            ))}
            <PaginationControls />
          </>
        ) : (
          <EmptyState />
        )}
      </Stack>
      <DynamicFormModal
        opened={modals.create[0]}
        onClose={() => {
          setRkForm(DEFAULT_RK_FORM);
          modals.create[1].close();
        }}
        title="Добавить конструкцию"
        mode="create"
        fields={formConfigCreate.fields}
        initialValues={rkForm}
        onSubmit={(values) => handleFormSubmit(values as RKFormValues, 'create')}
      />
      <DynamicFormModal
        opened={modals.edit[0]}
        onClose={() => {
          setRkForm(DEFAULT_RK_FORM);
          modals.edit[1].close();
        }}
        title="Редактировать конструкцию"
        mode="edit"
        fields={formConfigEdit.fields}
        initialValues={rkForm}
        onSubmit={(values) => handleFormSubmit(values as RKFormValues, 'edit')}
      />
      <DynamicFormModal
        opened={modals.view[0]}
        onClose={() => modals.view[1].close()}
        title="Просмотр конструкции"
        mode="view"
        initialValues={selectedRK || {}}
        viewFieldsConfig={[
          { label: 'РРС', value: (item) => item?.branch?.rrs || '-' },
          { label: 'Филиал', value: (item) => `${item?.branch?.name || '-'}${item?.branch?.code ? ` (${item.branch.code})` : ''}${item?.branch?.city ? ` - ${item.branch.city}` : ''}` },
          { label: 'Адрес', value: (item) => item?.branch?.address || '-' },
          { label: 'Статус', value: (item) => 
            item?.branch?.status === 0 ? 'Новый' : 
            item?.branch?.status === 1 ? 'Действующий' : 
            item?.branch?.status === 2 ? 'Закрыт' : 'Процедура закрытия'
          },
          { label: 'Тип конструкции', value: (item) => item?.typeStructure?.name || '-' },
          { label: 'Статус утверждения', value: (item) => item?.approvalStatus?.name || '-' },
          { label: 'Дата согласования', value: (item) => dayjs(item?.agreedTo).format('DD.MM.YYYY HH:mm') },
        ]}
      />
      <Modal
        opened={modals.delete[0]}
        onClose={() => modals.delete[1].close()}
        title="Подтверждение удаления"
        centered
      >
        <Text mb="md">Вы уверены, что хотите удалить эту конструкцию?</Text>
        <Group justify="flex-end">
          <Button variant="outline" onClick={() => modals.delete[1].close()}>
            Отмена
          </Button>
          <Button color="red" onClick={handleDeleteConfirm} loading={fileUploading}>
            Удалить
          </Button>
        </Group>
      </Modal>
      <Modal
        opened={imagePreviewOpened}
        onClose={() => {
          setImagePreviewSrc(null);
          imagePreviewHandlers.close();
        }}
        title="Просмотр изображения"
        size="xl"
        centered
      >
        {imagePreviewSrc ? (
          <Image src={imagePreviewSrc} radius="sm" h={500} fit="contain" alt="attachment" />
        ) : (
          <Text size="sm" c="dimmed">Нет изображения</Text>
        )}
      </Modal>
      <RKCalendarModal opened={calendarOpened} onClose={calendarHandlers.close} rkList={rkData} />
    </Box>
  </DndProviderWrapper>
);
}
export default RKList;