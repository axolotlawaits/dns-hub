import React, { useState, useEffect } from 'react';
import {  ActionIcon,  AppShell,  Avatar,  Menu,  Divider,  Group,  Text,  Tooltip, Transition, Box, Button } from '@mantine/core';
import {  IconBrightnessDown,  IconLogin,  IconLogout,  IconMoon,  IconUser, IconSearch } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { useUserContext } from '../hooks/useUserContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useDisclosure } from '@mantine/hooks';
import Search from './Search';
import logoMiniDark from '../assets/images/logo-dark-mini.svg';
import logoFullDark from '../assets/images/logo-dark.svg';
import logoMiniLight from '../assets/images/logo-light-mini.svg';
import logoFullLight from '../assets/images/logo-light.svg';
import './styles/Header.css';

interface HeaderProps {
  navOpened: boolean;
}

const Header: React.FC<HeaderProps> = ({ navOpened }) => {
  const navigate = useNavigate();
  const { user, logout, token } = useUserContext();
  const { isDark, toggleTheme } = useTheme();
  const { header } = usePageHeader();
  const [searchOpened, { open: openSearch, close: closeSearch }] = useDisclosure(false);

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
    
    // Для отладки
    console.log('[Header] Raw token:', token?.substring(0, 50) + '...');
    console.log('[Header] Token data:', tokenData);
    console.log('[Header] impersonatedBy:', tokenData?.impersonatedBy);
    console.log('[Header] isImpersonated:', impersonated);
    
    // Также проверяем localStorage напрямую
    const localStorageToken = localStorage.getItem('token');
    if (localStorageToken && localStorageToken !== token) {
      console.warn('[Header] Token mismatch! Context token differs from localStorage token');
      const localStorageTokenData = decodeToken(localStorageToken);
      console.log('[Header] localStorage token data:', localStorageTokenData);
      console.log('[Header] localStorage impersonatedBy:', localStorageTokenData?.impersonatedBy);
    }
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
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        // Перезагружаем страницу для применения токена администратора
        window.location.href = '/profile/admin?tab=users';
      } else {
        // Если токен администратора не найден, просто переходим на страницу логина
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Error returning to account:', error);
    }
  };

  const onLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    logout();
    navigate('/login');
  };

  const handleProfileClick = () => {
    navigate('/profile');
  };

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

            {/* Пользовательское меню */}
            {user ? (
              <Menu 
                shadow="lg" 
                width={280}
                position="bottom-end"
                offset={8}
                withArrow
                arrowPosition="center"
              >
                <Menu.Target>
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
                </Menu.Target>
                
                <Menu.Dropdown className="user-menu-dropdown">
                  {/* Информация о пользователе */}
                  <Box p="md" className="user-info">
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
                        <Text size="xs" c="var(--theme-text-secondary)">
                          {user.email}
                        </Text>
                      </div>
                    </Group>
                  </Box>
                  
                  <Divider />
                  
                  {/* Пункты меню */}
                  <Menu.Item 
                    leftSection={<IconUser size={16} />}
                    onClick={handleProfileClick}
                    className="menu-item"
                  >
                    Личный кабинет
                  </Menu.Item>
                  <Divider /> 
                  <Menu.Item 
                    leftSection={<IconLogout size={16} />}
                    onClick={onLogout}
                    className="menu-item logout-item"
                    color="red"
                  >
                    Выход
                  </Menu.Item>
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