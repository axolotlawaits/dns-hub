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
import { addCategory, updateCategory, deleteCategory, getCategoryChildren } from '../../data/HierarchyData';
import { API } from '../../../../../config/constants';
import type { DataItem } from '../../data/HierarchyData';
import { notificationSystem } from '../../../../../utils/Push';
import TiptapEditor from '../../../../../utils/editor';

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
      />

      <Box>
        <Text size="sm" fw={500} mb="xs">Описание</Text>
          <TiptapEditor
            content={description}
            onChange={setDescription}
            telegramMode={true}
          />
      </Box>

      <Box>
        <Text size="sm" fw={500} mb="xs">Изображения</Text>
        <FileInput
          placeholder="Выберите изображения"
          accept="image/*"
          multiple
          onChange={handleImageChange}
          leftSection={<IconUpload size={16} />}
        />
        
        {previewUrls.length > 0 && (
          <Grid mt="md">
            {previewUrls.map((url, index) => (
              <Grid.Col key={index} span={4}>
                <Box style={{ position: 'relative' }}>
                  <Image
                    src={url}
                    alt={`Preview ${index + 1}`}
                    height={100}
                    radius="md"
                    style={{ objectFit: 'cover' }}
                  />
                  <ActionIcon
                    color="red"
                    variant="filled"
                    size="sm"
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
              </Grid.Col>
            ))}
          </Grid>
        )}
      </Box>

      <Group justify="flex-end" mt="md">
        <Button variant="outline" onClick={onClose}>
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
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || '');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [deletedAttachmentIds, setDeletedAttachmentIds] = useState<string[]>([]); // ID attachments для удаления
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

    setName(item.name);
    setDescription(item.description || '');
    setImageFiles([]);
    setPreviewUrls([]);
    // Загружаем существующие изображения из item
    setExistingImageUrls(item.imageUrls || []);
    setDeletedAttachmentIds([]); // Сбрасываем список удаляемых
    setError(null);

    // Cleanup: освобождаем blob URLs при размонтировании или изменении item
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

  const removeExistingImage = (imageUrl: string) => {
    // Извлекаем имя файла из URL
    const urlParts = imageUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];
    
    // Находим attachment по source
    const attachment = item.attachments?.find(att => att.source === fileName);
    if (!attachment) {
      console.error('Attachment не найден для удаления');
      notificationSystem.addNotification('Ошибка!', 'Изображение не найдено', 'error');
      return;
    }

    // Удаляем из локального списка отображаемых
    const newImageUrls = existingImageUrls.filter(url => url !== imageUrl);
    setExistingImageUrls(newImageUrls);
    
    // Добавляем ID attachment в список для удаления при сохранении
    setDeletedAttachmentIds(prev => [...prev, attachment.id]);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Название обязательно');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Сначала удаляем помеченные attachments
      if (deletedAttachmentIds.length > 0) {
        const token = localStorage.getItem('token');
        const headers: HeadersInit = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        for (const attachmentId of deletedAttachmentIds) {
          try {
            const response = await fetch(`${API}/add/merch/attachments/${attachmentId}`, {
              method: 'DELETE',
              headers,
            });
            if (!response.ok) {
              console.error(`Ошибка при удалении attachment ${attachmentId}`);
            }
          } catch (err) {
            console.error(`Ошибка при удалении attachment ${attachmentId}:`, err);
          }
        }
      }

      const updatedData = await updateCategory(item.id, {
        name: name.trim(),
        description: description.trim(),
        images: imageFiles.length > 0 ? imageFiles : undefined
      });

      // Обновляем список существующих изображений после сохранения
      setExistingImageUrls(updatedData.imageUrls || []);

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
      />

      <Box>
        <Text size="sm" fw={500} mb="xs">Описание</Text>
          <TiptapEditor
            content={description}
            onChange={setDescription}
            telegramMode={true}
          />
      </Box>

      {/* Существующие изображения */}
      {existingImageUrls.length > 0 && (
        <Box>
          <Text size="sm" fw={500} mb="xs">Существующие изображения</Text>
          <Grid mt="xs">
            {existingImageUrls.map((url, index) => (
              <Grid.Col key={index} span={4}>
                <Box style={{ position: 'relative' }}>
                  <Image
                    src={url}
                    alt={`Existing ${index + 1}`}
                    height={100}
                    radius="md"
                    style={{ objectFit: 'cover' }}
                  />
                  <ActionIcon
                    color="red"
                    variant="filled"
                    size="sm"
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4
                    }}
                    onClick={() => removeExistingImage(url)}
                    loading={loading}
                  >
                    <IconX size={12} />
                  </ActionIcon>
                </Box>
              </Grid.Col>
            ))}
          </Grid>
        </Box>
      )}

      <Box>
        <Text size="sm" fw={500} mb="xs">Новые изображения</Text>
        <FileInput
          placeholder="Выберите изображения"
          accept="image/*"
          multiple
          onChange={handleImageChange}
          leftSection={<IconUpload size={16} />}
        />
        
        {previewUrls.length > 0 && (
          <Grid mt="md">
            {previewUrls.map((url, index) => (
              <Grid.Col key={index} span={4}>
                <Box style={{ position: 'relative' }}>
                  <Image
                    src={url}
                    alt={`Preview ${index + 1}`}
                    height={100}
                    radius="md"
                    style={{ objectFit: 'cover' }}
                  />
                  <ActionIcon
                    color="red"
                    variant="filled"
                    size="sm"
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
              </Grid.Col>
            ))}
          </Grid>
        )}
      </Box>

      <Group justify="flex-end" mt="md">
        <Button variant="outline" onClick={onClose}>
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
  const [loadingChildren, setLoadingChildren] = useState(false);

  // Загружаем дочерние элементы при открытии модалки
  useEffect(() => {
    const loadChildren = async () => {
      setLoadingChildren(true);
      try {
        const data = await getCategoryChildren(item.id);
        setChildren(data.children || []);
      } catch (err) {
        console.error('Ошибка при загрузке дочерних элементов:', err);
      } finally {
        setLoadingChildren(false);
      }
    };

    if (item.id) {
      loadChildren();
    }
  }, [item.id]);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);

    try {
      await deleteCategory(item.id);
      notificationSystem.addNotification('Успех!', 'Категория успешно удалена', 'success');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Ошибка при удалении категории:', error);
      setError('Ошибка при удалении категории');
      notificationSystem.addNotification('Ошибка!', 'Ошибка при удалении категории', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Рекурсивная функция для отображения дочерних элементов
  const renderChildren = (childrenList: DataItem[], depth: number = 0) => {
    if (childrenList.length === 0) return null;

    return (
      <Box pl={depth * 20} mt="xs">
        {childrenList.map((child) => (
          <Box key={child.id} mb="xs">
            <Group gap="xs" align="center">
              <Text size="sm" style={{ flex: 1 }}>
                {child.layer === 1 ? '📁' : '📄'} {child.name}
              </Text>
              {child.attachmentsCount > 0 && (
                <Badge size="sm" color="blue" variant="light">
                  {child.attachmentsCount} фото
                </Badge>
              )}
              {child.layer === 1 && (
                <Badge size="sm" color="gray" variant="light">
                  Категория
                </Badge>
              )}
              {child.layer === 0 && (
                <Badge size="sm" color="green" variant="light">
                  Карточка
                </Badge>
              )}
            </Group>
            {child.children && child.children.length > 0 && (
              <Box mt="xs">
                {renderChildren(child.children, depth + 1)}
              </Box>
            )}
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Stack gap="md">
      {error && <Alert color="red">{error}</Alert>}
      
      <Stack gap="xs">
        <Text>
          Вы уверены, что хотите удалить категорию <strong>"{item.name}"</strong>?
        </Text>
        
        {loadingChildren ? (
          <Text size="sm" c="dimmed">Загрузка списка дочерних элементов...</Text>
        ) : children.length > 0 ? (
          <Box>
            <Text size="sm" fw={600} mb="xs" c="orange">
              Внимание! Будет удалено {children.length} дочерних элементов:
            </Text>
            <ScrollArea h={200} style={{ border: '1px solid var(--theme-border-primary)', borderRadius: 4, padding: 8 }}>
              {renderChildren(children)}
            </ScrollArea>
          </Box>
        ) : (
          <Text size="sm" c="dimmed">У этой категории нет дочерних элементов.</Text>
        )}
      </Stack>

      <Group justify="flex-end" mt="md">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          Отмена
        </Button>
        <Button color="red" onClick={handleDelete} loading={loading}>
          Удалить
        </Button>
      </Group>
    </Stack>
  );
}

