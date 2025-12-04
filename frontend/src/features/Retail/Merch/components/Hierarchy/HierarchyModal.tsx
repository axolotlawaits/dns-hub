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
  Text 
} from '@mantine/core';
import { IconX, IconUpload } from '@tabler/icons-react';
import { addCategory, updateCategory, deleteCategory, deleteCategoryImage } from '../../data/HierarchyData';
import type { DataItem } from '../../data/HierarchyData';
import { API } from '../../../../../config/constants';
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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName('');
    setDescription('');
    setImageFile(null);
    setPreviewUrl(null);
    setError(null);
  }, []);

  const handleImageChange = (file: File | null) => {
    setImageFile(file);
    
    // Очищаем предыдущий preview
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
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
        description: description.trim() || undefined,
        parentId: parentItem?.id,
        images: imageFile ? [imageFile] : undefined
      });
      
      notificationSystem.addNotification(
        'Успех!', 
        `Категория "${name.trim()}" успешно создана`, 
        'success'
      );
      
      onSuccess?.();
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ошибка при добавлении';
      setError(errorMessage);
      notificationSystem.addNotification(
        'Ошибка!', 
        errorMessage, 
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Добавить категорию {parentItem ? `в "${parentItem.name}"` : ''}</h2>
      
      {error && (
        <Alert color="red" mb="md">
          {error}
        </Alert>
      )}
      
      <TextInput
        label="Название"
        placeholder="Введите название категории"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        mb="md"
      />
      
      <Box mb="md">
        <Text size="sm" fw={500} mb="xs">Описание</Text>
          <TiptapEditor
            content={description}
            onChange={setDescription}
            telegramMode={true}
          />
      </Box>

      <FileInput
        label="Изображение категории"
        placeholder="Выберите изображение"
        accept="image/*"
        value={imageFile}
        onChange={handleImageChange}
        leftSection={<IconUpload size={16} />}
        mb="md"
      />

      {previewUrl && (
        <Box mb="md">
          <Text size="sm" mb="xs">Предварительный просмотр:</Text>
          <Image
            src={previewUrl}
            alt="Preview"
            style={{ maxWidth: 200, maxHeight: 200 }}
            fit="cover"
          />
        </Box>
      )}

      <Group justify="flex-end" mt="md">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          Отмена
        </Button>
        <Button onClick={handleSubmit} loading={loading}>
          Добавить
        </Button>
      </Group>
    </div>
  );
}

// Модалка редактирования
export function HierarchyEditModal({ item, onClose, onSuccess }: ItemModalProps) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || '');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(item.imageUrl || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(item.name);
    setDescription(item.description || '');
    setImageFile(null);
    setPreviewUrl(null);
    setCurrentImageUrl(item.imageUrl || null);
    setError(null);
  }, [item]);

  const handleImageChange = (file: File | null) => {
    setImageFile(file);
    
    // Очищаем предыдущий preview
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleRemoveCurrentImage = async () => {
    if (!currentImageUrl) return;
    
    setLoading(true);
    setError(null);

    try {
      const updatedItem = await deleteCategoryImage(item.id);
      setCurrentImageUrl(updatedItem.imageUrl || null);
      // Обновляем item для отображения изменений
      if (updatedItem.imageUrl === null || updatedItem.imageUrl === undefined) {
        setCurrentImageUrl(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при удалении изображения');
    } finally {
      setLoading(false);
    }
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
        description: description.trim() || undefined,
        images: imageFile ? [imageFile] : undefined
      });
      
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при обновлении');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Редактировать категорию "{item.name}"</h2>
      
      {error && (
        <Alert color="red" mb="md">
          {error}
        </Alert>
      )}
      
      <TextInput
        label="Название"
        placeholder="Введите название категории"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        mb="md"
      />
      
      <Box mb="md">
        <Text size="sm" fw={500} mb="xs">Описание</Text>
          <TiptapEditor
            content={description}
            onChange={setDescription}
            telegramMode={true}
          />
      </Box>

      {/* Текущее изображение */}
      {currentImageUrl && (
        <Box mb="md">
          <Text size="sm" mb="xs">Текущее изображение:</Text>
          <Group>
            <Image
              src={currentImageUrl.startsWith('http') ? currentImageUrl : `${API}/public/retail/merch/${currentImageUrl}`}
              alt="Current"
              style={{ maxWidth: 200, maxHeight: 200 }}
              fit="cover"
            />
            <ActionIcon
              color="red"
              variant="outline"
              onClick={handleRemoveCurrentImage}
              loading={loading}
            >
              <IconX size={16} />
            </ActionIcon>
          </Group>
        </Box>
      )}

      <FileInput
        label="Новое изображение"
        placeholder="Выберите новое изображение"
        accept="image/*"
        value={imageFile}
        onChange={handleImageChange}
        leftSection={<IconUpload size={16} />}
        mb="md"
      />

      {previewUrl && (
        <Box mb="md">
          <Text size="sm" mb="xs">Предварительный просмотр нового изображения:</Text>
          <Image
            src={previewUrl}
            alt="Preview"
            style={{ maxWidth: 200, maxHeight: 200 }}
            fit="cover"
          />
        </Box>
      )}

      <Group justify="flex-end" mt="md">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          Отмена
        </Button>
        <Button onClick={handleSubmit} loading={loading}>
          Сохранить
        </Button>
      </Group>
    </div>
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
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при удалении');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Удалить категорию</h2>
      
      {error && (
        <Alert color="red" mb="md">
          {error}
        </Alert>
      )}
      
      <Alert color="orange" mb="md">
        Вы уверены, что хотите удалить категорию "{item.name}"?
        {item.child.length > 0 && (
          <div>
            <strong>Внимание:</strong> У этой категории есть дочерние элементы. 
            Они также будут удалены вместе с этой категорией.
          </div>
        )}
      </Alert>

      <Group justify="flex-end" mt="md">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          Отмена
        </Button>
        <Button color="red" onClick={handleDelete} loading={loading}>
          Удалить
        </Button>
      </Group>
    </div>
  );
}
