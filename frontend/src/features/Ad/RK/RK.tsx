import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { notificationSystem } from '../../../utils/Push';
import { Button, Title, Box, LoadingOverlay, Group, ActionIcon, Text, Stack, Paper, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { IconPencil, IconTrash, IconUpload, IconFile } from '@tabler/icons-react';
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
  name?: string;
}

interface RKData {
  id: string;
  userAddId: string;
  userUpdatedId: string;
  branchId: string;
  agreedTo: Date;
  sizeXY: string;
  clarification: string;
  typeStructureId: string;
  approvalStatusId: string;
  createdAt: Date;
  updatedAt?: Date;
  attachments: RKAttachment[];
  userAdd?: User;
  userUpdated?: User;
  branch?: {
    uuid: string;
    name: string;
  };
  typeStructure?: {
    id: string;
    name: string;
  };
  approvalStatus?: {
    id: string;
    name: string;
  };
}

interface RKFormValues {
  userAddId: string;
  userUpdatedId?: string;
  branchId: string;
  agreedTo: string;
  sizeXY: string;
  clarification: string;
  typeStructureId: string;
  approvalStatusId: string;
  attachments: Array<{ 
    id?: string; 
    source: File | string; 
    name?: string;
    sizeXY?: string;
    clarification?: string;
  }>;
  removedAttachments?: string[];
}

interface SelectOption {
  value: string;
  label: string;
}

const DEFAULT_PAGE_SIZE = 10;

const DEFAULT_RK_FORM: RKFormValues = {
  userAddId: '',
  branchId: '',
  agreedTo: dayjs().format('YYYY-MM-DDTHH:mm'),
  sizeXY: '',
  clarification: '',
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
  const [branchOptions, setBranchOptions] = useState<SelectOption[]>([]);
  const [approvalOptions, setApprovalOptions] = useState<SelectOption[]>([]);
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
      const [rkList, branches, types] = await Promise.all([
        fetchData(`${API}/add/rk`),
        fetchData(`${API}/branch`),
        fetchData(`${API}/type/sub?model_uuid=YOUR_MODEL_UUID`)
      ]);

      setRkData(rkList);
      
      setBranchOptions(branches.map((b: any) => ({
        value: b.uuid,
        label: b.name
      })));

      const typeStructureOptions = types
        .filter((t: any) => t.chapter === 'Тип')
        .map((t: any) => ({ value: t.id, label: t.name }));

      const approvalOptions = types
        .filter((t: any) => t.chapter === 'Статус')
        .map((t: any) => ({ value: t.id, label: t.name }));

      setTypeOptions(typeStructureOptions);
      setApprovalOptions(approvalOptions);
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

  const handleTableAction = useCallback((action: 'view' | 'edit' | 'delete', rk: RKData) => {
    setSelectedRK(rk);
    
    if (action === 'edit') {
      setRkForm({
        userAddId: rk.userAddId,
        userUpdatedId: rk.userUpdatedId,
        branchId: rk.branchId,
        agreedTo: dayjs(rk.agreedTo).format('YYYY-MM-DDTHH:mm'),
        sizeXY: rk.sizeXY,
        clarification: rk.clarification,
        typeStructureId: rk.typeStructureId,
        approvalStatusId: rk.approvalStatusId,
        attachments: rk.attachments.map(a => ({ 
          id: a.id, 
          source: a.source,
          name: a.name || a.source.split('/').pop() || 'Файл',
          sizeXY: a.sizeXY,
          clarification: a.clarification
        })),
        removedAttachments: []
      });
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
      
      // Добавляем основные поля
      formData.append('userAddId', user.id);
      if (mode === 'edit') formData.append('userUpdatedId', user.id);
      formData.append('branchId', values.branchId);
      formData.append('agreedTo', values.agreedTo);
      formData.append('sizeXY', values.sizeXY);
      formData.append('clarification', values.clarification);
      formData.append('typeStructureId', values.typeStructureId);
      formData.append('approvalStatusId', values.approvalStatusId);

      // Добавляем файлы и их метаданные
      values.attachments.forEach((file, index) => {
        if (file.source instanceof File) {
          formData.append(`files`, file.source);
          formData.append(`attachments[${index}][sizeXY]`, file.sizeXY || values.sizeXY);
          formData.append(`attachments[${index}][clarification]`, file.clarification || values.clarification);
        }
      });

      // Для редактирования - добавляем удаляемые вложения
      if (mode === 'edit' && values.removedAttachments?.length) {
        formData.append('removedAttachments', JSON.stringify(values.removedAttachments));
      }

      const url = mode === 'create' ? `${API}/add/rk` : `${API}/add/rk/${selectedRK!.id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';
      
      const response = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
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

  const formConfig = useMemo(() => ({
    fields: [
      { 
        name: 'branchId', 
        label: 'Филиал', 
        type: 'select' as const, 
        options: branchOptions,
        required: true 
      },
      { 
        name: 'agreedTo', 
        label: 'Дата согласования', 
        type: 'datetime' as const, 
        required: true 
      },
      { 
        name: 'sizeXY', 
        label: 'Размер (X x Y)', 
        type: 'text' as const, 
        required: true,
        placeholder: 'Например: 100x200' 
      },
      { 
        name: 'clarification', 
        label: 'Пояснение', 
        type: 'textarea' as const, 
        required: true 
      },
      {
        name: 'typeStructureId',
        label: 'Тип конструкции',
        type: 'select' as const,
        options: typeOptions,
        required: true
      },
      {
        name: 'approvalStatusId',
        label: 'Статус утверждения',
        type: 'select' as const,
        options: approvalOptions,
        required: true
      },
      {
        name: 'attachments',
        label: 'Прикрепленные файлы',
        type: 'file' as const,
        multiple: true,
        withDnd: true,
        accept: 'image/*,.pdf,.doc,.docx,.xls,.xlsx',
        leftSection: <IconUpload size={18} />,
        onRemove: (index: number, values: any, setFieldValue: any) => {
          const attachment = values.attachments[index];
          const newAttachments = [...values.attachments];
          newAttachments.splice(index, 1);
          
          if (attachment.id) {
            const newRemoved = [...(values.removedAttachments || []), attachment.id];
            setFieldValue('removedAttachments', newRemoved);
          }
          
          setFieldValue('attachments', newAttachments);
        },
        preview: (file: { source: string | File; name?: string }) => {
          const fileName = file.name || 
            (typeof file.source === 'string' 
              ? file.source.split('/').pop() 
              : file.source.name) || 'Файл';
              
          return (
            <Group gap="sm" p="xs">
              <IconFile size={16} />
              <Text size="sm" lineClamp={1}>
                {fileName}
              </Text>
            </Group>
          );
        }
      },
    ],
    initialValues: DEFAULT_RK_FORM,
  }), [branchOptions, typeOptions, approvalOptions]);

  const filteredData = useMemo(() => {
    const startIdx = (currentPage - 1) * DEFAULT_PAGE_SIZE;
    return rkData.slice(startIdx, startIdx + DEFAULT_PAGE_SIZE);
  }, [rkData, currentPage]);

  const PaginationControls = useCallback(() => (
    <Group justify="center" mt="md">
      <Button 
        variant="outline" 
        disabled={currentPage === 1}
        onClick={() => setCurrentPage(p => p - 1)}
      >
        Назад
      </Button>
      <Text>{currentPage} из {Math.ceil(rkData.length / DEFAULT_PAGE_SIZE)}</Text>
      <Button
        variant="outline"
        disabled={currentPage * DEFAULT_PAGE_SIZE >= rkData.length}
        onClick={() => setCurrentPage(p => p + 1)}
      >
        Вперед
      </Button>
    </Group>
  ), [currentPage, rkData.length]);

  const EmptyState = useCallback(() => (
    <Paper withBorder p="xl" radius="md" shadow="xs" style={{ textAlign: 'center' }}>
      <Text c="dimmed" mb="md">Нет данных для отображения</Text>
      <Button onClick={() => modals.create[1].open()}>
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
          <Button
            size="md"
            onClick={() => {
              setRkForm({
                ...DEFAULT_RK_FORM,
                userAddId: user?.id || '',
                userUpdatedId: user?.id || ''
              });
              modals.create[1].open();
            }}
            loading={fileUploading}
          >
            Добавить конструкцию
          </Button>
        </Group>

        <Stack gap="md">
          {rkData.length > 0 ? (
            <>
              {filteredData.map((rk) => (
                <Paper key={rk.id} withBorder p="md" radius="md" shadow="xs">
                  <Group justify="space-between" align="flex-start">
                    <Box>
                      <Text fw={500} mb="xs">
                        {rk.typeStructure?.name || 'Конструкция'} | {rk.approvalStatus?.name || 'Статус неизвестен'}
                      </Text>
                      <Text size="sm"><strong>Филиал:</strong> {rk.branch?.name || 'Не указан'}</Text>
                      <Text size="sm"><strong>Дата:</strong> {dayjs(rk.agreedTo).format('DD.MM.YYYY HH:mm')}</Text>
                      <Text size="sm"><strong>Размер:</strong> {rk.sizeXY}</Text>
                      <Text size="sm"><strong>Пояснение:</strong> {rk.clarification}</Text>
                      {rk.attachments.length > 0 && (
                        <Group gap="xs" mt="xs">
                          <Text size="sm"><strong>Файлы:</strong></Text>
                          {rk.attachments.map(att => (
                            <Text key={att.id} size="sm">
                              {att.name || att.source.split('/').pop() || 'Файл'} ({att.sizeXY})
                            </Text>
                          ))}
                        </Group>
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
          loading={fileUploading}
        />

        <DynamicFormModal
          opened={modals.edit[0]}
          onClose={() => modals.edit[1].close()}
          title="Редактировать конструкцию"
          mode="edit"
          fields={formConfig.fields}
          initialValues={rkForm}
          onSubmit={(values) => handleFormSubmit(values as RKFormValues, 'edit')}
          loading={fileUploading}
        />

        <DynamicFormModal
          opened={modals.delete[0]}
          onClose={() => modals.delete[1].close()}
          title="Подтверждение удаления"
          mode="delete"
          initialValues={selectedRK || {}}
          onConfirm={handleDeleteConfirm}
          confirmText="Вы уверены, что хотите удалить эту конструкцию?"
          confirmLabel="Удалить"
          cancelLabel="Отмена"
        />
      </Box>
    </DndProviderWrapper>
  );
};

export default RKList;