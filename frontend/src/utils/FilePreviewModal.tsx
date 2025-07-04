import { Modal, Image, Button, Loader, Stack, Text, Group, Paper } from '@mantine/core';
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
const SUPPORTED_PDF_EXTS = ['pdf'];
const SUPPORTED_TEXT_EXTS = ['txt', 'csv', 'json', 'xml'];

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
  const [activeTab, setActiveTab] = useState<string | null>('preview');
  const [fileContent, setFileContent] = useState<string>('');
  const currentAttachment = attachments[currentIndex];

  const {
    isImage,
    isPdf,
    isText,
    isAudio,
    isVideo,
    fileName,
    fileUrl,
    fileExt
  } = useMemo(() => {
    if (!currentAttachment) {
      return {
        ext: '',
        isImage: false,
        isPdf: false,
        isText: false,
        isAudio: false,
        isVideo: false,
        fileName: '',
        fileUrl: '',
        fileExt: ''
      };
    }

    const source = currentAttachment.source;
    const ext = typeof source === 'string'
      ? source.split('.').pop()?.toLowerCase() || ''
      : source.name.split('.').pop()?.toLowerCase() || '';

    const isImage = SUPPORTED_IMAGE_EXTS.includes(ext);
    const isPdf = SUPPORTED_PDF_EXTS.includes(ext);
    const isText = SUPPORTED_TEXT_EXTS.includes(ext);
    const isAudio = SUPPORTED_AUDIO_EXTS.includes(ext);
    const isVideo = SUPPORTED_VIDEO_EXTS.includes(ext);

    return {
      ext,
      isImage,
      isPdf,
      isText,
      isAudio,
      isVideo,
      fileName: typeof source === 'string'
        ? decodeURIComponent(source.split('\\').pop() || source.split('/').pop() || 'Файл')
        : source.name,
      fileUrl: typeof source === 'string'
        ? `${apiBaseUrl}/${source}`
        : URL.createObjectURL(source),
      fileExt: ext
    };
  }, [currentAttachment, apiBaseUrl]);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => {
      const nextIndex = prev < attachments.length - 1 ? prev + 1 : prev;
      return nextIndex;
    });
    setLoading(true);
    setActiveTab('preview');
  }, [attachments.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex(prev => {
      const prevIndex = prev > 0 ? prev - 1 : prev;
      return prevIndex;
    });
    setLoading(true);
    setActiveTab('preview');
  }, []);

  const handleFileSelect = (index: number) => {
    setCurrentIndex(index);
    setLoading(true);
    setActiveTab('preview');
  };

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

    if (isText && typeof currentAttachment.source === 'string') {
      fetch(fileUrl)
        .then(response => response.text())
        .then(text => {
          setFileContent(text);
          setLoading(false);
        })
        .catch(() => {
          setError(true);
        });
    } else if (isText && currentAttachment.source instanceof File) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFileContent(event.target?.result as string);
        setLoading(false);
      };
      reader.readAsText(currentAttachment.source);
    } else {
      const timer = setTimeout(() => setLoading(false), 500);
      return () => clearTimeout(timer);
    }

    return () => {
      if (typeof currentAttachment.source !== 'string') {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [currentAttachment, fileUrl, isText]);

  if (!opened || attachments.length === 0) return null;

  const FileNavigation = () => (
    <Group justify="space-between" align="center" mt="md">
      <Button
        disabled={currentIndex <= 0}
        onClick={handlePrev}
        variant="outline"
      >
        Предыдущий
      </Button>
      <Text fw={500}>
        {currentIndex + 1} из {attachments.length}
      </Text>
      <Button
        disabled={currentIndex >= attachments.length - 1}
        onClick={handleNext}
        variant="outline"
      >
        Следующий
      </Button>
    </Group>
  );

  const FileSelector = () => (
    <Group gap="xs">
      {attachments.map((attachment, index) => {
        const src = typeof attachment.source === 'string'
          ? attachment.source.split('\\').pop() || attachment.source.split('/').pop() || 'Файл'
          : attachment.source.name;
        return (
          <Button
            key={attachment.id || `attachment-${index}`}
            variant={currentIndex === index ? 'filled' : 'outline'}
            size="xs"
            onClick={() => handleFileSelect(index)}
            title={src}
          >
            {index === currentIndex ? `✓ ${src.substring(0, 15)}${src.length > 15 ? '...' : ''}` : src.substring(0, 15) + (src.length > 15 ? '...' : '')}
          </Button>
        );
      })}
    </Group>
  );

  const DownloadButton = () => (
    <Button
      component="a"
      href={fileUrl}
      download={fileName}
      target="_blank"
      rel="noopener noreferrer"
      variant="outline"
      size="xs"
    >
      Скачать файл
    </Button>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <Stack align="center" justify="center" style={{ minHeight: 400 }}>
          <Loader size="lg" />
          <Text>Загружается файл...</Text>
        </Stack>
      );
    }

    if (error) {
      return (
        <Stack align="center" justify="center" style={{ minHeight: 400 }}>
          <Text color="red">Не удалось открыть файл</Text>
        </Stack>
      );
    }

    if (isImage) {
      return (
        <Stack align="center" style={{ minHeight: 400 }}>
          <Image
            src={fileUrl}
            alt={fileName}
            fit="contain"
            style={{
              maxWidth: '100%',
              maxHeight: 'calc(100vh - 300px)',
              margin: 'auto'
            }}
            onLoad={() => setLoading(false)}
            onError={() => setError(true)}
          />
        </Stack>
      );
    }

    if (isPdf) {
      return (
        <Stack style={{ minHeight: 400 }}>
          <iframe
            title="PDF Viewer"
            src={`${fileUrl}#toolbar=0&navpanes=0`}
            style={{
              width: '100%',
              height: 'calc(100vh - 350px)',
              border: 'none',
              minHeight: 400
            }}
            onLoad={() => setLoading(false)}
            onError={() => setError(true)}
          />
        </Stack>
      );
    }

    if (isText) {
      return (
        <Stack style={{ minHeight: 400 }}>
          <Paper withBorder p="md" style={{
            width: '100%',
            height: 'calc(100vh - 300px)',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            fontFamily: 'monospace',
            backgroundColor: 'inherit'
          }}>
            <pre style={{ margin: 0 }}>
              {fileContent}
            </pre>
          </Paper>
        </Stack>
      );
    }

    if (isAudio) {
      return (
        <Stack align="center" justify="center" style={{ minHeight: 400 }}>
          <audio
            controls
            src={fileUrl}
            style={{ width: '100%', maxWidth: 400 }}
            onLoadedData={() => setLoading(false)}
            onError={() => setError(true)}
          >
            Ваш браузер не поддерживает элемент audio.
          </audio>
        </Stack>
      );
    }

    if (isVideo) {
      return (
        <Stack align="center" justify="center" style={{ minHeight: 400 }}>
          <video
            controls
            style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 300px)' }}
            src={fileUrl}
            onLoadedData={() => setLoading(false)}
            onError={() => setError(true)}
          >
            Ваш браузер не поддерживает видео.
          </video>
        </Stack>
      );
    }

    return (
      <Stack align="center" justify="center" style={{ minHeight: 400 }}>
        <Text>Формат файла {fileExt.toUpperCase()} не поддерживает встроенный просмотр.</Text>
      </Stack>
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      title={fileName}
      styles={{
        body: { padding: '0 1rem 1rem' },
        header: { padding: '1rem' },
      }}
    >
      <Stack gap="md">
        {renderContent()}
        <FileSelector />
        <DownloadButton />
        <FileNavigation />
      </Stack>
    </Modal>
  );
};
