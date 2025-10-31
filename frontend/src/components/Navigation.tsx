import React, { useState, useEffect } from 'react';
import { 
  ActionIcon, 
  AppShell, 
  Tooltip, 
  Text, 
  Badge,
  Transition,
  Divider,
  ScrollArea,
  Loader,
  Alert
} from '@mantine/core';
import { 
  IconLayoutSidebarLeftExpand, 
  IconLayoutSidebarRightExpand,
  IconHome,
  IconChevronRight,
  IconAlertCircle
} from '@tabler/icons-react';
import * as TablerIcons from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { API } from '../config/constants';
import { useTheme } from '../contexts/ThemeContext';
import './styles/Navigation.css';

interface Tool {
  id: string;
  parent_id: string | null;
  name: string;
  icon: string;
  link: string;
  order: number;
  types: any[];
  description?: string;
  badge?: string;
}

interface NavigationProps {
  navOpened: boolean;
  toggleNav: () => void;
}

const Navigation: React.FC<NavigationProps> = ({ navOpened, toggleNav }) => {
  const [activeTab, setActiveTab] = useState('');
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await fetch(`${API}/navigation`);
        if (!response.ok) {
          throw new Error('Ошибка при загрузке навигации');
        }
        const data = await response.json();
        setTools(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Обновляем активную вкладку при изменении маршрута
  useEffect(() => {
    const currentPath = location.pathname;
    const currentTool = tools.find(tool => `/${tool.link}` === currentPath);
    if (currentTool) {
      setActiveTab(currentTool.name);
    }
  }, [location.pathname, tools]);

  const getIconComponent = (iconName: string) => {
    const IconComponent = TablerIcons[iconName as keyof typeof TablerIcons] as React.ComponentType<{
      size?: number;
      className?: string;
      stroke?: number;
    }>;
    
    return IconComponent ? <IconComponent size={24} stroke={1.5} /> : <IconHome size={24} stroke={1.5} />;
  };

  const handleClick = (link: string, id: string, tool: Tool) => {
    setActiveTab(tool.name);
    navigate(link, { state: { id } });
  };

  const renderTool = (tool: Tool, isCollapsed: boolean = false) => {
    const isActive = activeTab === tool.name;
    const IconComponent = getIconComponent(tool.icon);

    if (isCollapsed) {
      return (
        <Tooltip 
          key={tool.id}
          label={tool.name} 
          position="right" 
          offset={12}
          withArrow
        >
          <div
            className={`nav-option collapsed ${isActive ? 'active' : ''}`}
            onClick={() => handleClick(`/${tool.link}`, tool.id, tool)}
          >
            {IconComponent}
            {tool.badge && (
              <Badge 
                size="xs" 
                color="red" 
                className="nav-badge"
              >
                {tool.badge}
              </Badge>
            )}
          </div>
        </Tooltip>
      );
    }

    return (
      <div
        key={tool.id}
        className={`nav-option ${isActive ? 'active' : ''}`}
        onClick={() => handleClick(`/${tool.link}`, tool.id, tool)}
      >
        <div className="nav-option-content">
          <div className="nav-option-icon">
            {IconComponent}
          </div>
          <div className="nav-option-text">
            <Text size="lg" fw={isActive ? 600 : 500} className="nav-option-name">
              {tool.name}
            </Text>
            {tool.description && (
              <Text size="md" c="var(--theme-text-tertiary)" className="nav-option-description">
                {tool.description}
              </Text>
            )}
          </div>
          {tool.badge && (
            <Badge 
              size="xs" 
              color="red" 
              className="nav-badge"
            >
              {tool.badge}
            </Badge>
          )}
          <IconChevronRight 
            size={20} 
            className="nav-option-arrow"
            style={{ 
              opacity: isActive ? 1 : 0,
              transform: isActive ? 'translateX(0)' : 'translateX(-4px)'
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <AppShell.Navbar className={`modern-navbar ${!navOpened ? 'collapsed' : ''}`} data-navigation>
      <div className="navbar-content">
        {/* Кнопка сворачивания */}
        <div className="navbar-header">
          <ActionIcon
            variant="filled"
            size="lg"
            radius="xl"
            onClick={toggleNav}
            className="navbar-toggle"
            aria-label={navOpened ? 'Свернуть меню' : 'Развернуть меню'}
            style={{
              background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
              color: 'white',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              border: 'none',
              width: '36px',
              height: '36px'
            }}
          >
            <Transition 
              mounted={true} 
              transition="rotate-left" 
              duration={200}
            >
              {(styles) => (
                <div style={styles}>
                  {navOpened ? (
                    <IconLayoutSidebarLeftExpand size={20} />
                  ) : (
                    <IconLayoutSidebarRightExpand size={20} />
                  )}
                </div>
              )}
            </Transition>
          </ActionIcon>
        </div>

        {/* Навигационные опции */}
        <div className="navbar-content-main">
          {isLoading ? (
            <div className="navbar-loading">
              <Loader size="sm" />
              <Text size="sm" c="var(--theme-text-secondary)">
                Загрузка...
              </Text>
            </div>
          ) : error ? (
            <Alert 
              icon={<IconAlertCircle size={20} />}
              title="Ошибка загрузки"
              color="red"
              variant="light"
              className="navbar-error"
            >
              {error}
            </Alert>
          ) : (
            <ScrollArea className="navbar-scroll">
              <div className="nav-options">
                {tools
                  .sort((a, b) => a.order - b.order)
                  .map((tool) => renderTool(tool, !navOpened))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Нижняя часть навигации */}
        <div className="navbar-footer">
          <Divider className="navbar-divider" />
          <div className="navbar-footer-content">
            <Text size="xs" c="var(--theme-text-tertiary)" ta="center">
              {navOpened ? `DNS Hub ${APP_VERSION}` : `v${APP_VERSION}`}
            </Text>
          </div>
        </div>
      </div>
    </AppShell.Navbar>
  );
};

export default Navigation;