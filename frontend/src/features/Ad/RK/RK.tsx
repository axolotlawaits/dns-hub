import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { notificationSystem } from '../../../utils/Push';
import { Button, Title, Box, LoadingOverlay, Group, ActionIcon, Text, Stack, Paper, TextInput, Modal, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { IconPencil, IconTrash, IconUpload, IconFile, IconX, IconFilter } from '@tabler/icons-react';
import { DynamicFormModal } from '../../../utils/formModal';
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
  branch?: { uuid: string; rrs: string; name: string };
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
    sizeXY: string;
    clarification: string;
  }>;
  removedAttachments?: string[];
}

interface SelectOption {
  value: string;
  label: string;
  color?: string;
  rrs?: string;
}

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_RK_FORM: RKFormValues = {
  userAddId: '',
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
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [selectedRK, setSelectedRK] = useState<RKData | null>(null);
  const [rkForm, setRkForm] = useState<RKFormValues>(DEFAULT_RK_FORM);
  const [typeOptions, setTypeOptions] = useState<SelectOption[]>([]);
  const [approvalOptions, setApprovalOptions] = useState<SelectOption[]>([]);
  const [branchOptions, setBranchOptions] = useState<SelectOption[]>([]);
  const [filteredBranchOptions, setFilteredBranchOptions] = useState<SelectOption[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [fileUploading, setFileUploading] = useState(false);
  const [selectedRrs, setSelectedRrs] = useState<string | null>(null);

  const modals = {
    view: useDisclosure(false),
    edit: useDisclosure(false),
    create: useDisclosure(false),
    delete: useDisclosure(false),
  };

  useEffect(() => {
    if (selectedRrs) {
      setFilteredBranchOptions(
        branchOptions.filter(branch => branch.rrs === selectedRrs)
      );
    } else {
      setFilteredBranchOptions([]);
    }
  }, [selectedRrs, branchOptions]);

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
      setLoadingOptions(true);
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
      const formattedBranches = branches.map((b: any) => ({
        value: b.uuid,
        label: b.name,
        rrs: b.rrs || ''
      }));
      setBranchOptions(formattedBranches);
      setFilteredBranchOptions([]);
    } catch (error) {
      console.error('Failed to load initial data:', error);
      showNotification('error', 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
      setLoadingOptions(false);
    }
  }, [fetchData, showNotification]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleTableAction = useCallback((action: 'view' | 'edit' | 'delete', rk: RKData) => {
    setSelectedRK(rk);
    if (action === 'edit') {
      setRkForm({
        userAddId: rk.userAddId,
        userUpdatedId: rk.userUpdatedId,
        rrs: rk.branch?.rrs || '',
        branchId: rk.branchId,
        agreedTo: dayjs(rk.agreedTo).format('YYYY-MM-DDTHH:mm'),
        typeStructureId: rk.typeStructureId,
        approvalStatusId: rk.approvalStatusId,
        attachments: rk.attachments.map(a => ({
          id: a.id,
          source: a.source,
          sizeXY: a.sizeXY,
          clarification: a.clarification
        })),
        removedAttachments: []
      });
      setSelectedRrs(rk.branch?.rrs || '');
    }
    modals[action][1].open();
  }, [modals]);

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
      const attachmentsMeta = values.attachments
        .filter(att => att.source instanceof File)
        .map(att => ({
          sizeXY: att.sizeXY,
          clarification: att.clarification
        }));
      formData.append('attachmentsMeta', JSON.stringify(attachmentsMeta));
      values.attachments.forEach(attachment => {
        if (attachment.source instanceof File) {
          formData.append('files', attachment.source);
        }
      });
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
      setSelectedRrs(null);
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

  const rrsOptions = useMemo(() => {
    const uniqueRrs = new Set<string>();
    branchOptions.forEach(branch => {
      if (branch.rrs) {
        uniqueRrs.add(branch.rrs);
      }
    });
    return Array.from(uniqueRrs).map(rrs => ({
      value: rrs,
      label: rrs
    }));
  }, [branchOptions]);

  const formConfig = useMemo(() => ({
    fields: [
      {
        name: 'rrs',
        label: 'РРС',
        type: 'select',
        options: rrsOptions,
        required: true,
        loading: loadingOptions,
        onChange: (value: string) => {
          setSelectedRrs(value);
          setRkForm(prev => ({ ...prev, branchId: '', rrs: value }));
        },
        value: rkForm.rrs
      },
      {
        name: 'branchId',
        label: 'Филиал',
        type: 'select',
        options: filteredBranchOptions,
        required: true,
        loading: loadingOptions || (selectedRrs && filteredBranchOptions.length === 0),
        hidden: !selectedRrs,
        value: rkForm.branchId
      },
      {
        name: 'agreedTo',
        label: 'Дата согласования',
        type: 'datetime',
        required: true,
        value: rkForm.agreedTo
      },
      {
        name: 'typeStructureId',
        label: 'Тип конструкции',
        type: 'select',
        options: typeOptions,
        required: true,
        loading: loadingOptions,
        value: rkForm.typeStructureId
      },
      {
        name: 'approvalStatusId',
        label: 'Статус утверждения',
        type: 'select',
        options: approvalOptions,
        required: true,
        loading: loadingOptions,
        value: rkForm.approvalStatusId
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
        onAdd: (files: File[], values: any, setFieldValue: any) => {
          const newAttachments = files.map(file => ({
            source: file,
            sizeXY: '',
            clarification: '',
            isNew: true
          }));
          setFieldValue('attachments', [...values.attachments, ...newAttachments]);
        },
        renderFileList: (values: any, setFieldValue: any) => (
          <Stack mt="md" gap="sm">
            {values.attachments.map((file: any, index: number) => (
              <Paper key={file.id || index} p="sm" withBorder>
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Group gap="xs" align="center" style={{ flex: 1, minWidth: 0 }}>
                    <IconFile size={16} />
                    <Text size="sm" truncate>
                      {typeof file.source === 'string'
                        ? file.source.split('/').pop()
                        : file.source.name || 'Файл'}
                    </Text>
                  </Group>
                  <Group gap="sm" align="flex-end" wrap="nowrap">
                    <TextInput
                      label="Размер"
                      placeholder="100x200"
                      value={file.sizeXY || ''}
                      onChange={(e) => {
                        const newAttachments = [...values.attachments];
                        newAttachments[index].sizeXY = e.target.value;
                        setFieldValue('attachments', newAttachments);
                      }}
                      required
                      style={{ width: '120px' }}
                    />
                    <TextInput
                      label="Пояснение"
                      placeholder="Описание файла"
                      value={file.clarification || ''}
                      onChange={(e) => {
                        const newAttachments = [...values.attachments];
                        newAttachments[index].clarification = e.target.value;
                        setFieldValue('attachments', newAttachments);
                      }}
                      required
                      style={{ width: '200px' }}
                    />
                    <ActionIcon
                      color="red"
                      size="sm"
                      onClick={() => {
                        const attachment = values.attachments[index];
                        const newAttachments = [...values.attachments];
                        newAttachments.splice(index, 1);
                        if (attachment.id) {
                          const newRemoved = [...(values.removedAttachments || []), attachment.id];
                          setFieldValue('removedAttachments', newRemoved);
                        }
                        setFieldValue('attachments', newAttachments);
                      }}
                      style={{ marginBottom: '4px' }}
                    >
                      <IconX size={16} />
                    </ActionIcon>
                  </Group>
                </Group>
              </Paper>
            ))}
          </Stack>
        ),
        value: rkForm.attachments
      },
    ],
    initialValues: rkForm,
  }), [rrsOptions, filteredBranchOptions, typeOptions, approvalOptions, loadingOptions, selectedRrs, rkForm]);

  const filteredData = useMemo(() => {
    let result = Array.isArray(rkData) ? rkData : [];
    if (selectedRrs) {
      result = result.filter(rk => 
        rk.branch && rk.branch.rrs === selectedRrs
      );
    }
    const startIdx = (currentPage - 1) * DEFAULT_PAGE_SIZE;
    return result.slice(startIdx, startIdx + DEFAULT_PAGE_SIZE);
  }, [rkData, currentPage, selectedRrs]);

  const PaginationControls = useCallback(() => {
    const totalPages = Math.ceil(
      (selectedRrs 
        ? rkData.filter(rk => rk.branch && rk.branch.rrs === selectedRrs).length 
        : rkData.length) / DEFAULT_PAGE_SIZE
    );
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
          disabled={currentPage * DEFAULT_PAGE_SIZE >= 
            (selectedRrs 
              ? rkData.filter(rk => rk.branch && rk.branch.rrs === selectedRrs).length 
              : rkData.length)}
          onClick={() => setCurrentPage(p => p + 1)}
        >
          Вперед
        </Button>
      </Group>
    );
  }, [currentPage, rkData.length, selectedRrs]);

  const EmptyState = useCallback(() => (
    <Paper withBorder p="xl" radius="md" shadow="xs" style={{ textAlign: 'center' }}>
      <Text c="dimmed" mb="md">Нет данных для отображения</Text>
      <Button onClick={() => {
        setRkForm(DEFAULT_RK_FORM);
        setSelectedRrs(null);
        modals.create[1].open();
      }}>
        Создать первую запись
      </Button>
    </Paper>
  ), [modals.create]);

  if (loading) {
    return (
      <Box style={{ height: '200px', position: 'relative' }}>
        <LoadingOverlay visible loaderProps={{ size: 'lg' }} />
      </Box>
    );
  }

  return (
    <DndProviderWrapper>
      <Box p="md">
        <Group justify="space-between" mb="md">
          <Title order={2}>Реестр конструкций</Title>
          <Group>
            <Select
              placeholder="Фильтр по РРС"
              data={rrsOptions}
              value={selectedRrs}
              onChange={(value) => {
                setSelectedRrs(value);
                setCurrentPage(1);
              }}
              clearable
              style={{ width: 200 }}
            />
            <Button
              size="md"
              onClick={() => {
                setRkForm(DEFAULT_RK_FORM);
                setSelectedRrs(null);
                modals.create[1].open();
              }}
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
                  <Group justify="space-between" align="flex-start">
                    <Box>
                      <Text fw={500} mb="xs">
                        {rk.typeStructure?.name || 'Конструкция'} | {rk.approvalStatus?.name || 'Статус неизвестен'}
                      </Text>
                      <Text size="sm"><strong>РРС:</strong> {rk.branch?.rrs || 'Не указан'}</Text>
                      <Text size="sm"><strong>Филиал:</strong> {rk.branch?.name || 'Не указан'}</Text>
                      <Text size="sm"><strong>Дата:</strong> {dayjs(rk.agreedTo).format('DD.MM.YYYY HH:mm')}</Text>
                      {Array.isArray(rk.attachments) && rk.attachments.length > 0 && (
                        <Box mt="sm">
                          <Text size="sm" fw={500} mb="xs">Прикрепленные файлы:</Text>
                          <Stack gap="xs">
                            {rk.attachments.map(att => (
                              <Group key={att.id} gap="xs">
                                <IconFile size={16} />
                                <Text size="sm">
                                  {att.source.split('/').pop() || 'Файл'}
                                </Text>
                                <Text size="sm" c="dimmed">
                                  (Размер: {att.sizeXY || 'не указан'})
                                </Text>
                                <Text size="sm" c="dimmed">
                                  {att.clarification || 'Без пояснения'}
                                </Text>
                              </Group>
                            ))}
                          </Stack>
                        </Box>
                      )}
                      <Text size="xs" c="dimmed" mt="xs">
                        Добавлено: {dayjs(rk.createdAt).format('DD.MM.YYYY HH:mm')} |
                        {rk.userAdd?.name || 'Неизвестный пользователь'}
                      </Text>
                    </Box>
                    <Group>
                      <ActionIcon
                        color="blue"
                        onClick={() => handleTableAction('edit', rk)}
                        disabled={fileUploading}
                      >
                        <IconPencil size={18} />
                      </ActionIcon>
                      <ActionIcon
                        color="red"
                        onClick={() => handleTableAction('delete', rk)}
                        disabled={fileUploading}
                      >
                        <IconTrash size={18} />
                      </ActionIcon>
                    </Group>
                  </Group>
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
          onClose={() => modals.create[1].close()}
          title="Добавить конструкцию"
          mode="create"
          fields={formConfig.fields}
          initialValues={rkForm}
          onSubmit={(values) => handleFormSubmit(values as RKFormValues, 'create')}
        />
        <DynamicFormModal
          opened={modals.edit[0]}
          onClose={() => modals.edit[1].close()}
          title="Редактировать конструкцию"
          mode="edit"
          fields={formConfig.fields}
          initialValues={rkForm}
          onSubmit={(values) => handleFormSubmit(values as RKFormValues, 'edit')}
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