import { Modal, TextInput, Select, Button, Alert, Stack, Textarea, Text, Group, Card, Paper, ActionIcon, NumberInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState, useEffect, useCallback, useMemo, useRef, JSX } from 'react';
import dayjs from 'dayjs';
import { API } from '../config/constants';
import { FileDropZone } from './dnd';
import { IconFile, IconFileTypePdf, IconFileTypeDoc, IconFileTypeXls, IconFileTypePpt, IconFileTypeZip, IconPhoto, IconFileTypeJs, IconFileTypeHtml, IconFileTypeCss, IconFileTypeTxt, IconFileTypeCsv, IconX } from '@tabler/icons-react';
import { FilePreviewModal } from './FilePreviewModal';

// Types and interfaces
export type FieldType = 'text' | 'number' | 'select' | 'selectSearch' | 'date' | 'datetime' | 'textarea' | 'file' | 'boolean';

interface FileFieldConfig {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'datetime';
  required?: boolean | ((meta: Record<string, any>) => boolean);
  options?: Array<{ value: string; label: string }>;
  mask?: (value: string) => string;
  visible?: (meta: Record<string, any>) => boolean;
  placeholder?: string;
}

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
  fileFields?: FileFieldConfig[]; // Конфигурация дополнительных полей для файлов
  // Дополнительные свойства для расширенного управления
  onChange?: (value: any) => void;
  searchable?: boolean;
  disabled?: boolean;
  loading?: boolean;
  leftSection?: JSX.Element;
  multiple?: boolean;
  accept?: string;
  value?: any;
  renderFileList?: (values: any, setFieldValue: (path: string, val: any) => void) => JSX.Element;
  mask?: (value: string) => string;
  placeholder?: string;
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
  meta?: Record<string, any>; // Для хранения дополнительных полей
}

interface FileUploadProps {
  onFilesDrop: (files: File[]) => void;
  attachments: FileAttachment[];
  onRemoveAttachment: (id: string | undefined) => void;
  withDnd?: boolean;
  fileFields?: FileFieldConfig[];
  onMetaChange: (id: string | undefined, meta: Record<string, any>) => void;
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

const FileUploadComponent = ({ 
  onFilesDrop, 
  attachments, 
  onRemoveAttachment, 
  withDnd = false,
  fileFields = [],
  onMetaChange
}: FileUploadProps) => {
  const renderField = (field: FileFieldConfig, attachment: FileAttachment) => {
    const value = attachment.meta?.[field.name] || '';

    const commonProps = {
      value,
      onChange: (e: any) => {
        let nextValue = e.target?.value ?? e;
        if (typeof nextValue === 'string' && typeof field.mask === 'function') {
          nextValue = field.mask(nextValue);
        }
        const newMeta = {
          ...attachment.meta,
          [field.name]: nextValue
        };
        onMetaChange(attachment.id, newMeta);
      },
      required: typeof field.required === 'function' ? field.required(attachment.meta || {}) : !!field.required,
      style: { width: '150px' },
      placeholder: field.placeholder,
    } as any;

    switch (field.type) {
      case 'text':
        return <TextInput {...commonProps} label={field.label} />;
      case 'number':
        return <NumberInput {...commonProps} label={field.label} />;
      case 'select':
        return (
          <Select
            {...commonProps}
            label={field.label}
            data={field.options || []}
            placeholder={field.placeholder}
          />
        );
      case 'date':
        return <TextInput {...commonProps} label={field.label} type="date" />;
      case 'datetime':
        return <TextInput {...commonProps} label={field.label} type="datetime-local" />;
      default:
        return null;
    }
  };

  const renderAttachment = (attachment: FileAttachment) => {
    const originalName = typeof attachment.source === 'string'
      ? attachment.source.split('\\').pop() || 'Файл'
      : (attachment.source as File).name;
    const normalizedPath = typeof attachment.source === 'string'
      ? String(attachment.source).replace(/\\/g, '/')
      : '';
    const previewUrl = typeof attachment.source === 'string' ? `${API}/${normalizedPath}` : '';

    const visibleFields = (fileFields || []).filter((f) =>
      typeof f.visible === 'function' ? f.visible(attachment.meta || {}) : true
    );

    return (
      <Paper key={attachment.id || originalName} p="sm" withBorder>
        <Group justify="space-between" align="center" wrap="wrap">
          <Group gap="sm" align="center">
            {typeof attachment.source === 'string' ? (
              <img src={previewUrl} alt={originalName} style={{ height: 60, width: 100, objectFit: 'contain', borderRadius: 6 }} />
            ) : (
              <img src={URL.createObjectURL(attachment.source as File)} alt={originalName} style={{ height: 60, width: 100, objectFit: 'contain', borderRadius: 6 }} />
            )}
            <Text size="sm" c="dimmed">Предпросмотр</Text>
          </Group>

          <Group gap="sm" align="flex-end">
            {visibleFields.map(field => (
              <div key={`${attachment.id}-${field.name}`}>
                {renderField(field, attachment)}
              </div>
            ))}
            
            <ActionIcon
              color="red"
              onClick={() => onRemoveAttachment(attachment.id)}
            >
              <IconX size={16} />
            </ActionIcon>
          </Group>
        </Group>
      </Paper>
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
  const initializedRef = useRef(false);

  useEffect(() => {
    if (opened && !initializedRef.current) {
      // Initialize once per open session
      const incoming: any[] = (initialValues as any).attachments
        || (initialValues as any).rkAttachment
        || [];

      const normalized = incoming.map((att: any) => {
        const knownKeys = new Set([
          'id', 'userAdd', 'userAddId', 'source', 'type', 'recordId', 'createdAt', 'updatedAt',
        ]);
        const derivedMeta: Record<string, any> = att?.meta ? { ...att.meta } : {};
        Object.keys(att || {}).forEach((key) => {
          if (!knownKeys.has(key) && !(key in derivedMeta)) {
            derivedMeta[key] = att[key];
          }
        });
        return { ...att, meta: derivedMeta } as FileAttachment;
      });

      const preparedValues = {
        removedAttachments: [],
        ...initialValues,
        attachments: normalized,
      } as Record<string, any>;

      form.setValues(preparedValues);
      setAttachments(normalized);
      initializedRef.current = true;
    }
    if (!opened) {
      initializedRef.current = false;
    }
  }, [opened]);

  const handleMetaChange = useCallback(
    (id: string | undefined, meta: Record<string, any>) => {
      setAttachments(prev => {
        const updated = prev.map(att => 
          att.id === id ? { ...att, meta } : att
        );
        form.setFieldValue('attachments', updated);
        return updated;
      });
    },
    [form]
  );

  const handleFileDrop = useCallback((files: File[]) => {
    const newAttachments = files.map((file, idx) => ({
      id: `temp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
      userAdd: initialValues.userAdd || '',
      source: file,
      meta: {},
    }));
    setAttachments(prev => {
      const next = [...prev, ...newAttachments];
      form.setFieldValue('attachments', next);
      return next;
    });
  }, [initialValues.userAdd, form]);

  const handleRemoveAttachment = useCallback((id: string | undefined) => {
    setAttachments(prev => {
      const newAttachments = prev.filter(a => a.id?.toString() !== id?.toString());
      form.setFieldValue('attachments', newAttachments);
      if (id) {
        const prevRemoved = (form.values as any).removedAttachments || [];
        form.setFieldValue('removedAttachments', [...prevRemoved, id]);
      }
      return newAttachments;
    });
  }, [form]);

  const renderField = useCallback((field: FormField) => {
    const commonProps = {
      label: field.label,
      required: field.required,
      ...form.getInputProps(field.name),
      mb: "md" as const,
      placeholder: field.placeholder,
    };

    switch (field.type) {
      case 'text':
        return (
          <TextInput
            key={field.name}
            {...commonProps}
            onChange={(e) => {
              const raw = e.target.value;
              const masked = typeof field.mask === 'function' ? field.mask(raw) : raw;
              form.setFieldValue(field.name, masked);
              field.onChange?.(masked);
            }}
          />
        );
      case 'textarea':
        return <Textarea key={field.name} {...commonProps} />;
      case 'select':
        return (
          <Select
            key={field.name}
            {...commonProps}
            data={field.options || []}
            searchable={field.searchable}
            disabled={field.disabled}
            placeholder={field.placeholder}
            comboboxProps={{ withinPortal: true, zIndex: 9999 }}
            value={(form.values as any)[field.name] ?? ''}
            onChange={(val) => {
              form.setFieldValue(field.name, val);
              field.onChange?.(val ?? '');
            }}
          />
        );
      case 'selectSearch':
        return (
          <Select
            key={field.name}
            {...commonProps}
            data={field.options || []}
            searchable
            nothingFoundMessage="Ничего не найдено"
            clearable
            disabled={field.disabled}
            placeholder={field.placeholder}
            comboboxProps={{ withinPortal: true, zIndex: 9999 }}
            value={(form.values as any)[field.name] ?? ''}
            onChange={(val) => {
              form.setFieldValue(field.name, val);
              field.onChange?.(val ?? '');
            }}
          />
        );
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
              fileFields={field.fileFields || []}
              onMetaChange={handleMetaChange}
            />
          </div>
        );
      case 'boolean':
        return null;
      default:
        return null;
    }
  }, [form, handleFileDrop, handleRemoveAttachment, attachments, handleMetaChange, mode]);

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