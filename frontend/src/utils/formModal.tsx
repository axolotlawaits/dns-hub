import { Modal, TextInput, Select, Button, Alert, Stack, Textarea, Text, Group, Image, Card } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { API } from '../config/constants';
import { FileDropZone } from './dnd';
import { IconFile, IconFileTypePdf, IconFileTypeDoc, IconFileTypeXls, IconFileTypePpt, IconFileTypeZip, IconPhoto, IconFileTypeJs, IconFileTypeHtml, IconFileTypeCss, IconFileTypeTxt, IconFileTypeCsv,
} from '@tabler/icons-react';
import { FilePreviewModal } from './FilePreviewModal';

// Определите интерфейсы
export type FieldType = 'text' | 'number' | 'select' | 'selectSearch' | 'date' | 'datetime' | 'textarea' | 'file';

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  step?: string;
  min?: number;
  max?: number;
  withDnd?: boolean;
}

export interface ViewFieldConfig {
  label: string;
  value: (item: any) => string | number | null;
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

const getFileIcon = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
      return <IconPhoto size={20} />;
    case 'pdf':
      return <IconFileTypePdf size={20} />;
    case 'doc':
    case 'docx':
      return <IconFileTypeDoc size={20} />;
    case 'xls':
    case 'xlsx':
      return <IconFileTypeXls size={20} />;
    case 'zip':
    case 'rar':
    case 'tar':
    case 'gz':
      return <IconFileTypeZip size={20} />;
    case 'ppt':
    case 'pptx':
      return <IconFileTypePpt size={20} />;
    case 'js':
      return <IconFileTypeJs size={20} />;
    case 'html':
      return <IconFileTypeHtml size={20} />;
    case 'css':
      return <IconFileTypeCss size={20} />;
    case 'txt':
      return <IconFileTypeTxt size={20} />;
    case 'csv':
      return <IconFileTypeCsv size={20} />;
    default:
      return <IconFile size={20} />;
  }
};

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
          {attachments.map((attachment) => {
            const fileName = typeof attachment.source === 'string' ? attachment.source : attachment.source.name;
            const isImage = fileName.match(/\.(jpg|jpeg|png|gif)$/i);

            return (
              <Card key={attachment.id || `temp-${Math.random().toString(36).substr(2, 9)}`} p="sm" withBorder>
                <Group justify="space-between">
                  <Group gap="xs">
                    {getFileIcon(fileName)}
                    <Text size="sm">{fileName}</Text>
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
                {isImage && typeof attachment.source === 'string' && (
                  <Image src={`${API}/${attachment.source}`} width={100} mt="sm" alt="Preview" />
                )}
              </Card>
            );
          })}
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
        {attachments.map((attachment) => {
          const fileName = typeof attachment.source === 'string' ? attachment.source : attachment.source.name;
          const isImage = fileName.match(/\.(jpg|jpeg|png|gif)$/i);

          return (
            <Card key={attachment.id || `temp-${Math.random().toString(36).substr(2, 9)}`} p="sm" withBorder>
              <Group justify="space-between">
                <Group gap="xs">
                  {getFileIcon(fileName)}
                  <Text size="sm">{fileName}</Text>
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
              {isImage && typeof attachment.source === 'string' && (
                <Image src={`${API}/${attachment.source}`} width={100} mt="sm" alt="Preview" />
              )}
            </Card>
          );
        })}
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
      case 'selectSearch':
        return (
          <Select
            key={field.name}
            label={field.label}
            data={field.options || []}
            required={field.required}
            searchable
            nothingFoundMessage="Ничего не найдено"
            clearable
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
      default:
        return null;
    }
  };

  const renderViewField = (config: ViewFieldConfig, item: any) => (
    <div key={config.label} style={{ marginBottom: '16px' }}>
      <Text fw={500} mb="xs">{config.label}</Text>
      <Text>{config.value(item) || '-'}</Text>
    </div>
  );

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="sm" radius="md">
      {mode === 'view' ? (
        <>
          {viewFieldsConfig.map((config) => renderViewField(config, initialValues))}

          {initialValues.attachments?.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <Text fw={500} mb="sm">Приложения</Text>
              <Stack gap="xs">
                {initialValues.attachments.map((attachment: FileAttachment) => {
                  const fileName = typeof attachment.source === 'string'
                    ? attachment.source.split('/').pop() || 'Файл'
                    : attachment.source.name;
                  const fileUrl = `${API}/${attachment.source}`;
                  const fileId = attachment.id || `temp-${fileName}-${Math.random().toString(36).substr(2, 9)}`;

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
                })}
              </Stack>
            </div>
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
          <Stack>
            {fields.map(renderField)}
            {error && (
              <Alert color="red">
                {error}
              </Alert>
            )}
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
      )}
    </Modal>
  );
};