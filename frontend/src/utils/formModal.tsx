import { Modal, TextInput, Select, Button, Alert, Stack, Textarea, Text, Group, Card, Paper, ActionIcon, NumberInput, MultiSelect } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState, useEffect, useCallback, useMemo, useRef, JSX } from 'react';
import dayjs from 'dayjs';
import { API } from '../config/constants';
import { FileDropZone } from './dnd';
import { IconFile, IconFileTypePdf, IconFileTypeDoc, IconFileTypeXls, IconFileTypePpt, IconFileTypeZip, IconPhoto, IconFileTypeJs, IconFileTypeHtml, IconFileTypeCss, IconFileTypeTxt, IconFileTypeCsv, IconX } from '@tabler/icons-react';
import { FilePreviewModal } from './FilePreviewModal';
import './formModal.css';

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
  searchable?: boolean;
  clearable?: boolean;
  allowDeselect?: boolean;
  onChange?: (value: any) => void;
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
  onChange?: (value: any, setFieldValue?: (path: string, val: any) => void) => void;
  searchable?: boolean;
  onSearchChange?: (search: string) => void;
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
  extraContent?: (values: Record<string, any>, setFieldValue: (path: string, val: any) => void) => JSX.Element;
  viewExtraContent?: (values: Record<string, any>) => JSX.Element;
  hideDefaultViewAttachments?: boolean;
  viewSecondaryAttachments?: Array<{ title: string; list: any[] }>;
  submitButtonText?: string;
  cancelButtonText?: string;
  hideButtons?: boolean;
  size?: string | number;
  fullScreen?: boolean;
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
        // Вызываем onChange из конфигурации поля, если он есть
        if (field.onChange) {
          field.onChange(nextValue);
        }
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
            searchable={field.searchable}
            clearable={field.clearable}
            allowDeselect={field.allowDeselect}
            withinPortal={true}
            zIndex={9999999}
            comboboxProps={{ withinPortal: true, zIndex: 9999999 }}
            className="file-field-select"
            onClick={(e) => {
              console.log('Select clicked:', e);
              e.stopPropagation();
            }}
            onFocus={(e) => {
              console.log('Select focused:', e);
            }}
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

          <Group gap="sm" align="flex-end" className="file-fields">
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
  extraContent,
  viewExtraContent,
  hideDefaultViewAttachments = false,
  viewSecondaryAttachments = [],
  submitButtonText,
  cancelButtonText,
  hideButtons = false,
  size = 'md',
  fullScreen = false
}: DynamicFormModalProps) => {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const form = useForm({ initialValues });
  const [attachmentsMap, setAttachmentsMap] = useState<Record<string, FileAttachment[]>>({});
  const initializedRef = useRef(false);

  useEffect(() => {
    if (opened && !initializedRef.current) {
      // Initialize once per open session
      const fileFieldNames = (fields || []).filter(f => f.type === 'file').map(f => f.name);

      const buildNormalized = (arr: any[]) => arr.map((att: any) => {
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

      const nextMap: Record<string, FileAttachment[]> = {};
      for (const fieldName of fileFieldNames) {
        const incoming: any[] = (initialValues as any)[fieldName] || [];
        nextMap[fieldName] = buildNormalized(incoming);
      }

      // Backward-compat: if generic attachments provided but no specific field had values, map to first file field
      if (fileFieldNames.length > 0) {
        const generic: any[] = (initialValues as any).attachments
          || (initialValues as any).rkAttachment
          || (initialValues as any).rocAttachment
          || [];
        if (generic.length && (!nextMap[fileFieldNames[0]] || nextMap[fileFieldNames[0]].length === 0)) {
          nextMap[fileFieldNames[0]] = buildNormalized(generic);
        }
      }

      // Apply to form values as well
      const preparedValues: Record<string, any> = { removedAttachments: [], ...initialValues };
      for (const k of Object.keys(nextMap)) preparedValues[k] = nextMap[k];
      form.setValues(preparedValues);
      setAttachmentsMap(nextMap);
      initializedRef.current = true;
    }
    if (!opened) {
      initializedRef.current = false;
    }
  }, [opened]);

  const handleMetaChangeFor = useCallback(
    (fieldName: string) => (id: string | undefined, meta: Record<string, any>) => {
      setAttachmentsMap(prev => {
        const current = prev[fieldName] || [];
        const updated = current.map(att => att.id === id ? { ...att, meta } : att);
        const next = { ...prev, [fieldName]: updated };
        form.setFieldValue(fieldName, updated);
        return next;
      });
    },
    [form]
  );

  const handleFileDropFor = useCallback((fieldName: string) => (files: File[]) => {
    const newAttachments = files.map((file, idx) => ({
      id: `temp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
      userAdd: initialValues?.userAdd || '',
      source: file,
      meta: {},
    }));
    setAttachmentsMap(prev => {
      const current = prev[fieldName] || [];
      const nextList = [...current, ...newAttachments];
      const next = { ...prev, [fieldName]: nextList };
      form.setFieldValue(fieldName, nextList);
      return next;
    });
  }, [initialValues?.userAdd, form]);

  const handleRemoveAttachmentFor = useCallback((fieldName: string) => (id: string | undefined) => {
    setAttachmentsMap(prev => {
      const current = prev[fieldName] || [];
      const newAttachments = current.filter(a => a.id?.toString() !== id?.toString());
      const next = { ...prev, [fieldName]: newAttachments };
      form.setFieldValue(fieldName, newAttachments);
      if (id) {
        const prevRemoved = (form.values as any).removedAttachments || [];
        form.setFieldValue('removedAttachments', [...prevRemoved, id]);
      }
      return next;
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
              field.onChange?.(masked, form.setFieldValue);
            }}
          />
        );
      case 'textarea':
        return <Textarea key={field.name} {...commonProps} />;
      case 'select': {
        const getAtPath = (obj: any, path: string): any => {
          return path.split('.').reduce((acc: any, key: string) => (acc == null ? undefined : acc[key]), obj);
        };
        if (field.multiple) {
          const current: string[] = getAtPath(form.values, field.name) || [];
          return (
            <MultiSelect
              key={field.name}
              label={field.label}
              data={(field.options || []).filter(option => option && option.value && option.label)}
              value={current}
              searchable={field.searchable}
              onSearchChange={(s) => field.onSearchChange?.(s)}
              disabled={field.disabled}
              placeholder={field.placeholder}
              comboboxProps={{ withinPortal: true, zIndex: 10001 }}
              onChange={(vals) => {
                form.setFieldValue(field.name, vals);
                field.onChange?.(vals, form.setFieldValue);
              }}
            />
          );
        }
        const singleValue = (form.getInputProps(field.name) as any)?.value ?? '';
        return (
          <Select
            key={field.name}
            {...commonProps}
            data={field.options || []}
            searchable={field.searchable}
            onSearchChange={(s) => field.onSearchChange?.(s)}
            nothingFoundMessage="Не найдено"
            disabled={field.disabled}
            placeholder={field.placeholder}
            comboboxProps={{ withinPortal: true, zIndex: 10001 }}
            value={singleValue}
            onChange={(val) => {
              form.setFieldValue(field.name, val);
              field.onChange?.(val ?? '', form.setFieldValue);
            }}
          />
        );
      }
      case 'selectSearch': {
        const singleValue = (form.getInputProps(field.name) as any)?.value ?? '';
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
            comboboxProps={{ withinPortal: true, zIndex: 10001 }}
            value={singleValue}
            onChange={(val) => {
              form.setFieldValue(field.name, val);
              field.onChange?.(val ?? '', form.setFieldValue);
            }}
          />
        );
      }
      case 'date': {
        const value = (form.getInputProps(field.name) as any)?.value;
        const normalized = typeof value === 'string' && value.includes('T')
          ? value.split('T')[0]
          : value || '';
        return <TextInput key={field.name} {...commonProps} type="date" value={normalized} onChange={(e) => {
          form.setFieldValue(field.name, e.target.value);
          field.onChange?.(e.target.value, form.setFieldValue);
        }} />;
      }
      case 'datetime':
        return <TextInput key={field.name} {...commonProps} type="datetime-local" />;
      case 'number':
        return <TextInput key={field.name} {...commonProps} type="number" step={field.step || "any"} min={field.min} max={field.max} />;
      case 'file':
        return (
          <div key={field.name}>
            <Text fw={500} mb="sm">{field.label}</Text>
            <FileUploadComponent
              onFilesDrop={handleFileDropFor(field.name)}
              attachments={attachmentsMap[field.name] || []}
              onRemoveAttachment={handleRemoveAttachmentFor(field.name)}
              withDnd={field.withDnd}
              fileFields={field.fileFields || []}
              onMetaChange={handleMetaChangeFor(field.name)}
            />
          </div>
        );
      case 'boolean':
        return null;
      default:
        return null;
    }
  }, [form, handleFileDropFor, handleRemoveAttachmentFor, attachmentsMap, handleMetaChangeFor, mode]);

  const renderViewField = useCallback((config: ViewFieldConfig, item: any) => (
    <div key={config.label} className="view-field">
      <Text fw={500} mb="xs" c="var(--theme-text-primary)" size="sm">{config.label}</Text>
      <Text c="var(--theme-text-secondary)" size="sm" style={{ 
        background: 'var(--theme-bg-secondary)', 
        padding: 'var(--space-2) var(--space-3)', 
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--theme-border)'
      }}>
        {config.value(item) || '-'}
      </Text>
    </div>
  ), []);

  const renderAttachmentCard = useCallback((attachment: FileAttachment) => {
    const fileName = typeof attachment.source === 'string'
      ? attachment.source.split('\\').pop() || 'Файл'
      : attachment.source.name;
    const normalized = typeof attachment.source === 'string' ? String(attachment.source).replace(/\\/g, '/') : '';
    const fileUrl = `${API}/${normalized}`;
    const isImage = typeof attachment.source === 'string' && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(normalized);
    const fileId = attachment.id || `temp-${fileName}-${Math.random().toString(36).slice(2, 11)}`;
    return (
      <Card key={fileId} p="sm" withBorder className="file-card">
        <Group justify="space-between">
          <Group gap="xs" onClick={() => setPreviewId(fileId)} style={{ cursor: 'pointer' }}>
            {isImage ? (
              <img 
                src={fileUrl} 
                alt={fileName} 
                className="file-preview"
                style={{ height: 42, width: 64, objectFit: 'cover' }} 
              />
            ) : (
              <div className="file-icon">
                {getFileIcon(fileName)}
              </div>
            )}
            <Text size="sm" c="var(--theme-text-primary)">{fileName}</Text>
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
        {/* FilePreviewModal expects Attachment[] with required id:string. Map gently. */}
        <FilePreviewModal
          opened={previewId === fileId}
          onClose={() => setPreviewId(null)}
          attachments={(() => {
            const base: any[] = (initialValues as any).attachments
              || (initialValues as any).rkAttachment
              || (initialValues as any).rocAttachment
              || [];
            const extras: any[] = (viewSecondaryAttachments || []).flatMap(s => s.list || []);
            const all = [...base, ...extras];
            return all.map((a: any) => ({
              id: String(a.id || `temp-${Math.random().toString(36).slice(2, 11)}`),
              name: typeof a.source === 'string' ? (a.source.split('\\').pop() || 'Файл') : (a.source?.name || 'Файл'),
              url: typeof a.source === 'string' ? `${API}/${a.source}` : (a.source ? URL.createObjectURL(a.source) : ''),
              source: typeof a.source === 'string' ? a.source : '',
            }));
          })()}
        />
      </Card>
    );
  }, [previewId, initialValues]);

  const modalContent = useMemo(() => {
    switch (mode) {
      case 'view':
        return (
          <Stack gap="lg">
            <Group gap="md" align="flex-start" mb="md">
              <div style={{
                background: 'var(--color-blue-100)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <IconFile size={24} color="var(--color-blue-600)" />
              </div>
              <div style={{ flex: 1 }}>
                <Text size="lg" fw={600} c="var(--theme-text-primary)" mb="xs">
                  Просмотр записи
                </Text>
                <Text c="var(--theme-text-secondary)" size="sm">
                  Детальная информация о записи
                </Text>
              </div>
            </Group>
            
            <Stack gap="md">
              {viewFieldsConfig.map(config => renderViewField(config, initialValues))}
            </Stack>
            
            {!hideDefaultViewAttachments && (((initialValues as any).attachments?.length || (initialValues as any).rkAttachment?.length || (initialValues as any).rocAttachment?.length) > 0) && (
              <div>
                <Text fw={500} mb="sm" c="var(--theme-text-primary)">Приложения</Text>
                <Stack gap="xs">
                  {(((initialValues as any).attachments
                    || (initialValues as any).rkAttachment
                    || (initialValues as any).rocAttachment
                    || []) as any[]).map(renderAttachmentCard)}
                </Stack>
              </div>
            )}
            {typeof viewExtraContent === 'function' && (
              <div>
                {viewExtraContent(initialValues)}
              </div>
            )}
          </Stack>
        );
      case 'delete':
        return (
          <Stack gap="lg">
            <Group gap="md" align="flex-start">
              <div style={{
                background: 'var(--color-red-100)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <IconX size={24} color="var(--color-red-600)" />
              </div>
              <div style={{ flex: 1 }}>
                <Text size="lg" fw={600} c="var(--theme-text-primary)" mb="xs">
                  Подтверждение удаления
                </Text>
                <Text c="var(--theme-text-secondary)">
                  Вы уверены, что хотите удалить эту запись? Это действие нельзя отменить.
                  {initialValues?.ReceiptDate && ` (${dayjs(initialValues.ReceiptDate).format('DD.MM.YYYY')})`}
                </Text>
              </div>
            </Group>
            <Group justify="flex-end" gap="sm">
              <Button 
                variant="outline" 
                onClick={() => { initializedRef.current = false; onClose(); }}
                className="cancel-button"
              >
                Отмена
              </Button>
              <Button 
                color="red" 
                onClick={onConfirm}
                className="delete-button"
              >
                Удалить
              </Button>
            </Group>
          </Stack>
        );
      default: {
        const panelContent = typeof extraContent === 'function'
          ? extraContent(form.values, form.setFieldValue)
          : null;

        if (panelContent) {
          return (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <form onSubmit={form.onSubmit(values => onSubmit?.({ ...values }))} style={{ flex: 1 }}>
                <Stack>
                  {fields.map(renderField)}
                  {error && <Alert color="red">{error}</Alert>}
                  {!hideButtons && (
                    <Group justify="flex-end" mt="md">
                      <Button variant="default" onClick={() => { initializedRef.current = false; onClose(); }}>
                        {cancelButtonText || 'Отмена'}
                      </Button>
                      <Button type="submit">
                        {submitButtonText || (mode === 'create' ? 'Создать' : 'Сохранить')}
                      </Button>
                    </Group>
                  )}
                </Stack>
              </form>
              <div style={{ width: 380 }}>
                <Card withBorder shadow="sm" p="md">
                  {panelContent}
                </Card>
              </div>
            </div>
          );
        }

        // No side panel → render classic single-column form (full width)
        return (
          <form onSubmit={form.onSubmit(values => onSubmit?.({ ...values }))}>
            <Stack>
              {fields.map(renderField)}
              {error && <Alert color="red">{error}</Alert>}
              {!hideButtons && (
                <Group justify="flex-end" mt="md">
                  <Button variant="default" onClick={() => { initializedRef.current = false; onClose(); }}>
                    {cancelButtonText || 'Отмена'}
                  </Button>
                  <Button type="submit">
                    {submitButtonText || (mode === 'create' ? 'Создать' : 'Сохранить')}
                  </Button>
                </Group>
              )}
            </Stack>
          </form>
        );
      }
    }
  }, [mode, viewFieldsConfig, initialValues, renderViewField, renderAttachmentCard, onClose, onConfirm, form, onSubmit, fields, renderField, error, attachmentsMap, hideDefaultViewAttachments, viewExtraContent]);

  return (
    <Modal 
      opened={opened} 
      onClose={() => { initializedRef.current = false; onClose(); }} 
      title={title} 
      size={size} 
      radius="lg"
      className={`form-modal ${mode === 'delete' ? 'delete-mode' : mode === 'view' ? 'view-mode' : ''}`}
      centered={!fullScreen}
      fullScreen={fullScreen}
      overlayProps={{
        backgroundOpacity: 0.5,
      }}
      withCloseButton
      closeOnClickOutside
      closeOnEscape
      styles={fullScreen ? {
        content: {
          width: '100vw',
          maxWidth: '100vw',
          maxHeight: '90vh'
        },
        body: {
          width: '100%',
          padding: 0
        }
      } : undefined}
    >
      {modalContent}
    </Modal>
  );
};