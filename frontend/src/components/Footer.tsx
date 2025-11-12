import { AppShell, Group, Popover, Stack, Text, Divider, Box, Badge, ThemeIcon, ActionIcon, ScrollArea, Loader } from "@mantine/core";
import { IconAlien, IconAppWindow, IconBasket, IconBrandRumble, IconBrandUnity, IconBriefcase, IconDashboard, IconNews, IconBell, IconAlertCircle, IconInfoCircle, IconCheck, IconX } from "@tabler/icons-react";
import { useState, useEffect, useCallback, useContext, useRef } from "react";
import dayjs from "dayjs";
import "./styles/Footer.css";
import { ThemeContext } from "../contexts/ThemeContext";
import { useUserContext } from "../hooks/useUserContext";
import { API } from "../config/constants";
import { useSocketIO } from "../hooks/useSocketIO";

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

const navLinks = [
  {
    href: "https://dns-shop.ru",
    icon: IconBasket,
    name: "DNS-Shop",
    description: "Магазин"
  },
  {
    href: "http://sale.partner.ru/login",
    icon: IconAppWindow,
    name: "Web - База",
    description: "Портал продаж"
  },
  {
    href: "https://docs.dns-shop.ru/",
    icon: IconBriefcase,
    name: "Docs",
    description: "Документация"
  },
  {
    href: "https://media2.dns-shop.ru/",
    icon: IconBrandRumble,
    name: "Media2",
    description: "Медиа портал"
  },
  {
    href: "https://ecosystem.dns-shop.ru/stream",
    icon: IconNews,
    name: "EcoSystem",
    description: "Новости компании"
  },
  {
    href: window.location.host.includes('localhost') ? `https://dns-zs.partner.ru/uweb` : `https://${window.location.host}/uweb`,
    icon: IconBrandUnity,
    name: "Uweb",
    description: "Планограммы"
  },
  {
    href: "https://dns-go.dns-shop.ru",
    icon: IconAlien,
    name: "DNS-GO",
    description: "Заявочная система"
  },
  {
    href: "https://dashboards.dns-shop.ru",
    icon: IconDashboard,
    name: "Dashboards",
    description: "Портал дашбордов"
  },
];

function Footer() {
  const themeContext = useContext(ThemeContext);
  const { user } = useUserContext();
  const isDark = themeContext?.isDark ?? false;

  // Состояния для уведомлений
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [notificationsOpened, setNotificationsOpened] = useState(false);
  
  // Socket.IO для получения новых уведомлений
  const { lastNotification } = useSocketIO();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Состояния для футера
  const [isScrolled, setIsScrolled] = useState(false);
  const [isFooterVisible, setIsFooterVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [autoHideEnabled, setAutoHideEnabled] = useState(false);
  const [hideTimer, setHideTimer] = useState<NodeJS.Timeout | null>(null);

  // Загрузка уведомлений
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const response = await fetch(`${API}/notifications?userId=${user.id}&limit=20`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) {
        throw new Error('Ошибка загрузки уведомлений');
      }
      const data = await response.json();
      setNotifications(data.data || []);
    } catch (err) {
      console.error('Ошибка загрузки уведомлений:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Загрузка уведомлений при монтировании и открытии попапа
  useEffect(() => {
    if (notificationsOpened) {
      fetchNotifications();
      
      // Периодическое обновление каждые 5 секунд, когда модалка открыта
      pollingIntervalRef.current = setInterval(() => {
        fetchNotifications();
      }, 5000);
      
      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      };
    } else {
      // Очищаем интервал при закрытии модалки
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  }, [notificationsOpened, fetchNotifications]);

  // Обновление уведомлений при получении нового через Socket.IO
  useEffect(() => {
    if (lastNotification && notificationsOpened) {
      // Добавляем новое уведомление в начало списка, если его еще нет
      setNotifications(prev => {
        const exists = prev.some(n => n.id === lastNotification.id);
        if (exists) {
          // Если уведомление уже есть, обновляем его
          return prev.map(n => n.id === lastNotification.id ? {
            ...lastNotification,
            read: n.read // Сохраняем статус прочитанности
          } : n);
        } else {
          // Добавляем новое уведомление в начало
          return [lastNotification, ...prev];
        }
      });
    }
  }, [lastNotification, notificationsOpened]);

  // Отметить как прочитанное
  const markAsRead = useCallback(async (notificationId: string) => {
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
      console.error('Ошибка обновления уведомления:', err);
    }
  }, [user?.id]);

  const getNotificationIcon = (type: string) => {
    const IconComponent = NOTIFICATION_ICONS[type as keyof typeof NOTIFICATION_ICONS] || IconInfoCircle;
    return <IconComponent size={16} />;
  };

  const getNotificationColor = (type: string) => {
    return NOTIFICATION_COLORS[type as keyof typeof NOTIFICATION_COLORS] || 'blue';
  };

  const formatTime = (dateString: string) => {
    const date = dayjs(dateString);
    const now = dayjs();
    const diffInMinutes = now.diff(date, 'minute');
    
    if (diffInMinutes < 1) return 'только что';
    if (diffInMinutes < 60) return `${diffInMinutes} мин назад`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} ч назад`;
    return date.format('DD.MM.YYYY');
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // Загрузка настройки автоскрытия футера
  useEffect(() => {
    const loadFooterSetting = async () => {
      if (!user?.id) {
        // Если пользователь не загружен, используем значение по умолчанию
        setAutoHideEnabled(false);
        return;
      }
      
      try {
        const response = await fetch(`${API}/user/settings/${user.id}/auto_hide_footer`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setAutoHideEnabled(data.value === 'true');
        } else if (response.status === 404) {
          // Если настройка не найдена, используем значение по умолчанию (отключено)
          setAutoHideEnabled(false);
        }
      } catch (error) {
        console.error('Error loading footer setting:', error);
        setAutoHideEnabled(false);
      }
    };

    if (user?.id) {
      loadFooterSetting();
    }
  }, [user?.id]);

  // Слушатель изменения настройки автоскрытия футера
  useEffect(() => {
    const handleFooterSettingChange = (event: CustomEvent) => {
      setAutoHideEnabled(event.detail);
    };

    window.addEventListener('footer-setting-changed', handleFooterSettingChange as EventListener);
    
    return () => {
      window.removeEventListener('footer-setting-changed', handleFooterSettingChange as EventListener);
    };
  }, []);

  // Очистка таймера при размонтировании
  useEffect(() => {
    return () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
      }
    };
  }, [hideTimer]);

  // Инициализация видимости футера
  useEffect(() => {
    if (!autoHideEnabled) {
      setIsFooterVisible(true);
    } else {
      setIsFooterVisible(false);
    }
  }, [autoHideEnabled]);


  // Эффект скролла для прогресса (только для индикатора)
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      // Прогресс прокрутки (0-100%)
      const maxScroll = documentHeight - windowHeight;
      const progress = maxScroll > 0 ? Math.min((scrollY / maxScroll) * 100, 100) : 0;
      setScrollProgress(progress);
      
      // Добавляем класс при скролле вниз или когда контент больше экрана
      const shouldShowScrolled = scrollY > 50 || documentHeight > windowHeight + 100;
      setIsScrolled(shouldShowScrolled);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Проверяем при загрузке
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);



  // Обработчики мыши для футера
  const handleMouseEnter = () => {
    if (autoHideEnabled) {
      setIsFooterVisible(true);
      // Очищаем таймер при наведении
      if (hideTimer) {
        clearTimeout(hideTimer);
        setHideTimer(null);
      }
    }
  };

  const handleMouseLeave = () => {
    if (autoHideEnabled) {
      // Устанавливаем таймер на 5 секунд
      const timer = setTimeout(() => {
        setIsFooterVisible(false);
        setHideTimer(null);
      }, 5000);
      setHideTimer(timer);
    }
  };

  return (
    <AppShell.Footer 
      id="footer-wrapper" 
      data-footer
      className={`auto-hide-footer ${isScrolled ? 'scrolled' : ''} ${isFooterVisible ? 'visible' : 'hidden'} ${autoHideEnabled ? 'auto-hide-enabled' : 'auto-hide-disabled'}`}
      style={{
        '--scroll-progress': `${scrollProgress}%`
      } as React.CSSProperties}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Индикатор прогресса прокрутки */}
      <div className="scroll-progress-bar" style={{ width: `${scrollProgress}%` }} />
      
      <div id="footer">
        <div id="footer-nav">
          {/* Основные ссылки */}
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <a 
                key={link.href}
                href={link.href} 
                className="footer-nav-option" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <Icon size={35} />
                <div className="footer-nav-text">
                  <span className="footer-nav-name">{link.name}</span>
                  <span className="footer-nav-description">{link.description}</span>
                </div>
              </a>
            );
          })}
          {/* Правый блок с разделителем */}
          <div className="footer-right-section">
            <Divider orientation="vertical" className="footer-divider" />
            <Box w={10} />
            {/* Уведомления */}
            <Popover 
              opened={notificationsOpened} 
              onChange={setNotificationsOpened} 
              position="top-end"
              width={400}
              offset={20}
              classNames={{ 
                dropdown: isDark ? 'dark-theme-dropdown' : ''
              }}
              styles={{
                dropdown: {
                  marginLeft: '20px'
                }
              }}
            >
              <Popover.Target>
                <div 
                  className="footer-notifications-option" 
                  onClick={() => setNotificationsOpened(!notificationsOpened)}
                  style={{
                    position: 'relative',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    transition: 'background-color 0.2s ease'
                  }}
                >
                  <ThemeIcon size="md" color="blue" variant="light" style={{ position: 'relative' }}>
                    <IconBell size={20} />
                    {unreadCount > 0 && (
                      <Badge
                        size="xs"
                        color="red"
                        variant="filled"
                        style={{
                          position: 'absolute',
                          top: '-4px',
                          right: '-4px',
                          minWidth: '18px',
                          height: '18px',
                          padding: '0 4px',
                          fontSize: '10px',
                          lineHeight: '18px'
                        }}
                      >
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </Badge>
                    )}
                  </ThemeIcon>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <Text size="sm" fw={600} c="var(--theme-text-primary)">
                      Уведомления
                    </Text>
                    {unreadCount > 0 && (
                      <Text size="xs" c="var(--theme-text-secondary)">
                        {unreadCount} непрочитанных
                      </Text>
                    )}
                  </div>
                </div>
              </Popover.Target>
              <Popover.Dropdown>
                <Stack gap="md" style={{ maxHeight: '500px' }}>
                  <Group justify="space-between">
                    <Text size="lg" fw={600}>
                      Уведомления
                    </Text>
                    {unreadCount > 0 && (
                      <Badge color="blue" variant="light">
                        {unreadCount} новых
                      </Badge>
                    )}
                  </Group>
                  
                  {loading ? (
                    <Box style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                      <Loader size="sm" />
                    </Box>
                  ) : notifications.length === 0 ? (
                    <Box style={{ textAlign: 'center', padding: '20px' }}>
                      <ThemeIcon size="xl" color="gray" variant="light" style={{ margin: '0 auto 12px' }}>
                        <IconBell size={32} />
                      </ThemeIcon>
                      <Text size="sm" c="var(--theme-text-secondary)">
                        Нет уведомлений
                      </Text>
                    </Box>
                  ) : (
                    <ScrollArea.Autosize mah={400}>
                      <Stack gap="xs">
                        {notifications.map((notification) => {
                          const color = getNotificationColor(notification.type);
                          const isUnread = !notification.read;
                          
                          return (
                            <Box
                              key={notification.id}
                              p="sm"
                              style={{
                                borderRadius: '8px',
                                border: `1px solid var(--theme-border)`,
                                background: isUnread ? 'var(--theme-bg-elevated)' : 'var(--theme-bg-primary)',
                                transition: 'all 0.2s ease'
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
                                  <Text size="xs" c="var(--theme-text-secondary)" lineClamp={2}>
                                    {notification.message}
                                  </Text>
                                  <Group gap="xs" justify="space-between">
                                    <Group gap="xs">
                                      {notification.sender && (
                                        <Badge size="xs" variant="light" color="gray">
                                          {notification.sender.name}
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
                                    onClick={() => markAsRead(notification.id)}
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
                </Stack>
              </Popover.Dropdown>
            </Popover>
          </div>
        </div>
      </div>
    </AppShell.Footer>
  );
}

export default Footer;