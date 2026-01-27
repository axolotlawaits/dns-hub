import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {  ActionIcon,  AppShell,  Avatar,  Menu,  Divider,  Group,  Text,  Tooltip, Transition, Box, Button, Badge, ThemeIcon, ScrollArea, Loader, Stack } from '@mantine/core';
import {  IconBrightnessDown,  IconLogin,  IconLogout,  IconMoon,  IconUser, IconSearch, IconBell, IconAlertCircle, IconInfoCircle, IconCheck, IconX } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { useUserContext } from '../hooks/useUserContext';
import { clearAllAuthStorage } from '../utils/storage';
import { useTheme } from '../contexts/ThemeContext';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useDisclosure } from '@mantine/hooks';
import { useSocketIO } from '../hooks/useSocketIO';
import { API } from '../config/constants';
import dayjs from 'dayjs';
import { truncateText } from '../utils/format';
import Search from './Search';
import logoMiniDark from '../assets/images/logo-dark-mini.svg';
import logoFullDark from '../assets/images/logo-dark.svg';
import logoMiniLight from '../assets/images/logo-light-mini.svg';
import logoFullLight from '../assets/images/logo-light.svg';
import './styles/Header.css';

interface HeaderProps {
  navOpened: boolean;
}

interface Notification {
  id: string;
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' | 'ALERT' | 'SYSTEM' | 'EVENT';
  channel: ('IN_APP' | 'EMAIL' | 'PUSH')[];
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  sender?: { name: string; avatar?: string };
  tool?: { name: string; icon?: string };
  action?: Record<string, unknown>;
}

const NOTIFICATION_ICONS = {
  WARNING: IconAlertCircle,
  ERROR: IconX,
  SUCCESS: IconCheck,
  INFO: IconInfoCircle,
  ALERT: IconAlertCircle,
  SYSTEM: IconInfoCircle,
  EVENT: IconInfoCircle,
};

const NOTIFICATION_COLORS = {
  WARNING: 'orange',
  ERROR: 'red',
  SUCCESS: 'teal',
  INFO: 'blue',
  ALERT: 'yellow',
  SYSTEM: 'gray',
  EVENT: 'violet',
};

const Header: React.FC<HeaderProps> = ({ navOpened }) => {
  const navigate = useNavigate();
  const { user, logout, token } = useUserContext();
  const { isDark, toggleTheme } = useTheme();
  const { header } = usePageHeader();
  const [searchOpened, { open: openSearch, close: closeSearch }] = useDisclosure(false);
  
  // Состояния для уведомлений
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [menuOpened, setMenuOpened] = useState(false);
  const { lastNotification } = useSocketIO();
  // useNotifications уже обрабатывает push-уведомления в App.tsx,
  // здесь мы только добавляем уведомление в список
  const pollingIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchingRef = useRef(false); // Защита от одновременных запросов

  // Декодируем токен для проверки impersonatedBy
  const decodeToken = (token: string | null): any => {
    if (!token) return null;
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (error) {
      return null;
    }
  };

  const [isImpersonated, setIsImpersonated] = useState(false);

  useEffect(() => {
    if (!token) {
      setIsImpersonated(false);
      return;
    }
    
    const tokenData = decodeToken(token);
    const impersonated = tokenData?.impersonatedBy !== undefined && tokenData?.impersonatedBy !== null;
    setIsImpersonated(impersonated);
  }, [token]);

  const handleReturnToMyAccount = async () => {
    try {
      // Получаем токен и данные администратора из localStorage
      const adminToken = localStorage.getItem('adminToken');
      const adminUser = localStorage.getItem('adminUser');
      
      if (adminToken && adminUser) {
        // Восстанавливаем токен и данные администратора
        localStorage.setItem('token', adminToken);
        localStorage.setItem('user', adminUser);
        // Перезагружаем страницу для применения токена администратора
        window.location.href = '/profile/admin?tab=users';
      } else {
        // Если токен администратора не найден, просто переходим на страницу логина
        clearAllAuthStorage();
        window.location.href = '/login';
      }
    } catch (error) {
    }
  };

  const onLogout = () => {
    clearAllAuthStorage();
    logout();
    navigate('/login');
  };

  const handleProfileClick = () => {
    navigate('/profile');
  };

  // Загрузка уведомлений
  const fetchNotifications = useCallback(async (showLoading = true) => {
    if (!user?.id) return;
    
    // Защита от одновременных запросов
    if (fetchingRef.current) {
      return;
    }
    
    fetchingRef.current = true;

    try {
      if (showLoading) {
        setNotificationsLoading(true);
      }
      const response = await fetch(`${API}/notifications?userId=${user.id}&limit=20`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) {
        throw new Error('Ошибка загрузки уведомлений');
      }
      const data = await response.json();
      // При обновлении через polling, сохраняем статус прочитанности для уведомлений, которые уже были в списке
      setNotifications(prev => {
        const newNotifications = data.data || [];
        // Создаем мапу существующих уведомлений для быстрого поиска
        const existingMap = new Map(prev.map(n => [n.id, n.read]));
        // Обновляем статус прочитанности для существующих уведомлений
        return newNotifications.map((n: Notification) => ({
          ...n,
          read: existingMap.has(n.id) ? existingMap.get(n.id) || n.read : n.read
        }));
      });
    } catch (err) {
      console.error('[Header] Error fetching notifications:', err);
    } finally {
      fetchingRef.current = false;
      if (showLoading) {
        setNotificationsLoading(false);
      }
    }
  }, [user?.id]);

  // Закрытие popup при переходе по уведомлению (через событие)
  useEffect(() => {
    const handleClosePopup = () => {
      setMenuOpened(false);
    };
    
    window.addEventListener('closeNotificationsPopup', handleClosePopup);
    
    return () => {
      window.removeEventListener('closeNotificationsPopup', handleClosePopup);
    };
  }, []);

  // Загрузка уведомлений при монтировании и периодическое обновление
  useEffect(() => {
    if (!user?.id) return;

    // Первая загрузка при монтировании
    fetchNotifications(false);
    
    // Периодическое обновление каждые 30 секунд для синхронизации счетчика
    // Увеличено с 10 до 30 секунд, чтобы не перезаписывать новые уведомления из Socket.IO
    pollingIntervalRef.current = setInterval(() => {
      fetchNotifications(false);
    }, 30000);
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [user?.id, fetchNotifications]);

  // Загрузка уведомлений при открытии меню (с индикатором загрузки)
  // Загружаем только при изменении состояния с закрытого на открытое
  const prevMenuOpenedRef = useRef(false);
  useEffect(() => {
    if (menuOpened && !prevMenuOpenedRef.current) {
      fetchNotifications(true);
    }
    prevMenuOpenedRef.current = menuOpened;
  }, [menuOpened, fetchNotifications]);

  // Обновление уведомлений при получении нового через Socket.IO (независимо от состояния меню)
  // useNotifications в App.tsx уже обрабатывает push-уведомления, здесь мы только добавляем в список
  useEffect(() => {
    if (lastNotification && user?.id) {
      // Проверяем, не было ли это уведомление уже добавлено (по ID)
      const notificationId = lastNotification.id;
      if (notificationId && notifications.some(n => n.id === notificationId)) {
        // Уведомление уже есть в списке, обновляем его
        setNotifications(prev => prev.map(n => n.id === notificationId ? {
          ...n,
          read: lastNotification.read || n.read,
        } : n));
        return;
      }
      // Убеждаемся, что уведомление имеет все необходимые поля
      // Преобразуем message в строку, если это не строка
      let messageText = '';
      if (typeof lastNotification.message === 'string') {
        messageText = lastNotification.message;
      } else if (lastNotification.message !== null && lastNotification.message !== undefined) {
        // Если message - это объект, пытаемся извлечь строку из него
        if (typeof lastNotification.message === 'object') {
          // Пытаемся найти строковое поле в объекте
          const msgObj = lastNotification.message as any;
          if (msgObj.message && typeof msgObj.message === 'string') {
            messageText = msgObj.message;
          } else if (msgObj.text && typeof msgObj.text === 'string') {
            messageText = msgObj.text;
          } else if (msgObj.content && typeof msgObj.content === 'string') {
            messageText = msgObj.content;
          } else {
            // Если не нашли строковое поле, преобразуем весь объект в JSON
            try {
              messageText = JSON.stringify(lastNotification.message);
            } catch {
              messageText = 'Сообщение';
            }
          }
        } else {
          // Для других типов просто преобразуем в строку
          messageText = String(lastNotification.message);
        }
      }
      
      const notification: Notification = {
        id: lastNotification.id || '',
        type: lastNotification.type || 'INFO',
        channel: lastNotification.channel || ['IN_APP'],
        title: lastNotification.title || '',
        message: messageText,
        read: lastNotification.read || false,
        createdAt: lastNotification.createdAt || new Date().toISOString(),
        sender: lastNotification.sender,
        tool: lastNotification.tool,
        action: lastNotification.action,
      };
      
      // Логируем для отладки
      if (!messageText || !messageText.trim()) {
        console.warn('[Header] Received notification with empty message:', {
          id: notification.id,
          title: notification.title,
          messageType: typeof lastNotification.message,
          messageValue: lastNotification.message
        });
      }
      
      setNotifications(prev => {
        // Проверяем, не было ли это уведомление уже добавлено (по ID)
        const exists = prev.some(n => n.id === notification.id);
        if (exists) {
          // Если уведомление уже есть, обновляем его (но сохраняем статус прочитанности)
          return prev.map(n => n.id === notification.id ? {
            ...notification,
            read: n.read // Сохраняем статус прочитанности
          } : n);
        } else {
          // Добавляем новое уведомление в начало списка только если его еще нет
          return [notification, ...prev];
        }
      });
      
      // Popup уведомлений не должен открываться автоматически
      // Пользователь сам откроет popup, если нужно
    }
  }, [lastNotification, user?.id, menuOpened]);

  // Отметить как прочитанное
  const markAsRead = useCallback(async (notificationId: string | undefined) => {
    if (!notificationId) {
      console.warn('[Header] markAsRead called with undefined notificationId');
      return;
    }
    try {
      const response = await fetch(`${API}/notifications/read/${notificationId}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ userId: user?.id }),
      });
      if (!response.ok) {
        throw new Error('Ошибка обновления уведомления');
      }
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
    } catch (err) {
      console.error('[Header] Error marking notification as read:', err);
    }
  }, [user?.id]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  // Отметить все как прочитанные
  const markAllAsRead = useCallback(async () => {
    if (!user?.id || unreadCount === 0) return;
    
    try {
      const response = await fetch(`${API}/notifications/read-all`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!response.ok) {
        throw new Error('Ошибка обновления уведомлений');
      }
      // Обновляем все уведомления как прочитанные
      setNotifications(prev => 
        prev.map(n => ({ ...n, read: true }))
      );
    } catch (err) {
      console.error('Ошибка при отметке всех уведомлений как прочитанных:', err);
    }
  }, [user?.id, unreadCount]);

  const getNotificationIcon = (type: string) => {
    const IconComponent = NOTIFICATION_ICONS[type as keyof typeof NOTIFICATION_ICONS] || IconInfoCircle;
    return <IconComponent size={16} />;
  };

  const getNotificationColor = (type: string) => {
    return NOTIFICATION_COLORS[type as keyof typeof NOTIFICATION_COLORS] || 'blue';
  };

  const formatTime = useCallback((dateString: string) => {
    const date = dayjs(dateString);
    const now = dayjs();
    const diffInMinutes = now.diff(date, 'minute');
    
    if (diffInMinutes < 1) return 'только что';
    if (diffInMinutes < 60) return `${diffInMinutes} мин назад`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} ч назад`;
    return date.format('DD.MM.YYYY');
  }, []);
  
  const filteredNotifications = useMemo(() => {
    return showAllNotifications ? notifications : notifications.filter(n => !n.read);
  }, [notifications, showAllNotifications]);

  return (
    <AppShell.Header className="modern-header" data-header>
      <div className="header-content">
        {/* Левая часть */}
        <div className="header-left">
          <Group gap="sm" align="center">
            {/* Адаптивный логотип DNS */}
            <div 
              className="header-logo" 
              onClick={() => navigate('/')}
              style={{ cursor: 'pointer' }}
            >
              <img 
                src={navOpened 
                  ? (isDark ? logoFullDark : logoFullLight)
                  : (isDark ? logoMiniDark : logoMiniLight)
                } 
                alt="DNS Logo" 
                className={`logo-image ${navOpened ? 'logo-full' : 'logo-mini'}`}
                onError={(e) => {
                  // Fallback если логотип не загрузился
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
              {/* Fallback текст если логотип не загрузился */}
              <div className="logo-fallback" style={{ display: 'none' }}>
                <Text size="lg" fw={700} c="var(--color-primary-500)">
                  DNS
                </Text>
              </div>
            </div>
          </Group>
        </div>

        {/* Центральная часть - заголовок страницы или поиск */}
        <div className="header-center">
          {header.title ? (
            <div className="page-header-content">
              <div className="page-header-text">
                <div className="page-title-wrapper">
                  <Group gap="md" align="center">
                    {header.icon && (
                      <div className="page-header-icon">
                        {header.icon}
                      </div>
                    )}
                    <div>
                      <Text 
                        size="xl" 
                        fw={700} 
                        className="page-title"
                        style={{
                          background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-500))',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text',
                          filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
                        }}
                      >
                        {header.title}
                      </Text>
                      {header.subtitle && (
                        <Text 
                          size="sm" 
                          c="var(--theme-text-secondary)"
                          className="page-subtitle"
                          style={{
                            fontWeight: '500',
                            opacity: '0.8'
                          }}
                        >
                          {header.subtitle}
                        </Text>
                      )}
                    </div>
                  </Group>
                </div>
              </div>
              <div className="page-header-actions">
                <ActionIcon
                  size="lg"
                  variant="filled"
                  color="blue"
                  radius="xl"
                  onClick={openSearch}
                  style={{
                    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                    color: 'white',
                    border: 'none',
                    fontWeight: '600',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                  className="search-button"
                >
                  <IconSearch size={18} />
                </ActionIcon>
              </div>
            </div>
          ) : (
            <Button
              size="md"
              variant="filled"
              color="blue"
              radius="xl"
              onClick={openSearch}
              leftSection={<IconSearch size={16} />}
              style={{
                background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                color: 'white',
                border: 'none',
                fontWeight: '600',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              className="search-button"
            >
              Поиск
            </Button>
          )}
        </div>

        {/* Правая часть */}
        <div className="header-right">
          <Group gap="xs">
            {/* Кнопка возврата к администратору */}
            {isImpersonated && (
              <Tooltip label="Вернуться в свой профиль" position="bottom">
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  radius="md"
                  className="header-action"
                  onClick={handleReturnToMyAccount}
                  aria-label="Вернуться в свой профиль"
                  color="orange"
                >
                  <IconLogin size={20} style={{ transform: 'scaleX(-1)' }} />
                </ActionIcon>
              </Tooltip>
            )}

            {/* Переключатель темы */}
            <Tooltip 
              label={isDark ? 'Переключить на светлую тему' : 'Переключить на темную тему'} 
              position="bottom"
            >
              <ActionIcon 
                variant="subtle" 
                size="lg" 
                radius="md"
                className="header-action theme-toggle"
                onClick={toggleTheme}
                aria-label="Переключить тему"
              >
                <Transition 
                  mounted={true} 
                  transition="rotate-left" 
                  duration={200}
                >
                  {(styles) => (
                    <div style={styles}>
                      {isDark ? (
                        <IconBrightnessDown size={20} />
                      ) : (
                        <IconMoon size={20} />
                      )}
                    </div>
                  )}
                </Transition>
              </ActionIcon>
            </Tooltip>

            {/* Пользовательское меню с уведомлениями в два столбца */}
            {user ? (
              <Menu 
                shadow="lg" 
                width={680} // 400px (уведомления) + 280px (профиль)
                position="bottom-end"
                offset={8}
                withArrow
                arrowPosition="center"
                opened={menuOpened}
                onChange={setMenuOpened}
              >
                <Menu.Target>
                  <Box style={{ position: 'relative', display: 'inline-block' }}>
                    <ActionIcon 
                      size="lg" 
                      variant="subtle" 
                      radius="md"
                      className="header-action user-avatar"
                      aria-label="Меню пользователя"
                    >
                      {user.image ? (
                        <Avatar 
                          src={`data:image/jpeg;base64,${user.image}`} 
                          size="sm"
                          radius="md"
                        />
                      ) : (
                        <Avatar 
                          name={user.name} 
                          color="blue" 
                          size="sm"
                          radius="md"
                        />
                      )}
                    </ActionIcon>
                    {unreadCount > 0 && (
                      <Badge
                        size="xs"
                        color="orange"
                        variant="filled"
                        style={{
                          position: 'absolute',
                          top: '-6px',
                          right: '-6px',
                          minWidth: '20px',
                          height: '20px',
                          padding: '0 5px',
                          fontSize: '11px',
                          lineHeight: '20px',
                          zIndex: 10,
                          color: 'white',
                          backgroundColor: 'var(--mantine-color-orange-6)',
                          border: '2px solid var(--theme-bg-primary)',
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                        }}
                      >
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </Badge>
                    )}
                  </Box>
                </Menu.Target>
                
                <Menu.Dropdown className="user-menu-dropdown" style={{ padding: 0 }}>
                  <Box style={{ display: 'flex', width: '100%' }}>
                    {/* Левая колонка - Уведомления */}
                    <Box 
                      style={{ 
                        width: '400px', 
                        borderRight: '1px solid var(--theme-border)',
                        padding: '16px',
                        flexShrink: 0
                      }}
                    >
                      <Group justify="space-between" mb="md">
                        <Text size="lg" fw={600} c="var(--theme-text-primary)">
                          Уведомления
                        </Text>
                        <Group gap="xs">
                          {unreadCount > 0 && (
                            <Badge color="blue" variant="light" size="sm">
                              {unreadCount} новых
                            </Badge>
                          )}
                          {unreadCount > 0 && (
                            <Button
                              variant="subtle"
                              size="xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                markAllAsRead();
                              }}
                              title="Отметить все как прочитанные"
                            >
                              Прочитать все
                            </Button>
                          )}
                          <Button
                            variant="subtle"
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowAllNotifications(!showAllNotifications);
                            }}
                          >
                            {showAllNotifications ? 'Непрочитанные' : 'Все'}
                          </Button>
                        </Group>
                      </Group>
                      
                      {notificationsLoading ? (
                        <Box style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                          <Loader size="sm" />
                        </Box>
                      ) : filteredNotifications.length === 0 ? (
                        <Box style={{ textAlign: 'center', padding: '20px' }}>
                          <ThemeIcon size="xl" color="gray" variant="light" style={{ margin: '0 auto 12px' }}>
                            <IconBell size={32} />
                          </ThemeIcon>
                          <Text size="sm" c="var(--theme-text-secondary)">
                            {showAllNotifications ? 'Нет уведомлений' : 'Нет непрочитанных уведомлений'}
                          </Text>
                        </Box>
                      ) : (
                        <ScrollArea.Autosize mah={400}>
                          <Stack gap="xs">
                            {filteredNotifications.map((notification, index) => {
                              const color = getNotificationColor(notification.type);
                              const isUnread = !notification.read;
                              
                              return (
                                <Box
                                  key={notification.id || `notification-${index}`}
                                  p="sm"
                                  style={{
                                    borderRadius: '8px',
                                    border: `1px solid var(--theme-border)`,
                                    background: isUnread ? 'var(--theme-bg-elevated)' : 'var(--theme-bg-primary)',
                                    transition: 'all 0.2s ease',
                                    cursor: 'pointer'
                                  }}
                                  onClick={() => {
                                    // Обрабатываем клик по уведомлению
                                    if (notification.action && typeof notification.action === 'object') {
                                      const action = notification.action as any;
                                      if (action.type === 'NAVIGATE' && action.url) {
                                        const currentPath = window.location.pathname;
                                        const notificationUrl = action.url;
                                        
                                        // Закрываем popup уведомлений при переходе
                                        setMenuOpened(false);
                                        
                                        // Если мы уже на странице Safety Journal и уведомление тоже для Safety Journal
                                        if (currentPath.includes('/jurists/safety') && notificationUrl.includes('/jurists/safety')) {
                                          // Извлекаем параметры из URL уведомления
                                          const urlObj = new URL(notificationUrl, window.location.origin);
                                          const branchId = urlObj.searchParams.get('branchId');
                                          const chatId = urlObj.searchParams.get('chatId');
                                          const messageId = urlObj.searchParams.get('messageId');
                                          
                                          // Обновляем URL параметры без редиректа
                                          const newParams = new URLSearchParams();
                                          if (branchId) newParams.set('branchId', branchId);
                                          if (chatId) newParams.set('chatId', chatId);
                                          if (messageId) newParams.set('messageId', messageId);
                                          
                                          navigate(`${currentPath}?${newParams.toString()}`, { replace: true });
                                        } else {
                                          // Если мы не на странице Safety Journal, делаем обычный редирект
                                          navigate(notificationUrl);
                                        }
                                        
                                        // Отмечаем как прочитанное при клике
                                        if (isUnread && notification.id) {
                                          markAsRead(notification.id);
                                        }
                                        return;
                                      }
                                    }
                                    // Если нет action, просто отмечаем как прочитанное
                                    if (isUnread && notification.id) {
                                      markAsRead(notification.id);
                                    }
                                  }}
                                >
                                  <Group gap="sm" align="flex-start" wrap="nowrap">
                                    <ThemeIcon size="sm" color={color} variant="light">
                                      {getNotificationIcon(notification.type)}
                                    </ThemeIcon>
                                    <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
                                      <Text size="sm" fw={isUnread ? 600 : 500} c="var(--theme-text-primary)">
                                        {notification.title}
                                      </Text>
                                      {notification.message && typeof notification.message === 'string' && notification.message.trim() ? (
                                        <Text size="xs" c="var(--theme-text-secondary)">
                                          {truncateText(notification.message, 100)}
                                        </Text>
                                      ) : (
                                        <Text size="xs" c="var(--theme-text-tertiary)" fs="italic">
                                          Сообщение
                                        </Text>
                                      )}
                                      <Group gap="xs" justify="space-between">
                                        <Group gap="xs">
                                          {notification.sender && (
                                            <Badge size="xs" variant="light" color="gray">
                                              {notification.sender.name}
                                            </Badge>
                                          )}
                                          {notification.action && typeof notification.action === 'object' && (notification.action as any).branchName && (
                                            <Badge size="xs" variant="light" color="blue">
                                              {(notification.action as any).branchName}
                                            </Badge>
                                          )}
                                          {notification.tool && (
                                            <Badge size="xs" variant="light" color="blue">
                                              {notification.tool.name}
                                            </Badge>
                                          )}
                                        </Group>
                                        <Text size="xs" c="var(--theme-text-tertiary)">
                                          {formatTime(notification.createdAt)}
                                        </Text>
                                      </Group>
                                    </Stack>
                                    {isUnread && (
                                      <ActionIcon
                                        variant="subtle"
                                        size="sm"
                                        color="blue"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (notification.id) {
                                            markAsRead(notification.id);
                                          }
                                        }}
                                        title="Отметить как прочитанное"
                                      >
                                        <IconCheck size={14} />
                                      </ActionIcon>
                                    )}
                                  </Group>
                                </Box>
                              );
                            })}
                          </Stack>
                        </ScrollArea.Autosize>
                      )}
                    </Box>

                    {/* Правая колонка - Меню пользователя */}
                    <Box style={{ width: '280px', padding: '16px', flexShrink: 0 }}>
                      {/* Информация о пользователе */}
                      <Box mb="md">
                        <Group gap="sm">
                          {user.image ? (
                            <Avatar 
                              src={`data:image/jpeg;base64,${user.image}`} 
                              size="md"
                              radius="md"
                            />
                          ) : (
                            <Avatar 
                              name={user.name} 
                              color="blue" 
                              size="md"
                              radius="md"
                            />
                          )}
                          <div>
                            <Text size="sm" fw={500} c="var(--theme-text-primary)">
                              {user.name}
                            </Text>
                          </div>
                        </Group>
                      </Box>
                      
                      <Divider mb="md" />
                      
                      {/* Пункты меню */}
                      <Menu.Item 
                        leftSection={<IconUser size={16} />}
                        onClick={handleProfileClick}
                        className="menu-item"
                      >
                        Личный кабинет
                      </Menu.Item>
                      
                      <Divider my="xs" />
                      
                      <Box
                        onClick={onLogout}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          backgroundColor: 'rgba(255, 0, 0, 0.08)',
                          border: '1px solid rgba(255, 0, 0, 0.25)',
                          marginTop: '4px',
                          transition: 'all 0.2s ease',
                          fontWeight: 500
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 0, 0, 0.15)';
                          e.currentTarget.style.borderColor = 'rgba(255, 0, 0, 0.4)';
                          e.currentTarget.style.transform = 'scale(1.02)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 0, 0, 0.08)';
                          e.currentTarget.style.borderColor = 'rgba(255, 0, 0, 0.25)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      >
                        <Group gap="sm">
                          <IconLogout size={16} color="var(--mantine-color-red-6)" />
                          <Text size="sm" c="var(--mantine-color-red-6)" fw={500}>
                            Выход
                          </Text>
                        </Group>
                      </Box>
                    </Box>
                  </Box>
                </Menu.Dropdown>
              </Menu>
            ) : (
              <Tooltip label="Войти в систему" position="bottom">
                <ActionIcon 
                  size="lg" 
                  variant="subtle" 
                  radius="md"
                  className="header-action"
                  onClick={() => navigate('/login')}
                  aria-label="Войти"
                >
                  <IconLogin size={20} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </div>
      </div>
      
      {/* Модальное окно поиска для кнопки в заголовке */}
      <Search opened={searchOpened} onClose={closeSearch} showButton={false} />
    </AppShell.Header>
  );
};

export default Header;