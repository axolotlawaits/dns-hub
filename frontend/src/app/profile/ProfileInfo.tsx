import { useState, useEffect } from 'react';
import { useUserContext } from '../../hooks/useUserContext';
import { API } from '../../config/constants';
import { notificationSystem } from '../../utils/Push';
import {  Avatar,  Card,  Text,  Group,  Badge,  Skeleton,  Stack,  Box,  Modal,  Button,  Loader,  CopyButton,  Tooltip,  ActionIcon, Title, Divider, ThemeIcon, Grid, Alert, Switch, SegmentedControl } from '@mantine/core';
import { DynamicFormModal, FormField } from '../../utils/formModal';
import { useDisclosure } from '@mantine/hooks';
import { DndProviderWrapper } from '../../utils/dnd';
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
  IconBell,
  IconQrcode,
  IconBookmark
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
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isTelegramConnected, setIsTelegramConnected] = useState(false);
  const [telegramLink, setTelegramLink] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [telegramUserName, setTelegramUserName] = useState('');
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
  const [bookmarksCardsPerRow, setBookmarksCardsPerRow] = useState<3 | 6 | 9>(6);
  const [photoModalOpened, { open: openPhotoModal, close: closePhotoModal }] = useDisclosure(false);
  const [passwordModalOpened, { open: openPasswordModal, close: closePasswordModal }] = useDisclosure(false);
  const [telegramModalOpened, { open: openTelegramModal, close: closeTelegramModal }] = useDisclosure(false);
  const [photoForm, setPhotoForm] = useState({ password: '' });

  // Конфигурация полей для формы фото
  const photoFields: FormField[] = [
    {
      name: 'password',
      label: 'Пароль',
      type: 'text',
      required: true,
      placeholder: 'Введите пароль для подтверждения'
    }
  ];

  // Конфигурация полей для выбора фото
  const photoSelectFields: FormField[] = [
    {
      name: 'photo',
      label: 'Выберите фото',
      type: 'file',
      required: true,
      accept: 'image/*',
      withDnd: true
    }
  ];

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

  // Функции для работы с настройками закладок
  const saveBookmarksSetting = async (parameter: string, value: string) => {
    if (!user?.id) return;

    try {
      const response = await fetch(`${API}/user/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          userId: user.id,
          parameter: parameter,
          value: value
        }),
      });

      if (!response.ok) {
        throw new Error('Ошибка сохранения настройки');
      }
    } catch (err) {
      console.error('Error saving bookmarks setting:', err);
      notificationSystem.addNotification(
        'Ошибка',
        'Не удалось сохранить настройку закладок',
        'error'
      );
    }
  };

  const loadBookmarksSetting = async (parameter: string) => {
    if (!user?.id) return null;

    try {
      const response = await fetch(`${API}/user/settings/${user.id}/${parameter}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return data.value;
    } catch (err) {
      console.error('Error loading bookmarks setting:', err);
      return null;
    }
  };

  const handleBookmarksCardsPerRowChange = async (value: string) => {
    const newCardsPerRow = parseInt(value) as 3 | 6 | 9;
    setBookmarksCardsPerRow(newCardsPerRow);
    await saveBookmarksSetting('bookmarks_cards_per_row', value);
    notificationSystem.addNotification(
      'Успех',
      `Настройка закладок обновлена: ${newCardsPerRow} карточек в ряд`,
      'success'
    );
  };

  // Загрузка сохраненной настройки количества карточек
  useEffect(() => {
    const loadCardsPerRowSetting = async () => {
      const savedSetting = await loadBookmarksSetting('bookmarks_cards_per_row');
      if (savedSetting && ['3', '6', '9'].includes(savedSetting)) {
        setBookmarksCardsPerRow(parseInt(savedSetting) as 3 | 6 | 9);
      }
    };

    if (user?.id) {
      loadCardsPerRowSetting();
    }
  }, [user?.id]);

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


  const handlePhotoSelect = async (values: Record<string, any>) => {
    const file = values.photo;
    if (!file || !(file instanceof File)) return;
    
    setFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setNewPhoto(reader.result as string);
      closePhotoModal();
      setPhotoForm({ password: '' });
      openPasswordModal();
    };
    reader.readAsDataURL(file);
  };


  const updatePhoto = async (values: Record<string, any>) => {
    if (!file || !newPhoto || !user?.login || isUpdating) return;
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
          password: values.password
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 401) throw new Error('Неверный пароль');
        throw new Error(errorData.message || 'Ошибка при обновлении фотографии');
      }
      setUser((prevUser: any) => prevUser ? { ...prevUser, image: base64String } : null);
      closePasswordModal();
      setNewPhoto(null);
      setFile(null);
      setPhotoForm({ password: '' });
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
    <DndProviderWrapper>
      <Stack gap="lg">
      {/* Основная информация о пользователе */}
      <Card 
        shadow="lg" 
        padding="xl" 
        radius="lg" 
        className="profile-main-card"
        style={{
          background: 'var(--theme-bg-elevated)',
          border: '1px solid var(--theme-border)',
          transition: 'var(--transition-all)',
          marginBottom: 'var(--space-4)'
        }}
      >
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
                  <Title 
                    order={2} 
                    mb="xs"
                    style={{ 
                      color: 'var(--theme-text-primary)',
                      fontWeight: 'var(--font-weight-bold)',
                      fontSize: 'var(--font-size-2xl)'
                    }}
                  >
                    {userData.fio}
                  </Title>
                  <Text 
                    size="md" 
                    mb="sm"
                    style={{ 
                      color: 'var(--theme-text-secondary)',
                      fontSize: 'var(--font-size-base)'
                    }}
                  >
                    {userData.position.name || 'Должность не указана'}
                  </Text>
                </Box>
                <Badge 
                  size="md" 
                  color={userData.status === 'active' ? 'green' : 'red'} 
                  variant="light"
                  className="status-badge"
                >
                  {userData.status}
                </Badge>
              </Group>

              <Grid gutter="sm">
                <Grid.Col span={6}>
                  <Group gap="sm" mb="sm">
                    <ThemeIcon size="md" color="blue" variant="light">
                      <IconBuilding size={16} />
                    </ThemeIcon>
                    <Box>
                      <Text 
                        size="sm" 
                        fw={500}
                        style={{ 
                          color: 'var(--theme-text-tertiary)',
                          fontSize: 'var(--font-size-sm)'
                        }}
                      >
                        РРС
                      </Text>
                      <Text 
                        size="md"
                        style={{ 
                          color: 'var(--theme-text-primary)',
                          fontSize: 'var(--font-size-base)'
                        }}
                      >
                        {userData.branch.rrs || 'Не указано'}
                      </Text>
                    </Box>
                  </Group>
                  
                  <Group gap="sm" mb="sm">
                    <ThemeIcon size="md" color="green" variant="light">
                      <IconBuilding size={16} />
                    </ThemeIcon>
                    <Box>
                      <Text 
                        size="sm" 
                        fw={500}
                        style={{ 
                          color: 'var(--theme-text-tertiary)',
                          fontSize: 'var(--font-size-sm)'
                        }}
                      >
                        Отдел
                      </Text>
                      <Text 
                        size="md"
                        style={{ 
                          color: 'var(--theme-text-primary)',
                          fontSize: 'var(--font-size-base)'
                        }}
                      >
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
                      <Text 
                        size="sm" 
                        fw={500}
                        style={{ 
                          color: 'var(--theme-text-tertiary)',
                          fontSize: 'var(--font-size-sm)'
                        }}
                      >
                        Дата рождения
                      </Text>
                      <Text 
                        size="md"
                        style={{ 
                          color: 'var(--theme-text-primary)',
                          fontSize: 'var(--font-size-base)'
                        }}
                      >
                        {new Date(userData.birthday).toLocaleDateString()}
                      </Text>
                    </Box>
                  </Group>
                  
                  <Group gap="sm" mb="sm">
                    <ThemeIcon size="md" color="purple" variant="light">
                      <IconMailSolid size={16} />
                    </ThemeIcon>
                    <Box>
                      <Text 
                        size="sm" 
                        fw={500}
                        style={{ 
                          color: 'var(--theme-text-tertiary)',
                          fontSize: 'var(--font-size-sm)'
                        }}
                      >
                        Email
                      </Text>
                      <Text 
                        size="md"
                        style={{ 
                          color: 'var(--theme-text-primary)',
                          fontSize: 'var(--font-size-base)'
                        }}
                      >
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
      <Card 
        shadow="lg" 
        padding="xl" 
        radius="lg" 
        className="notifications-card"
        style={{
          background: 'var(--theme-bg-elevated)',
          border: '1px solid var(--theme-border)',
          transition: 'var(--transition-all)',
          marginBottom: 'var(--space-4)'
        }}
      >
        <Group mb="md" align="center">
          <ThemeIcon size="md" color="blue" variant="light">
            <IconBell size={18} />
          </ThemeIcon>
          <Title 
            order={4}
            style={{ 
              color: 'var(--theme-text-primary)',
              fontWeight: 'var(--font-weight-semibold)',
              fontSize: 'var(--font-size-lg)'
            }}
          >
            Настройки уведомлений
          </Title>
        </Group>

        <Grid gutter="lg">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card 
              padding="md" 
              radius="md" 
              className="notification-service-card"
              style={{
                background: 'var(--theme-bg-secondary)',
                border: '1px solid var(--theme-border)',
                transition: 'var(--transition-all)',
                height: '140px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <Group justify="space-between" mb="sm">
                <Group gap="sm">
                  <ThemeIcon size="sm" color="blue" variant="light">
                    <IconBrandTelegram size={16} />
                  </ThemeIcon>
                  <Text 
                    fw={600}
                    style={{ color: 'var(--theme-text-primary)' }}
                  >
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
                        <Text 
                          size="sm"
                          style={{ color: 'var(--theme-text-secondary)' }}
                        >
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
            <Card 
              padding="md" 
              radius="md" 
              className="notification-service-card"
              style={{
                background: 'var(--theme-bg-secondary)',
                border: '1px solid var(--theme-border)',
                transition: 'var(--transition-all)',
                height: '140px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <Group justify="space-between" mb="sm">
                <Group gap="sm">
                  <ThemeIcon size="sm" color="green" variant="light">
                    <IconMail size={16} />
                  </ThemeIcon>
                  <Text 
                    fw={600}
                    style={{ color: 'var(--theme-text-primary)' }}
                  >
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
                <Text 
                  size="sm"
                  style={{ color: 'var(--theme-text-secondary)' }}
                >
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

      {/* Настройки закладок */}
      <Card 
        shadow="lg" 
        padding="xl" 
        radius="lg" 
        className="notifications-card"
        style={{
          background: 'var(--theme-bg-elevated)',
          border: '1px solid var(--theme-border)',
          transition: 'var(--transition-all)',
          marginBottom: 'var(--space-4)'
        }}
      >
        <Group mb="md" align="center">
          <ThemeIcon size="md" color="green" variant="light">
            <IconBookmark size={18} />
          </ThemeIcon>
          <Title 
            order={4} 
            style={{ 
              color: 'var(--theme-text-primary)',
              fontWeight: 'var(--font-weight-semibold)',
              fontSize: 'var(--font-size-lg)'
            }}
          >
            Настройки закладок
          </Title>
        </Group>

        <Grid gutter="lg">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card 
              padding="md" 
              radius="md" 
              className="notification-service-card"
              style={{
                background: 'var(--theme-bg-secondary)',
                border: '1px solid var(--theme-border)',
                transition: 'var(--transition-all)',
                height: '140px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <Group justify="space-between" mb="sm">
                <Group gap="sm">
                  <ThemeIcon size="sm" color="green" variant="light">
                    <IconBookmark size={16} />
                  </ThemeIcon>
                  <Text 
                    fw={600} 
                    style={{ color: 'var(--theme-text-primary)' }}
                  >
                    Количество карточек в ряд
                  </Text>
                </Group>
                <Badge 
                  color="green" 
                  variant="light"
                  size="sm"
                >
                  {bookmarksCardsPerRow} карточек
                </Badge>
              </Group>
              
              <Stack gap="sm">
                <Text 
                  size="sm" 
                  style={{ color: 'var(--theme-text-secondary)' }}
                >
                  Выберите количество закладок, отображаемых в одном ряду
                </Text>
                <SegmentedControl
                  value={bookmarksCardsPerRow.toString()}
                  onChange={handleBookmarksCardsPerRowChange}
                  data={[
                    { label: '3', value: '3' },
                    { label: '6', value: '6' },
                    { label: '9', value: '9' }
                  ]}
                  size="sm"
                  color="green"
                  fullWidth
                />
              </Stack>
            </Card>
          </Grid.Col>
          
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card 
              padding="md" 
              radius="md" 
              className="notification-service-card"
              style={{
                background: 'var(--theme-bg-secondary)',
                border: '1px solid var(--theme-border)',
                transition: 'var(--transition-all)',
                height: '140px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <Group gap="sm" mb="sm">
                <ThemeIcon size="sm" color="blue" variant="light">
                  <IconBookmark size={16} />
                </ThemeIcon>
                <Text 
                  fw={600} 
                  style={{ color: 'var(--theme-text-primary)' }}
                >
                  Информация
                </Text>
              </Group>
              
              <Stack gap="xs">
                <Text 
                  size="sm" 
                  style={{ color: 'var(--theme-text-secondary)' }}
                >
                  • Максимум 2 ряда отображается на главной странице
                </Text>
                <Text 
                  size="sm" 
                  style={{ color: 'var(--theme-text-secondary)' }}
                >
                  • Остальные закладки доступны в модальном окне
                </Text>
                <Text 
                  size="sm" 
                  style={{ color: 'var(--theme-text-secondary)' }}
                >
                  • Настройка сохраняется автоматически
                </Text>
              </Stack>
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
      <DynamicFormModal
        opened={photoModalOpened}
        onClose={closePhotoModal}
        title={user?.image ? 'Смена фото профиля' : 'Добавление фото профиля'}
        mode="create"
        fields={photoSelectFields}
        initialValues={{ photo: null }}
        onSubmit={handlePhotoSelect}
        submitButtonText="Выбрать фото"
      />
      <DynamicFormModal
        opened={passwordModalOpened}
        onClose={closePasswordModal}
        title="Подтвердите смену фото"
        mode="create"
        fields={photoFields}
        initialValues={photoForm}
        onSubmit={updatePhoto}
        submitButtonText="Подтвердить"
      />
      </Stack>
    </DndProviderWrapper>
  );
};

export default ProfileInfo;
