import { useState, useEffect } from 'react';
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
  Stack
} from '@mantine/core';
import { IconX, IconUpload } from '@tabler/icons-react';
import { addCategory, updateCategory, deleteCategory } from '../../data/HierarchyData';
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

  useEffect(() => {
    setName('');
    setDescription('');
    setImageFiles([]);
    setPreviewUrls([]);
    setError(null);
  }, []);

  const handleImageChange = (files: File[] | null) => {
    // Очищаем предыдущие preview
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    
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
    URL.revokeObjectURL(previewUrls[index]);
    
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(item.name);
    setDescription(item.description || '');
    setImageFiles([]);
    setPreviewUrls([]);
    setError(null);
  }, [item]);

  const handleImageChange = (files: File[] | null) => {
    // Очищаем предыдущие preview
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    
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
    URL.revokeObjectURL(previewUrls[index]);
    
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
      await updateCategory(item.id, {
        name: name.trim(),
        description: description.trim(),
        images: imageFiles.length > 0 ? imageFiles : undefined
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

  return (
    <Stack gap="md">
      {error && <Alert color="red">{error}</Alert>}
      
      <Text>
        Вы уверены, что хотите удалить категорию <strong>"{item.name}"</strong>?
        {item.hasChildren && (
          <Text size="sm" c="orange" mt="xs">
            Внимание: Эта категория содержит подкатегории. Они также будут удалены.
          </Text>
        )}
      </Text>

      <Group justify="flex-end" mt="md">
        <Button variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button color="red" onClick={handleDelete} loading={loading}>
          Удалить
        </Button>
      </Group>
    </Stack>
  );
}
