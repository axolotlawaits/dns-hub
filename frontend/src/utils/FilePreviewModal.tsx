import { Modal, Image, Button, Loader, Stack, Text, Group } from '@mantine/core';
import { useState, useEffect, useMemo, useCallback } from 'react';

interface Attachment {
  id: string;
  source: string | File;
}

interface FilePreviewModalProps {
  opened: boolean;
  onClose: () => void;
  attachments: Attachment[];
  initialIndex?: number;
  apiBaseUrl?: string;
}

const SUPPORTED_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const SUPPORTED_AUDIO_EXTS = ['mp3', 'ogg', 'wav'];
const SUPPORTED_VIDEO_EXTS = ['mp4', 'webm', 'ogg'];

export const FilePreviewModal = ({
  opened,
  onClose,
  attachments,
  initialIndex = 0,
  apiBaseUrl = 'http://localhost:2000/hub-api/'
}: FilePreviewModalProps) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const currentAttachment = attachments[currentIndex];
  
  // Мемоизированные вычисления свойств файла
  const { isImage, isPdf, isText, isAudio, isVideo, fileName, fileUrl } = useMemo(() => {
    if (!currentAttachment) {
      return {
        ext: '',
        isImage: false,
        isPdf: false,
        isText: false,
        isAudio: false,
        isVideo: false,
        fileName: '',
        fileUrl: ''
      };
    }

    const source = currentAttachment.source;
    const ext = typeof source === 'string'
      ? source.split('.').pop()?.toLowerCase() || ''
      : source.name.split('.').pop()?.toLowerCase() || '';

    return {
      ext,
      isImage: SUPPORTED_IMAGE_EXTS.includes(ext),
      isPdf: ext === 'pdf',
      isText: ext === 'txt',
      isAudio: SUPPORTED_AUDIO_EXTS.includes(ext),
      isVideo: SUPPORTED_VIDEO_EXTS.includes(ext),
      fileName: typeof source === 'string'
        ? decodeURIComponent(source.split('\\').pop() || 'Файл')
        : source.name,
      fileUrl: typeof source === 'string'
        ? `${apiBaseUrl}/${source}`
        : URL.createObjectURL(source)
    };
  }, [currentAttachment, apiBaseUrl]);

  // Обработчики навигации с useCallback
  const handleNext = useCallback(() => {
    setCurrentIndex(prev => (prev < attachments.length - 1 ? prev + 1 : prev));
  }, [attachments.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : prev));
  }, []);

  // Эффекты для управления состоянием загрузки и очистки URL
  useEffect(() => {
    if (!opened) {
      setCurrentIndex(initialIndex);
      setLoading(true);
      setError(false);
    }
  }, [opened, initialIndex]);

  useEffect(() => {
    if (!currentAttachment) return;

    setLoading(true);
    const timer = setTimeout(() => setLoading(false), 500);

    return () => {
      clearTimeout(timer);
      if (typeof currentAttachment.source !== 'string') {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [currentAttachment, fileUrl]);

  if (!currentAttachment) return null;

  // Общий компонент для навигации между файлами
  const FileNavigation = () => (
    <Group mt="auto">
      <Button disabled={currentIndex <= 0} onClick={handlePrev}>
        Предыдущий
      </Button>
      <Text>{`${currentIndex + 1} из ${attachments.length}`}</Text>
      <Button disabled={currentIndex >= attachments.length - 1} onClick={handleNext}>
        Следующий
      </Button>
    </Group>
  );

  // Компонент для скачивания файла
  const DownloadButton = () => (
    <Button component="a" href={fileUrl} target="_blank" rel="noopener noreferrer">
      Скачать файл
    </Button>
  );

  // Рендер содержимого в зависимости от типа файла
  const renderContent = () => {
    if (loading) {
      return (
        <Stack align="center" justify="center" h="90vh">
          <Loader size="lg" />
          <Text>Загружается файл...</Text>
        </Stack>
      );
    }

    if (error) {
      return (
        <Stack align="center" justify="center" h="90vh">
          <Text color="red">Не удалось открыть файл</Text>
          <DownloadButton />
        </Stack>
      );
    }

    if (isImage) {
      return (
        <Stack align="center" h="90vh">
          <Image 
            src={fileUrl} 
            alt={fileName} 
            fit="contain" 
            style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 60px)' }} 
            onLoad={() => setLoading(false)}
            onError={() => setError(true)}
          />
          <FileNavigation />
        </Stack>
      );
    }

    if (isPdf || isText) {
      return (
        <Stack h="90vh">
          <iframe
            title={`${isPdf ? 'PDF' : 'Text'} Viewer`}
            src={fileUrl}
            style={{ 
              width: '100%', 
              height: '100%', 
              border: 'none',
              ...(isText && { fontFamily: 'monospace' })
            }}
            onLoad={() => setLoading(false)}
            onError={() => setError(true)}
          />
          <FileNavigation />
        </Stack>
      );
    }

    if (isAudio) {
      return (
        <Stack align="center" justify="center" h="90vh">
          <audio controls src={fileUrl}>
            Ваш браузер не поддерживает элемент audio.
          </audio>
          <FileNavigation />
        </Stack>
      );
    }

    if (isVideo) {
      return (
        <Stack align="center" justify="center" h="90vh">
          <video controls style={{ maxWidth: '80%', maxHeight: '80%' }} src={fileUrl}>
            Ваш браузер не поддерживает видео.
          </video>
          <FileNavigation />
        </Stack>
      );
    }

    return (
      <Stack align="center" justify="center" h="90vh">
        <Text>Формат файла не поддерживает встроенный просмотр.</Text>
        <DownloadButton />
      </Stack>
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} fullScreen title={fileName}>
      {renderContent()}
    </Modal>
  );
};