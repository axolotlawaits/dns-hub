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
  const [autoHideFooter, setAutoHideFooter] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isTelegramConnected, setIsTelegramConnected] = useState(false);
  const [telegramLink, setTelegramLink] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  // Обработчик изменения настройки футера
  const handleFooterSettingChange = async (value: boolean) => {
    setAutoHideFooter(value);
    await saveUserSetting('auto_hide_footer', value.toString());
    // Уведомляем другие компоненты об изменении настройки
    window.dispatchEvent(new CustomEvent('footer-setting-changed', { detail: value }));
    notificationSystem.addNotification(
      'Успех',
      `Настройка панели обновлена: ${value ? 'автоскрытие включено' : 'автоскрытие отключено'}`,
      'success'
    );
  };
  const [telegramUserName, setTelegramUserName] = useState('');
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
  // Настройки Telegram бота
  const [telegramDoorOpeningEnabled, setTelegramDoorOpeningEnabled] = useState(true);
  const [telegramNotificationsEnabled, setTelegramNotificationsEnabled] = useState(true);
  const [telegramAdditionalDoorsEnabled, setTelegramAdditionalDoorsEnabled] = useState(false);
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(true);
  const [notificationSound, setNotificationSound] = useState<string>('default');
  const [bookmarksCardsPerRow, setBookmarksCardsPerRow] = useState<3 | 6 | 9>(6);
  const [navMenuMode, setNavMenuMode] = useState<string>('auto'); // 'auto', 'always_open', 'always_closed'
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

  // Функции для работы с настройками пользователя
  const saveUserSetting = async (parameter: string, value: string) => {
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

  const loadUserSetting = async (parameter: string) => {
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
    await saveUserSetting('bookmarks_cards_per_row', value);
    notificationSystem.addNotification(
      'Успех',
      `Настройка закладок обновлена: ${newCardsPerRow} карточек в ряд`,
      'success'
    );
  };

  const handleNotificationSoundToggle = async (enabled: boolean) => {
    setNotificationSoundEnabled(enabled);
    await saveUserSetting('notificationSoundEnabled', enabled.toString());
    localStorage.setItem('notificationSoundEnabled', enabled.toString());
    notificationSystem.addNotification(
      'Успех',
      `Звук уведомлений ${enabled ? 'включен' : 'отключен'}`,
      'success'
    );
  };

  const handleNotificationSoundChange = async (sound: string) => {
    setNotificationSound(sound);
    await saveUserSetting('notificationSound', sound);
    localStorage.setItem('notificationSound', sound);
    notificationSystem.addNotification(
      'Успех',
      `Звук уведомлений изменен на: ${sound === 'default' ? 'По умолчанию' : sound === 'gentle' ? 'Мягкий' : sound === 'classic' ? 'Классический' : 'Современный'}`,
      'success'
    );
    
    // Воспроизводим звук для предпросмотра
    if (notificationSoundEnabled) {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      switch (sound) {
        case 'gentle':
          oscillator.frequency.value = 800;
          oscillator.type = 'sine';
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.3);
          break;
        case 'classic':
          oscillator.frequency.value = 1000;
          oscillator.type = 'square';
          gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.2);
          break;
        case 'modern':
          const osc1 = audioContext.createOscillator();
          const osc2 = audioContext.createOscillator();
          const gain1 = audioContext.createGain();
          const gain2 = audioContext.createGain();
          
          osc1.frequency.value = 800;
          osc2.frequency.value = 1000;
          osc1.type = 'sine';
          osc2.type = 'sine';
          
          osc1.connect(gain1);
          osc2.connect(gain2);
          gain1.connect(audioContext.destination);
          gain2.connect(audioContext.destination);
          
          gain1.gain.setValueAtTime(0.2, audioContext.currentTime);
          gain2.gain.setValueAtTime(0.2, audioContext.currentTime);
          gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
          gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
          
          osc1.start(audioContext.currentTime);
          osc2.start(audioContext.currentTime);
          osc1.stop(audioContext.currentTime + 0.4);
          osc2.stop(audioContext.currentTime + 0.4);
          return;
        default:
          oscillator.frequency.value = 600;
          oscillator.type = 'sine';
          gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.25);
      }
    }
  };

  const handleNavMenuModeChange = async (value: string) => {
    setNavMenuMode(value);
    await saveUserSetting('nav_menu_mode', value);
    localStorage.setItem('nav_menu_mode', value);
    // Уведомляем App.tsx об изменении настройки
    window.dispatchEvent(new CustomEvent('nav-menu-mode-changed', { detail: value }));
    notificationSystem.addNotification(
      'Успех',
      `Режим меню изменен: ${value === 'auto' ? 'Автоматически' : value === 'always_open' ? 'Всегда открыто' : 'Всегда скрыто'}`,
      'success'
    );
  };

  // Загрузка настроек звука уведомлений
  useEffect(() => {
    const loadSoundSettings = async () => {
      if (!user?.id) return;
      
      const soundEnabled = await loadUserSetting('notificationSoundEnabled');
      const soundType = await loadUserSetting('notificationSound');
      
      if (soundEnabled !== null) {
        setNotificationSoundEnabled(soundEnabled === 'true');
        localStorage.setItem('notificationSoundEnabled', soundEnabled);
      } else {
        localStorage.setItem('notificationSoundEnabled', 'true');
      }
      
      if (soundType && ['default', 'gentle', 'classic', 'modern'].includes(soundType)) {
        setNotificationSound(soundType);
        localStorage.setItem('notificationSound', soundType);
      } else {
        localStorage.setItem('notificationSound', 'default');
      }
    };

    if (user?.id) {
      loadSoundSettings();
    }
  }, [user?.id]);

  // Загрузка сохраненной настройки количества карточек
  useEffect(() => {
    const loadCardsPerRowSetting = async () => {
      const savedSetting = await loadUserSetting('bookmarks_cards_per_row');
      if (savedSetting && ['3', '6', '9'].includes(savedSetting)) {
        setBookmarksCardsPerRow(parseInt(savedSetting) as 3 | 6 | 9);
      }
    };

    if (user?.id) {
      loadCardsPerRowSetting();
    }
  }, [user?.id]);

  // Загрузка настройки автоскрытия футера
  useEffect(() => {
    const loadFooterSetting = async () => {
      const savedSetting = await loadUserSetting('auto_hide_footer');
      if (savedSetting !== null) {
        setAutoHideFooter(savedSetting === 'true');
      } else {
        // Если настройка не найдена, используем значение по умолчанию (отключено)
        setAutoHideFooter(false);
      }
    };

    if (user?.id) {
      loadFooterSetting();
    }
  }, [user?.id]);

  // Загрузка настроек Telegram
  useEffect(() => {
    const loadTelegramSettings = async () => {
      if (!user?.id) return;
      
      const doorOpening = await loadUserSetting('telegram_door_opening_enabled');
      const notifications = await loadUserSetting('telegram_notifications_enabled');
      const additionalDoors = await loadUserSetting('telegram_additional_doors_enabled');
      
      if (doorOpening !== null) {
        setTelegramDoorOpeningEnabled(doorOpening === 'true');
      } else {
        // По умолчанию включено
        setTelegramDoorOpeningEnabled(true);
      }
      
      if (notifications !== null) {
        setTelegramNotificationsEnabled(notifications === 'true');
      } else {
        // По умолчанию включено
        setTelegramNotificationsEnabled(true);
      }
      
      if (additionalDoors !== null) {
        setTelegramAdditionalDoorsEnabled(additionalDoors === 'true');
      } else {
        // По умолчанию отключено
        setTelegramAdditionalDoorsEnabled(false);
      }
    };

    if (user?.id) {
      loadTelegramSettings();
    }
  }, [user?.id]);

  const handleTelegramDoorOpeningToggle = async (enabled: boolean) => {
    setTelegramDoorOpeningEnabled(enabled);
    await saveUserSetting('telegram_door_opening_enabled', enabled.toString());
    notificationSystem.addNotification(
      'Успех',
      `Открытие дверей через Telegram ${enabled ? 'включено' : 'отключено'}`,
      'success'
    );
  };

  const handleTelegramNotificationsToggle = async (enabled: boolean) => {
    setTelegramNotificationsEnabled(enabled);
    await saveUserSetting('telegram_notifications_enabled', enabled.toString());
    notificationSystem.addNotification(
      'Успех',
      `Оповещения в Telegram ${enabled ? 'включены' : 'отключены'}`,
      'success'
    );
  };

  const handleTelegramAdditionalDoorsToggle = async (enabled: boolean) => {
    setTelegramAdditionalDoorsEnabled(enabled);
    await saveUserSetting('telegram_additional_doors_enabled', enabled.toString());
    notificationSystem.addNotification(
      'Успех',
      `Дополнительные двери в Telegram ${enabled ? 'включены' : 'отключены'}`,
      'success'
    );
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

  const handlePhotoSelect = async (values: Record<string, any>) => {
    const photoValue = values.photo;
    
    // Обрабатываем разные форматы данных
    let file: File | null = null;
    
    // Если это массив FileAttachment (из FileUploadComponent)
    if (Array.isArray(photoValue) && photoValue.length > 0) {
      const attachment = photoValue[0];
      if (attachment && attachment.source instanceof File) {
        file = attachment.source;
      } else if (attachment && typeof attachment.source === 'string') {
        // Если это строка (путь к файлу), пропускаем
        notificationSystem.addNotification(
          'Ошибка',
          'Пожалуйста, выберите новый файл для загрузки',
          'error'
        );
        return;
      }
    }
    // Если это напрямую File объект
    else if (photoValue instanceof File) {
      file = photoValue;
    }
    // Если это FileAttachment объект
    else if (photoValue && photoValue.source instanceof File) {
      file = photoValue.source;
    }
    
    if (!file) {
      notificationSystem.addNotification(
        'Ошибка',
        'Пожалуйста, выберите файл для загрузки',
        'error'
      );
      return;
    }
    
    setFile(file);
    const reader = new FileReader();
    reader.onerror = () => {
      notificationSystem.addNotification(
        'Ошибка',
        'Не удалось прочитать файл',
        'error'
      );
    };
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
                minHeight: '250px',
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
                      
                      {/* Переключатели настроек Telegram */}
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <Text size="sm" style={{ color: 'var(--theme-text-primary)' }}>
                            Открытие дверей
                          </Text>
                          <Switch
                            checked={telegramDoorOpeningEnabled}
                            onChange={(e) => handleTelegramDoorOpeningToggle(e.currentTarget.checked)}
                            size="sm"
                          />
                        </Group>
                        
                        <Group justify="space-between">
                          <Text size="sm" style={{ color: 'var(--theme-text-primary)' }}>
                            Оповещения
                          </Text>
                          <Switch
                            checked={telegramNotificationsEnabled}
                            onChange={(e) => handleTelegramNotificationsToggle(e.currentTarget.checked)}
                            size="sm"
                          />
                        </Group>
                        
                        <Group justify="space-between">
                          <Text size="sm" style={{ color: 'var(--theme-text-primary)' }}>
                            Дополнительные двери
                          </Text>
                          <Switch
                            checked={telegramAdditionalDoorsEnabled}
                            onChange={(e) => handleTelegramAdditionalDoorsToggle(e.currentTarget.checked)}
                            size="sm"
                          />
                        </Group>
                      </Stack>
                      
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
                minHeight: '250px',
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

          {/* Настройка звука уведомлений */}
          <Grid.Col span={12}>
            <Card 
              padding="md" 
              radius="md"
              style={{ 
                background: 'var(--theme-bg-tertiary)',
                border: '1px solid var(--theme-border-primary)'
              }}
            >
              <Group justify="space-between" mb="sm">
                <Group gap="sm">
                  <ThemeIcon size="sm" color="blue" variant="light">
                    <IconBell size={16} />
                  </ThemeIcon>
                  <Text 
                    fw={600}
                    style={{ color: 'var(--theme-text-primary)' }}
                  >
                    Звук уведомлений
                  </Text>
                </Group>
                <Badge 
                  color={notificationSoundEnabled ? "blue" : "gray"} 
                  variant="light"
                  size="sm"
                >
                  {notificationSoundEnabled ? "Включен" : "Отключен"}
                </Badge>
              </Group>
              
              <Group justify="space-between" align="center" mb="md">
                <Text 
                  size="sm"
                  style={{ color: 'var(--theme-text-secondary)' }}
                >
                  Воспроизводить звук при получении уведомлений
                </Text>
                <Switch
                  checked={notificationSoundEnabled}
                  onChange={(event) => handleNotificationSoundToggle(event.currentTarget.checked)}
                  color="blue"
                  size="sm"
                />
              </Group>
              
              {notificationSoundEnabled && (
                <Box>
                  <Text 
                    size="sm"
                    fw={500}
                    mb="xs"
                    style={{ color: 'var(--theme-text-primary)' }}
                  >
                    Выберите звук:
                  </Text>
                  <SegmentedControl
                    value={notificationSound}
                    onChange={handleNotificationSoundChange}
                    data={[
                      { label: 'По умолчанию', value: 'default' },
                      { label: 'Мягкий', value: 'gentle' },
                      { label: 'Классический', value: 'classic' },
                      { label: 'Современный', value: 'modern' }
                    ]}
                    fullWidth
                  />
                </Box>
              )}
            </Card>
          </Grid.Col>
        </Grid>
      </Card>

      {/* Настройки интерфейса */}
      <Card 
        shadow="lg"  
        radius="lg" 
        className="interface-settings-card"
        style={{
          background: 'var(--theme-bg-elevated)',
          border: '1px solid var(--theme-border)',
          transition: 'var(--transition-all)',
          marginBottom: 'var(--space-4)'
        }}
      >
        <Group mb="md" align="center">
          <ThemeIcon size="lg" color="blue" variant="light" radius="xl">
            <IconBell size={20} />
          </ThemeIcon>
          <Box>
            <Title order={4} c="var(--theme-text-primary)">
              Настройки интерфейса
            </Title>
            <Text size="sm" c="var(--theme-text-secondary)">
              Персонализация внешнего вида
            </Text>
          </Box>
        </Group>

        <Grid>
          <Grid.Col span={12}>
            <Card 
              padding="md" 
              radius="md"
              style={{ 
                background: 'var(--theme-bg-tertiary)',
                border: '1px solid var(--theme-border-primary)'
              }}
            >
              <Group justify="space-between" align="center">
                <Box>
                  <Text size="sm" fw={500} c="var(--theme-text-primary)">
                    Автоскрывающаяся нижняя панель
                  </Text>
                  <Text size="xs" c="var(--theme-text-secondary)">
                    Панель будет скрываться автоматически и появляться при наведении
                  </Text>
                </Box>
                <Switch
                  checked={autoHideFooter}
                  onChange={(event) => handleFooterSettingChange(event.currentTarget.checked)}
                  color="blue"
                  size="sm"
                />
              </Group>
            </Card>
          </Grid.Col>
          <Grid.Col span={12}>
            <Card 
              padding="md" 
              radius="md"
              style={{ 
                background: 'var(--theme-bg-tertiary)',
                border: '1px solid var(--theme-border-primary)'
              }}
            >
              <Box mb="xs">
                <Text size="sm" fw={500} c="var(--theme-text-primary)" mb="xs">
                  Режим бокового меню
                </Text>
                <Text size="xs" c="var(--theme-text-secondary)" mb="md">
                  Выберите, как должно вести себя боковое меню навигации
                </Text>
                <SegmentedControl
                  value={navMenuMode}
                  onChange={handleNavMenuModeChange}
                  data={[
                    { label: 'Автоматически', value: 'auto' },
                    { label: 'Всегда открыто', value: 'always_open' },
                    { label: 'Всегда скрыто', value: 'always_closed' }
                  ]}
                  fullWidth
                />
              </Box>
            </Card>
          </Grid.Col>
        </Grid>
      </Card>

      {/* Настройки закладок */}
      <Card 
        shadow="lg" 
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
        initialValues={{ photo: [] }}
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
