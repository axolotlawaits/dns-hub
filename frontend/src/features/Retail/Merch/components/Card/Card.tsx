import { useMemo, useState, useRef, useCallback } from 'react';
import { 
  Title, 
  Group, 
  ActionIcon, 
  Tooltip, 
  Image, 
  SimpleGrid, 
  Text,
  Badge,
  Box,
  Paper,
  Loader
} from '@mantine/core';
import { 
  IconEdit, 
  IconTrash, 
  IconInfoCircle, 
  IconZoomIn, 
  IconEye,
  IconEyeOff,
  IconFileTypePdf,
} from '@tabler/icons-react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { CardItem } from '../../data/CardData';
import { FilePreviewModal } from '../../../../../utils/FilePreviewModal';
import { API } from '../../../../../config/constants';
import { truncateText } from '../../../../../utils/format';
import { formatDescriptionForTelegram } from '../../../../../utils/telegramFormatter';
import './Card.css';

// Настройка worker для PDF.js - используем unpkg вместо cdnjs
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}
// Теперь description уже в формате HTML

// Компонент для превью PDF в карточке
interface PdfCardPreviewProps {
  src: string;
}

const PdfCardPreview = ({ src }: PdfCardPreviewProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const onDocumentLoadSuccess = useCallback(() => {
    setLoading(false);
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('Error loading PDF:', error);
    setError(true);
    setLoading(false);
  }, []);

  const onPageLoadSuccess = useCallback(() => {
    setLoading(false);
  }, []);

  if (error) {
    return (
      <Box style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <IconFileTypePdf size={48} color="var(--mantine-color-red-6)" />
      </Box>
    );
  }

  return (
    <Box style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {loading && (
        <Box style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--mantine-color-gray-1)' }}>
          <Loader size="sm" />
        </Box>
      )}
      <Document
        file={src}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        loading={null}
      >
        <Page
          pageNumber={1}
          onLoadSuccess={onPageLoadSuccess}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          width={undefined}
          height={200}
          canvasRef={canvasRef}
        />
      </Document>
    </Box>
  );
};

//----------------------------Карточка
interface CardProps {
  cardData: CardItem;
  onEdit?: (card: CardItem) => void;
  onDelete?: (cardId: string) => void;
  onToggleActive?: (cardId: string, isActive: boolean) => void;
  searchQuery?: string;
  compact?: boolean;
}

function Card({ cardData, onEdit, onDelete, searchQuery = '', compact = false }: CardProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [zoomModalOpened, setZoomModalOpened] = useState(false);

  const CardEdit = () => {
    if (onEdit) {
      onEdit(cardData);
    }
  };
  
  const CardDelete = () => {
    if (onDelete) {
      onDelete(cardData.id);
    }
  };

  const fileMeta = useMemo(() => {
    // Используем attachments, если они есть, иначе fallback на imageUrls
    const attachments = cardData.attachments || cardData.imageUrls.map((url, idx) => ({
      id: `${cardData.id}-att-${idx}`,
      source: url,
      type: 'image' // По умолчанию считаем изображением
    }));

    return attachments.map((attachment, index) => {
      const source = attachment.source;
      const resolvedUrl = source.startsWith('http')
        ? source
        : `${API}/public/retail/merch/${source}`;

      const cleanPath = source.split('?')[0];
      const segments = cleanPath.split(/[\\\/]/);
      const fullFileName = decodeURIComponent(
        segments[segments.length - 1] || `file-${index + 1}`
      );

      const lastDotIndex = fullFileName.lastIndexOf('.');
      const baseName =
        lastDotIndex > 0 ? fullFileName.slice(0, lastDotIndex) : fullFileName;
      const extension =
        lastDotIndex > 0 ? fullFileName.slice(lastDotIndex + 1).toLowerCase() : '';

      // Определяем тип файла
      const isPdf = attachment.type === 'pdf' || extension === 'pdf';
      const mimeType = isPdf 
        ? 'application/pdf'
        : extension
          ? extension === 'jpg'
            ? 'image/jpeg'
            : `image/${extension}`
          : 'image/*';

      return {
        id: attachment.id || `${cardData.id}-file-${index}`,
        baseName,
        extension,
        resolvedUrl,
        isPdf,
        attachment: {
          id: attachment.id || `${cardData.id}-file-${index}`,
          name: baseName,
          source: resolvedUrl,
          mimeType
        }
      };
    });
  }, [cardData.id, cardData.imageUrls, cardData.attachments]);

  const openImageZoom = (index: number) => {
    setSelectedImageIndex(index);
    setZoomModalOpened(true);
  };

  const formatDate = (dateString: string | Date | null | undefined) => {
    if (!dateString) return 'Не указано';
    try {
      const date = dateString instanceof Date ? dateString : new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Неверная дата';
      }
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch (error) {
      console.error('Ошибка форматирования даты:', error, dateString);
      return 'Неверная дата';
    }
  };

  // Описание форматируем так же, как в Telegram-превью (переносы сохраняются)
  const formattedDescription = useMemo(
    () => formatDescriptionForTelegram(cardData.description || ''),
    [cardData.description]
  );

  if (compact) {
    // Компактный режим для сетки
    return (
      <Paper 
        withBorder
        radius="md" 
        p="md" 
        className="card-container"
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        {/* Заголовок */}
        <Group justify="space-between" mb="xs" align="flex-start" wrap="nowrap">
          <Title order={4} style={{ margin: 0, flex: 1 }} lineClamp={2}>
            {searchQuery.trim() ? (
              (() => {
                const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                const parts = truncateText(cardData.name, 30).split(regex);
                return parts.map((part, index) => 
                  regex.test(part) ? (
                    <mark key={index} style={{ 
                      backgroundColor: 'var(--mantine-color-yellow-3)', 
                      color: 'var(--mantine-color-dark-9)',
                      padding: '0 2px',
                      borderRadius: '2px'
                    }}>
                      {part}
                    </mark>
                  ) : part
                );
              })()
            ) : (
              truncateText(cardData.name, 30)
            )}
          </Title>
          <Badge 
            color={cardData.isActive ? 'green' : 'gray'} 
            variant="light"
            size="xs"
          >
            {cardData.isActive ? '✓' : '✗'}
          </Badge>
        </Group>

        {/* Первое изображение или PDF */}
        {fileMeta.length > 0 && (
          <Box mb="xs" style={{ flex: 1, minHeight: 150, position: 'relative' }}>
            {fileMeta[0].isPdf ? (
              <Box
                style={{
                  width: '100%',
                  height: 150,
                  position: 'relative',
                  backgroundColor: 'var(--mantine-color-gray-1)',
                  borderRadius: 'var(--mantine-radius-md)',
                  border: '1px solid var(--mantine-color-gray-3)',
                  cursor: 'pointer',
                  overflow: 'hidden'
                }}
                onClick={() => openImageZoom(0)}
              >
                <PdfCardPreview src={fileMeta[0].resolvedUrl} />
              </Box>
            ) : (
              <Image
                src={fileMeta[0].resolvedUrl}
                alt={fileMeta[0].baseName}
                height={150}
                fit="cover"
                radius="md"
                style={{ cursor: 'pointer' }}
                onClick={() => openImageZoom(0)}
              />
            )}
            {fileMeta.length > 1 && (
              <Badge 
                size="xs" 
                variant="filled" 
                style={{ position: 'absolute', top: 8, right: 8 }}
              >
                +{fileMeta.length - 1}
              </Badge>
            )}
          </Box>
        )}

        {/* Описание (сокращенное) */}
        {cardData.description && (
          <Text size="xs" c="dimmed" lineClamp={2} mb="xs">
            {cardData.description.replace(/<[^>]*>/g, '').substring(0, 100)}
            {cardData.description.length > 100 ? '...' : ''}
          </Text>
        )}

        {/* Кнопки действий */}
        <Group justify="flex-end" gap="xs" mt="auto">
          {onEdit && (
            <ActionIcon 
              variant="subtle" 
              color="blue"
              size="sm"
              onClick={CardEdit}
            >
              <IconEdit size={14} />
            </ActionIcon>
          )}
          {onDelete && (
            <ActionIcon 
              variant="subtle" 
              color="red"
              size="sm"
              onClick={CardDelete}
            >
              <IconTrash size={14} />
            </ActionIcon>
          )}
        </Group>

        {/* Модальное окно для просмотра файлов */}
        <FilePreviewModal
          opened={zoomModalOpened}
          onClose={() => {
            setZoomModalOpened(false);
            setSelectedImageIndex(null);
          }}
          attachments={fileMeta.map(meta => meta.attachment)}
          initialIndex={selectedImageIndex || 0}
        />
      </Paper>
    );
  }

  return (
    <Paper 
      withBorder
      radius="md" 
      p="lg" 
      mb="md"
      className="card-container"
    >
      {/* Заголовок с кнопками */}
      <Group justify="space-between" mb="md" align="center">
        <Group>
          <Title order={3} style={{ margin: 0 }}>
            {searchQuery.trim() ? (
              (() => {
                const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                const parts = truncateText(cardData.name, 50).split(regex);
                return parts.map((part, index) => 
                  regex.test(part) ? (
                    <mark key={index} style={{ 
                      backgroundColor: 'var(--mantine-color-yellow-3)', 
                      color: 'var(--mantine-color-dark-9)',
                      padding: '0 2px',
                      borderRadius: '2px'
                    }}>
                      {part}
                    </mark>
                  ) : part
                );
              })()
            ) : (
              truncateText(cardData.name, 50)
            )}
          </Title>
          <Badge 
            color={cardData.isActive ? 'green' : 'gray'} 
            variant="light"
            leftSection={cardData.isActive ? <IconEye size={12} /> : <IconEyeOff size={12} />}
          >
            {cardData.isActive ? 'Активна' : 'Неактивна'}
          </Badge>
        </Group>
        
        <Group gap="xs">
          {onEdit && (
            <Tooltip label="Редактировать" withArrow>
              <ActionIcon 
                variant="outline" 
                color="blue"
                onClick={CardEdit}
              >
                <IconEdit size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          
          {onDelete && (
            <Tooltip label="Удалить" withArrow>
              <ActionIcon 
                variant="outline" 
                color="red"
                onClick={CardDelete}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>

      {/* Описание */}
      {cardData.description && (
        <Box mb="md" className="card-description">
          <Text size="sm" c="dimmed" mb="xs">
            <IconInfoCircle size={14} style={{ marginRight: 4 }} />
            Описание:
          </Text>
          <div 
            dangerouslySetInnerHTML={{ 
              __html: formattedDescription 
            }}
            className="card-description-content"
          />
        </Box>
      )}

      {/* Файлы (изображения и PDF) */}
      {fileMeta.length > 0 && (
        <Box mb="md">
          <Text size="sm" c="dimmed" mb="xs">
            Файлы ({fileMeta.length}):
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {fileMeta.map((meta, index) => (
              <Box
                key={meta.id}
                className="card-image-container"
              >
                {meta.isPdf ? (
                  // Отображение PDF файла с превью
                  <Box
                    style={{
                      width: '100%',
                      height: 200,
                      position: 'relative',
                      backgroundColor: 'var(--mantine-color-gray-1)',
                      borderRadius: 'var(--mantine-radius-md)',
                      border: '1px solid var(--mantine-color-gray-3)',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                    onClick={() => openImageZoom(index)}
                  >
                    {/* Превью PDF через react-pdf */}
                    <PdfCardPreview src={meta.resolvedUrl} />
                    {/* Overlay с иконкой и информацией */}
                    <Box
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        opacity: 0,
                        transition: 'opacity 0.2s',
                        pointerEvents: 'none'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0';
                      }}
                    >
                      <IconFileTypePdf size={48} color="white" />
                      <Text size="sm" mt="xs" c="white" fw={500}>
                        {meta.baseName}
                      </Text>
                      <Text size="xs" c="white">
                        PDF
                      </Text>
                    </Box>
                    <ActionIcon
                      size="sm"
                      variant="filled"
                      color="blue"
                      className="card-image-zoom-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openImageZoom(index);
                      }}
                    >
                      <IconZoomIn size={12} />
                    </ActionIcon>
                  </Box>
                ) : (
                  // Отображение изображения
                  <>
                    <Image
                      src={meta.resolvedUrl}
                      alt={`${cardData.name} - изображение ${index + 1}`}
                      className="card-image"
                      onClick={() => openImageZoom(index)}
                      loading="lazy"
                    />
                    <ActionIcon
                      size="sm"
                      variant="filled"
                      color="blue"
                      className="card-image-zoom-button"
                      onClick={() => openImageZoom(index)}
                    >
                      <IconZoomIn size={12} />
                    </ActionIcon>
                  </>
                )}
                <Box style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Text
                    size="sm"
                    className="card-image-name"
                    lineClamp={2}
                    title={meta.baseName}
                  >
                    {meta.baseName}
                  </Text>
                  <Text
                    size="xs"
                    c="dimmed"
                    className="card-image-extension"
                  >
                    {meta.extension ? meta.extension.toUpperCase() : 'Формат не указан'}
                  </Text>
                </Box>
              </Box>
            ))}
          </SimpleGrid>
        </Box>
      )}

      {/* Метаинформация */}
      <Group justify="space-between" mt="md" pt="md" className="card-meta-divider">
        <Group gap="md">
          <Text size="xs" c="dimmed">
            Категория: {cardData.category.name}
          </Text>
          <Text size="xs" c="dimmed">
            Файлов: {fileMeta.length}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          Создано: {formatDate(cardData.createdAt)}
        </Text>
      </Group>

      {/* Модалка для просмотра файлов (изображения и PDF) */}
      <FilePreviewModal
        opened={zoomModalOpened}
        onClose={() => setZoomModalOpened(false)}
        attachments={fileMeta.map((meta) => meta.attachment)}
        initialIndex={selectedImageIndex ?? 0}
      />
    </Paper>
  );
}

export default Card;
