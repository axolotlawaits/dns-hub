import { useState, useEffect } from 'react';
import { useUserContext } from '../../hooks/useUserContext';
import { API } from '../../config/constants';
import { notificationSystem } from '../../utils/Push';
import {
  Avatar, Card, Text, Group, Badge, Skeleton, Stack, Box,
  Modal, Button, PasswordInput, Image, FileButton, Paper, Loader, CopyButton, Tooltip, ActionIcon
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import QRCode from 'react-qr-code';
import { IconBrandTelegram, IconLink, IconUnlink, IconCopy, IconCheck, IconMail, IconNotification } from '@tabler/icons-react';

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
  const [isTelegramConnected, setIsTelegramConnected] = useState(false);
  const [telegramLink, setTelegramLink] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [telegramUserName, setTelegramUserName] = useState('');
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
  const [photoModalOpened, { open: openPhotoModal, close: closePhotoModal }] = useDisclosure(false);
  const [passwordModalOpened, { open: openPasswordModal, close: closePasswordModal }] = useDisclosure(false);
  const [telegramModalOpened, { open: openTelegramModal, close: closeTelegramModal }] = useDisclosure(false);

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
        if (!response.ok) throw new Error('Failed to fetch user data');
        setUserData(await response.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    const fetchEmailNotificationSetting = async () => {
      try {
        const response = await fetch(`${API}/user/settings/notifications.email`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (!response.ok) throw new Error('Failed to fetch email notification setting');
        const data = await response.json();
        setEmailNotificationsEnabled(data.value === 'true');
      } catch (error) {
        console.error('Error fetching email notification setting:', error);
      }
    };

    fetchUserData();
    fetchEmailNotificationSetting();
  }, [user?.email]);

  useEffect(() => {
    const checkTelegramConnection = async () => {
      setTelegramLoading(true);
      try {
        const response = await fetch(`${API}/telegram/status/${user?.id}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (!response.ok) {
          throw new Error('Failed to check Telegram status');
        }
        const data = await response.json();
        setIsTelegramConnected(data.is_connected);
        if (data.user_name) {
          setTelegramUserName(data.user_name);
        }
      } catch (error) {
        console.error('Telegram status check error:', error);
        notificationSystem.addNotification(
          'Ошибка',
          error instanceof Error ? error.message : 'Не удалось проверить статус Telegram',
          'error'
        );
      } finally {
        setTelegramLoading(false);
      }
    };
    if (user?.id) {
      checkTelegramConnection();
    }
  }, [user?.id]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (user?.id) {
        try {
          const response = await fetch(`${API}/telegram/status/${user.id}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            if (data.is_connected !== isTelegramConnected) {
              setIsTelegramConnected(data.is_connected);
              if (data.user_name) {
                setTelegramUserName(data.user_name);
              }
              notificationSystem.addNotification(
                'Успех',
                'Статус Telegram обновлен',
                'success'
              );
              if (data.is_connected) {
                closeTelegramModal();
              }
            }
          }
        } catch (error) {
          console.error('Error polling Telegram status:', error);
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [user?.id, isTelegramConnected]);

  const toggleEmailNotifications = async () => {
    const newValue = !emailNotificationsEnabled;
    setEmailNotificationsEnabled(newValue);
    try {
      const response = await fetch(`${API}/user/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          userId: user?.id,
          parameter: 'notifications.email',
          value: newValue.toString(),
        }),
      });
      if (!response.ok) throw new Error('Failed to update email notification setting');
      notificationSystem.addNotification(
        'Успех',
        `Рассылка по почте ${newValue ? 'включена' : 'отключена'}`,
        'success'
      );
    } catch (error) {
      notificationSystem.addNotification(
        'Ошибка',
        error instanceof Error ? error.message : 'Не удалось обновить настройку рассылки',
        'error'
      );
    }
  };

  const generateTelegramLink = async () => {
    setIsGeneratingLink(true);
    try {
      const response = await fetch(`${API}/telegram/generate-link/${user?.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to generate link');
      const data = await response.json();
      setTelegramLink(data.link);
      openTelegramModal();
      notificationSystem.addNotification('Успех', 'Ссылка для привязки Telegram сгенерирована', 'success');
    } catch (error) {
      notificationSystem.addNotification(
        'Ошибка',
        error instanceof Error ? error.message : 'Не удалось сгенерировать ссылку',
        'error'
      );
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const disconnectTelegram = async () => {
    try {
      const response = await fetch(`${API}/telegram/disconnect/${user?.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to disconnect Telegram');
      setIsTelegramConnected(false);
      setTelegramUserName('');
      setTelegramLink('');
      notificationSystem.addNotification('Успех', 'Telegram успешно отвязан', 'success');
    } catch (error) {
      notificationSystem.addNotification(
        'Ошибка',
        error instanceof Error ? error.message : 'Не удалось отвязать Telegram',
        'error'
      );
    }
  };

  const handleFileSelect = (file: File | null) => {
    if (!file) return;
    setFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setNewPhoto(reader.result as string);
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
        if (response.status === 401) throw new Error('Неверный пароль');
        throw new Error(errorData.message || 'Ошибка при обновлении фотографии');
      }
      setUser((prevUser: any) => prevUser ? { ...prevUser, image: base64String } : null);
      closePasswordModal();
      setPassword('');
      setNewPhoto(null);
      setFile(null);
      notificationSystem.addNotification('Успех', 'Фото профиля успешно обновлено', 'success');
    } catch (err) {
      notificationSystem.addNotification(
        'Ошибка',
        err instanceof Error ? err.message : 'Произошла неизвестная ошибка',
        'error'
      );
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

  if (error) return <Text c="red">Ошибка: {error}</Text>;
  if (!userData) return <Text>Нет данных пользователя</Text>;

  return (
    <Stack gap="md">
      <Card shadow="sm" padding="lg" radius="md" withBorder style={{ width: '100%' }}>
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
              <Text size="lg" fw={500}>{userData.fio}</Text>
              <Badge color={userData.status === 'active' ? 'green' : 'red'} variant="light">
                {userData.status}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed" mt={4}>{userData.position.name || 'Не указано'}</Text>
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
      <Box style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: 300 }}>
          <Paper shadow="sm" p="lg" radius="md" withBorder>
            <Group mb="md" align="center">
              <IconNotification size={24} />
              <Text size="lg" fw={500}>Уведомления</Text>
            </Group>
            {telegramLoading ? (
              <Group justify="center">
                <Loader size="sm" />
                <Text>Проверка статуса...</Text>
              </Group>
            ) : (
              <>
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Group>
                      <IconBrandTelegram size={18} />
                      <Text size="sm" fw={500}>Telegram</Text>
                    </Group>
                    <Badge color={isTelegramConnected ? "green" : "gray"} variant="light">
                      {isTelegramConnected ? "Подключен" : "Не подключен"}
                    </Badge>
                  </Group>
                  {isTelegramConnected ? (
                    <>
                      {telegramUserName && <Text size="sm" c="dimmed">@{telegramUserName}</Text>}
                      <Button
                        leftSection={<IconUnlink size={18} />}
                        variant="outline"
                        color="red"
                        onClick={disconnectTelegram}
                        fullWidth
                      >
                        Отключить
                      </Button>
                    </>
                  ) : (
                    <Button
                      leftSection={<IconLink size={18} />}
                      onClick={generateTelegramLink}
                      loading={isGeneratingLink}
                      fullWidth
                    >
                      Подключить Telegram
                    </Button>
                  )}
                </Stack>
                <Stack gap="sm" mt="md">
                  <Group justify="space-between" align="center">
                    <Group>
                      <IconMail size={18} />
                      <Text size="sm" fw={500}>Почта</Text>
                    </Group>
                    <Badge color={emailNotificationsEnabled ? "green" : "gray"} variant="light">
                      {emailNotificationsEnabled ? "Включена" : "Отключена"}
                    </Badge>
                  </Group>
                  <Button
                    onClick={toggleEmailNotifications}
                    fullWidth
                    variant={emailNotificationsEnabled ? "outline" : "filled"}
                    color={emailNotificationsEnabled ? "red" : "green"}
                  >
                    {emailNotificationsEnabled ? "Отключить" : "Включить"}
                  </Button>
                </Stack>
              </>
            )}
          </Paper>
        </div>
      </Box>
      <Modal
        opened={telegramModalOpened}
        onClose={closeTelegramModal}
        title="Подключение Telegram"
        centered
        size="lg"
      >
        <Stack align="center">
          <QRCode value={telegramLink} size={200} />
          <Text size="sm" mt="md" fw={500}>Или используйте ссылку:</Text>
          <Group w="100%">
            <Text
              size="sm"
              style={{
                flex: 1,
                wordBreak: 'break-all',
                padding: '8px 12px',
                backgroundColor: 'var(--mantine-color-gray-1)',
                borderRadius: 'var(--mantine-radius-sm)'
              }}
            >
              {telegramLink}
            </Text>
            <CopyButton value={telegramLink}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'Скопировано!' : 'Копировать'} withArrow>
                  <ActionIcon
                    color={copied ? 'teal' : 'gray'}
                    variant="light"
                    onClick={copy}
                    size="lg"
                  >
                    {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
          <Button
            component="a"
            href={telegramLink}
            target="_blank"
            rel="noopener noreferrer"
            leftSection={<IconBrandTelegram size={18} />}
            fullWidth
            mt="md"
          >
            Открыть в Telegram
          </Button>
          <Text size="xs" c="dimmed" mt="sm">
            Ссылка действительна в течение 15 минут
          </Text>
        </Stack>
      </Modal>
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
      <Modal opened={passwordModalOpened} onClose={closePasswordModal} title="Подтвердите смену фото" centered>
        <PasswordInput
          label="Введите ваш пароль"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          placeholder="Пароль"
          required
          mt="md"
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
    </Stack>
  );
};

export default ProfileInfo;
