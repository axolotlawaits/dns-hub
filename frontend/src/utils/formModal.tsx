import { Modal, TextInput, Select, Button, Alert, Stack, Textarea, Text, Group, Image, Card } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState, useEffect, useCallback, useMemo, JSX } from 'react';
import dayjs from 'dayjs';
import { API } from '../config/constants';
import { FileDropZone } from './dnd';
import { IconFile, IconFileTypePdf, IconFileTypeDoc, IconFileTypeXls, IconFileTypePpt, IconFileTypeZip, IconPhoto, IconFileTypeJs, IconFileTypeHtml, IconFileTypeCss, IconFileTypeTxt, IconFileTypeCsv } from '@tabler/icons-react';
import { FilePreviewModal } from './FilePreviewModal';

// Types and interfaces
export type FieldType = 'text' | 'number' | 'select' | 'selectSearch' | 'date' | 'datetime' | 'textarea' | 'file' | 'boolean';

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Array<{ value: string; label: string; icon?: JSX.Element }>;
  step?: string;
  min?: number;
  max?: number;
  withDnd?: boolean;
}

export interface ViewFieldConfig {
  label: string;
  value: (item: any) => string | number | null | JSX.Element;
}

export interface FormConfig {
  fields: FormField[];
  initialValues: Record<string, any>;
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

// Helper functions
const getFileIcon = (fileName: string): JSX.Element => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const iconSize = 20;
  const iconMap: Record<string, JSX.Element> = {
    jpg: <IconPhoto size={iconSize} />,
    jpeg: <IconPhoto size={iconSize} />,
    png: <IconPhoto size={iconSize} />,
    gif: <IconPhoto size={iconSize} />,
    pdf: <IconFileTypePdf size={iconSize} />,
    doc: <IconFileTypeDoc size={iconSize} />,
    docx: <IconFileTypeDoc size={iconSize} />,
    xls: <IconFileTypeXls size={iconSize} />,
    xlsx: <IconFileTypeXls size={iconSize} />,
    zip: <IconFileTypeZip size={iconSize} />,
    rar: <IconFileTypeZip size={iconSize} />,
    tar: <IconFileTypeZip size={iconSize} />,
    gz: <IconFileTypeZip size={iconSize} />,
    ppt: <IconFileTypePpt size={iconSize} />,
    pptx: <IconFileTypePpt size={iconSize} />,
    js: <IconFileTypeJs size={iconSize} />,
    html: <IconFileTypeHtml size={iconSize} />,
    css: <IconFileTypeCss size={iconSize} />,
    txt: <IconFileTypeTxt size={iconSize} />,
    csv: <IconFileTypeCsv size={iconSize} />,
  };
  return iconMap[extension as string] || <IconFile size={iconSize} />;
};

const FileUploadComponent = ({ onFilesDrop, attachments, onRemoveAttachment, withDnd = false }: FileUploadProps) => {
  const renderAttachment = (attachment: FileAttachment) => {
    const fileName = typeof attachment.source === 'string'
      ? attachment.source.split('\\').pop() || 'Файл'
      : attachment.source.name;
    const isImage = fileName.match(/\.(jpg|jpeg|png|gif)$/i);
    return (
      <Card key={attachment.id || `temp-${Math.random().toString(36).slice(2, 11)}`} p="sm" withBorder>
        <Group justify="space-between">
          <Group gap="xs">
            {getFileIcon(fileName)}
            <Text size="sm">{fileName}</Text>
            {isImage && typeof attachment.source === 'string' && (
              <Image src={`${API}/${attachment.source}`} width={100} mt="sm" alt="Preview" />
            )}
          </Group>
          <Button
            variant="subtle"
            color="red"
            size="sm"
            onClick={() => onRemoveAttachment(attachment.id)}
          >
            Удалить
          </Button>
        </Group>
      </Card>
    );
  };

  if (withDnd) {
    try {
      return (
        <>
          <FileDropZone onFilesDrop={onFilesDrop} />
          <Stack mt="md">
            {attachments.map(renderAttachment)}
          </Stack>
        </>
      );
    } catch (e) {
      console.warn("DnD components are not available, falling back to basic UI.");
    }
  }

  return (
    <>
      <input
        type="file"
        multiple
        onChange={(e) => e.target.files && onFilesDrop(Array.from(e.target.files))}
      />
      <Stack mt="md">
        {attachments.map(renderAttachment)}
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
  const [previewId, setPreviewId] = useState<string | null>(null);
  const form = useForm({ initialValues });
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
    setAttachments(prev => [...prev, ...newAttachments]);
    form.setFieldValue('attachments', [...attachments, ...newAttachments]);
  }, [initialValues.userAdd, attachments, form]);

  const handleRemoveAttachment = useCallback((id: string | undefined) => {
    setAttachments(prev => {
      const newAttachments = prev.filter(a => a.id?.toString() !== id?.toString());
      form.setFieldValue('attachments', newAttachments);
      return newAttachments;
    });
  }, [form]);

  const renderField = useCallback((field: FormField) => {
    const commonProps = {
      label: field.label,
      required: field.required,
      ...form.getInputProps(field.name),
      mb: "md" as const,
    };

    switch (field.type) {
      case 'text':
        return <TextInput key={field.name} {...commonProps} />;
      case 'textarea':
        return <Textarea key={field.name} {...commonProps} />;
      case 'select':
        return <Select key={field.name} {...commonProps} data={field.options || []} />;
      case 'selectSearch':
        return <Select key={field.name} {...commonProps} data={field.options || []} searchable nothingFoundMessage="Ничего не найдено" clearable />;
      case 'date':
        return <TextInput key={field.name} {...commonProps} type="date" />;
      case 'datetime':
        return <TextInput key={field.name} {...commonProps} type="datetime-local" />;
      case 'number':
        return <TextInput key={field.name} {...commonProps} type="number" step={field.step || "any"} min={field.min} max={field.max} />;
      case 'file':
        return (
          <div key={field.name}>
            <Text fw={500} mb="sm">{field.label}</Text>
            <FileUploadComponent
              onFilesDrop={handleFileDrop}
              attachments={attachments}
              onRemoveAttachment={handleRemoveAttachment}
              withDnd={field.withDnd}
            />
          </div>
        );
      case 'boolean':
        return null; // Handle boolean fields if necessary
      default:
        return null;
    }
  }, [form, handleFileDrop, handleRemoveAttachment, attachments]);

  const renderViewField = useCallback((config: ViewFieldConfig, item: any) => (
    <div key={config.label} style={{ marginBottom: '16px' }}>
      <Text fw={500} mb="xs">{config.label}</Text>
      <Text>{config.value(item) || '-'}</Text>
    </div>
  ), []);

  const renderAttachmentCard = useCallback((attachment: FileAttachment) => {
    const fileName = typeof attachment.source === 'string'
      ? attachment.source.split('\\').pop() || 'Файл'
      : attachment.source.name;
    const fileUrl = `${API}/${attachment.source}`;
    const fileId = attachment.id || `temp-${fileName}-${Math.random().toString(36).slice(2, 11)}`;
    return (
      <Card key={fileId} p="sm" withBorder>
        <Group justify="space-between">
          <Group gap="xs" onClick={() => setPreviewId(fileId)} style={{ cursor: 'pointer' }}>
            {getFileIcon(fileName)}
            <Text size="sm">{fileName}</Text>
          </Group>
          <Text
            size="sm"
            c="blue"
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              window.open(fileUrl, '_blank');
            }}
          >
            Скачать
          </Text>
        </Group>
        <FilePreviewModal
          opened={previewId === fileId}
          onClose={() => setPreviewId(null)}
          attachments={initialValues.attachments || []}
        />
      </Card>
    );
  }, [previewId, initialValues.attachments]);

  const modalContent = useMemo(() => {
    switch (mode) {
      case 'view':
        return (
          <>
            {viewFieldsConfig.map(config => renderViewField(config, initialValues))}
            {initialValues.attachments?.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <Text fw={500} mb="sm">Приложения</Text>
                <Stack gap="xs">
                  {initialValues.attachments.map(renderAttachmentCard)}
                </Stack>
              </div>
            )}
          </>
        );
      case 'delete':
        return (
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
        );
      default:
        return (
          <form onSubmit={form.onSubmit(values => onSubmit?.({ ...values, attachments }))}>
            <Stack>
              {fields.map(renderField)}
              {error && <Alert color="red">{error}</Alert>}
              <Group justify="flex-end" mt="md">
                <Button variant="default" onClick={onClose}>
                  Отмена
                </Button>
                <Button type="submit">
                  {mode === 'create' ? 'Создать' : 'Сохранить'}
                </Button>
              </Group>
            </Stack>
          </form>
        );
    }
  }, [mode, viewFieldsConfig, initialValues, renderViewField, renderAttachmentCard, onClose, onConfirm, form, onSubmit, fields, renderField, error, attachments]);

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="xl" radius="md">
      {modalContent}
    </Modal>
  );
};
