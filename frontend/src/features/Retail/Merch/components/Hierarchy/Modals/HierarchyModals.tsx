import { useState, useEffect, useRef } from 'react';
import { 
  TextInput, 
  Button, 
  Group, 
  Alert, 
  Image, 
  FileInput, 
  ActionIcon, 
  Box, 
  Text,
  Grid,
  Stack,
  ScrollArea,
  Badge
} from '@mantine/core';
import { IconX, IconUpload } from '@tabler/icons-react';
import { addCategory, updateCategory, deleteCategory, getCategoryChildren } from '../../../data/HierarchyData';
import { API } from '../../../../../../config/constants';
import type { DataItem } from '../../../data/HierarchyData';
import { notificationSystem } from '../../../../../../utils/Push';
import TiptapEditor from '../../../../../../utils/editor';

// Props для редактирования и удаления
interface ItemModalProps {
  item: DataItem;
  onSuccess?: () => void;
  onClose: () => void;
}

// Props для добавления
interface AddModalProps {
  parentItem?: DataItem;
  onSuccess?: () => void;
  onClose: () => void;
}

// Модалка добавления
export function HierarchyAddModal({ onClose, onSuccess, parentItem }: AddModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrlsRef = useRef<string[]>([]);

  // Обновляем ref при изменении previewUrls
  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);

  useEffect(() => {
    setName('');
    setDescription('');
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
    // Очищаем предыдущие preview
    previewUrlsRef.current.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        // Игнорируем ошибки при очистке
      }
    });
    
    if (files && files.length > 0) {
      setImageFiles(files);
      const urls = files.map(file => URL.createObjectURL(file));
      setPreviewUrls(urls);
    } else {
      setImageFiles([]);
      setPreviewUrls([]);
    }
  };

  const removeImage = (index: number) => {
    const newFiles = imageFiles.filter((_, i) => i !== index);
    const newUrls = previewUrls.filter((_, i) => i !== index);
    
    // Освобождаем память
    try {
      URL.revokeObjectURL(previewUrls[index]);
    } catch (error) {
      // Игнорируем ошибки при очистке
    }
    
    setImageFiles(newFiles);
    setPreviewUrls(newUrls);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Название обязательно');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await addCategory({
        name: name.trim(),
        description: description.trim(),
        parentId: parentItem?.id,
        images: imageFiles
      });

      notificationSystem.addNotification('Успех!', 'Категория успешно добавлена', 'success');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Ошибка при добавлении категории:', error);
      setError('Ошибка при добавлении категории');
      notificationSystem.addNotification('Ошибка!', 'Ошибка при добавлении категории', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="md">
      {error && <Alert color="red">{error}</Alert>}
      
      <TextInput
        label="Название категории"
        placeholder="Введите название"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        disabled={loading}
      />

      <Box>
        <Text size="sm" fw={500} mb="xs">Описание</Text>
        <TiptapEditor
          content={description}
          onChange={setDescription}
          placeholder="Введите описание категории (необязательно)"
        />
      </Box>

      <FileInput
        label="Изображения категории"
        placeholder="Выберите изображения"
        accept="image/*"
        multiple
        value={imageFiles}
        onChange={handleImageChange}
        disabled={loading}
        leftSection={<IconUpload size={16} />}
      />

      {previewUrls.length > 0 && (
        <Box>
          <Text size="sm" fw={500} mb="xs">Предпросмотр изображений</Text>
          <Grid>
            {previewUrls.map((url, index) => (
              <Grid.Col key={index} span={4}>
                <Box style={{ position: 'relative' }}>
                  <Image
                    src={url}
                    alt={`Preview ${index + 1}`}
                    style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '8px' }}
                  />
                  <ActionIcon
                    style={{ position: 'absolute', top: 4, right: 4 }}
                    color="red"
                    variant="filled"
                    size="sm"
                    onClick={() => removeImage(index)}
                    disabled={loading}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </Box>
              </Grid.Col>
            ))}
          </Grid>
        </Box>
      )}

      <Group justify="flex-end" mt="md">
        <Button variant="subtle" onClick={onClose} disabled={loading}>
          Отмена
        </Button>
        <Button onClick={handleSubmit} loading={loading}>
          Добавить
        </Button>
      </Group>
    </Stack>
  );
}

// Модалка редактирования
export function HierarchyEditModal({ item, onClose, onSuccess }: ItemModalProps) {
  const [name, setName] = useState(item.name || '');
  const [description, setDescription] = useState(item.description || '');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>(item.images || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);

  useEffect(() => {
    setName(item.name || '');
    setDescription(item.description || '');
    setExistingImages(item.images || []);
    setImageFiles([]);
    setPreviewUrls([]);
    setError(null);

    return () => {
      previewUrlsRef.current.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          // Игнорируем ошибки при очистке
        }
      });
    };
  }, [item]);

  const handleImageChange = (files: File[] | null) => {
    previewUrlsRef.current.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        // Игнорируем ошибки при очистке
      }
    });
    
    if (files && files.length > 0) {
      setImageFiles(files);
      const urls = files.map(file => URL.createObjectURL(file));
      setPreviewUrls(urls);
    } else {
      setImageFiles([]);
      setPreviewUrls([]);
    }
  };

  const removeImage = (index: number) => {
    const newFiles = imageFiles.filter((_, i) => i !== index);
    const newUrls = previewUrls.filter((_, i) => i !== index);
    
    try {
      URL.revokeObjectURL(previewUrls[index]);
    } catch (error) {
      // Игнорируем ошибки при очистке
    }
    
    setImageFiles(newFiles);
    setPreviewUrls(newUrls);
  };

  const removeExistingImage = (index: number) => {
    setExistingImages(existingImages.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Название обязательно');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await updateCategory({
        id: item.id,
        name: name.trim(),
        description: description.trim(),
        images: imageFiles,
        existingImages: existingImages
      });

      notificationSystem.addNotification('Успех!', 'Категория успешно обновлена', 'success');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Ошибка при обновлении категории:', error);
      setError('Ошибка при обновлении категории');
      notificationSystem.addNotification('Ошибка!', 'Ошибка при обновлении категории', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="md">
      {error && <Alert color="red">{error}</Alert>}
      
      <TextInput
        label="Название категории"
        placeholder="Введите название"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        disabled={loading}
      />

      <Box>
        <Text size="sm" fw={500} mb="xs">Описание</Text>
        <TiptapEditor
          content={description}
          onChange={setDescription}
          placeholder="Введите описание категории (необязательно)"
        />
      </Box>

      {existingImages.length > 0 && (
        <Box>
          <Text size="sm" fw={500} mb="xs">Текущие изображения</Text>
          <Grid>
            {existingImages.map((imageUrl, index) => (
              <Grid.Col key={index} span={4}>
                <Box style={{ position: 'relative' }}>
                  <Image
                    src={`${API}/${imageUrl}`}
                    alt={`Existing ${index + 1}`}
                    style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '8px' }}
                  />
                  <ActionIcon
                    style={{ position: 'absolute', top: 4, right: 4 }}
                    color="red"
                    variant="filled"
                    size="sm"
                    onClick={() => removeExistingImage(index)}
                    disabled={loading}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </Box>
              </Grid.Col>
            ))}
          </Grid>
        </Box>
      )}

      <FileInput
        label="Добавить изображения"
        placeholder="Выберите изображения"
        accept="image/*"
        multiple
        value={imageFiles}
        onChange={handleImageChange}
        disabled={loading}
        leftSection={<IconUpload size={16} />}
      />

      {previewUrls.length > 0 && (
        <Box>
          <Text size="sm" fw={500} mb="xs">Предпросмотр новых изображений</Text>
          <Grid>
            {previewUrls.map((url, index) => (
              <Grid.Col key={index} span={4}>
                <Box style={{ position: 'relative' }}>
                  <Image
                    src={url}
                    alt={`Preview ${index + 1}`}
                    style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '8px' }}
                  />
                  <ActionIcon
                    style={{ position: 'absolute', top: 4, right: 4 }}
                    color="red"
                    variant="filled"
                    size="sm"
                    onClick={() => removeImage(index)}
                    disabled={loading}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </Box>
              </Grid.Col>
            ))}
          </Grid>
        </Box>
      )}

      <Group justify="flex-end" mt="md">
        <Button variant="subtle" onClick={onClose} disabled={loading}>
          Отмена
        </Button>
        <Button onClick={handleSubmit} loading={loading}>
          Сохранить
        </Button>
      </Group>
    </Stack>
  );
}

// Модалка удаления
export function HierarchyDeleteModal({ item, onClose, onSuccess }: ItemModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [children, setChildren] = useState<DataItem[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);

  useEffect(() => {
    const loadChildren = async () => {
      try {
        const childrenData = await getCategoryChildren(item.id);
        setChildren(childrenData);
      } catch (error) {
        console.error('Ошибка при загрузке дочерних элементов:', error);
      } finally {
        setLoadingChildren(false);
      }
    };

    loadChildren();
  }, [item.id]);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);

    try {
      await deleteCategory(item.id);
      notificationSystem.addNotification('Успех!', 'Категория успешно удалена', 'success');
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error('Ошибка при удалении категории:', error);
      const errorMessage = error?.message || 'Ошибка при удалении категории';
      setError(errorMessage);
      notificationSystem.addNotification('Ошибка!', errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="md">
      {error && <Alert color="red">{error}</Alert>}
      
      <Text>
        Вы уверены, что хотите удалить категорию <strong>{item.name}</strong>?
      </Text>

      {loadingChildren ? (
        <Text size="sm" c="dimmed">Загрузка дочерних элементов...</Text>
      ) : children.length > 0 ? (
        <Alert color="orange">
          <Text size="sm" fw={500} mb="xs">Внимание! У этой категории есть дочерние элементы:</Text>
          <ScrollArea h={150}>
            <Stack gap="xs">
              {children.map((child) => (
                <Badge key={child.id} variant="light" color="orange">
                  {child.name}
                </Badge>
              ))}
            </Stack>
          </ScrollArea>
          <Text size="sm" mt="xs" c="orange">
            При удалении категории все дочерние элементы также будут удалены!
          </Text>
        </Alert>
      ) : null}

      <Group justify="flex-end" mt="md">
        <Button variant="subtle" onClick={onClose} disabled={loading}>
          Отмена
        </Button>
        <Button color="red" onClick={handleDelete} loading={loading}>
          Удалить
        </Button>
      </Group>
    </Stack>
  );
}
