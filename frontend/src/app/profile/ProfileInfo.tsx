import { useState, useEffect } from 'react';
import { useUserContext } from '../../hooks/useUserContext';
import { API } from '../../config/constants';
import { notificationSystem } from '../../utils/Push';
import { Avatar, Card, Text, Group, Badge, Skeleton, Stack, Box, Modal, Button, PasswordInput, Image, FileButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

interface UserData {
  fio: string;
  birthday: string;
  code: string;
  email: string;
  status: string;
  branch: {
    rrs: string;
    division: string;
    name: string;
    city: string;
    address: string;
  };
  position: {
    name: string;
  };
}

const ProfileInfo = () => {
  const { user, setUser } = useUserContext();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Модальные окна
  const [photoModalOpened, { open: openPhotoModal, close: closePhotoModal }] = useDisclosure(false);
  const [passwordModalOpened, { open: openPasswordModal, close: closePasswordModal }] = useDisclosure(false);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.email) {
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`${API}/profile/user-data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ email: user.email })
        });
        if (!response.ok) {
          throw new Error('Failed to fetch user data');
        }
        const data: UserData = await response.json();
        setUserData(data);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('An unknown error occurred');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, [user?.email]);

  const handleFileSelect = (file: File | null) => {
    if (!file) return;
    
    setFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setNewPhoto(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSavePhoto = () => {
    closePhotoModal();
    openPasswordModal();
  };

  const updatePhoto = async () => {
    if (!file || !newPhoto || !password || !user?.login || isUpdating) return;
    
    setIsUpdating(true);
    try {
      const base64String = newPhoto.split(',')[1];
      const response = await fetch(`${API}/user/update-photo`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ 
          login: user.login, 
          photo: base64String,
          password: password 
        })
      });
        
      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 401) {
          throw new Error('Неверный пароль. Пожалуйста, попробуйте снова.');
        }
        throw new Error(errorData.message || 'Ошибка при обновлении фотографии');
      }

      setUser((prevUser: any) => prevUser ? { ...prevUser, image: base64String } : null);
      
      closePasswordModal();
      setPassword('');
      setNewPhoto(null);
      setFile(null);
      
      notificationSystem.addNotification('Успех', 'Фото профиля успешно обновлено', 'success');
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
        notificationSystem.addNotification('Ошибка', err.message, 'error');
      } else {
        setError('Произошла неизвестная ошибка');
        notificationSystem.addNotification('Ошибка', 'Произошла неизвестная ошибка', 'error');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return (
      <Stack>
        <Skeleton height={50} circle mb="xl" />
        <Skeleton height={8} radius="xl" />
        <Skeleton height={8} mt={6} radius="xl" />
        <Skeleton height={8} mt={6} width="70%" radius="xl" />
      </Stack>
    );
  }

  if (error) {
    return <Text c="red">Ошибка: {error}</Text>;
  }

  if (!userData) {
    return <Text>Нет данных пользователя</Text>;
  }

  return (
    <>
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Group align="flex-start" wrap="nowrap">
          <Box style={{ position: 'relative' }}>
            <Avatar
              src={user?.image ? `data:image/jpeg;base64,${user.image}` : null}
              size={120}
              radius={60}
              style={{ cursor: 'pointer' }}
              onClick={openPhotoModal}
            />
            <Text 
              size="sm" 
              style={{ 
                cursor: 'pointer',
                textAlign: 'center',
                marginTop: 8,
                textDecoration: 'underline',
                color: '#228be6'
              }}
              onClick={openPhotoModal}
            >
              {user?.image ? 'Сменить фото' : 'Добавить фото'}
            </Text>
          </Box>
          
          <Box style={{ flex: 1 }}>
            <Group justify="space-between">
              <Text size="lg" fw={500}>
                {userData.fio}
              </Text>
              <Badge color={userData.status === 'active' ? 'green' : 'red'} variant="light">
                {userData.status}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed" mt={4}>
              {userData.position.name || 'Не указано'}
            </Text>
            <Group gap="xl" mt="md">
              <Stack gap="xs">
                <Group gap="md">
                  <Text size="sm" c="dimmed">РРС:</Text>
                  <Text size="sm">{userData.branch.rrs || 'Не указано'}</Text>
                </Group>
                <Group gap="md">
                  <Text size="sm" c="dimmed">Отдел:</Text>
                  <Text size="sm">{userData.branch.name || 'Не указано'}</Text>
                </Group>
              </Stack>
              <Stack gap="xs">
                <Group gap="md">
                  <Text size="sm" c="dimmed">Дата рождения:</Text>
                  <Text size="sm">{new Date(userData.birthday).toLocaleDateString()}</Text>
                </Group>
                <Group gap="md">
                  <Text size="sm" c="dimmed">Email:</Text>
                  <Text size="sm">{userData.email}</Text>
                </Group>
              </Stack>
            </Group>
          </Box>
        </Group>
      </Card>

      {/* Модальное окно смены фото */}
      <Modal opened={photoModalOpened} onClose={closePhotoModal} title={user?.image ? 'Смена фото профиля' : 'Добавление фото профиля'} centered>
        <Group justify="center" mb="xl">
          {user?.image && (
            <Box>
              <Text size="sm" mb="xs">Текущее фото:</Text>
              <Image
                src={`data:image/jpeg;base64,${user.image}`}
                width={150}
                height={150}
                radius="md"
              />
            </Box>
          )}
          
          {newPhoto && (
            <Box>
              <Text size="sm" mb="xs">Новое фото:</Text>
              <Image
                src={newPhoto}
                width={150}
                height={150}
                radius="md"
              />
            </Box>
          )}
        </Group>
        
        <FileButton onChange={handleFileSelect} accept="image/*">
          {(props) => (
            <Button {...props} fullWidth>
              {newPhoto ? 'Выбрать другое фото' : 'Выбрать фото'}
            </Button>
          )}
        </FileButton>
        
        {newPhoto && (
          <Button fullWidth mt="md" onClick={handleSavePhoto}>
            Сохранить фото
          </Button>
        )}
      </Modal>

      {/* Модальное окно ввода пароля */}
      <Modal opened={passwordModalOpened} onClose={closePasswordModal} title="Подтвердите смену фото" centered>
        <PasswordInput
          label="Введите ваш пароль"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          placeholder="Пароль"
          required
          mt="md"
          error={error ? '' : undefined}
        />
        <Group justify="flex-end" mt="xl">
          <Button variant="outline" onClick={closePasswordModal} disabled={isUpdating}>
            Отмена
          </Button>
          <Button onClick={updatePhoto} loading={isUpdating}>
            Подтвердить
          </Button>
        </Group>
      </Modal>
    </>
  );
};

export default ProfileInfo;