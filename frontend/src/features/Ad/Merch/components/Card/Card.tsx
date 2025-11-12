import { useMemo, useState } from 'react';
import { 
  Title, 
  Group, 
  ActionIcon, 
  Tooltip, 
  Image, 
  SimpleGrid, 
  Text,
  Badge,
  Switch,
  Box,
  Paper
} from '@mantine/core';
import { 
  IconEdit, 
  IconTrash, 
  IconInfoCircle, 
  IconZoomIn, 
  IconEye,
  IconEyeOff
} from '@tabler/icons-react';
import type { CardItem } from '../../data/CardData';
import { toggleCardActive } from '../../data/CardData';
import { FilePreviewModal } from '../../../../../utils/FilePreviewModal';
import { API } from '../../../../../config/constants';
import { truncateText } from '../../../../../utils/format';
// Теперь description уже в формате HTML

//----------------------------Карточка
interface CardProps {
  cardData: CardItem;
  onEdit?: (card: CardItem) => void;
  onDelete?: (cardId: string) => void;
  onToggleActive?: (cardId: string, isActive: boolean) => void;
}

function Card({ cardData, onEdit, onDelete, onToggleActive }: CardProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [zoomModalOpened, setZoomModalOpened] = useState(false);
  const [isActiveLoading, setIsActiveLoading] = useState(false);

  const CardEdit = () => {
    if (onEdit) {
      onEdit(cardData);
    } else {
      alert(`Редактирование карточки: ${cardData.name}`);
    }
  };
  
  const CardDelete = () => {
    if (onDelete) {
      onDelete(cardData.id);
    } else {
      alert(`Удаление карточки: ${cardData.name}`);
    }
  };

  const handleToggleActive = async (checked: boolean) => {
    if (onToggleActive) {
      onToggleActive(cardData.id, checked);
    } else {
      try {
        setIsActiveLoading(true);
        await toggleCardActive(cardData.id, checked);
      } catch (error) {
        console.error('Ошибка при переключении статуса:', error);
      } finally {
        setIsActiveLoading(false);
      }
    }
  };

  const imageMeta = useMemo(() => {
    return (cardData.imageUrls || []).map((imageUrl, index) => {
      const resolvedUrl = imageUrl.startsWith('http')
        ? imageUrl
        : `${API}/public/add/merch/${imageUrl}`;

      const cleanPath = imageUrl.split('?')[0];
      const segments = cleanPath.split(/[\\\/]/);
      const fullFileName = decodeURIComponent(
        segments[segments.length - 1] || `file-${index + 1}`
      );

      const lastDotIndex = fullFileName.lastIndexOf('.');
      const baseName =
        lastDotIndex > 0 ? fullFileName.slice(0, lastDotIndex) : fullFileName;
      const extension =
        lastDotIndex > 0 ? fullFileName.slice(lastDotIndex + 1).toLowerCase() : '';

      const mimeType = extension
        ? extension === 'jpg'
          ? 'image/jpeg'
          : `image/${extension}`
        : 'image/*';

      return {
        id: `${cardData.id}-image-${index}`,
        baseName,
        extension,
        resolvedUrl,
        attachment: {
          id: `${cardData.id}-image-${index}`,
          name: baseName,
          source: resolvedUrl,
          mimeType
        }
      };
    });
  }, [cardData.id, cardData.imageUrls]);

  const openImageZoom = (index: number) => {
    setSelectedImageIndex(index);
    setZoomModalOpened(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Description уже в формате HTML
  const formattedDescription = cardData.description || '';

  return (
    <Paper 
      withBorder
      radius="md" 
      p="lg" 
      mb="md"
      style={{ 
        background: 'var(--theme-bg-elevated)',
        border: '1px solid var(--theme-border-primary)',
        boxShadow: 'var(--theme-shadow-sm)'
      }}
    >
      {/* Заголовок с кнопками */}
      <Group justify="space-between" mb="md">
        <Group>
          <Title order={3} style={{ margin: 0 }}>
            {truncateText(cardData.name, 50)}
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
          <Tooltip label="Переключить активность" withArrow>
            <Switch
              checked={cardData.isActive}
              onChange={(event) => handleToggleActive(event.currentTarget.checked)}
              disabled={isActiveLoading}
              size="sm"
            />
          </Tooltip>
          
          <Tooltip label="Редактировать" withArrow>
            <ActionIcon 
              variant="outline" 
              color="blue"
              onClick={CardEdit}
            >
              <IconEdit size={16} />
            </ActionIcon>
          </Tooltip>
          
          <Tooltip label="Удалить" withArrow>
            <ActionIcon 
              variant="outline" 
              color="red"
              onClick={CardDelete}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Описание */}
      {cardData.description && (
        <Box mb="md" style={{ color: 'var(--theme-text-secondary)' }}>
          <Text size="sm" c="dimmed" mb="xs">
            <IconInfoCircle size={14} style={{ marginRight: 4 }} />
            Описание:
          </Text>
          <div 
            dangerouslySetInnerHTML={{ __html: formattedDescription }}
            style={{ 
              lineHeight: 1.5,
              fontSize: '14px'
            }}
          />
        </Box>
      )}

      {/* Изображения */}
      {imageMeta.length > 0 && (
        <Box mb="md">
          <Text size="sm" c="dimmed" mb="xs">
            Изображения ({imageMeta.length}):
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {imageMeta.map((meta, index) => (
              <Box
                key={meta.id}
                style={{
                  position: 'relative',
                  background: 'var(--theme-bg-primary)',
                  borderRadius: 12,
                  border: '1px solid var(--theme-border-primary)',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  height: '100%'
                }}
              >
                <Image
                  src={meta.resolvedUrl}
                  alt={`${cardData.name} - изображение ${index + 1}`}
                  style={{ 
                    cursor: 'pointer',
                    borderRadius: 8,
                    border: '1px solid var(--theme-border-primary)',
                    flexGrow: 1,
                    objectFit: 'cover'
                  }}
                  onClick={() => openImageZoom(index)}
                  loading="lazy"
                />
                <ActionIcon
                  size="sm"
                  variant="filled"
                  color="blue"
                  style={{
                    position: 'absolute',
                    top: 16,
                     right: 16,
                    opacity: 0.8
                  }}
                  onClick={() => openImageZoom(index)}
                >
                  <IconZoomIn size={12} />
                </ActionIcon>
                <Box style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Text
                    size="sm"
                    style={{
                      fontWeight: 600,
                      color: 'var(--theme-text-primary)'
                    }}
                    lineClamp={2}
                    title={meta.baseName}
                  >
                    {meta.baseName}
                  </Text>
                  <Text
                    size="xs"
                    c="dimmed"
                    style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}
                  >
                    {meta.extension ? meta.extension : 'Формат не указан'}
                  </Text>
                </Box>
              </Box>
            ))}
          </SimpleGrid>
        </Box>
      )}

      {/* Метаинформация */}
      <Group justify="space-between" mt="md" pt="md" style={{ borderTop: '1px solid var(--theme-border-primary)' }}>
        <Group gap="md">
          <Text size="xs" c="dimmed">
            Категория: {cardData.category.name}
          </Text>
          <Text size="xs" c="dimmed">
            Фотографий: {cardData.imageUrls.length}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          Создано: {formatDate(cardData.createdAt)}
        </Text>
      </Group>

      {/* Модалка для увеличенного просмотра изображения */}
      <FilePreviewModal
        opened={zoomModalOpened}
        onClose={() => setZoomModalOpened(false)}
        attachments={imageMeta.map((meta) => meta.attachment)}
        initialIndex={selectedImageIndex ?? 0}
      />
    </Paper>
  );
}

export default Card;
