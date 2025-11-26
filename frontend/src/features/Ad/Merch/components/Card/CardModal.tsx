import { useState, useEffect, useRef } from 'react';
import { 
  Button, 
  TextInput, 
  Container, 
  Group, 
  Alert, 
  FileInput,
  Image,
  Text,
  SimpleGrid,
  ActionIcon,
  Box,
  Checkbox,
  Drawer,
  Stack
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconUpload, IconX, IconEye } from '@tabler/icons-react';
import { createCard, updateCard, addCardImages, deleteCard, deleteCardImage, type CardItem } from '../../data/CardData';
import { API } from '../../../../../config/constants';
import TiptapEditor from '../../../../../utils/editor';
import { TelegramPreview } from './TelegramPreview';
import './CardModal.css';

// Props для добавления
interface AddCardModalProps {
  categoryId: string | null;
  onSuccess?: () => void;
  onClose: () => void;
}

// Props для редактирования
interface EditCardModalProps {
  card: CardItem;
  onSuccess?: () => void;
  onClose: () => void;
}

// Props для удаления
interface DeleteCardModalProps {
  card: CardItem;
  onSuccess?: () => void;
  onClose: () => void;
}

// Модалка добавления карточки
export function AddCardModal({ categoryId, onSuccess, onClose }: AddCardModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewDrawerOpened, previewDrawerHandlers] = useDisclosure(false);
  const previewUrlsRef = useRef<string[]>([]);

  // Обновляем ref при изменении previewUrls
  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);

  useEffect(() => {
    setName('');
    setDescription('');
    setIsActive(true);
    setImageFiles([]);
    setPreviewUrls([]);
    setError(null);

    // Cleanup: освобождаем blob URLs при размонтировании
    return () => {
      previewUrlsRef.current.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          // Игнорируем ошибки при очистке
        }
      });
    };
  }, []);

  const handleImageChange = (files: File[] | null) => {
    if (!files) {
      setImageFiles([]);
      setPreviewUrls([]);
      return;
    }

    const limitedFiles = files.slice(0, 5);
    setImageFiles(limitedFiles);

    const newPreviewUrls = limitedFiles.map(file => URL.createObjectURL(file));
    setPreviewUrls(newPreviewUrls);
  };

  const removeImage = (index: number) => {
    const newFiles = [...imageFiles];
    const newPreviews = [...previewUrls];
    
    URL.revokeObjectURL(newPreviews[index]);
    
    newFiles.splice(index, 1);
    newPreviews.splice(index, 1);
    
    setImageFiles(newFiles);
    setPreviewUrls(newPreviews);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!categoryId) {
      setError('Категория не выбрана');
      return;
    }

    if (!name.trim()) {
      setError('Название карточки обязательно');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await createCard({
        name: name.trim(),
        description: description.trim(),
        categoryId: categoryId,
        isActive: isActive,
        images: imageFiles.length > 0 ? imageFiles : undefined
      });

      // Очищаем форму
      setName('');
      setDescription('');
      setIsActive(true);
      
      // Освобождаем все preview URLs
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      setImageFiles([]);
      setPreviewUrls([]);

      onSuccess?.();
      previewDrawerHandlers.close();
      onClose();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при создании карточки');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Container style={{ padding: 0 }}> 
        <h2>Добавить карточку</h2>
        
        <form onSubmit={handleSubmit}>
          {error && (
            <Alert color="red" className="card-modal-form-section">
              {error}
            </Alert>
          )}

          <Group justify="space-between" mb="md">
            <TextInput
              label="Название карточки"
              placeholder="Введите название..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="card-modal-text-input"
            />
            <Button
              variant="light"
              leftSection={<IconEye size={16} />}
              onClick={previewDrawerHandlers.open}
              className="card-modal-preview-button"
            >
              Превью Telegram
            </Button>
          </Group>

          <Box className="card-modal-form-section">
            <Text size="sm" fw={500} mb="xs">Описание</Text>
            <TiptapEditor
              content={description}
              onChange={setDescription}
              telegramMode={true}
            />
          </Box>

          <Checkbox
            label="Активная карточка"
            description="Активные карточки отображаются в боте"
            checked={isActive}
            onChange={(e) => setIsActive(e.currentTarget.checked)}
            className="card-modal-form-section"
          />

          <FileInput
            label="Изображения"
            placeholder="Выберите изображения"
            accept="image/*,application/pdf"
            multiple
            value={imageFiles}
            onChange={handleImageChange}
            leftSection={<IconUpload size={16} />}
            className="card-modal-form-section"
          />

          {previewUrls.length > 0 && (
            <Box className="card-modal-form-section">
              <Text size="sm" className="card-modal-preview-label">Предварительный просмотр:</Text>
              <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
                {previewUrls.map((url, index) => (
                  <Box key={index} className="card-modal-preview-container">
                    <Image
                      src={url}
                      alt={`Preview ${index + 1}`}
                      className="card-modal-preview-grid"
                    />
                    <ActionIcon
                      size="sm"
                      color="red"
                      variant="filled"
                      className="card-modal-preview-remove-button"
                      onClick={() => removeImage(index)}
                    >
                      <IconX size={12} />
                    </ActionIcon>
                  </Box>
                ))}
              </SimpleGrid>
            </Box>
          )}

          <Group justify="flex-end" mt="md">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Отмена
            </Button>
            <Button type="submit" loading={loading}>
              Создать карточку
            </Button>
          </Group>
        </form>
      </Container>

      <Drawer
        opened={previewDrawerOpened}
        onClose={previewDrawerHandlers.close}
        position="right"
        withOverlay={false}
        lockScroll={false}
        title="Превью в Telegram"
        size={460}
        zIndex={1000}
        classNames={{
          content: 'card-modal-drawer-content',
          header: 'card-modal-drawer-header',
          title: 'card-modal-drawer-title',
          close: 'card-modal-drawer-close',
          body: 'card-modal-drawer-body'
        }}
      >
        <Stack gap="md">
          <TelegramPreview
            name={name}
            description={description}
            images={imageFiles.length > 0 ? imageFiles : previewUrls}
          />
        </Stack>
      </Drawer>
    </>
  );
}

// Модалка редактирования карточки
export function EditCardModal({ card, onSuccess, onClose }: EditCardModalProps) {
  const [name, setName] = useState(card.name);
  const [description, setDescription] = useState(card.description);
  const [isActive, setIsActive] = useState(card.isActive);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [currentImages, setCurrentImages] = useState<string[]>(card.imageUrls || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewDrawerOpened, previewDrawerHandlers] = useDisclosure(false);
  const previewUrlsRef = useRef<string[]>([]);

  // Обновляем ref при изменении previewUrls
  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);

  useEffect(() => {
    // Освобождаем старые blob URLs перед обновлением
    previewUrlsRef.current.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        // Игнорируем ошибки при очистке
      }
    });

    setName(card.name);
    setDescription(card.description);
    setIsActive(card.isActive);
    setImageFiles([]);
    setPreviewUrls([]);
    setCurrentImages(card.imageUrls || []);
    setError(null);

    // Cleanup: освобождаем blob URLs при размонтировании или изменении карточки
    return () => {
      previewUrlsRef.current.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          // Игнорируем ошибки при очистке
        }
      });
    };
  }, [card]);

  const handleImageChange = (files: File[] | null) => {
    if (!files) {
      setImageFiles([]);
      setPreviewUrls([]);
      return;
    }

    const limitedFiles = files.slice(0, 5);
    setImageFiles(limitedFiles);

    const newPreviewUrls = limitedFiles.map(file => URL.createObjectURL(file));
    setPreviewUrls(newPreviewUrls);
  };

  const removeImage = (index: number) => {
    const newFiles = [...imageFiles];
    const newPreviews = [...previewUrls];
    
    URL.revokeObjectURL(newPreviews[index]);
    
    newFiles.splice(index, 1);
    newPreviews.splice(index, 1);
    
    setImageFiles(newFiles);
    setPreviewUrls(newPreviews);
  };

  const removeCurrentImage = async (index: number) => {
    const imageUrlToRemove = currentImages[index];
    if (!imageUrlToRemove) {
      console.log('❌ [removeCurrentImage] imageUrlToRemove не найден для индекса:', index);
      return;
    }

    console.log(`🗑️ [removeCurrentImage] Удаляем изображение с индексом ${index}, URL: ${imageUrlToRemove}`);

    try {
      setLoading(true);
      setError(null);
      
      // Удаляем изображение из базы данных
      console.log(`🔄 [removeCurrentImage] Вызываем deleteCardImage для карточки ${card.id}`);
      const updatedCard = await deleteCardImage(card.id, imageUrlToRemove);
      console.log(`✅ [removeCurrentImage] Изображение удалено, обновленная карточка:`, updatedCard);
      
      // Обновляем локальное состояние
      const newImageUrls = updatedCard.imageUrls || [];
      console.log(`🔄 [removeCurrentImage] Обновляем currentImages с ${currentImages.length} на ${newImageUrls.length} изображений`);
      setCurrentImages(newImageUrls);
    } catch (err) {
      console.error('❌ [removeCurrentImage] Ошибка при удалении изображения:', err);
      setError(err instanceof Error ? err.message : 'Ошибка при удалении изображения');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Название карточки обязательно');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Обновляем основные данные карточки (imageUrls уже обновлены через removeCurrentImage)
      await updateCard(card.id, {
        name: name.trim(),
        description: description.trim(),
        isActive: isActive
      });

      // Добавляем новые изображения, если есть
      if (imageFiles.length > 0) {
        await addCardImages(card.id, imageFiles);
      }

      // Очищаем новые файлы
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      setImageFiles([]);
      setPreviewUrls([]);

      onSuccess?.();
      previewDrawerHandlers.close();
      onClose();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при обновлении карточки');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Container style={{ padding: 0 }}> 
        <h2>Редактировать карточку</h2>
        
        <form onSubmit={handleSubmit}>
          {error && (
            <Alert color="red" style={{ marginBottom: 15 }}>
              {error}
            </Alert>
          )}

          <Group justify="space-between" mb="md">
            <TextInput
              label="Название карточки"
              placeholder="Введите название..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ flex: 1 }}
            />
            <Button
              variant="light"
              leftSection={<IconEye size={16} />}
              onClick={previewDrawerHandlers.open}
              style={{ marginTop: '24px' }}
            >
              Превью Telegram
            </Button>
          </Group>

          <Box style={{ marginBottom: 15 }}>
            <Text size="sm" fw={500} mb="xs">Описание</Text>
            <TiptapEditor
              content={description}
              onChange={setDescription}
              telegramMode={true}
            />
          </Box>

          <Checkbox
            label="Активная карточка"
            description="Активные карточки отображаются в боте"
            checked={isActive}
            onChange={(e) => setIsActive(e.currentTarget.checked)}
            style={{ marginBottom: 15 }}
          />

          {/* Текущие изображения */}
          {currentImages.length > 0 && (
            <Box style={{ marginBottom: 15 }}>
              <Text size="sm" style={{ marginBottom: 10 }}>Текущие изображения:</Text>
              <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
                {currentImages.map((url, index) => (
                  <Box key={index} style={{ position: 'relative' }}>
                    <Image
                      src={url.startsWith('http') ? url : `${API}/public/add/merch/${url}`}
                      alt={`Current ${index + 1}`}
                      style={{ 
                        width: '100%', 
                        height: 120, 
                        objectFit: 'cover',
                        borderRadius: 8,
                        border: '1px solid #e0e0e0'
                      }}
                    />
                    <ActionIcon
                      size="sm"
                      color="red"
                      variant="filled"
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4
                      }}
                      onClick={() => removeCurrentImage(index)}
                    >
                      <IconX size={12} />
                    </ActionIcon>
                  </Box>
                ))}
              </SimpleGrid>
            </Box>
          )}

          <FileInput
            label="Добавить новые изображения"
            placeholder="Выберите изображения"
            accept="image/*,application/pdf"
            multiple
            value={imageFiles}
            onChange={handleImageChange}
            leftSection={<IconUpload size={16} />}
            style={{ marginBottom: 15 }}
          />

          {previewUrls.length > 0 && (
            <Box style={{ marginBottom: 15 }}>
              <Text size="sm" style={{ marginBottom: 10 }}>Предварительный просмотр новых изображений:</Text>
              <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
                {previewUrls.map((url, index) => (
                  <Box key={index} style={{ position: 'relative' }}>
                    <Image
                      src={url}
                      alt={`Preview ${index + 1}`}
                      style={{ 
                        width: '100%', 
                        height: 120, 
                        objectFit: 'cover',
                        borderRadius: 8,
                        border: '1px solid #e0e0e0'
                      }}
                    />
                    <ActionIcon
                      size="sm"
                      color="red"
                      variant="filled"
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4
                      }}
                      onClick={() => removeImage(index)}
                    >
                      <IconX size={12} />
                    </ActionIcon>
                  </Box>
                ))}
              </SimpleGrid>
            </Box>
          )}

          <Group justify="flex-end" mt="md">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Отмена
            </Button>
            <Button type="submit" loading={loading}>
              Сохранить изменения
            </Button>
          </Group>
        </form>
      </Container>

      <Drawer
        opened={previewDrawerOpened}
        onClose={previewDrawerHandlers.close}
        position="right"
        withOverlay={false}
        lockScroll={false}
        title="Превью в Telegram"
        size={460}
        zIndex={1000}
        classNames={{
          content: 'card-modal-drawer-content',
          header: 'card-modal-drawer-header',
          title: 'card-modal-drawer-title',
          close: 'card-modal-drawer-close',
          body: 'card-modal-drawer-body'
        }}
      >
        <Stack gap="md">
          <TelegramPreview
            name={name}
            description={description}
            images={[
              ...currentImages.map(url => url.startsWith('http') ? url : `${API}/public/add/merch/${url}`),
              ...previewUrls
            ]}
          />
        </Stack>
      </Drawer>
    </>
  );
}

// Модалка удаления карточки
export function DeleteCardModal({ card, onSuccess, onClose }: DeleteCardModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    try {
      setLoading(true);
      setError(null);

      await deleteCard(card.id);

      onSuccess?.();
      onClose();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при удалении карточки');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container style={{ padding: 0 }}> 
      <h2>Удалить карточку</h2>
      
      {error && (
        <Alert color="red" style={{ marginBottom: 15 }}>
          {error}
        </Alert>
      )}
      
      <Alert color="orange" style={{ marginBottom: 15 }}>
        Вы уверены, что хотите удалить карточку "{card.name}"?
        <br />
        <strong>Внимание:</strong> Это действие нельзя отменить.
      </Alert>

      <Group justify="flex-end" mt="md">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          Отмена
        </Button>
        <Button color="red" onClick={handleDelete} loading={loading}>
          Удалить карточку
        </Button>
      </Group>
    </Container>
  );
}
