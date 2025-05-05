import { Modal, TextInput, Select, Button, Alert, Stack, Textarea, Text, Group } from '@mantine/core';
import { useForm } from '@mantine/form';
import { FileDropZone, ListItemWithActions } from './dnd';
import { useState, useEffect, useCallback } from 'react';
import React from 'react';
import dayjs from 'dayjs';
import { API } from '../config/constants';

export type FieldType = 'text' | 'number' | 'select' | 'date' | 'datetime' | 'textarea';

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
}

export interface ViewFieldConfig {
  label: string;
  value: (item: any) => string;
}

export interface FormConfig {
  fields: FormField[];
  initialValues: Record<string, any>;
}

interface DynamicFormModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  mode: 'edit' | 'create' | 'view' | 'delete';
  fields?: FormField[];
  viewFieldsConfig?: ViewFieldConfig[];
  initialValues: Record<string, any>;
  onSubmit?: (values: Record<string, any>) => void;
  onConfirm?: () => void;
  error?: string | null;
}

export const DynamicFormModal = ({
  opened,
  onClose,
  title,
  mode,
  fields = [],
  viewFieldsConfig = [],
  initialValues,
  onSubmit,
  onConfirm,
  error,
}: DynamicFormModalProps) => {
  const form = useForm({
    initialValues: initialValues,
  });

  const [attachments, setAttachments] = useState<Array<{
    id?: string;
    userAdd: string;
    source: File | string;
  }>>(initialValues.attachments || []);

  useEffect(() => {
    if (opened) {
      form.setValues(initialValues);
      setAttachments(initialValues.attachments || []);
    }
  }, [opened, initialValues]);

  const handleFileDrop = useCallback((files: File[]) => {
    const newAttachments = files.map((file) => ({
      userAdd: initialValues.userAdd || '',
      source: file,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
    form.setFieldValue('attachments', [...attachments, ...newAttachments]);
  }, [initialValues.userAdd, form]);

  const handleRemoveAttachment = useCallback((id: string | undefined) => {
    setAttachments((prev) => {
      const newAttachments = prev.filter((a) =>
        a.id ? a.id.toString() !== id?.toString() : true
      );
      form.setFieldValue('attachments', newAttachments);
      return newAttachments;
    });
  }, [form]);

  const renderAttachment = (attachment: { id?: string; userAdd: string; source: File | string }) => (
    <ListItemWithActions
      key={attachment.id || `temp-${Math.random().toString(36).substr(2, 9)}`}
      item={{
        id: attachment.id || `temp-${Math.random().toString(36).substr(2, 9)}`,
        name: typeof attachment.source === 'string'
          ? attachment.source
          : attachment.source.name
      }}
      onDelete={() => handleRemoveAttachment(attachment.id)}
      renderContent={(item) => <Text>{item.name}</Text>}
    />
  );

  const renderField = (field: FormField) => {
    switch (field.type) {
      case 'text':
        return (
          <TextInput
            key={field.name}
            label={field.label}
            required={field.required}
            {...form.getInputProps(field.name)}
            mb="md"
          />
        );
      case 'textarea':
        return (
          <Textarea
            key={field.name}
            label={field.label}
            required={field.required}
            {...form.getInputProps(field.name)}
            mb="md"
          />
        );
      case 'select':
        return (
          <Select
            key={field.name}
            label={field.label}
            data={field.options || []}
            required={field.required}
            {...form.getInputProps(field.name)}
            mb="md"
          />
        );
      case 'date':
        return (
          <TextInput
            key={field.name}
            type="date"
            label={field.label}
            required={field.required}
            {...form.getInputProps(field.name)}
            mb="md"
          />
        );
      case 'datetime':
        return (
          <TextInput
            key={field.name}
            type="datetime-local"
            label={field.label}
            required={field.required}
            {...form.getInputProps(field.name)}
            mb="md"
          />
        );
      default:
        return null;
    }
  };

  const renderViewField = (config: ViewFieldConfig, item: any) => (
    <Group key={config.label} mb="md">
      <Text fw={500}>{config.label}:</Text>
      <Text>{config.value(item)}</Text>
    </Group>
  );

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="sm" radius="md">
      {mode === 'view' ? (
        <>
          {viewFieldsConfig.map((config) => renderViewField(config, initialValues))}
          {initialValues.attachments?.length > 0 && (
            <>
              <Text mt="md" mb="sm" fw={500}>Приложения</Text>
              {initialValues.attachments.map((attachment: any) => (
                <img key={attachment.id} src={`${API}/${attachment.source}`} width={50} alt="Attachment" />
              ))}
            </>
          )}
        </>
      ) : mode === 'delete' ? (
        <>
          <Text mb="xl">
            Вы уверены, что хотите удалить корреспонденцию от {dayjs(initialValues.ReceiptDate).format('DD.MM.YYYY')}?
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Отмена
            </Button>
            <Button color="red" onClick={onConfirm}>
              Удалить
            </Button>
          </Group>
        </>
      ) : (
        <form onSubmit={form.onSubmit((values) => onSubmit && onSubmit({ ...values, attachments }))}>
          {fields.map(renderField)}
          <FileDropZone onFilesDrop={handleFileDrop} />
          <Stack mt="md">
            {attachments.map((attachment) => (
              <React.Fragment key={attachment.id || `temp-${Math.random().toString(36).substr(2, 9)}`}>
                {renderAttachment(attachment)}
              </React.Fragment>
            ))}
          </Stack>
          {error && (
            <Alert color="red" mt="md">
              {error}
            </Alert>
          )}
          <Button type="submit" fullWidth mt="xl">
            Submit
          </Button>
        </form>
      )}
    </Modal>
  );
};
