import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { notificationSystem } from '../../../utils/Push';
import { Button, Title, Box, LoadingOverlay, Group, ActionIcon, Text, Stack, Paper, Modal, Badge, Image, Avatar } from '@mantine/core';
import RKCalendarModal from './RKCalendar';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { IconPencil, IconTrash, IconUpload, IconDownload, IconPlus, IconCalendar, IconArchive, IconEye } from '@tabler/icons-react';
import { DynamicFormModal, type FormConfig } from '../../../utils/formModal';
import { FilePreviewModal } from '../../../utils/FilePreviewModal';
import { DndProviderWrapper } from '../../../utils/dnd';
import { FilterGroup } from '../../../utils/filter';
import type { ColumnFiltersState } from '@tanstack/react-table';

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
  onOpenFilePreview,
}: {
  att: RKAttachment;
  apiBase: string;
  onOpenFilePreview: (files: string[], currentIndex: number) => void;
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
      onClick={() => onOpenFilePreview([fileUrl], 0)}
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
          <Image 
            src={fileUrl} 
            h={70} 
            w={100} 
            fit="contain" 
            radius="sm" 
            alt={fileName}
            onError={(e) => {
              console.error('Ошибка загрузки изображения в AttachmentCard:', fileUrl);
              console.error('Исходный путь:', att.source);
              console.error('Нормализованный путь:', normalizedPath);
              // Заменяем на placeholder при ошибке
              e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjcwIiB2aWV3Qm94PSIwIDAgMTAwIDcwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iNzAiIGZpbGw9IiNmNWY1ZjUiLz48dGV4dCB4PSI1MCIgeT0iNDAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OTk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+0JjQt9C+0LHRgNCw0LbQsCDRgdC+0LfQtNCwPC90ZXh0Pjwvc3ZnPg==';
            }}
          />
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
  userData?: Array<{ fio: string; email?: string; position?: { name: string } }>;
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
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const modals = {
    view: useDisclosure(false),
    edit: useDisclosure(false),
    create: useDisclosure(false),
    delete: useDisclosure(false),
  };

  const [imagePreviewSrc, setImagePreviewSrc] = useState<string | null>(null);
  const [imagePreviewOpened, imagePreviewHandlers] = useDisclosure(false);
  const [filePreviewOpened, filePreviewHandlers] = useDisclosure(false);
  const [filePreviewData, setFilePreviewData] = useState<{ files: string[], currentIndex: number } | null>(null);

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
        let errMsg = `HTTP error! status: ${response.status}`;
        try {
          const text = await response.text();
          if (text) {
            const json = JSON.parse(text);
            errMsg = json.message || errMsg;
          }
        } catch {
          // тело пустое или не JSON — оставляем errMsg
        }
        throw new Error(errMsg);
      }
      const text = await response.text();
      if (!text) return null; // поддержка 204/пустых ответов
      return JSON.parse(text);
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
            placeholder: 'Выберите тип',
            searchable: false,
            clearable: false,
            allowDeselect: false,
            onChange: (value: any) => {
              console.log('Type attachment changed:', value);
            }
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
  }), [rrsOptions, filteredBranchOptions, rkForm, handleRrsChange, typeOptions, approvalOptions, maskSizeXY]);

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
            ],
            placeholder: 'Выберите тип',
            searchable: false,
            clearable: false,
            allowDeselect: false,
            onChange: (value: any) => {
              console.log('Type attachment changed:', value);
            }
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
  }), [rrsOptions, filteredBranchOptions, rkForm, handleRrsChange, typeOptions, approvalOptions, maskSizeXY]);

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

  const openFilePreview = useCallback((files: string[], currentIndex: number = 0) => {
    setFilePreviewData({ files, currentIndex });
    filePreviewHandlers.open();
  }, [filePreviewHandlers]);

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
    let list = (rkData || []).filter(rk => showArchive ? isArchivedBranch(rk) : !isArchivedBranch(rk));

    // Применяем дополнительные фильтры: rrs, branch, city, dates, statuses, types
    const getFilter = (id: string) => columnFilters.find(f => f.id === id)?.value as any;
    const rrsFilter = getFilter('rrs') as string[] | undefined;
    const branchFilter = getFilter('branch') as string[] | undefined;
    const cityFilter = getFilter('city') as string[] | undefined;
    const dateFilter = getFilter('agreedDate') as { start?: string; end?: string } | undefined;
    const statusFilter = getFilter('statusId') as string[] | undefined;
    const typeFilter = getFilter('typeId') as string[] | undefined;

    if (rrsFilter && rrsFilter.length) {
      list = list.filter(rk => rk.branch?.rrs && rrsFilter.includes(rk.branch.rrs));
    }
    if (branchFilter && branchFilter.length) {
      list = list.filter(rk => rk.branch?.name && branchFilter.includes(rk.branch.name));
    }
    if (cityFilter && cityFilter.length) {
      list = list.filter(rk => rk.branch?.city && cityFilter.includes(rk.branch.city));
    }
    if (dateFilter && (dateFilter.start || dateFilter.end)) {
      const start = dateFilter.start ? dayjs(dateFilter.start).startOf('day') : null;
      const end = dateFilter.end ? dayjs(dateFilter.end).endOf('day') : null;
      list = list.filter(rk => {
        const dates = (rk.rkAttachment || []).map((a: any) => a.agreedTo && dayjs(a.agreedTo));
        return dates.some(d => d && d.isValid() && (
          (start && end && d.isBetween(start, end, 'day', '[]')) ||
          (!start && end && d.isBefore(end)) ||
          (start && !end && d.isAfter(start))
        ));
      });
    }
    if (statusFilter && statusFilter.length) {
      list = list.filter(rk => (rk.rkAttachment || []).some((a: any) => a.approvalStatusId && statusFilter.includes(a.approvalStatusId)));
    }
    if (typeFilter && typeFilter.length) {
      list = list.filter(rk => (rk.rkAttachment || []).some((a: any) => a.typeStructureId && typeFilter.includes(a.typeStructureId)));
    }

    return list;
  }, [rkData, showArchive, columnFilters]);

  const filteredData = useMemo(() => {
    const startIdx = (currentPage - 1) * DEFAULT_PAGE_SIZE;
    return baseList.slice(startIdx, startIdx + DEFAULT_PAGE_SIZE);
  }, [baseList, currentPage]);

  const totalPages = useMemo(() => Math.ceil(baseList.length / DEFAULT_PAGE_SIZE), [baseList.length]);
  const PaginationControls = useCallback(() => (
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
  ), [currentPage, baseList.length, totalPages]);


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

  // Dependent filter helpers (RRS -> Branch) MUST be declared before any early returns
  const getFilterValue = useCallback((id: string) => {
    return columnFilters.find((f) => f.id === id)?.value as any;
  }, [columnFilters]);

  const rrsFilter = getFilterValue('rrs') as string[] | undefined;

  const branchOptionsFilteredByRrs = useMemo(() => {
    const data = rkData || [];
    const filtered = rrsFilter && rrsFilter.length
      ? data.filter((r) => r.branch?.rrs && rrsFilter.includes(String(r.branch.rrs)))
      : data;
    const names = Array.from(new Set(filtered.map((r) => r.branch?.name).filter(Boolean))).map((v: any) => ({ value: String(v), label: String(v) }));
    return names;
  }, [rkData, rrsFilter]);

  // Prune selected branches if they are not allowed by current RRS selection
  useEffect(() => {
    const currentBranch = getFilterValue('branch') as string[] | undefined;
    if (!currentBranch || currentBranch.length === 0) return;
    const allowed = new Set(branchOptionsFilteredByRrs.map((o) => o.value));
    const nextBranch = currentBranch.filter((b) => allowed.has(String(b)));
    if (nextBranch.length === currentBranch.length) return;
    setColumnFilters((prev) => {
      const next = prev.filter((f) => f.id !== 'branch');
      if (nextBranch.length > 0) return [...next, { id: 'branch', value: nextBranch }];
      return next;
    });
  }, [branchOptionsFilteredByRrs, getFilterValue]);

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
    <Box 
      style={{
        background: 'var(--theme-bg-primary)',
        minHeight: '100vh',
        padding: '20px'
      }}
    >
      {loading && <LoadingOverlay visible />}
      
      {/* Современный заголовок */}
      <Box
        style={{
          background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
          border: '1px solid var(--theme-border-primary)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Декоративные элементы */}
        <Box
          style={{
            position: 'absolute',
            top: '-20px',
            right: '-20px',
            width: '120px',
            height: '120px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            zIndex: 1
          }}
        />
        <Box
          style={{
            position: 'absolute',
            bottom: '-30px',
            left: '-30px',
            width: '80px',
            height: '80px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '50%',
            zIndex: 1
          }}
        />
        
        <Group justify="space-between" align="center" style={{ position: 'relative', zIndex: 2 }}>
          <Group gap="16px" align="center">
            <Box
              style={{
                width: '48px',
                height: '48px',
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px'
              }}
            >
              🏗️
            </Box>
            <Box>
              <Title 
                order={2} 
                style={{ 
                  color: 'white', 
                  margin: 0,
                  fontSize: '28px',
                  fontWeight: '700'
                }}
              >
                Реестр конструкций
              </Title>
              <Text 
                style={{ 
                  color: 'rgba(255, 255, 255, 0.8)', 
                  fontSize: '16px',
                  marginTop: '4px'
                }}
              >
                Управление конструкциями и документацией
              </Text>
            </Box>
          </Group>
          
          <Group gap="12px">
            <Button
              size="md"
              radius="xl"
              variant={showArchive ? 'filled' : 'outline'}
              onClick={() => { setCurrentPage(1); setShowArchive(v => !v); }}
              style={{
                background: showArchive 
                  ? 'rgba(255, 255, 255, 0.3)' 
                  : 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                backdropFilter: 'blur(10px)',
                fontWeight: '600'
              }}
              leftSection={<IconArchive size={18} />}
            >
              Архив
            </Button>
            <Button
              size="md"
              radius="xl"
              variant="outline"
              onClick={calendarHandlers.open}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                backdropFilter: 'blur(10px)',
                fontWeight: '600'
              }}
              leftSection={<IconCalendar size={18} />}
            >
              Календарь
            </Button>
            <Button
              size="lg"
              radius="xl"
              onClick={openCreateModal}
              loading={fileUploading}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                backdropFilter: 'blur(10px)',
                fontWeight: '600',
                fontSize: '16px',
                padding: '12px 24px'
              }}
              leftSection={<IconPlus size={20} />}
            >
              Добавить конструкцию
            </Button>
          </Group>
        </Group>
      </Box>
      {/* Фильтры */}
      {rkData.length > 0 && (
        <Box
          style={{
            background: 'var(--theme-bg-elevated)',
            borderRadius: '16px',
            padding: '20px',
            border: '1px solid var(--theme-border-primary)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
            marginBottom: '20px'
          }}
        >
          <Group gap="12px" align="center" style={{ marginBottom: '16px' }}>
            <Box
              style={{
                width: '32px',
                height: '32px',
                background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px'
              }}
            >
              🔍
            </Box>
            <Text 
              style={{ 
                fontSize: '18px', 
                fontWeight: '600',
                color: 'var(--theme-text-primary)'
              }}
            >
              Фильтры
            </Text>
          </Group>
          <FilterGroup
            filters={[
              {
                type: 'date',
                columnId: 'agreedDate',
                label: 'Дата согласования',
                placeholder: 'Выберите дату',
              },
              {
                type: 'select',
                columnId: 'rrs',
                label: 'РРС',
                placeholder: 'Выберите РРС',
                options: Array.from(new Set(rkData.map(r => r.branch?.rrs).filter(Boolean))).map((v: any) => ({ value: String(v), label: String(v) })),
              },
              {
                type: 'select',
                columnId: 'branch',
                label: 'Филиал',
                placeholder: 'Выберите филиал',
                options: branchOptionsFilteredByRrs,
              },
              {
                type: 'select',
                columnId: 'city',
                label: 'Город',
                placeholder: 'Выберите город',
                options: Array.from(new Set(rkData.map(r => r.branch?.city).filter(Boolean))).map((v: any) => ({ value: String(v), label: String(v) })),
              },
              {
                type: 'select',
                columnId: 'statusId',
                label: 'Статусы',
                placeholder: 'Выберите статус',
                options: approvalOptions.map(o => ({ value: String(o.value), label: o.label })),
              },
              {
                type: 'select',
                columnId: 'typeId',
                label: 'Типы',
                placeholder: 'Выберите тип',
                options: typeOptions.map(o => ({ value: String(o.value), label: o.label })),
              },
            ]}
            columnFilters={columnFilters}
            onColumnFiltersChange={(id, value) => setColumnFilters(prev => {
              const next = prev.filter(f => f.id !== id);
              const isArray = Array.isArray(value);
              const isObject = value !== null && typeof value === 'object';
              const isDateRange = isObject && !isArray && ('start' in (value as any) || 'end' in (value as any));

              // remove when undefined
              if (value === undefined) return next;
              // remove when empty array
              if (isArray && (value as any[]).length === 0) return next;
              // remove when date range object has neither start nor end
              if (isDateRange && !(value as any).start && !(value as any).end) return next;

              return [...next, { id, value }];
            })}
          />
        </Box>
      )}
      <Stack gap="md">
        {Array.isArray(rkData) && rkData.length > 0 ? (
          <>
            {filteredData.map((rk) => (
              <Box key={rk.id}>
                <Box
                  style={{
                    background: 'var(--theme-bg-elevated)',
                    borderRadius: '16px',
                    padding: '20px',
                    border: '1px solid var(--theme-border-primary)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.05)';
                  }}
                >
                  <Group align="flex-start" gap="xl" wrap="nowrap">
                    {/* Левая часть - основная информация */}
                    <Stack gap="md" style={{ flex: 1, minWidth: '400px' }}>
                      {/* Заголовок карточки */}
                      <Group justify="space-between" align="flex-start">
                      <Group gap="12px" align="center">
                        <Box
                          style={{
                            width: '50px',
                            height: '50px',
                            background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '24px'
                          }}
                        >
                          🏢
                        </Box>
                        <Box>
                          <Text 
                            fw={700} 
                            size="xl"
                            style={{ 
                              color: 'var(--theme-text-primary)',
                              marginBottom: '4px'
                            }}
                          >
                            {rk.branch?.name || 'Филиал не указан'}
                          </Text>
                          <Text 
                            size="md" 
                            style={{ 
                              color: 'var(--theme-text-secondary)',
                              fontWeight: '500'
                            }}
                          >
                            {rk.branch?.rrs || 'РРС не указан'}
                          </Text>
                        </Box>
                      </Group>
                      
                      {/* Статус и кнопки действий */}
                      <Group gap="12px" align="center">
                        {rk.branch?.status !== undefined && (() => {
                          const { label, color, variant, style } = getBranchStatusBadge(rk.branch?.status);
                          return (
                            <Badge 
                              color={color} 
                              variant={variant} 
                              style={{ 
                                textTransform: 'none', 
                                fontWeight: '600',
                                fontSize: '14px',
                                padding: '8px 16px',
                                borderRadius: '10px',
                                ...style 
                              }}
                            >
                              {label}
                            </Badge>
                          );
                        })()}
                        <Group gap="6px">
                          <ActionIcon
                            size="md"
                            variant="light"
                            onClick={() => {
                              setSelectedRK(rk);
                              modals.view[1].open();
                            }}
                            disabled={fileUploading}
                            style={{
                              background: 'var(--color-blue-100)',
                              color: 'var(--color-blue-700)',
                              border: '1px solid var(--color-blue-200)',
                              borderRadius: '10px'
                            }}
                          >
                            <IconEye size={18} />
                          </ActionIcon>
                          <ActionIcon
                            size="md"
                            variant="light"
                            onClick={(e) => { e.stopPropagation(); openEditModal(rk); }}
                            disabled={fileUploading}
                            style={{
                              background: 'var(--color-green-100)',
                              color: 'var(--color-green-700)',
                              border: '1px solid var(--color-green-200)',
                              borderRadius: '10px'
                            }}
                          >
                            <IconPencil size={18} />
                          </ActionIcon>
                          <ActionIcon
                            size="md"
                            variant="light"
                            onClick={(e) => { e.stopPropagation(); setSelectedRK(rk); modals.delete[1].open(); }}
                            disabled={fileUploading}
                            style={{
                              background: 'var(--color-red-100)',
                              color: 'var(--color-red-700)',
                              border: '1px solid var(--color-red-200)',
                              borderRadius: '10px'
                            }}
                          >
                            <IconTrash size={18} />
                          </ActionIcon>
                        </Group>
                      </Group>
                    </Group>

                      {/* Основная информация */}
                      <Stack gap="md">
                        <Group gap="12px" align="center">
                          <Text size="md" fw={600} style={{ color: 'var(--theme-text-secondary)', minWidth: '80px' }}>
                            Город:
                          </Text>
                          <Text size="md" style={{ color: 'var(--theme-text-primary)' }}>
                            {rk.branch?.city || 'не указан'}
                          </Text>
                        </Group>
                        <Group gap="12px" align="flex-start">
                          <Text size="md" fw={600} style={{ color: 'var(--theme-text-secondary)', minWidth: '80px' }}>
                            Адрес:
                          </Text>
                          <Text size="md" style={{ color: 'var(--theme-text-primary)' }}>
                            {rk.branch?.address || 'не указан'} {rk.branch?.code}
                          </Text>
                        </Group>
                        {rk.branch?.userData && rk.branch.userData.length > 0 && (
                          <Group gap="12px" align="flex-start">
                            <Text size="md" fw={600} style={{ color: 'var(--theme-text-secondary)', minWidth: '80px' }}>
                              Контакты:
                            </Text>
                            <Text size="md" style={{ color: 'var(--theme-text-primary)' }}>
                              {rk.branch.userData.map(u => u.fio).join(', ')}
                            </Text>
                          </Group>
                        )}
                      </Stack>
                    </Stack>

                    {/* Правая часть - вложения в два ряда */}
                    <Stack gap="lg" style={{ minWidth: '400px', maxWidth: '500px' }}>
                        {Array.isArray(rk.rkAttachment) && rk.rkAttachment.length > 0 && (() => {
                          const constructions = rk.rkAttachment.filter((a: any) => a.typeAttachment !== 'DOCUMENT');
                          const documents = rk.rkAttachment.filter((a: any) => a.typeAttachment === 'DOCUMENT');
                          return (
                            <>
                              {/* Конструкции */}
                              {constructions.length > 0 && (
                                <Box>
                                  <Group gap="12px" align="center" style={{ marginBottom: '12px' }}>
                                    <Box
                                      style={{
                                        width: '28px',
                                        height: '28px',
                                        background: 'linear-gradient(135deg, var(--color-orange-500), var(--color-orange-600))',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '16px'
                                      }}
                                    >
                                      🏗️
                                    </Box>
                                    <Text size="lg" fw={700} style={{ color: 'var(--theme-text-primary)' }}>
                                      Конструкции ({constructions.length})
                                    </Text>
                                  </Group>
                                  <Group gap="12px" wrap="wrap">
                                    {constructions.slice(0, 4).map((att: any) => (
                                      <AttachmentCard
                                        key={att.id}
                                        att={att as any}
                                        apiBase={API}
                                        onOpenFilePreview={openFilePreview}
                                      />
                                    ))}
                                    {constructions.length > 4 && (
                                      <Text size="sm" style={{ color: 'var(--theme-text-secondary)', padding: '8px' }}>
                                        +{constructions.length - 4} еще
                                      </Text>
                                    )}
                                  </Group>
                                </Box>
                              )}
                              {/* Документы */}
                              {documents.length > 0 && (
                                <Box>
                                  <Group gap="12px" align="center" style={{ marginBottom: '12px' }}>
                                    <Box
                                      style={{
                                        width: '28px',
                                        height: '28px',
                                        background: 'linear-gradient(135deg, var(--color-blue-500), var(--color-blue-600))',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '16px'
                                      }}
                                    >
                                      📄
                                    </Box>
                                    <Text size="lg" fw={700} style={{ color: 'var(--theme-text-primary)' }}>
                                      Документы ({documents.length})
                                    </Text>
                                  </Group>
                                  <Group gap="12px" wrap="wrap">
                                    {documents.slice(0, 4).map((att: any, index: number) => {
                                      const sourcePath = String(att.source || '');
                                      const normalizedPath = sourcePath
                                        .replace(/\\/g, '/')
                                        .replace(/\/+/g, '/')
                                        .replace(/^\/+/, '');
                                      const fileUrl = `${API}/${normalizedPath}`;
                                      return (
                                        <Box
                                          key={index}
                                          style={{
                                            width: '120px',
                                            height: '90px',
                                            borderRadius: '12px',
                                            overflow: 'hidden',
                                            border: '2px solid var(--theme-border-secondary)',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            position: 'relative'
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'scale(1.05)';
                                            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.15)';
                                            e.currentTarget.style.borderColor = 'var(--color-primary-300)';
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'scale(1)';
                                            e.currentTarget.style.boxShadow = 'none';
                                            e.currentTarget.style.borderColor = 'var(--theme-border-secondary)';
                                          }}
                                          onClick={() => {
                                            const fileUrls = documents.map((a: any) => {
                                              const sourcePath = String(a.source || '');
                                              const normalizedPath = sourcePath
                                                .replace(/\\/g, '/')
                                                .replace(/\/+/g, '/')
                                                .replace(/^\/+/, '');
                                              return `${API}/${normalizedPath}`;
                                            });
                                            openFilePreview(fileUrls, index);
                                          }}
                                        >
                                          <img
                                            src={fileUrl}
                                            alt={`Документ ${index + 1}`}
                                            style={{
                                              width: '100%',
                                              height: '100%',
                                              objectFit: 'cover'
                                            }}
                                            onError={(e) => {
                                              console.error('Ошибка загрузки изображения в документах:', fileUrl);
                                              e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjkwIiB2aWV3Qm94PSIwIDAgMTIwIDkwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iOTAiIGZpbGw9IiNmNWY1ZjUiLz48dGV4dCB4PSI2MCIgeT0iNTAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OTk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+0JjQt9C+0LHRgNCw0LbQsCDRgdC+0LfQtNCwPC90ZXh0Pjwvc3ZnPg==';
                                            }}
                                          />
                                          <Box
                                            style={{
                                              position: 'absolute',
                                              top: '4px',
                                              right: '4px',
                                              background: 'rgba(0, 0, 0, 0.7)',
                                              borderRadius: '6px',
                                              padding: '2px 6px'
                                            }}
                                          >
                                            <Text size="xs" style={{ color: 'white', fontWeight: '600' }}>
                                              {index + 1}
                                            </Text>
                                          </Box>
                                        </Box>
                                      );
                                    })}
                                    {documents.length > 4 && (
                                      <Text size="sm" style={{ color: 'var(--theme-text-secondary)', padding: '8px' }}>
                                        +{documents.length - 4} еще
                                      </Text>
                                    )}
                                  </Group>
                                </Box>
                              )}
                        </>
                      );
                    })()}
                    </Stack>
                  </Group>

                  {/* Футер карточки */}
                  <Box 
                    style={{ 
                      borderTop: '1px solid var(--theme-border-secondary)',
                      paddingTop: '16px',
                      marginTop: '16px'
                    }}
                  >
                    <Group justify="space-between" align="center">
                      <Group gap="8px" align="center">
                        <Avatar
                          size="sm"
                          radius="xl"
                          style={{
                            background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                            color: 'white',
                            fontWeight: '600'
                          }}
                        >
                          {rk.userAdd?.name?.charAt(0).toUpperCase() || 'U'}
                        </Avatar>
                        <Text size="xs" style={{ color: 'var(--theme-text-secondary)' }}>
                          {rk.userAdd?.name || 'Неизвестный пользователь'}
                        </Text>
                      </Group>
                      <Group gap="12px">
                        <Text 
                          size="xs" 
                          style={{ 
                            color: getDaysInfo(rk).label.includes('Просрочено') 
                              ? 'var(--color-red-600)' 
                              : 'var(--theme-text-secondary)',
                            fontWeight: '500'
                          }}
                        >
                          {getDaysInfo(rk).label}
                        </Text>
                        <Text size="xs" style={{ color: 'var(--theme-text-secondary)' }}>
                          {dayjs(rk.agreedTo).format('DD.MM.YYYY')}
                        </Text>
                      </Group>
                    </Group>
                  </Box>
                </Box>
              </Box>
            ))}
            <Box>
              <PaginationControls />
            </Box>
          </>
        ) : (
          <Box>
            <EmptyState />
          </Box>
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
        size="90vw"
        centered
      >
        {imagePreviewSrc ? (
          <Image src={imagePreviewSrc} radius="sm" h={window.innerHeight ? Math.floor(window.innerHeight * 0.75) : 700} fit="contain" alt="attachment" />
        ) : (
          <Text size="sm" c="dimmed">Нет изображения</Text>
        )}
      </Modal>
      <RKCalendarModal opened={calendarOpened} onClose={calendarHandlers.close} rkList={rkData} />
      <FilePreviewModal
        opened={filePreviewOpened}
        onClose={filePreviewHandlers.close}
        attachments={filePreviewData?.files.map((file, index) => ({
          id: `file-${index}`,
          source: file,
          type: 'image',
          sizeXY: '',
          clarification: '',
          createdAt: new Date(),
          recordId: '',
          userAdd: '',
          user: { id: '', name: '' }
        })) || []}
        initialIndex={filePreviewData?.currentIndex || 0}
      />
    </Box>
  </DndProviderWrapper>
);
}
export default RKList;