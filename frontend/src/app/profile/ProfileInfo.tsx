import { useState, useEffect } from 'react';
import { useUserContext } from '../../hooks/useUserContext';
import { API } from '../../config/constants';
import { notificationSystem } from '../../utils/Push';
import { 
  Avatar, 
  Card, 
  Text, 
  Group, 
  Badge, 
  Skeleton, 
  Stack, 
  Box, 
  Modal, 
  Button, 
  PasswordInput, 
  Image, 
  FileButton, 
  Loader, 
  CopyButton, 
  Tooltip, 
  ActionIcon,
  Title,
  Divider,
  ThemeIcon,
  Grid,
  Alert,
  Switch
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import QRCode from 'react-qr-code';
import { 
  IconBrandTelegram, 
  IconLink, 
  IconUnlink, 
  IconCopy, 
  IconCheck, 
  IconMail, 
  IconBuilding,
  IconCalendar,
  IconMail as IconMailSolid,
  IconEdit,
  IconCamera,
  IconShield,
  IconBell,
  IconQrcode
} from '@tabler/icons-react';

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
    fetchUserData();
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
    <Stack gap="lg">
      {/* Основная информация о пользователе */}
      <Card shadow="lg" padding="xl" radius="lg" className="profile-main-card">
        <Grid gutter="lg">
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Stack align="center" gap="md">
              <Box className="avatar-container">
                <Avatar
                  src={user?.image ? `data:image/jpeg;base64,${user.image}` : null}
                  size={120}
                  radius="xl"
                  className="profile-avatar"
                />
                <ActionIcon
                  size="md"
                  radius="xl"
                  color="blue"
                  variant="filled"
                  className="avatar-edit-button"
                  onClick={openPhotoModal}
                >
                  <IconCamera size={16} />
                </ActionIcon>
              </Box>
              <Button
                variant="subtle"
                leftSection={<IconEdit size={16} />}
                onClick={openPhotoModal}
                size="sm"
                className="edit-photo-button"
              >
                {user?.image ? 'Сменить фото' : 'Добавить фото'}
              </Button>
            </Stack>
          </Grid.Col>
          
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Stack gap="md">
              <Group justify="space-between" align="flex-start">
                <Box>
                  <Title order={2} c="var(--theme-text-primary)" mb="xs">
                    {userData.fio}
                  </Title>
                  <Text size="md" c="var(--theme-text-secondary)" mb="sm">
                    {userData.position.name || 'Должность не указана'}
                  </Text>
                </Box>
                <Badge 
                  size="md" 
                  color={userData.status === 'active' ? 'green' : 'red'} 
                  variant="light"
                  className="status-badge"
                >
                  {userData.status === 'active' ? 'Активен' : 'Неактивен'}
                </Badge>
              </Group>

              <Grid gutter="sm">
                <Grid.Col span={6}>
                  <Group gap="sm" mb="sm">
                    <ThemeIcon size="md" color="blue" variant="light">
                      <IconBuilding size={16} />
                    </ThemeIcon>
                    <Box>
                      <Text size="sm" c="var(--theme-text-tertiary)" fw={500}>
                        РРС
                      </Text>
                      <Text size="md" c="var(--theme-text-primary)">
                        {userData.branch.rrs || 'Не указано'}
                      </Text>
                    </Box>
                  </Group>
                  
                  <Group gap="sm" mb="sm">
                    <ThemeIcon size="md" color="green" variant="light">
                      <IconBuilding size={16} />
                    </ThemeIcon>
                    <Box>
                      <Text size="sm" c="var(--theme-text-tertiary)" fw={500}>
                        Отдел
                      </Text>
                      <Text size="md" c="var(--theme-text-primary)">
                        {userData.branch.name || 'Не указано'}
                      </Text>
                    </Box>
                  </Group>
                </Grid.Col>
                
                <Grid.Col span={6}>
                  <Group gap="sm" mb="sm">
                    <ThemeIcon size="md" color="orange" variant="light">
                      <IconCalendar size={16} />
                    </ThemeIcon>
                    <Box>
                      <Text size="sm" c="var(--theme-text-tertiary)" fw={500}>
                        Дата рождения
                      </Text>
                      <Text size="md" c="var(--theme-text-primary)">
                        {new Date(userData.birthday).toLocaleDateString()}
                      </Text>
                    </Box>
                  </Group>
                  
                  <Group gap="sm" mb="sm">
                    <ThemeIcon size="md" color="purple" variant="light">
                      <IconMailSolid size={16} />
                    </ThemeIcon>
                    <Box>
                      <Text size="sm" c="var(--theme-text-tertiary)" fw={500}>
                        Email
                      </Text>
                      <Text size="md" c="var(--theme-text-primary)">
                        {userData.email}
                      </Text>
                    </Box>
                  </Group>
                </Grid.Col>
              </Grid>
            </Stack>
          </Grid.Col>
        </Grid>
      </Card>

      {/* Настройки уведомлений */}
      <Card shadow="lg" padding="xl" radius="lg" className="notifications-card">
        <Group mb="md" align="center">
          <ThemeIcon size="md" color="blue" variant="light">
            <IconBell size={18} />
          </ThemeIcon>
          <Title order={4} c="var(--theme-text-primary)">
            Настройки уведомлений
          </Title>
        </Group>

        <Grid gutter="lg">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card padding="md" radius="md" className="notification-service-card">
              <Group justify="space-between" mb="sm">
                <Group gap="sm">
                  <ThemeIcon size="sm" color="blue" variant="light">
                    <IconBrandTelegram size={16} />
                  </ThemeIcon>
                  <Text fw={600} c="var(--theme-text-primary)">
                    Telegram
                  </Text>
                </Group>
                {telegramLoading ? (
                  <Loader size="sm" />
                ) : (
                                  <Badge 
                  color={isTelegramConnected ? "green" : "gray"} 
                  variant="light"
                  size="sm"
                >
                  {isTelegramConnected ? "Подключен" : "Не подключен"}
                </Badge>
                )}
              </Group>
              
              {!telegramLoading && (
                <>
                  {isTelegramConnected ? (
                    <Stack gap="md">
                      {telegramUserName && (
                        <Text size="sm" c="var(--theme-text-secondary)">
                          @{telegramUserName}
                        </Text>
                      )}
                      <Button
                        leftSection={<IconUnlink size={16} />}
                        variant="outline"
                        color="red"
                        onClick={disconnectTelegram}
                        fullWidth
                        size="sm"
                        className="disconnect-button"
                      >
                        Отключить
                      </Button>
                    </Stack>
                  ) : (
                    <Button
                      leftSection={<IconLink size={16} />}
                      onClick={generateTelegramLink}
                      loading={isGeneratingLink}
                      fullWidth
                      size="sm"
                      className="connect-button"
                    >
                      Подключить Telegram
                    </Button>
                  )}
                </>
              )}
            </Card>
          </Grid.Col>
          
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card padding="md" radius="md" className="notification-service-card">
              <Group justify="space-between" mb="sm">
                <Group gap="sm">
                  <ThemeIcon size="sm" color="green" variant="light">
                    <IconMail size={16} />
                  </ThemeIcon>
                  <Text fw={600} c="var(--theme-text-primary)">
                    Email уведомления
                  </Text>
                </Group>
                <Badge 
                  color={emailNotificationsEnabled ? "green" : "gray"} 
                  variant="light"
                  size="sm"
                >
                  {emailNotificationsEnabled ? "Включены" : "Отключены"}
                </Badge>
              </Group>
              
              <Group justify="space-between" align="center">
                <Text size="sm" c="var(--theme-text-secondary)">
                  Получать уведомления по почте
                </Text>
                <Switch
                  checked={emailNotificationsEnabled}
                  onChange={toggleEmailNotifications}
                  color="green"
                  size="sm"
                />
              </Group>
            </Card>
          </Grid.Col>
        </Grid>
      </Card>
      <Modal
        opened={telegramModalOpened}
        onClose={closeTelegramModal}
        title={
          <Group gap="sm">
            <ThemeIcon size="md" color="blue" variant="light">
              <IconBrandTelegram size={18} />
            </ThemeIcon>
            <Text fw={600}>Подключение Telegram</Text>
          </Group>
        }
        centered
        size="lg"
        className="telegram-modal"
      >
        <Stack align="center" gap="sm">
          <Card padding="md" radius="md" className="qr-code-card">
            <Stack align="center" gap="sm">
              <QRCode value={telegramLink} size={200} />
              <Text size="sm" c="var(--theme-text-secondary)" ta="center">
                Отсканируйте QR-код в приложении Telegram
              </Text>
            </Stack>
          </Card>
          
          <Divider label="или" labelPosition="center" w="100%" my="xs" />
          
          <Box w="100%">
            <Text size="sm" fw={500} mb="xs" c="var(--theme-text-primary)">
              Используйте ссылку:
            </Text>
            <Group w="100%">
              <Text
                size="sm"
                className="telegram-link-text"
                style={{
                  flex: 1,
                  wordBreak: 'break-all',
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--theme-bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--theme-border)'
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
          </Box>
          
          <Button
            component="a"
            href={telegramLink}
            target="_blank"
            rel="noopener noreferrer"
            leftSection={<IconBrandTelegram size={18} />}
            fullWidth
            size="md"
            className="telegram-open-button"
          >
            Открыть в Telegram
          </Button>
          
          <Alert 
            icon={<IconQrcode size={16} />} 
            color="blue" 
            variant="light"
            className="telegram-info-alert"
            mt="xs"
          >
            <Text size="sm">
              Ссылка действительна в течение 15 минут
            </Text>
          </Alert>
        </Stack>
      </Modal>
      <Modal 
        opened={photoModalOpened} 
        onClose={closePhotoModal} 
        title={
          <Group gap="sm">
            <ThemeIcon size="md" color="blue" variant="light">
              <IconCamera size={18} />
            </ThemeIcon>
            <Text fw={600}>
              {user?.image ? 'Смена фото профиля' : 'Добавление фото профиля'}
            </Text>
          </Group>
        } 
        centered
        size="md"
        className="photo-modal"
      >
        <Stack gap="md">
          <Group justify="center" gap="md">
            {user?.image && (
              <Card padding="sm" radius="md" className="photo-preview-card">
                <Stack align="center" gap="xs">
                  <Text size="sm" fw={500} c="var(--theme-text-primary)">
                    Текущее фото
                  </Text>
                  <Image
                    src={`data:image/jpeg;base64,${user.image}`}
                    width={100}
                    height={100}
                    radius="md"
                    className="photo-preview"
                  />
                </Stack>
              </Card>
            )}
            {newPhoto && (
              <Card padding="sm" radius="md" className="photo-preview-card">
                <Stack align="center" gap="xs">
                  <Text size="sm" fw={500} c="var(--theme-text-primary)">
                    Новое фото
                  </Text>
                  <Image
                    src={newPhoto}
                    width={100}
                    height={100}
                    radius="md"
                    className="photo-preview"
                  />
                </Stack>
              </Card>
            )}
          </Group>
          
          <FileButton onChange={handleFileSelect} accept="image/*">
            {(props) => (
              <Button 
                {...props} 
                fullWidth 
                size="sm"
                leftSection={<IconCamera size={16} />}
                className="select-photo-button"
              >
                {newPhoto ? 'Выбрать другое фото' : 'Выбрать фото'}
              </Button>
            )}
          </FileButton>
          
          {newPhoto && (
            <Button 
              fullWidth 
              size="sm"
              onClick={handleSavePhoto}
              leftSection={<IconCheck size={16} />}
              className="save-photo-button"
            >
              Сохранить фото
            </Button>
          )}
        </Stack>
      </Modal>
      <Modal 
        opened={passwordModalOpened} 
        onClose={closePasswordModal} 
        title={
          <Group gap="sm">
            <ThemeIcon size="md" color="orange" variant="light">
              <IconShield size={18} />
            </ThemeIcon>
            <Text fw={600}>Подтвердите смену фото</Text>
          </Group>
        } 
        centered
        size="sm"
        className="password-modal"
      >
        <Stack gap="xs">
          <Alert 
            icon={<IconShield size={16} />} 
            color="orange" 
            variant="light"
            className="password-alert"
            mb="xs"
          >
            <Text size="sm">
              Для изменения фото профиля необходимо подтвердить пароль
            </Text>
          </Alert>
          
          <PasswordInput
            label="Введите ваш пароль"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            placeholder="Пароль"
            required
            size="sm"
            leftSection={<IconShield size={16} />}
            className="password-input"
            mb="xs"
          />
          
          <Group justify="flex-end" gap="xs" mt="xs">
            <Button 
              variant="outline" 
              onClick={closePasswordModal} 
              disabled={isUpdating}
              className="cancel-button"
              size="sm"
            >
              Отмена
            </Button>
            <Button 
              onClick={updatePhoto} 
              loading={isUpdating}
              leftSection={<IconCheck size={16} />}
              className="confirm-button"
              size="sm"
            >
              Подтвердить
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};

export default ProfileInfo;
