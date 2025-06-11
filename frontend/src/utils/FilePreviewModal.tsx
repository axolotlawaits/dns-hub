import { Modal, Image, Button, Loader, Stack, Text, Group } from '@mantine/core';
import { useState, useEffect } from 'react';

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
  if (!currentAttachment) return null;

  // Получаем расширение файла
  const ext = typeof currentAttachment.source === 'string'
    ? currentAttachment.source.split('.').pop()?.toLowerCase() || ''
    : currentAttachment.source.name.split('.').pop()?.toLowerCase() || '';

  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
  const isPdf = ext === 'pdf';
  const isText = ext === 'txt';
  const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
  const isAudio = ['mp3', 'ogg', 'wav'].includes(ext);
  const isVideo = ['mp4', 'webm', 'ogg'].includes(ext);

  // Получаем имя файла
  const fileName = typeof currentAttachment.source === 'string'
    ? decodeURIComponent(currentAttachment.source.split('/').pop() || 'Файл')
    : currentAttachment.source.name;

  // Формируем URL
  const fileUrl = typeof currentAttachment.source === 'string'
    ? `${apiBaseUrl}/${currentAttachment.source}`
    : URL.createObjectURL(currentAttachment.source);

  const handleNext = () =>
    setCurrentIndex((prev) => (prev < attachments.length - 1 ? prev + 1 : prev));

  const handlePrev = () =>
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      setLoading(false);
    }, 500);

    return () => {
      clearTimeout(timer);
      if (typeof currentAttachment.source !== 'string') {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [fileUrl, currentAttachment.source]);

  useEffect(() => {
    if (!opened) {
      setCurrentIndex(initialIndex);
      setLoading(true);
      setError(false);
    }
  }, [opened, initialIndex]);

  return (
<Modal opened={opened} onClose={onClose} fullScreen title={fileName}>
      {/* Изображения */}
      {isImage && !loading && !error && (
        <Stack align="center" h="90vh">
          <Image 
            src={fileUrl} 
            alt={fileName} 
            fit="contain" 
            style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 60px)' }} 
            onLoad={() => setLoading(false)}
            onError={() => setError(true)}
          />
          <Group mt="auto">
            <Button disabled={currentIndex <= 0} onClick={handlePrev}>
              Предыдущий
            </Button>
            <Text>{`${currentIndex + 1} из ${attachments.length}`}</Text>
            <Button disabled={currentIndex >= attachments.length - 1} onClick={handleNext}>
              Следующий
            </Button>
          </Group>
        </Stack>
      )}

      {/* PDF файлы */}
      {isPdf && !loading && !error && (
        <Stack h="90vh">
          <iframe
            title="PDF Viewer"
            src={fileUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
            onLoad={() => setLoading(false)}
            onError={() => setError(true)}
          />
          <Group mt="auto">
            <Button disabled={currentIndex <= 0} onClick={handlePrev}>
              Предыдущий
            </Button>
            <Button disabled={currentIndex >= attachments.length - 1} onClick={handleNext}>
              Следующий
            </Button>
          </Group>
        </Stack>
      )}

      {/* Текстовые файлы */}
      {isText && !loading && !error && (
        <Stack h="90vh">
          <iframe
            title="TXT Viewer"
            src={fileUrl}
            style={{ width: '100%', height: '100%', border: 'none', fontFamily: 'monospace' }}
            onLoad={() => setLoading(false)}
            onError={() => setError(true)}
          />
          <Group mt="auto">
            <Button disabled={currentIndex <= 0} onClick={handlePrev}>
              Предыдущий
            </Button>
            <Button disabled={currentIndex >= attachments.length - 1} onClick={handleNext}>
              Следующий
            </Button>
          </Group>
        </Stack>
      )}

      {/* Office документы */}
      {isOffice && !loading && !error && (
        <Stack h="90vh">
          <iframe
            title="Office Viewer"
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`}
            style={{ width: '100%', height: '100%', border: 'none' }}
            frameBorder="0"
            onLoad={() => setLoading(false)}
            onError={() => setError(true)}
          />
          <Group mt="auto">
            <Button disabled={currentIndex <= 0} onClick={handlePrev}>
              Предыдущий
            </Button>
            <Button disabled={currentIndex >= attachments.length - 1} onClick={handleNext}>
              Следующий
            </Button>
          </Group>
        </Stack>
      )}

      {/* Аудио */}
      {isAudio && !loading && !error && (
        <Stack align="center" justify="center" h="90vh">
          <audio controls src={fileUrl}>
            Ваш браузер не поддерживает элемент audio.
          </audio>
          <Group>
            <Button disabled={currentIndex <= 0} onClick={handlePrev}>
              Предыдущий
            </Button>
            <Button disabled={currentIndex >= attachments.length - 1} onClick={handleNext}>
              Следующий
            </Button>
          </Group>
        </Stack>
      )}

      {/* Видео */}
      {isVideo && !loading && !error && (
        <Stack align="center" justify="center" h="90vh">
          <video controls style={{ maxWidth: '80%', maxHeight: '80%' }} src={fileUrl}>
            Ваш браузер не поддерживает видео.
          </video>
          <Group>
            <Button disabled={currentIndex <= 0} onClick={handlePrev}>
              Предыдущий
            </Button>
            <Button disabled={currentIndex >= attachments.length - 1} onClick={handleNext}>
              Следующий
            </Button>
          </Group>
        </Stack>
      )}

      {/* Индикатор загрузки */}
      {loading && (
        <Stack align="center" justify="center" h="90vh">
          <Loader size="lg" />
          <Text>Загружается файл...</Text>
        </Stack>
      )}

      {/* Ошибка */}
      {error && (
        <Stack align="center" justify="center" h="90vh">
          <Text color="red">Не удалось открыть файл</Text>
          <Button component="a" href={fileUrl} target="_blank" rel="noopener noreferrer">
            Скачать напрямую
          </Button>
        </Stack>
      )}

      {/* Неподдерживаемые форматы */}
      {!isImage && !isPdf && !isText && !isOffice && !isAudio && !isVideo && !loading && !error && (
        <Stack align="center" justify="center" h="90vh">
          <Text>Формат файла не поддерживает встроенный просмотр.</Text>
          <Button component="a" href={fileUrl} target="_blank" rel="noopener noreferrer">
            Скачать файл
          </Button>
        </Stack>
      )}
    </Modal>
  );
};