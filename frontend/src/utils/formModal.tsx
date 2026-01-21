import { Modal, TextInput, Select, Button, Alert, Stack, Textarea, Text, Group, Card, Paper, ActionIcon, MultiSelect, Badge, Switch, Autocomplete, PasswordInput, Grid, Popover } from '@mantine/core';
import { useForm } from '@mantine/form';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import { useState, useEffect, useCallback, useMemo, useRef, JSX, memo } from 'react';
import dayjs from 'dayjs';
import { FileDropZone } from './dnd';
import { IconFile, IconFileTypePdf, IconFileTypeDoc, IconFileTypeXls, IconFileTypePpt, IconFileTypeZip, IconPhoto, IconFileTypeJs, IconFileTypeHtml, IconFileTypeCss, IconFileTypeTxt, IconFileTypeCsv, IconX, IconUpload, IconVideo, IconMusic, IconFileText } from '@tabler/icons-react';
import * as TablerIcons from '@tabler/icons-react';
import { FilePreviewModal } from './FilePreviewModal';
import { IconPicker } from '../components/IconPicker';
import './styles/formModal.css';
import { saveAs } from 'file-saver';
import { API } from '../config/constants';

// Хук для управления blob URL с автоматической очисткой
const useBlobUrl = (file: File | null): string | null => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setBlobUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setBlobUrl(url);

    return () => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.warn('Failed to revoke blob URL:', error);
      }
    };
  }, [file]);

  return blobUrl;
};

// Constants for optimization
const FILE_ICON_MAP = {
  // Изображения
  jpg: IconPhoto,
  jpeg: IconPhoto,
  png: IconPhoto,
  gif: IconPhoto,
  bmp: IconPhoto,
  svg: IconPhoto,
  webp: IconPhoto,
  ico: IconPhoto,
  
  // Документы
  pdf: IconFileTypePdf,
  doc: IconFileTypeDoc,
  docx: IconFileTypeDoc,
  rtf: IconFileTypeDoc,
  
  // Таблицы
  xls: IconFileTypeXls,
  xlsx: IconFileTypeXls,
  ods: IconFileTypeXls,
  
  // Презентации
  ppt: IconFileTypePpt,
  pptx: IconFileTypePpt,
  odp: IconFileTypePpt,
  
  // Архивы
  zip: IconFileTypeZip,
  rar: IconFileTypeZip,
  tar: IconFileTypeZip,
  gz: IconFileTypeZip,
  '7z': IconFileTypeZip,
  
  // Видео
  mp4: IconVideo,
  avi: IconVideo,
  mkv: IconVideo,
  mov: IconVideo,
  wmv: IconVideo,
  flv: IconVideo,
  webm: IconVideo,
  
  // Аудио
  mp3: IconMusic,
  wav: IconMusic,
  flac: IconMusic,
  aac: IconMusic,
  ogg: IconMusic,
  
  // Текстовые файлы
  txt: IconFileTypeTxt,
  md: IconFileText,
  
  // Данные
  csv: IconFileTypeCsv,
  json: IconFileTypeJs,
  xml: IconFileTypeHtml,
  
  // Код
  js: IconFileTypeJs,
  ts: IconFileTypeJs,
  jsx: IconFileTypeJs,
  tsx: IconFileTypeJs,
  html: IconFileTypeHtml,
  htm: IconFileTypeHtml,
  css: IconFileTypeCss,
  scss: IconFileTypeCss,
  sass: IconFileTypeCss,
  less: IconFileTypeCss,
} as const;

const ICON_SIZE = 20;
const KNOWN_ATTACHMENT_KEYS = new Set([
  'id', 'userAdd', 'userAddId', 'source', 'type', 'recordId', 'createdAt', 'updatedAt',
]);

const COMMON_FIELD_PROPS = {
  size: 'sm' as const,
  radius: 'md' as const,
  style: {
    '--input-bd': 'var(--theme-border)',
    '--input-bg': 'var(--theme-bg-elevated)',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
  }
};

// CSS класс для декоративного элемента - стили в formModal.css
const DECORATIVE_CLASS = 'decorative-element';

// Types and interfaces
export type FieldType = 'text' | 'password' | 'number' | 'select' | 'selectSearch' | 'autocomplete' | 'date' | 'datetime' | 'textarea' | 'file' | 'boolean' | 'multiselect' | 'icon' | 'color';

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
  onKeyDown?: (e: React.KeyboardEvent) => void; // Обработчик нажатия клавиш
}

export interface FormField {
  name: string;
  label: string | ((values: Record<string, any>) => string);
  type: FieldType;
  required?: boolean;
  options?: Array<{ value: string; label: string; icon?: JSX.Element }> | ((values: Record<string, any>) => Array<{ value: string; label: string; icon?: JSX.Element }>);
  data?: Array<{ value: string; label: string; icon?: JSX.Element }> | ((values: Record<string, any>) => Array<{ value: string; label: string; icon?: JSX.Element }>); // Для MultiSelect
  step?: string;
  min?: number;
  max?: number;
  withDnd?: boolean;
  fileFields?: FileFieldConfig[]; // Конфигурация дополнительных полей для файлов
  // Дополнительные свойства для расширенного управления
  onChange?: (value: any, setFieldValue?: (path: string, val: any) => void) => void;
  searchable?: boolean;
  onSearchChange?: (search: string) => void;
  disabled?: boolean | ((values: Record<string, any>) => boolean);
  // Группировка полей в ряд
  groupWith?: string[]; // Массив имен полей для группировки в ряд
  groupSize?: 1 | 2 | 3; // Размер группы (1, 2 или 3 поля в ряд)
  // Дополнительные свойства для полей
  loading?: boolean;
  leftSection?: JSX.Element;
  multiple?: boolean;
  accept?: string;
  value?: any;
  renderFileList?: (values: any, setFieldValue: (path: string, val: any) => void) => JSX.Element;
  mask?: (value: string) => string;
  placeholder?: string | ((values: Record<string, any>) => string);
  description?: string; // Описание поля
  mb?: string | number; // Отступ снизу для поля
  onKeyDown?: (e: React.KeyboardEvent) => void; // Обработчик нажатия клавиш
}

export interface ViewFieldConfig {
  label: string;
  value: (item: any) => string | number | null | JSX.Element;
  // Группировка полей в ряд
  groupWith?: string[]; // Массив меток полей для группировки в ряд
  groupSize?: 1 | 2 | 3; // Размер группы (1, 2 или 3 поля в ряд)
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

interface MantineForm {
  values: Record<string, any>;
  setFieldValue: (path: string, val: any) => void;
  getInputProps: (path: string) => any;
  onSubmit: (handler: (values: Record<string, any>) => void) => (e?: React.FormEvent<HTMLFormElement>) => void;
  setValues: (values: Record<string, any>) => void;
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
  loading?: boolean;
  // Универсальная поддержка дополнительных вложений к файлам
  fileAttachments?: Record<string, File[]>;
  onFileAttachmentsChange?: (fileId: string, attachments: File[]) => void;
  attachmentLabel?: string;
  attachmentAccept?: string;
  existingDocuments?: Record<string, any[]>;
  onDeleteExistingDocument?: (fileId: string, documentId: string) => void;
  // Настройка заголовка карточки файла
  fileCardTitle?: string;
  // Ключ для получения вложений из initialValues (по умолчанию 'attachments')
  attachmentsKey?: string;
}

// Helper functions
const getFileIcon = (fileName: string): JSX.Element => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const IconComponent = FILE_ICON_MAP[extension as keyof typeof FILE_ICON_MAP];
  return IconComponent ? <IconComponent size={ICON_SIZE} /> : <IconFile size={ICON_SIZE} />;
};

const isImageFile = (fileName: string): boolean => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'];
  return imageExtensions.includes(extension || '');
};

// Компонент для отображения превью файла
const FilePreview = memo(({ 
  attachment, 
  onRemove 
}: { 
  attachment: FileAttachment; 
  onRemove: () => void;
}) => {
  const originalName = typeof attachment.source === 'string'
    ? attachment.source.split('\\').pop()?.split('/').pop() || 'Файл'
    : (attachment.source as File).name;
  // Используем previewUrl из attachment (должен передаваться из инструмента)
  const previewUrl = typeof attachment.source === 'string' 
    ? ((attachment as any).previewUrl || '')
    : '';
  const file = typeof attachment.source === 'string' ? null : attachment.source;
  const blobUrl = useBlobUrl(file);

  return (
    <Paper 
      key={attachment.id || originalName} 
      p="lg" 
      withBorder 
      radius="lg"
      className="file-preview-card"
      style={{
        background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
        border: '1px solid var(--theme-border)',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      {/* Декоративный элемент */}
      <div className="decorative-element-green" />
      
      <Group justify="space-between" align="center" wrap="wrap" style={{ position: 'relative' }}>
        <Group gap="md" align="center">
          {/* Красивая рамка для превью */}
          <div style={{
            position: 'relative',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            border: '2px solid var(--theme-border)',
            background: 'var(--theme-bg-elevated)',
            padding: '8px'
          }}>
            {isImageFile(originalName) ? (
              (() => {
                const imageSrc = typeof attachment.source === 'string' ? previewUrl : (blobUrl || '');
                if (!imageSrc || imageSrc.trim() === '') {
                  return (
                    <div style={{
                      height: 60,
                      width: 100,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--theme-text-secondary)',
                      fontSize: '12px'
                    }}>
                      Нет превью
                    </div>
                  );
                }
                return (
                  <img 
                    src={imageSrc} 
                    alt={originalName} 
                    style={{ 
                      height: 60, 
                      width: 100, 
                      objectFit: 'contain', 
                      borderRadius: '8px',
                      display: 'block'
                    }} 
                  />
                );
              })()
            ) : (
              <div style={{
                height: 60,
                width: 100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--theme-bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--theme-border)'
              }}>
                {getFileIcon(originalName)}
              </div>
            )}
            {/* Индикатор успеха */}
            <div style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              width: '16px',
              height: '16px',
              background: 'linear-gradient(135deg, var(--color-green-500) 0%, var(--color-green-600) 100%)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                background: 'white',
                borderRadius: '50%'
              }} />
            </div>
          </div>
          
          <Stack gap="xs">
            <Text size="sm" fw={600} c="var(--theme-text-primary)">
              Предпросмотр
            </Text>
            <Text size="xs" c="dimmed" fw={500}>
              {originalName}
            </Text>
          </Stack>
        </Group>
          
          <ActionIcon
          size="lg"
          variant="light"
            color="red"
          radius="md"
            onClick={onRemove}
          style={{
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)'
          }}
          className="remove-button"
          >
          <IconX size={18} />
          </ActionIcon>
      </Group>
    </Paper>
  );
});

const FileUploadComponent = memo(({ 
  onFilesDrop, 
  attachments, 
  onRemoveAttachment, 
  withDnd = false,
  hidePreview = false,
  accept = "*"
}: FileUploadProps & { hidePreview?: boolean; accept?: string }) => {

  // Функция для генерации текста поддерживаемых форматов
  const getSupportedFormatsText = useCallback((acceptString: string) => {
    if (acceptString === "*") return "Все типы файлов";
    
    const formats = acceptString.split(',').map(f => f.trim());
    const extensions = formats
      .filter(f => f.startsWith('.'))
      .map(f => f.substring(1).toUpperCase());
    
    if (extensions.length === 0) return "Все типы файлов";
    return `Поддерживаются: ${extensions.join(', ')}`;
  }, []);

  const renderAttachment = useCallback((attachment: FileAttachment) => {
    return (
      <FilePreview
        key={attachment.id || `attachment-${Math.random()}`}
        attachment={attachment}
        onRemove={() => onRemoveAttachment(attachment.id)}
      />
    );
  }, [onRemoveAttachment]);

  if (withDnd) {
    try {
      return (
        <>
          <FileDropZone onFilesDrop={onFilesDrop} acceptedTypes={accept} />
          {!hidePreview && (
          <Stack mt="md">
            {attachments.map(renderAttachment)}
          </Stack>
          )}
        </>
      );
    } catch (e) {
      console.warn("DnD components are not available, falling back to basic UI.");
    }
  }

  return (
    <>
      <Paper
        p="xl"
        withBorder
        radius="lg"
        style={{
          background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
          border: '2px dashed var(--theme-border)',
          cursor: 'pointer',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          overflow: 'hidden'
        }}
        className="file-upload-area"
      >
        {/* Декоративный элемент */}
        <div className="decorative-element-circle" />
        
        <Stack align="center" gap="md">
          <div className="icon-container">
            <IconUpload size={24} color="white" />
          </div>
          
          <Stack align="center" gap="xs">
            <Text fw={600} size="lg" c="var(--theme-text-primary)">
              Загрузить файл
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              Перетащите файл сюда или нажмите для выбора
            </Text>
            <Text size="xs" c="dimmed" ta="center">
              {getSupportedFormatsText(accept)}
            </Text>
          </Stack>
        </Stack>
        
      <input
        type="file"
        multiple
        accept={accept}
        onChange={(e) => e.target.files && onFilesDrop(Array.from(e.target.files))}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer'
          }}
        />
      </Paper>
      
      {!hidePreview && (
      <Stack mt="md">
        {attachments.map(renderAttachment)}
      </Stack>
      )}
    </>
  );
});


// Компонент для отображения полей файла в карточке с документами
const FileFieldsCard = memo(({ 
  file, 
  index, 
  fileFields, 
  form, 
  setFieldValue,
  fileAttachments,
  onFileAttachmentsChange,
  attachmentLabel,
  attachmentAccept,
  existingDocuments,
  onDeleteExistingDocument,
  fileCardTitle = "Файл",
  handleMetaChangeFor,
  onRemove
}: { 
  file: FileAttachment & { fileName?: string; source?: File | string }; 
  index: number; 
  fileFields: FileFieldConfig[]; 
  form: MantineForm; 
  setFieldValue: (path: string, val: any) => void;
  fileAttachments?: Record<string, File[]>;
  onFileAttachmentsChange?: (fileId: string, attachments: File[]) => void;
  attachmentLabel?: string;
  attachmentAccept?: string;
  existingDocuments?: Record<string, any[]> | any[];
  onDeleteExistingDocument?: (fileId: string, documentId: string) => void;
  fileCardTitle?: string;
  handleMetaChangeFor?: (fieldName: string) => (id: string | undefined, meta: Record<string, any>) => void;
  onRemove?: () => void;
}) => {
  const fileSource = file.source;
  const fileForBlob = typeof fileSource === 'string' ? null : fileSource;
  const blobUrl = useBlobUrl(fileForBlob);
  const renderFileField = (field: FileFieldConfig) => {
    const fieldValue = form.values.attachments?.[index]?.meta?.[field.name] || '';

    const handleChange = (value: any) => {
      if (handleMetaChangeFor) {
        // Используем handleMetaChangeFor для более стабильного обновления
        const metaUpdate = { [field.name]: value };

        // Используем существующий механизм обновления мета-данных
        const handleMetaChange = handleMetaChangeFor('attachments');
        handleMetaChange(file.id, metaUpdate);
      } else {
        // Fallback к старому методу
        const currentAttachments = form.values.attachments || [];
        const updatedAttachments = currentAttachments.map((att: any, idx: number) => {
          if (idx === index) {
            return {
              ...att,
              meta: {
                ...att.meta,
                [field.name]: value
              }
            };
          }
          return att;
        });
        
        
        setFieldValue('attachments', updatedAttachments);
      }
      
      field.onChange?.(value);
    };

    const isRequired = typeof field.required === 'function' ? field.required(file.meta || {}) : !!field.required;
    const isVisible = typeof field.visible === 'function' ? field.visible(file.meta || {}) : true;

    if (!isVisible) return null;

    // Определяем label и placeholder для мета-полей файлов (FileFieldConfig использует только строки)
    const metaLabel = field.label;
    const metaPlaceholder = field.placeholder;

    const commonProps = {
      size: 'sm' as const,
      radius: 'md' as const,
      style: { 
        '--input-bd': 'var(--theme-border)',
        '--input-bg': 'var(--theme-bg-elevated)',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }
    };

    switch (field.type) {
      case 'text':
        return (
          <TextInput
            key={field.name}
            label={metaLabel}
            value={fieldValue}
            onChange={(e) => {
              const raw = e.target.value;
              const masked = typeof field.mask === 'function' ? field.mask(raw) : raw;
              handleChange(masked);
            }}
            onKeyDown={field.onKeyDown}
            placeholder={metaPlaceholder}
            required={isRequired}
            {...commonProps}
          />
        );
      case 'select': {
        const selectOptions: Array<{ value: string; label: string; icon?: JSX.Element }> = 
          typeof field.options === 'function' 
            ? (field.options as (values: Record<string, any>) => Array<{ value: string; label: string; icon?: JSX.Element }>)(file.meta || {})
            : (field.options || []);
        return (
          <Select
            key={field.name}
            label={metaLabel}
            value={fieldValue}
            onChange={handleChange}
            placeholder={metaPlaceholder}
            required={isRequired}
            data={selectOptions}
            searchable={field.searchable}
            clearable={field.clearable}
            allowDeselect={field.allowDeselect}
            comboboxProps={{ 
              withinPortal: true
            }}
            {...commonProps}
          />
        );
      }
      case 'date':
        return (
          <TextInput
            key={field.name}
            label={metaLabel}
            value={fieldValue}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={metaPlaceholder}
            required={isRequired}
            type="date"
            {...commonProps}
          />
        );
      case 'datetime':
        return (
          <TextInput
            key={field.name}
            label={metaLabel}
            value={fieldValue}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={metaPlaceholder}
            required={isRequired}
            type="datetime-local"
            {...commonProps}
          />
        );
      default:
        return null;
    }
  };

  const fileId = file.id || `file-${index}`;
  const fileAttachmentsList = fileAttachments?.[fileId] || [];
  // existingDocuments может быть объектом {fileId: [documents]} или массивом
  const existingDocsList = Array.isArray(existingDocuments) 
    ? existingDocuments 
    : existingDocuments?.[fileId] || [];
  

  return (
    <Card 
      p='md' 
      withBorder 
      shadow="lg" 
      radius="sm"
      className="file-fields-card"
    >
      {/* Декоративный элемент */}
      <div className={DECORATIVE_CLASS} />
      
      <Stack gap="md" style={{ position: 'relative' }}>
        {/* Заголовок с иконкой */}
        <Group gap="sm" align="center" justify="space-between">
          <Group gap="sm" align="center">
            <div className="status-indicator" />
            <Text size="lg" fw={700} c="var(--theme-text-primary)" style={{ letterSpacing: '0.5px' }}>
              {file.fileName || (file.source instanceof File ? file.source.name : (typeof file.source === 'string' ? file.source.split('\\').pop() || file.source.split('/').pop() : '')) || `${fileCardTitle} #${index + 1}`}
            </Text>
          </Group>
          {onRemove && (
            <ActionIcon
              size="lg"
              variant="light"
              color="red"
              radius="md"
              onClick={onRemove}
              title="Удалить конструкцию"
              style={{
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <IconX size={18} />
            </ActionIcon>
          )}
        </Group>
        
        {/* Preview файла */}
        {file.source && (
          <Card 
            p='15px 0px' 
            radius="md" 
            style={{ 
              background: 'linear-gradient(135deg, var(--theme-bg-secondary) 0%, var(--theme-bg-elevated) 100%)',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: 'none'
            }}
          >
            {/* Декоративная полоска */}
            <div className="decorative-stripe" />
            
            <Group gap="md" wrap='nowrap' align="center" style={{ position: 'relative' }}>
              {/* Красивая рамка для превью */}
              <div style={{
                position: 'relative',
                borderRadius: '12px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                border: '2px solid var(--theme-border)',
                background: 'var(--theme-bg-elevated)',

              }}>
                {(() => {
                  const fileName = typeof fileSource === 'string' 
                    ? String(fileSource).split('\\').pop() || String(fileSource).split('/').pop() || ''
                    : (fileSource instanceof File ? fileSource.name : '');
                  const isImage = isImageFile(fileName);
                  // Используем previewUrl из file (должен передаваться из инструмента)
                  const imageUrl = typeof fileSource === 'string'
                    ? ((file as any).previewUrl || '')
                    : (blobUrl || '');

                  return isImage ? (
                    !imageUrl || imageUrl.trim() === '' ? (
                      <div style={{
                        height: 120,
                        width: 100,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--theme-text-secondary)',
                        fontSize: '12px'
                      }}>
                        Нет превью
                      </div>
                    ) : (
                      <img 
                        src={imageUrl} 
                        alt={fileName} 
                        style={{ 
                          height: 120, 
                          width: 'auto', 
                          objectFit: 'contain', 
                          borderRadius: '8px',
                          display: 'block'
                        }} 
                      />
                    )
                  ) : (
                    <div style={{
                      height: 60,
                      width: 100,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--theme-bg-secondary)',
                      borderRadius: '8px',
                      border: '1px solid var(--theme-border)'
                    }}>
                      {getFileIcon(fileName)}
                    </div>
                  );
                })()}
                {/* Индикатор успеха */}
                <div style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  width: '16px',
                  height: '16px',
                  background: 'linear-gradient(135deg, var(--color-green-500) 0%, var(--color-green-600) 100%)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    background: 'white',
                    borderRadius: '50%'
                  }} />
                </div>
              </div>
              
              <Stack gap="xs">
                <Text size="sm" fw={600} c="var(--theme-text-primary)">
                  Предпросмотр
                </Text>
                <Text size="xs" c="dimmed" fw={500}>
                  {typeof fileSource === 'string' 
                    ? String(fileSource).split('\\').pop() || 'Файл'
                    : (fileSource instanceof File ? fileSource.name : 'Файл')
                  }
                </Text>
              </Stack>
            </Group>
          </Card>
        )}
        
        <div className="file-fields-grid">
          {/* Левая колонка */}
          <Stack gap="lg">
            {fileFields.slice(0, Math.ceil(fileFields.length / 2)).map((field, fieldIndex) => (
              <div key={fieldIndex} style={{ position: 'relative' }}>
                {renderFileField(field)}
              </div>
            ))}
          </Stack>

          {/* Правая колонка - остальные поля + документы */}
          <Stack gap="lg">
            {fileFields.slice(Math.ceil(fileFields.length / 2)).map((field, fieldIndex) => (
              <div key={fieldIndex} style={{ position: 'relative' }}>
                {renderFileField(field)}
              </div>
            ))}
            
            {/* Дополнительные документы */}
            {fileAttachments && onFileAttachmentsChange && (
              <Card 
                p="md" 
                withBorder 
                radius="md" 
                style={{ 
                  background: 'linear-gradient(135deg, var(--theme-bg-secondary) 0%, var(--theme-bg-elevated) 100%)',
                  border: '1px solid var(--theme-border)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
            {/* Декоративная полоска */}
            <div className="decorative-stripe" />
                
                <Stack gap="md" style={{ position: 'relative' }}>
                  <Group gap="sm" align="center">
                    <div style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: 'var(--color-blue-500)'
                    }} />
                    <Text size="sm" fw={600} c="var(--theme-text-primary)">
                      {attachmentLabel || "📎 Дополнительные документы"}
                    </Text>
                  </Group>
                  
                  <Group justify="space-between" align="center">
                    <Text size="xs" c="dimmed" fw={500}>
                      {fileAttachmentsList.length + existingDocsList.length} вложений
                    </Text>
                    {fileAttachmentsList.length > 0 && (
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        leftSection={<IconX size={12} />}
                        radius="md"
                        onClick={() => onFileAttachmentsChange(fileId, [])}
                        style={{ transition: 'all 0.2s ease' }}
                      >
                        Очистить
                      </Button>
                    )}
                  </Group>
                  
                  {/* DnD зона для документов */}
                  <FileDropZone 
                    onFilesDrop={(files) => onFileAttachmentsChange(fileId, [...fileAttachmentsList, ...files])} 
                    acceptedTypes={attachmentAccept || "*"} 
                  />
                  
                  {(fileAttachmentsList.length > 0 || existingDocsList.length > 0) && (
                    <Stack gap="xs" mt="sm">
                      {/* Существующие документы */}
                      {existingDocsList.map((doc, docIndex) => (
                        <Card
                          key={`existing-${docIndex}`}
                          p="sm"
                          withBorder
                          radius="md"
                          style={{ 
                            background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
                            border: '1px solid var(--theme-border)',
                            transition: 'all 0.2s ease',
                            cursor: 'pointer',
                            position: 'relative'
                          }}
                        >
                            <Group justify="space-between" align="center">
                            <Group gap="sm" align="center" style={{ flex: 1 }}>
                              <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'linear-gradient(135deg, var(--color-green-500), var(--color-green-600))',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontSize: '12px',
                                fontWeight: 'bold'
                              }}>
                                📄
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <Text size="sm" fw={600} c="var(--theme-text-primary)" truncate>
                                  {doc.source?.split('\\').pop() || doc.source?.split('/').pop() || 'Документ'}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  Существующий документ
                                </Text>
                              </div>
                            </Group>
                            <Group gap="xs" align="center">
                              <Badge color="green" variant="light" size="xs">
                                Существует
                              </Badge>
                              {onDeleteExistingDocument && (
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  color="red"
                                  onClick={() => onDeleteExistingDocument(fileId, doc.id)}
                                  style={{
                                    minWidth: 'auto',
                                    padding: '4px 8px'
                                  }}
                                >
                                  🗑️
                                </Button>
                              )}
                            </Group>
                          </Group>
                        </Card>
                      ))}
                      
                      {/* Новые документы */}
                      {fileAttachmentsList.map((attachment, attachmentIndex) => (
                        <Card
                          key={attachmentIndex}
                          p="sm"
                          withBorder
                          radius="md"
                          style={{ 
                            background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
                            border: '1px solid var(--theme-border)',
                            transition: 'all 0.2s ease',
                            cursor: 'pointer',
                            position: 'relative',
                            overflow: 'hidden'
                          }}
                          className="attachment-item"
                        >
                          {/* Декоративная полоска */}
                          <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '2px',
                            background: 'linear-gradient(90deg, var(--color-blue-500) 0%, var(--color-blue-600) 100%)'
                          }} />
                          
                          <Group justify="space-between" align="center" style={{ position: 'relative' }}>
                            <Group gap="sm" align="center">
                              <div style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: 'var(--color-blue-500)'
                              }} />
                              <Text size="xs" truncate style={{ maxWidth: '150px', fontWeight: 500 }}>
                                {attachment.name}
                              </Text>
                            </Group>
                            <ActionIcon
                              size="sm"
                              variant="light"
                              color="red"
                              radius="md"
                              onClick={() => {
                                const newAttachments = fileAttachmentsList.filter((_, i) => i !== attachmentIndex);
                                onFileAttachmentsChange(fileId, newAttachments);
                              }}
                              style={{ 
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <IconX size={12} />
                            </ActionIcon>
                          </Group>
                        </Card>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </Card>
            )}
          </Stack>
        </div>
      </Stack>
    </Card>
  );
});

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
  fullScreen = false,
  loading = false,
  fileAttachments,
  onFileAttachmentsChange,
  attachmentLabel,
  attachmentAccept,
  existingDocuments,
  onDeleteExistingDocument,
  fileCardTitle = 'Файл',
  attachmentsKey = 'attachments'
}: DynamicFormModalProps) => {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const form = useForm({ initialValues });
  const [attachmentsMap, setAttachmentsMap] = useState<Record<string, FileAttachment[]>>({});
  const initializedRef = useRef(false);
  
  // Ref для актуального значения fileAttachments (решает проблему замыкания)
  const fileAttachmentsRef = useRef(fileAttachments);
  useEffect(() => {
    fileAttachmentsRef.current = fileAttachments;
  }, [fileAttachments]);

  // Оптимизированная функция нормализации данных
  const buildNormalizedAttachments = useCallback((arr: unknown): FileAttachment[] => {
    // Проверяем, что arr является массивом
    if (!Array.isArray(arr)) {
      console.warn('buildNormalizedAttachments received non-array:', arr);
      return [];
    }
    
    return arr.map((att: unknown) => {
      if (!att || typeof att !== 'object') {
        console.warn('Invalid attachment object:', att);
        return {
          id: `invalid-${Math.random().toString(36).slice(2, 11)}`,
          userAdd: '',
          source: '',
          meta: {}
        } as FileAttachment;
      }

      const attachment = att as Record<string, unknown>;
      const derivedMeta: Record<string, unknown> = attachment?.meta && typeof attachment.meta === 'object' 
        ? { ...(attachment.meta as Record<string, unknown>) } 
        : {};
      
      Object.keys(attachment).forEach((key) => {
        if (!KNOWN_ATTACHMENT_KEYS.has(key) && !(key in derivedMeta)) {
          derivedMeta[key] = attachment[key];
        }
      });
      
      return { 
        ...attachment, 
        meta: derivedMeta 
      } as FileAttachment;
    });
  }, []);

  // Отслеживаем предыдущие initialValues для определения изменений
  const prevInitialValuesRef = useRef<Record<string, any>>(initialValues);
  
  useEffect(() => {
    if (opened && !initializedRef.current) {
      try {
        // Initialize once per open session
        const fileFieldNames = (fields || []).filter(f => f.type === 'file').map(f => f.name);

        const nextMap: Record<string, FileAttachment[]> = {};
        for (const fieldName of fileFieldNames) {
          const incomingValue = initialValues[fieldName];
          const incoming: unknown[] = Array.isArray(incomingValue) ? incomingValue : [];
          nextMap[fieldName] = buildNormalizedAttachments(incoming);
        }

        // Backward-compat: if generic attachments provided but no specific field had values, map to first file field
        if (fileFieldNames.length > 0) {
          const attachmentsValue = initialValues.attachments;
          // Поддержка различных ключей для вложений
          const altAttachmentValue = initialValues[attachmentsKey];
          const generic: unknown[] = (Array.isArray(attachmentsValue) ? attachmentsValue : [])
            || (Array.isArray(altAttachmentValue) ? altAttachmentValue : [])
            || [];
          if (generic.length && (!nextMap[fileFieldNames[0]] || nextMap[fileFieldNames[0]].length === 0)) {
            nextMap[fileFieldNames[0]] = buildNormalizedAttachments(generic);
          }
        }

        // Apply to form values as well
        const preparedValues: Record<string, unknown> = { removedAttachments: [], ...initialValues };
        for (const k of Object.keys(nextMap)) preparedValues[k] = nextMap[k];
        form.setValues(preparedValues);
        setAttachmentsMap(nextMap);
        initializedRef.current = true;
        prevInitialValuesRef.current = initialValues;
      } catch (error) {
        console.error('Error initializing form attachments:', error);
      }
    }
    if (!opened) {
      initializedRef.current = false;
    }
  }, [opened, fields, initialValues, buildNormalizedAttachments, attachmentsKey, form]);

  // Обновляем значения формы при изменении initialValues (например, после загрузки данных)
  useEffect(() => {
    if (opened && initializedRef.current) {
      // Проверяем, действительно ли изменились initialValues
      const hasChanged = JSON.stringify(prevInitialValuesRef.current) !== JSON.stringify(initialValues);
      
      if (hasChanged) {
        try {
          const fileFieldNames = (fields || []).filter(f => f.type === 'file').map(f => f.name);
          
          const nextMap: Record<string, FileAttachment[]> = {};
          for (const fieldName of fileFieldNames) {
            const incomingValue = initialValues[fieldName];
            const incoming: unknown[] = Array.isArray(incomingValue) ? incomingValue : [];
            nextMap[fieldName] = buildNormalizedAttachments(incoming);
          }

          // Обновляем только не-file поля, чтобы не перезаписывать файлы, которые пользователь мог добавить
          const preparedValues: Record<string, unknown> = { ...initialValues };
          for (const k of Object.keys(nextMap)) preparedValues[k] = nextMap[k];
          
          // Обновляем только те поля, которые есть в initialValues и не являются файлами
          const nonFileValues: Record<string, unknown> = {};
          Object.keys(preparedValues).forEach(key => {
            if (!fileFieldNames.includes(key)) {
              nonFileValues[key] = preparedValues[key];
            }
          });
          
          if (Object.keys(nonFileValues).length > 0) {
            form.setValues(nonFileValues);
          }
          
          if (Object.keys(nextMap).length > 0) {
            setAttachmentsMap(prev => ({ ...prev, ...nextMap }));
          }
          
          prevInitialValuesRef.current = initialValues;
        } catch (error) {
          console.error('Error updating form values:', error);
        }
      }
    }
  }, [opened, initialValues, fields, buildNormalizedAttachments, form]);

  const handleMetaChangeFor = useCallback(
    (fieldName: string) => (id: string | undefined, meta: Record<string, any>) => {
      console.log('[FormModal] handleMetaChangeFor:', { fieldName, id, meta });
      setAttachmentsMap(prev => {
        const current = prev[fieldName] || [];
        const updated = current.map(att => 
          att.id === id ? { ...att, meta: { ...att.meta, ...meta } } : att
        );
        const next = { ...prev, [fieldName]: updated };
        console.log('[FormModal] Updated attachments:', updated);
        
        form.setFieldValue(fieldName, updated);
        return next;
      });
    },
    [form]
  );

  // Мемоизированные обработчики для оптимизации
  const handleClose = useCallback(() => {
    initializedRef.current = false;
    onClose();
  }, [onClose]);

  const handleFileDropFor = useCallback((fieldName: string) => (files: File[]) => {
    try {
      // Получаем конфигурацию полей для данного типа файла
      const fileField = fields.find(f => f.name === fieldName && f.type === 'file');
      const fileFields = fileField?.fileFields || [];
      
      setAttachmentsMap(prev => {
        const current = prev[fieldName] || [];
        
        // Если уже есть файл и есть fileFields (карточка с доп. документами),
        // то новые файлы добавляем как документы к первому файлу
        if (current.length > 0 && fileFields.length > 0 && onFileAttachmentsChange) {
          const firstFileId = current[0].id;
          if (firstFileId) {
            // Используем ref для актуального значения (решает проблему замыкания)
            const existingDocs = fileAttachmentsRef.current?.[firstFileId] || [];
            onFileAttachmentsChange(firstFileId, [...existingDocs, ...files]);
          }
          return prev; // Не добавляем в основной список
        }
        
        // Если это первый файл - добавляем как обычно
        const newAttachments = files.map((file, idx) => {
          // Инициализируем мета-данные с пустыми значениями для всех полей
          const initialMeta: Record<string, any> = {};
          fileFields.forEach(field => {
            initialMeta[field.name] = '';
          });
          
          const newAttachment: FileAttachment = {
            id: `temp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
            userAdd: initialValues?.userAdd || '',
            source: file,
            meta: initialMeta,
          };
          
          return newAttachment;
        });
        
        const nextList = [...current, ...newAttachments];
        const next = { ...prev, [fieldName]: nextList };
        
        try {
          form.setFieldValue(fieldName, nextList);
        } catch (error) {
          console.error('Error setting field value:', error);
        }
        return next;
      });
    } catch (error) {
      console.error('Error handling file drop:', error);
    }
  }, [initialValues?.userAdd, form, fields, onFileAttachmentsChange]);

  const handleRemoveAttachmentFor = useCallback((fieldName: string) => (id: string | undefined) => {
    try {
      setAttachmentsMap(prev => {
        const current = prev[fieldName] || [];
        const newAttachments = current.filter(a => a.id?.toString() !== id?.toString());
        const next = { ...prev, [fieldName]: newAttachments };
        
        try {
          form.setFieldValue(fieldName, newAttachments);
          if (id) {
            const prevRemoved = (form.values as Record<string, unknown>).removedAttachments as string[] || [];
            form.setFieldValue('removedAttachments', [...prevRemoved, id]);
          }
        } catch (error) {
          console.error('Error removing attachment:', error);
        }
        
        return next;
      });
    } catch (error) {
      console.error('Error in handleRemoveAttachmentFor:', error);
    }
  }, [form]);

  // Функция для группировки полей
  const groupFields = useCallback((fields: FormField[]) => {
    const grouped: (FormField | FormField[])[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      
      if (processed.has(field.name)) continue;

      // Проверяем, есть ли у поля группировка
      if (field.groupWith && field.groupWith.length > 0) {
        const groupFields: FormField[] = [field];
        processed.add(field.name);

        // Находим все поля в группе
        for (const groupFieldName of field.groupWith) {
          const groupField = fields.find(f => f.name === groupFieldName);
          if (groupField && !processed.has(groupField.name)) {
            groupFields.push(groupField);
            processed.add(groupField.name);
          }
        }

        // Сортируем группу по порядку в исходном массиве
        groupFields.sort((a, b) => {
          const aIndex = fields.findIndex(f => f.name === a.name);
          const bIndex = fields.findIndex(f => f.name === b.name);
          return aIndex - bIndex;
        });

        grouped.push(groupFields);
      } else {
        grouped.push(field);
        processed.add(field.name);
      }
    }

    return grouped;
  }, []);

  // Хелпер для вычисления опций (поддержка функций)
  const getFieldOptions = useCallback((field: FormField): Array<{ value: string; label: string; icon?: JSX.Element }> => {
    if (!field.options) return [];
    if (typeof field.options === 'function') {
      return field.options(form.values);
    }
    return field.options;
  }, [form.values]);


  const renderField = useCallback((field: FormField) => {
    // Поддержка динамических label и placeholder через функции
    const labelValue = typeof field.label === 'function' ? field.label(form.values) : field.label;
    const placeholderValue = typeof field.placeholder === 'function' ? field.placeholder(form.values) : field.placeholder;
    // Поддержка динамического disabled через функцию
    const disabledValue = typeof field.disabled === 'function' ? field.disabled(form.values) : field.disabled;
    
    const commonProps = {
      label: labelValue,
      required: field.required,
      ...form.getInputProps(field.name),
      mb: field.mb !== undefined ? field.mb : "md" as const,
      placeholder: placeholderValue,
      disabled: disabledValue,
      ...COMMON_FIELD_PROPS
    };

    switch (field.type) {
      case 'text':
        return (
          <TextInput
            key={field.name}
            {...commonProps}
            onKeyDown={field.onKeyDown}
            onChange={(e) => {
              const raw = e.target.value;
              const masked = typeof field.mask === 'function' ? field.mask(raw) : raw;
              form.setFieldValue(field.name, masked);
              field.onChange?.(masked, form.setFieldValue);
            }}
          />
        );
      case 'password':
        return (
          <PasswordInput
            key={field.name}
            {...commonProps}
            onKeyDown={field.onKeyDown}
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
              label={labelValue}
              data={getFieldOptions(field).filter(option => option && option.value && option.label)}
              value={current}
              searchable={field.searchable}
              onSearchChange={(s) => field.onSearchChange?.(s)}
              disabled={disabledValue}
              placeholder={placeholderValue}
              comboboxProps={{ withinPortal: true }}
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
            data={getFieldOptions(field)}
            searchable={field.searchable}
            onSearchChange={(s) => field.onSearchChange?.(s)}
            nothingFoundMessage="Не найдено"
            disabled={disabledValue}
            placeholder={placeholderValue}
            comboboxProps={{ withinPortal: true, zIndex: 10001 }}
            value={singleValue}
            onChange={(val) => {
              const newValue = val ?? '';
              form.setFieldValue(field.name, newValue);
              // Вызываем onChange после обновления формы через requestAnimationFrame
              const onChangeHandler = field.onChange;
              if (onChangeHandler) {
                requestAnimationFrame(() => {
                  onChangeHandler(newValue, (path: string, value: any) => {
                    form.setFieldValue(path, value);
                  });
                });
              }
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
            data={getFieldOptions(field)}
            searchable
            nothingFoundMessage="Ничего не найдено"
            clearable
            disabled={disabledValue}
            placeholder={placeholderValue}
            comboboxProps={{ withinPortal: true, zIndex: 10001 }}
            value={singleValue}
            onChange={(val) => {
              const newValue = val ?? '';
              form.setFieldValue(field.name, newValue);
              // Вызываем onChange после обновления формы через requestAnimationFrame
              const onChangeHandler = field.onChange;
              if (onChangeHandler) {
                requestAnimationFrame(() => {
                  onChangeHandler(newValue, (path: string, value: any) => {
                    form.setFieldValue(path, value);
                  });
                });
              }
            }}
          />
        );
      }
      case 'autocomplete': {
        const singleValue = (form.getInputProps(field.name) as any)?.value ?? '';
        const options = getFieldOptions(field);
        const optionsData = options.map(opt => opt.value);
        return (
          <Autocomplete
            key={field.name}
            {...commonProps}
            data={optionsData}
            value={singleValue}
            onChange={(val: string) => {
              form.setFieldValue(field.name, val);
              field.onChange?.(val, form.setFieldValue);
              // Вызываем onSearchChange для динамической загрузки данных
              if (field.onSearchChange && val.trim().length >= 2) {
                field.onSearchChange(val);
              }
            }}
            disabled={disabledValue}
            placeholder={placeholderValue}
            comboboxProps={{ withinPortal: true, zIndex: 10001 }}
          />
        );
      }
      case 'multiselect': {
        const current: string[] = (form.getInputProps(field.name) as any)?.value || [];
        const multiselectOptions: Array<{ value: string; label: string; icon?: JSX.Element }> = 
          typeof field.options === 'function' 
            ? (field.options as (values: Record<string, any>) => Array<{ value: string; label: string; icon?: JSX.Element }>)(form.values)
            : (field.options || []);
        return (
          <MultiSelect
            key={field.name}
            label={labelValue}
            data={multiselectOptions.filter((option: any) => option && option.value && option.label)}
            value={current}
            searchable={field.searchable}
            onSearchChange={(s) => field.onSearchChange?.(s)}
            disabled={disabledValue}
            placeholder={placeholderValue}
            comboboxProps={{ withinPortal: true }}
            onChange={(vals) => {
              form.setFieldValue(field.name, vals);
              field.onChange?.(vals, form.setFieldValue);
            }}
            required={field.required}
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
            <Text fw={500} mb="sm">{typeof field.label === 'function' ? field.label(form.values) : field.label}</Text>
            <FileUploadComponent
              onFilesDrop={handleFileDropFor(field.name)}
              attachments={attachmentsMap[field.name] || []}
              onRemoveAttachment={handleRemoveAttachmentFor(field.name)}
              withDnd={field.withDnd}
              fileFields={field.fileFields || []}
              onMetaChange={handleMetaChangeFor(field.name)}
              hidePreview={!!(field.fileFields && field.fileFields.length > 0)}
              accept={field.accept || "*"}
            />
          </div>
        );
      case 'boolean':
        return (
          <Switch
            key={field.name}
            label={labelValue}
            checked={form.getInputProps(field.name, { type: 'checkbox' }).checked || false}
            onChange={(e) => {
              form.setFieldValue(field.name, e.currentTarget.checked);
              field.onChange?.(e.currentTarget.checked, form.setFieldValue);
            }}
            required={field.required}
            disabled={disabledValue}
            mb={field.mb}
          />
        );
      case 'icon': {
        const IconPickerFieldComponent = memo(({ field }: { field: FormField }) => {
          const [pickerOpened, setPickerOpened] = useState(false);
          const iconValue = (form.getInputProps(field.name) as any)?.value || '';
          
          const getIconComponent = (iconName: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const IconComponent = (TablerIcons as any)[iconName] as React.ComponentType<{
              size?: number;
              stroke?: number;
            }>;
            return IconComponent ? <IconComponent size={20} stroke={1.5} /> : null;
          };

          return (
            <>
              <Group gap="xs" align="flex-end">
                <TextInput
                  key={field.name}
                  label={labelValue}
                  value={iconValue}
                  readOnly
                  placeholder={placeholderValue || 'Выберите иконку'}
                  required={field.required}
                  disabled={disabledValue}
                  mb={field.mb}
                  rightSection={
                    iconValue ? (
                      <Group gap="xs">
                        {getIconComponent(iconValue)}
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          onClick={() => {
                            form.setFieldValue(field.name, '');
                            field.onChange?.('', form.setFieldValue);
                          }}
                        >
                          <IconX size={16} />
                        </ActionIcon>
                      </Group>
                    ) : null
                  }
                />
                <Button
                  onClick={() => setPickerOpened(true)}
                  variant="light"
                  style={{ marginBottom: field.mb || '1rem' }}
                >
                  Выбрать
                </Button>
              </Group>
              {field.description && (
                <Text size="xs" c="dimmed" mt={-(typeof field.mb === 'number' ? field.mb : 16)} mb={field.mb || 'md'}>
                  {field.description}
                </Text>
              )}
              <IconPicker
                opened={pickerOpened}
                onClose={() => setPickerOpened(false)}
                onSelect={(iconName) => {
                  form.setFieldValue(field.name, iconName);
                  field.onChange?.(iconName, form.setFieldValue);
                }}
                currentIcon={iconValue}
              />
            </>
          );
        });
        return <IconPickerFieldComponent key={field.name} field={field} />;
      }
      case 'color': {
        const ColorPickerFieldComponent = memo(({ field }: { field: FormField }) => {
          const [pickerOpened, setPickerOpened] = useState(false);
          const colorValue = (form.getInputProps(field.name) as any)?.value || '#000000';
          
          return (
            <>
              <Group gap="xs" align="flex-end">
                <Popover
                  opened={pickerOpened}
                  onChange={setPickerOpened}
                  position="bottom"
                  withArrow
                  shadow="md"
                  withinPortal
                >
                  <Popover.Target>
                    <Button
                      variant="light"
                      onClick={() => setPickerOpened(!pickerOpened)}
                      style={{
                        backgroundColor: colorValue,
                        color: '#fff',
                        border: '1px solid var(--mantine-color-gray-4)',
                        minWidth: 120
                      }}
                    >
                      {colorValue}
                    </Button>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <Stack gap="md" p="md" style={{ minWidth: 250 }}>
                      <HexColorPicker
                        color={colorValue}
                        onChange={(hexColor) => {
                          form.setFieldValue(field.name, hexColor);
                          field.onChange?.(hexColor, form.setFieldValue);
                        }}
                      />
                      <HexColorInput
                        color={colorValue}
                        onChange={(hexColor) => {
                          form.setFieldValue(field.name, hexColor);
                          field.onChange?.(hexColor, form.setFieldValue);
                        }}
                        prefixed
                        alpha
                      />
                    </Stack>
                  </Popover.Dropdown>
                </Popover>
                <TextInput
                  label={labelValue}
                  value={colorValue}
                  readOnly
                  placeholder={placeholderValue || 'Выберите цвет'}
                  required={field.required}
                  disabled={disabledValue}
                  mb={field.mb}
                  style={{ flex: 1 }}
                />
              </Group>
              {field.description && (
                <Text size="xs" c="dimmed" mt={-(typeof field.mb === 'number' ? field.mb : 16)} mb={field.mb || 'md'}>
                  {field.description}
                </Text>
              )}
            </>
          );
        });
        return <ColorPickerFieldComponent key={field.name} field={field} />;
      }
      default:
        return null;
    }
  }, [form, handleFileDropFor, handleRemoveAttachmentFor, attachmentsMap, handleMetaChangeFor, fileAttachments, onFileAttachmentsChange, attachmentLabel, attachmentAccept]);

  // Функция для рендеринга группы полей
  const renderFieldGroup = useCallback((fieldGroup: FormField[]) => {
    const groupSize = fieldGroup[0]?.groupSize || 2;
    
    return (
      <div 
        key={`group-${fieldGroup.map(f => f.name).join('-')}`} 
        className={`field-group field-group-${groupSize}`}
      >
        {fieldGroup.map((field) => (
          <div key={field.name} className="field-item">
            {renderField({
              ...field,
              // Убираем mb для полей в группах
              mb: undefined
            })}
          </div>
        ))}
      </div>
    );
  }, [renderField]);

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

  // Группировка полей просмотра
  const groupViewFields = useCallback((fields: ViewFieldConfig[]) => {
    const grouped: (ViewFieldConfig | ViewFieldConfig[])[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      
      if (processed.has(field.label)) continue;

      // Проверяем, есть ли у поля группировка
      if (field.groupWith && field.groupWith.length > 0) {
        const groupFields: ViewFieldConfig[] = [field];
        processed.add(field.label);

        // Находим все поля в группе
        for (const groupFieldLabel of field.groupWith) {
          const groupField = fields.find(f => f.label === groupFieldLabel);
          if (groupField && !processed.has(groupField.label)) {
            groupFields.push(groupField);
            processed.add(groupField.label);
          }
        }

        // Сортируем группу по порядку в исходном массиве
        groupFields.sort((a, b) => {
          const aIndex = fields.findIndex(f => f.label === a.label);
          const bIndex = fields.findIndex(f => f.label === b.label);
          return aIndex - bIndex;
        });

        grouped.push(groupFields);
      } else {
        grouped.push(field);
        processed.add(field.label);
      }
    }

    return grouped;
  }, []);

  const renderAttachmentCard = useCallback((attachment: FileAttachment) => {
    const fileName = typeof attachment.source === 'string'
      ? attachment.source.split('\\').pop() || 'Файл'
      : attachment.source.name;
    // Используем previewUrl из attachment (должен передаваться из инструмента)
    // Если previewUrl не передан, формируем его из source
    let fileUrl = (attachment as any).previewUrl || '';
    if (!fileUrl && typeof attachment.source === 'string') {
      const source = attachment.source;
      if (source.startsWith('http') || source.startsWith('blob:')) {
        fileUrl = source;
      } else if (source.includes('/') || source.includes('\\')) {
        // Уже содержит полный путь
        fileUrl = `${API}/${source}`;
      }
      // Если только имя файла без пути - previewUrl должен быть передан из инструмента
    } else if (!fileUrl && attachment.source instanceof File) {
      fileUrl = URL.createObjectURL(attachment.source);
    }
    const isImage = isImageFile(fileName);
    const fileId = attachment.id || `temp-${fileName}-${Math.random().toString(36).slice(2, 11)}`;
    return (
      <Card key={fileId} p={10} withBorder className="file-card">
        <Group justify="space-between" align="center">
          <Group gap="md" onClick={() => {
            setPreviewId(fileId);
          }} style={{ cursor: 'pointer', flex: 1 }}>
            {isImage ? (
              !fileUrl || fileUrl.trim() === '' ? (
                <div style={{
                  height: 70,
                  width: 100,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--theme-text-secondary)',
                  fontSize: '12px'
                }}>
                  Нет превью
                </div>
              ) : (
                <img 
                  src={fileUrl} 
                  alt='preview' 
                  className="file-preview"
                  style={{ 
                    height: 70, 
                    width: 'auto', 
                    objectFit: 'contain',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--theme-border)'
                  }} 
                />
              )
            ) : (
              <div className="file-icon" style={{
                width: 48,
                height: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-blue-100)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-blue-600)'
              }}>
                {getFileIcon(fileName)}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={500} c="var(--theme-text-primary)" style={{ 
                wordBreak: 'break-all',
                lineHeight: 1.4
              }}>
                {fileName.split('/').pop() || fileName}
              </Text>
            </div>
          </Group>
          <Stack w='auto'>
            <Button
              size="xs"
              variant="light"
              color="blue"
              onClick={(e) => {
                e.stopPropagation();
                window.open(fileUrl, '_blank');
              }}
            >
              Открыть
            </Button>
            <Button
              size="xs"
              variant="light"
              color="blue"
              onClick={(e) => {
                e.stopPropagation();
                saveAs(fileUrl, fileName)
              }}
            >
              Скачать
            </Button>
          </Stack>
        </Group>
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
              {groupViewFields(viewFieldsConfig).map((fieldOrGroup, index) => {
                if (Array.isArray(fieldOrGroup)) {
                  // Группа полей - рендерим в Grid
                  const groupSize = fieldOrGroup[0]?.groupSize || 3;
                  const span = 12 / groupSize;
                  return (
                    <Grid key={`group-${index}`} gutter="md">
                      {fieldOrGroup.map((config) => (
                        <Grid.Col key={config.label} span={span}>
                          {renderViewField(config, initialValues)}
                        </Grid.Col>
                      ))}
                    </Grid>
                  );
                } else {
                  // Одиночное поле
                  return renderViewField(fieldOrGroup, initialValues);
                }
              })}
            </Stack>
            
            {!hideDefaultViewAttachments && ((initialValues as any)[attachmentsKey]?.length > 0) && (
              <div style={{ width: '100%' }}>
                <Text fw={500} mb="sm" c="var(--theme-text-primary)">Приложения</Text>
                <Stack gap="xs" style={{ width: '100%' }}>
                  {((initialValues as any)[attachmentsKey] || []).map(renderAttachmentCard)}
                </Stack>
              </div>
            )}
            {typeof viewExtraContent === 'function' && (
              <div>
                {viewExtraContent(initialValues)}
              </div>
            )}
            {typeof extraContent === 'function' && mode !== 'view' && (
              <div>
                {extraContent(form.values, form.setFieldValue)}
              </div>
            )}
            {typeof viewExtraContent === 'function' && mode !== 'view' && (
              <div>
                {viewExtraContent(form.values)}
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
          </Stack>
        );
      default: {
        const panelContent = typeof extraContent === 'function'
          ? extraContent(form.values, form.setFieldValue)
          : null;

        if (panelContent) {
          return (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, height: '100%' }}>
              <form onSubmit={form.onSubmit(values => onSubmit?.({ ...values }))} style={{ flex: 1, height: '100%' }}>
                <Stack style={{ height: '100%' }}>
                  {groupFields(fields).map((fieldOrGroup) => 
                    Array.isArray(fieldOrGroup) 
                      ? renderFieldGroup(fieldOrGroup)
                      : renderField(fieldOrGroup)
                  )}
                  {error && <Alert color="red">{error}</Alert>}
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
          <form onSubmit={form.onSubmit(values => onSubmit?.({ ...values }))} style={{ height: '100%' }}>
            <Stack style={{ height: '100%' }}>
              {groupFields(fields).map((fieldOrGroup) => 
                Array.isArray(fieldOrGroup) 
                  ? renderFieldGroup(fieldOrGroup)
                  : renderField(fieldOrGroup)
              )}
              {error && <Alert color="red">{error}</Alert>}
              
              {/* Рендерим карточки файлов в нижней части формы (только если есть fileFields) */}
              {fields.some(field => field.type === 'file' && field.fileFields && field.fileFields.length > 0) && (
                <div className="file-cards-section">
                  {fields
                    .filter(field => field.type === 'file' && field.fileFields && field.fileFields.length > 0)
                    .map(field => (
                      attachmentsMap[field.name] && attachmentsMap[field.name].length > 0 && (
                        <div key={`${field.name}-cards`} style={{ marginBottom: '24px' }}>
                          <Text fw={600} size="lg" mb="md" style={{ color: 'var(--theme-text-primary)' }}>
                            📋 {typeof field.label === 'function' ? field.label(form.values) : field.label} ({attachmentsMap[field.name].length})
                          </Text>
                          <div 
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '16px',
                              padding: '8px 0 16px 0',
                            }}
                            className="file-cards-vertical"
                          >
                            {attachmentsMap[field.name].map((file: any, index: number) => (
                              <div
                                key={file.id || index}
                                style={{
                                  width: '100%'
                                }}
                              >
                                <FileFieldsCard
                                  file={file}
                                  index={index}
                                  fileFields={field.fileFields || []}
                                  form={form}
                                  setFieldValue={form.setFieldValue}
                                  fileAttachments={fileAttachments}
                                  onFileAttachmentsChange={onFileAttachmentsChange}
                                  attachmentLabel={attachmentLabel}
                                  attachmentAccept={attachmentAccept}
                                  fileCardTitle={fileCardTitle}
                                  existingDocuments={existingDocuments?.[file.id] || []}
                                  onDeleteExistingDocument={onDeleteExistingDocument}
                                  handleMetaChangeFor={handleMetaChangeFor}
                                  onRemove={() => handleRemoveAttachmentFor(field.name)(file.id)}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    ))
                  }
                </div>
              )}
            </Stack>
          </form>
        );
      }
    }
  }, [mode, viewFieldsConfig, initialValues, renderViewField, renderAttachmentCard, onClose, onConfirm, form, onSubmit, fields, renderField, renderFieldGroup, groupFields, error, hideDefaultViewAttachments, viewExtraContent, attachmentsMap, fileAttachments, onFileAttachmentsChange, attachmentLabel, attachmentAccept, fileCardTitle, existingDocuments, onDeleteExistingDocument]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Escape закрывает модальное окно (уже обрабатывается Mantine)
    if (e.key === 'Escape') {
      handleClose();
    }
    // Enter на форме отправляет форму
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const formElement = document.querySelector('form');
      if (formElement) {
        formElement.requestSubmit();
      }
    }
  }, [handleClose]);

  // Focus management - фокус на первый инпут при открытии
  useEffect(() => {
    if (opened && mode !== 'view') {
      // Небольшая задержка для корректного фокуса
      setTimeout(() => {
        const firstInput = document.querySelector('.form-modal input:not([type="hidden"]), .form-modal textarea, .form-modal select') as HTMLElement;
        if (firstInput) {
          firstInput.focus();
        }
      }, 100);
    }
  }, [opened, mode]);

  return (
    <>
    <Modal 
      opened={opened} 
      onClose={handleClose} 
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
      // ARIA атрибуты для доступности
      aria-labelledby="modal-title"
      aria-describedby="modal-description"
      role="dialog"
      aria-modal="true"
      onKeyDown={handleKeyDown}
      styles={fullScreen ? {
        content: {
          width: '100vw',
          maxWidth: '100vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column'
        },
        body: {
          width: '100%',
          padding: 0,
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }
      } : {
        content: {
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        },
        body: {
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }
      }}
    >
      <div 
        id="modal-description"
        role="region"
        aria-label="Содержимое модального окна"
        style={{ 
          flex: 1, 
          overflow: 'auto', 
          padding: 'var(--mantine-spacing-md)',
          margin: '0',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
      {modalContent}
      </div>
      {!hideButtons && mode !== 'view' && (
        <div style={{
          padding: 'var(--mantine-spacing-lg) var(--mantine-spacing-md)',
          borderTop: '1px solid var(--theme-border-primary)',
          background: 'var(--theme-bg-elevated)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 'var(--mantine-spacing-md)',
          borderRadius: '0 0 var(--mantine-radius-lg) var(--mantine-radius-lg)'
        }} className="modal-footer">
          <Button 
            variant="default" 
            onClick={() => { initializedRef.current = false; onClose(); }}
          >
            {cancelButtonText || 'Отмена'}
          </Button>
          <Button 
            type="submit"
            color={mode === 'delete' ? 'red' : undefined}
            loading={loading}
            onClick={() => {
              if (mode === 'delete' && onConfirm) {
                onConfirm();
              } else {
                const formElement = document.querySelector('form');
                if (formElement) {
                  formElement.requestSubmit();
                }
              }
            }}
          >
            {submitButtonText || (mode === 'create' ? 'Создать' : mode === 'delete' ? 'Удалить' : 'Сохранить')}
          </Button>
        </div>
      )}
    </Modal>
    
      {/* FilePreviewModal на уровне DynamicFormModal */}
      <FilePreviewModal
        opened={previewId !== null}
        onClose={() => {
          setPreviewId(null);
        }}
        attachments={(() => {
          if (!previewId) {
            return [];
          }
          const base: any[] = (initialValues as any)[attachmentsKey] || [];
          const extras: any[] = (viewSecondaryAttachments || []).flatMap(s => s.list || []);
          const all = [...base, ...extras];
          const mapped = all.map((a: any) => {
            const previewUrl = (a as any).previewUrl;
            // Если previewUrl не является полным URL, не передаем его, чтобы сработал fallback
            const validPreviewUrl = previewUrl && (previewUrl.startsWith('http') || previewUrl.startsWith('blob:'))
              ? previewUrl
              : undefined;
            return {
              id: String(a.id || `temp-${Math.random().toString(36).slice(2, 11)}`),
              name: typeof a.source === 'string' ? (a.source.split('\\').pop()?.split('/').pop() || 'Файл') : (a.source?.name || 'Файл'),
              source: typeof a.source === 'string' ? a.source : (a.source || ''),
              previewUrl: validPreviewUrl,
            };
          });
          return mapped;
        })()}
      />
    </>
  );
};