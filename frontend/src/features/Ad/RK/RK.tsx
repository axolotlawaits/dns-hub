import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { notificationSystem } from '../../../utils/Push';
import { Button, Title, Box, LoadingOverlay, Group, ActionIcon, Text, Stack, Paper, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { IconPencil, IconTrash, IconUpload, IconFile } from '@tabler/icons-react';
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
}

interface Branch {
  uuid: string;
  name: string;
  code: string;
  city: string;
  rrs: string | null;
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
  attachments: RKAttachment[];
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
  typeStructureId: string;
  approvalStatusId: string;
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
  typeStructureId: '',
  approvalStatusId: '',
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

  const formConfig: FormConfig = useMemo(() => ({
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
        name: 'agreedTo',
        label: 'Дата согласования',
        type: 'datetime',
        required: true,
      },
      {
        name: 'typeStructureId',
        label: 'Тип конструкции',
        type: 'select',
        options: typeOptions,
        required: true,
      },
      {
        name: 'approvalStatusId',
        label: 'Статус утверждения',
        type: 'select',
        options: approvalOptions,
        required: true,
      },
      {
        name: 'attachments',
        label: 'Прикрепленные файлы',
        type: 'file',
        multiple: true,
        withDnd: true,
        accept: 'image/*,.pdf,.doc,.docx,.xls,.xlsx',
        leftSection: <IconUpload size={18} />,
        fileFields: [
          {
            name: 'sizeXY',
            label: 'Размер',
            type: 'text',
            required: true,
            placeholder: '100x200'
          },
          {
            name: 'clarification',
            label: 'Пояснение',
            type: 'text',
            required: true,
            placeholder: 'Описание файла'
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
      typeStructureId: rk.typeStructureId,
      approvalStatusId: rk.approvalStatusId,
      attachments: ((rk as any).attachments || (rk as any).rkAttachment || []).map((a: any) => ({
        id: a.id,
        source: a.source,
        sizeXY: a.sizeXY,
        clarification: a.clarification,
        meta: {
          sizeXY: a.sizeXY,
          clarification: a.clarification,
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
      formData.append('typeStructureId', values.typeStructureId);
      formData.append('approvalStatusId', values.approvalStatusId);

      // Prepare metadata for newly added files (source is File)
      const attachmentsMeta = values.attachments
        .filter(att => att.source instanceof File)
        .map(att => ({
          sizeXY: att.meta?.sizeXY ?? att.sizeXY ?? '',
          clarification: att.meta?.clarification ?? att.clarification ?? '',
        }));

      // For create vs edit, backend expects different field names
      if (mode === 'create') {
        formData.append('attachmentsMeta', JSON.stringify(attachmentsMeta));
      } else {
        formData.append('newAttachmentsMeta', JSON.stringify(attachmentsMeta));
        formData.append('userUpdatedId', user.id);
      }

      values.attachments.forEach(attachment => {
        if (attachment.source instanceof File) {
          formData.append('files', attachment.source);
        }
      });

      // Note: updating metadata of existing attachments is not supported by backend yet

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

  

  const filteredData = useMemo(() => {
    const startIdx = (currentPage - 1) * DEFAULT_PAGE_SIZE;
    return rkData.slice(startIdx, startIdx + DEFAULT_PAGE_SIZE);
  }, [rkData, currentPage]);

  const PaginationControls = useCallback(() => {
    const totalPages = Math.ceil(rkData.length / DEFAULT_PAGE_SIZE);
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
          disabled={currentPage * DEFAULT_PAGE_SIZE >= rkData.length}
          onClick={() => setCurrentPage(p => p + 1)}
        >
          Вперед
        </Button>
      </Group>
    );
  }, [currentPage, rkData.length]);

  const EmptyState = useCallback(() => (
    <Paper withBorder p="xl" radius="md" shadow="xs" style={{ textAlign: 'center' }}>
      <Text c="dimmed" mb="md">Нет данных для отображения</Text>
      <Button onClick={openCreateModal}>
        Создать первую запись
      </Button>
    </Paper>
  ), [openCreateModal]);

  if (loading) {
    return (
      <Box style={{ height: '200px', position: 'relative' }}>
        <LoadingOverlay visible loaderProps={{ size: 'lg' }} />
      </Box>
    );
  }

  // Helper: compute days between agreedTo and an optional end date
  const getDaysInfo = (rk: RKData) => {
    const start = dayjs(rk.agreedTo).startOf('day');
    const possibleEnd =
      (rk as any).endAt ||
      (rk as any).endDate ||
      (rk as any).expiresAt ||
      (rk as any).finishAt ||
      (rk as any).finishDate ||
      (rk as any).deadline ||
      (rk as any).dueDate ||
      null;

    if (possibleEnd) {
      const end = dayjs(possibleEnd).startOf('day');
      const totalDays = end.diff(start, 'day');
      return { label: `Срок: ${Math.max(totalDays, 0)} дн.` };
    }

    const passedDays = dayjs().startOf('day').diff(start, 'day');
    return { label: `Прошло: ${Math.max(passedDays, 0)} дн.` };
  };

  return (
    <DndProviderWrapper>
      <Box p="md">
        <Group justify="space-between" mb="md">
          <Title order={2}>Реестр конструкций</Title>
          <Button
            size="md"
            onClick={openCreateModal}
            loading={fileUploading}
          >
            Добавить конструкцию
          </Button>
        </Group>
        <Stack gap="md">
          {Array.isArray(rkData) && rkData.length > 0 ? (
            <>
              {filteredData.map((rk) => (
                <Paper key={rk.id} withBorder p="md" radius="md" shadow="xs">
                  <Stack gap="xs">
                    <Group justify="space-between" align="flex-start">
                      <Box style={{ flex: 1 }}>
                        <Text fw={600} mb="xs">
                          {rk.branch?.rrs || 'РРС не указан'}, {rk.branch?.name || 'Филиал не указан'}{rk.branch?.code ? ` (${rk.branch.code})` : ''}{rk.branch?.city ? ` - ${rk.branch.city}` : ''}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {rk.typeStructure?.name || 'Тип неизвестен'} | {rk.approvalStatus?.name || 'Статус неизвестен'}
                        </Text>
                      </Box>
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
                    </Group>

                    {Array.isArray((rk as any).attachments || (rk as any).rkAttachment) && ((rk as any).attachments || (rk as any).rkAttachment).length > 0 && (
                      <Box>
                        <Text size="sm" fw={500} mb="xs">Прикрепленные файлы:</Text>
                        <Stack gap="xs">
                          {(((rk as any).attachments || (rk as any).rkAttachment) as any[]).map((att: any) => (
                            <Group key={att.id} gap="xs">
                              <IconFile size={16} />
                              <Text size="sm">
                                {(att.source || '').split('/').pop() || 'Файл'}
                              </Text>
                              {att.sizeXY && (
                                <Text size="sm" c="dimmed">
                                  (Размер: {att.sizeXY})
                                </Text>
                              )}
                              {att.clarification && (
                                <Text size="sm" c="dimmed">
                                  {att.clarification}
                                </Text>
                              )}
                            </Group>
                          ))}
                        </Stack>
                      </Box>
                    )}

                    <Group justify="space-between" mt="xs">
                      <Text size="xs" c="dimmed">
                        Автор: {rk.userAdd?.name || 'Неизвестный пользователь'}
                      </Text>
                      <Group gap="md">
                        <Text size="xs" c="dimmed">{getDaysInfo(rk).label}</Text>
                        <Text size="xs" c="dimmed">{dayjs(rk.agreedTo).format('DD.MM.YYYY HH:mm')}</Text>
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
          fields={formConfig.fields}
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
          fields={formConfig.fields}
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
      </Box>
    </DndProviderWrapper>
  );
};

export default RKList;
