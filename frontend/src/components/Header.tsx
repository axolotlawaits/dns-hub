import React from 'react';
import { 
  ActionIcon, 
  AppShell, 
  Avatar, 
  Menu, 
  Divider, 
  Group, 
  Text, 
  Tooltip,
  Transition,
  Box
} from '@mantine/core';
import { 
  IconBrightnessDown, 
  IconLogin, 
  IconLogout, 
  IconMoon, 
  IconUser,
  IconSettings,
  IconBell
} from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { useUserContext } from '../hooks/useUserContext';
import { useTheme } from '../contexts/ThemeContext';
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
  const { user, logout } = useUserContext();
  const { isDark, toggleTheme } = useTheme();

  const onLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    logout();
    navigate('/login');
  };

  const handleProfileClick = () => {
    navigate('/profile');
  };

  const handleSettingsClick = () => {
    navigate('/settings');
  };

  return (
    <AppShell.Header className="modern-header">
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

        {/* Центральная часть - поиск */}
        <div className="header-center">
          <Search />
        </div>

        {/* Правая часть */}
        <div className="header-right">
          <Group gap="xs">
            {/* Уведомления */}
            <Tooltip label="Уведомления" position="bottom">
              <ActionIcon 
                variant="subtle" 
                size="lg" 
                radius="md"
                className="header-action"
                aria-label="Уведомления"
              >
                <IconBell size={20} />
              </ActionIcon>
            </Tooltip>

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
                  
                  <Menu.Item 
                    leftSection={<IconSettings size={16} />}
                    onClick={handleSettingsClick}
                    className="menu-item"
                  >
                    Настройки
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
    </AppShell.Header>
  );
};

export default Header;