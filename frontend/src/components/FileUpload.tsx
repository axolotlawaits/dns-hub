import React, { useState, useCallback } from 'react';
import {  Paper,  Group,  Text,  Button,  Progress,  Stack,  Alert, ActionIcon, Badge } from '@mantine/core';
import {  IconUpload,  IconFile,  IconX,  IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { notificationSystem } from '../utils/Push';

interface FileUploadProps {
  branchJournalId: string;
  onUploadComplete?: (fileId: string) => void;
  onUploadError?: (error: string) => void;
  disabled?: boolean;
  uploadFile?: (branchJournalId: string, file: File) => Promise<{ success: boolean; data?: any; message?: string }>;
}

interface UploadFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  fileId?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  branchJournalId,
  onUploadComplete,
  onUploadError,
  disabled = false,
  uploadFile: uploadFileFn
}) => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const newFiles: UploadFile[] = Array.from(selectedFiles).map(file => ({
      file,
      id: generateId(),
      status: 'pending',
      progress: 0
    }));

    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (disabled) return;
    
    const droppedFiles = e.dataTransfer.files;
    handleFileSelect(droppedFiles);
  }, [disabled, handleFileSelect]);

  const uploadFile = async (uploadFile: UploadFile) => {
    try {
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'uploading', progress: 0 }
          : f
      ));

      if (!uploadFileFn) {
        throw new Error('Функция загрузки файла не предоставлена');
      }

      const result = await uploadFileFn(branchJournalId, uploadFile.file);
      
      if (result.success && result.data) {
        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { ...f, status: 'success', progress: 100, fileId: result.data!.file_id }
            : f
        ));
        
        notificationSystem.addNotification('Успех', `Файл "${uploadFile.file.name}" загружен успешно`, 'success');
        onUploadComplete?.(result.data.file_id);
      } else {
        throw new Error(result.message || 'Ошибка загрузки файла');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'error', error: errorMessage }
          : f
      ));
      
      notificationSystem.addNotification('Ошибка', `Ошибка загрузки файла "${uploadFile.file.name}": ${errorMessage}`, 'error');
      onUploadError?.(errorMessage);
    }
  };

  const uploadAllFiles = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    
    for (const file of pendingFiles) {
      await uploadFile(file);
    }
  };

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const retryUpload = (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file) {
      uploadFile(file);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: UploadFile['status']) => {
    switch (status) {
      case 'pending': return <IconFile size={16} />;
      case 'uploading': return <IconUpload size={16} />;
      case 'success': return <IconCheck size={16} color="green" />;
      case 'error': return <IconAlertCircle size={16} color="red" />;
    }
  };

  const getStatusColor = (status: UploadFile['status']) => {
    switch (status) {
      case 'pending': return 'blue';
      case 'uploading': return 'yellow';
      case 'success': return 'green';
      case 'error': return 'red';
    }
  };

  const pendingFiles = files.filter(f => f.status === 'pending');
  const hasFiles = files.length > 0;

  return (
    <Stack gap="md">
      {/* Область загрузки */}
      <Paper
        withBorder
        radius="md"
        p="xl"
        style={{
          border: isDragging ? '2px dashed var(--color-primary-500)' : '2px dashed var(--theme-border-primary)',
          background: isDragging ? 'var(--color-primary-50)' : 'var(--theme-bg-secondary)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          opacity: disabled ? 0.6 : 1
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && document.getElementById('file-input')?.click()}
      >
        <Stack gap="md" align="center">
          <IconUpload size={48} color={isDragging ? 'var(--color-primary-500)' : 'var(--theme-text-secondary)'} />
          <Stack gap="xs" align="center">
            <Text size="lg" fw={500} style={{ color: 'var(--theme-text-primary)' }}>
              {isDragging ? 'Отпустите файлы для загрузки' : 'Перетащите файлы сюда или нажмите для выбора'}
            </Text>
            <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
              Поддерживаются все типы файлов
            </Text>
          </Stack>
        </Stack>
      </Paper>

      {/* Скрытый input для выбора файлов */}
      <input
        id="file-input"
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFileSelect(e.target.files)}
        disabled={disabled}
      />

      {/* Список файлов */}
      {hasFiles && (
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Text size="md" fw={500} style={{ color: 'var(--theme-text-primary)' }}>
              Файлы для загрузки ({files.length})
            </Text>
            {pendingFiles.length > 0 && (
              <Button
                size="sm"
                onClick={uploadAllFiles}
                disabled={disabled}
                leftSection={<IconUpload size={16} />}
              >
                Загрузить все
              </Button>
            )}
          </Group>

          {files.map((file) => (
            <Paper
              key={file.id}
              withBorder
              radius="md"
              p="md"
              style={{
                background: 'var(--theme-bg-primary)',
                border: `1px solid var(--theme-border-${getStatusColor(file.status)})`
              }}
            >
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Group gap="sm" align="center">
                    {getStatusIcon(file.status)}
                    <Stack gap={2}>
                      <Text size="sm" fw={500} style={{ color: 'var(--theme-text-primary)' }}>
                        {file.file.name}
                      </Text>
                      <Text size="xs" style={{ color: 'var(--theme-text-secondary)' }}>
                        {formatFileSize(file.file.size)}
                      </Text>
                    </Stack>
                  </Group>
                  
                  <Group gap="xs">
                    <Badge
                      color={getStatusColor(file.status)}
                      variant="light"
                      size="sm"
                    >
                      {file.status === 'pending' && 'Ожидает'}
                      {file.status === 'uploading' && 'Загрузка...'}
                      {file.status === 'success' && 'Загружен'}
                      {file.status === 'error' && 'Ошибка'}
                    </Badge>
                    
                    {file.status === 'error' && (
                      <ActionIcon
                        size="sm"
                        color="blue"
                        variant="light"
                        onClick={() => retryUpload(file.id)}
                        disabled={disabled}
                      >
                        <IconUpload size={14} />
                      </ActionIcon>
                    )}
                    
                    <ActionIcon
                      size="sm"
                      color="red"
                      variant="light"
                      onClick={() => removeFile(file.id)}
                      disabled={file.status === 'uploading'}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  </Group>
                </Group>

                {/* Прогресс загрузки */}
                {file.status === 'uploading' && (
                  <Progress
                    value={file.progress}
                    size="sm"
                    radius="md"
                    color="blue"
                  />
                )}

                {/* Ошибка */}
                {file.status === 'error' && file.error && (
                  <Alert color="red" icon={<IconAlertCircle size={16} />}>
                    {file.error}
                  </Alert>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
};

export default FileUpload;