import { Modal, TextInput, Select, Button, Alert, Stack, Textarea, Text, Group } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { API } from '../config/constants';
import { FileDropZone, ListItemWithActions, DraggableItem } from './dnd'; // Import DraggableItem and other necessary components

export type FieldType = 'text' | 'number' | 'select' | 'date' | 'datetime' | 'textarea' | 'file';

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  step?: string;
  min?: number;
  max?: number;
  withDnd?: boolean; // Флаг для включения DND функциональности
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

interface FileAttachment {
  id?: string;
  userAdd: string;
  source: File | string;
}

interface FileUploadProps {
  onFilesDrop: (files: File[]) => void;
  attachments: FileAttachment[];
  onRemoveAttachment: (id: string | undefined) => void;
  withDnd?: boolean;
}

const FileUploadComponent = ({
  onFilesDrop,
  attachments,
  onRemoveAttachment,
  withDnd = false
}: FileUploadProps) => {
  const DndFileUpload = useCallback(() => {
    return (
      <>
        <FileDropZone onFilesDrop={onFilesDrop} />
        <Stack mt="md">
          {attachments.map((attachment) => (
            <ListItemWithActions
              key={attachment.id || `temp-${Math.random().toString(36).substr(2, 9)}`}
              item={{
                id: attachment.id || `temp-${Math.random().toString(36).substr(2, 9)}`,
                name: typeof attachment.source === 'string'
                  ? attachment.source
                  : attachment.source.name
              }}
              onDelete={() => onRemoveAttachment(attachment.id)}
              renderContent={(item: DraggableItem) => <Text>{item.name}</Text>}
            />
          ))}
        </Stack>
      </>
    );
  }, [onFilesDrop, attachments, onRemoveAttachment]);

  if (withDnd) {
    try {
      return <DndFileUpload />;
    } catch (e) {
      console.warn("DnD components are not available, falling back to basic UI.");
    }
  }

  return (
    <>
      <input
        type="file"
        multiple
        onChange={(e) => {
          if (e.target.files) {
            onFilesDrop(Array.from(e.target.files));
          }
        }}
      />
      <Stack mt="md">
        {attachments.map((attachment) => (
          <Group key={attachment.id || `temp-${Math.random().toString(36).substr(2, 9)}`} mb="md">
            <Text>{typeof attachment.source === 'string' ? attachment.source : attachment.source.name}</Text>
            <Button variant="light" color="red" onClick={() => onRemoveAttachment(attachment.id)}>
              Remove
            </Button>
          </Group>
        ))}
      </Stack>
    </>
  );
};

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

  const [attachments, setAttachments] = useState<FileAttachment[]>(initialValues.attachments || []);

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
  }, [initialValues.userAdd, form, attachments]);

  const handleRemoveAttachment = useCallback((id: string | undefined) => {
    setAttachments((prev) => {
      const newAttachments = prev.filter((a) =>
        a.id ? a.id.toString() !== id?.toString() : true
      );
      form.setFieldValue('attachments', newAttachments);
      return newAttachments;
    });
  }, [form]);

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
      case 'number':
        return (
          <TextInput
            key={field.name}
            type="number"
            label={field.label}
            required={field.required}
            {...form.getInputProps(field.name)}
            mb="md"
            step={field.step || "any"}
            min={field.min}
            max={field.max}
          />
        );
      case 'file':
        return (
          <FileUploadComponent
            key={field.name}
            onFilesDrop={handleFileDrop}
            attachments={attachments}
            onRemoveAttachment={handleRemoveAttachment}
            withDnd={field.withDnd}
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
            Вы уверены, что хотите удалить запись? {dayjs(initialValues.ReceiptDate).format('DD.MM.YYYY')}?
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