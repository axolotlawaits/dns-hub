import { useState } from 'react';
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
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
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

  const openImageZoom = (imageUrl: string) => {
    setSelectedImage(imageUrl);
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
      {cardData.imageUrls && cardData.imageUrls.length > 0 && (
        <Box mb="md">
          <Text size="sm" c="dimmed" mb="xs">
            Изображения ({cardData.imageUrls.length}):
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {cardData.imageUrls.map((imageUrl, index) => (
              <Box key={index} style={{ position: 'relative' }}>
                <Image
                  src={imageUrl.startsWith('http') ? imageUrl : `${API}/public/add/merch/${imageUrl}`}
                  alt={`${cardData.name} - изображение ${index + 1}`}
                  style={{ 
                    cursor: 'pointer',
                    borderRadius: 8,
                    border: '1px solid #e0e0e0'
                  }}
                  onClick={() => openImageZoom(imageUrl)}
                  loading="lazy"
                />
                <ActionIcon
                  size="sm"
                  variant="filled"
                  color="blue"
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    opacity: 0.8
                  }}
                  onClick={() => openImageZoom(imageUrl)}
                >
                  <IconZoomIn size={12} />
                </ActionIcon>
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
        attachments={selectedImage ? [{
          id: '1',
          name: 'Изображение',
          source: selectedImage.startsWith('http') ? selectedImage : `${API}/public/add/merch/${selectedImage}`,
          mimeType: 'image/jpeg'
        }] : []}
        initialIndex={0}
      />
    </Paper>
  );
}

export default Card;
