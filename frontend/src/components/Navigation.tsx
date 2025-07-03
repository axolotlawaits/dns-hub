import { ActionIcon, AppShell, Tooltip } from "@mantine/core"
import { IconChevronLeftPipe, IconChevronRightPipe} from "@tabler/icons-react"
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import * as TablerIcons from "@tabler/icons-react";
import { API } from "../config/constants";
import logoLight from '../assets/images/logo-light.svg';
import logoDark from '../assets/images/logo-dark.svg';
import logoLightMini from '../assets/images/logo-light-mini.svg';
import logoDarkMini from '../assets/images/logo-dark-mini.svg';
import { useThemeContext } from "../hooks/useThemeContext";

interface Tool {
  id: string;
  parent_id: string | null;
  name: string;
  icon: string;
  link: string;
  order: number;
  types: any[];
}

type NavProps = {
  navOpened: boolean
  toggleNav: () => void
}

function Navigation({navOpened, toggleNav}: NavProps) {
  const [activeTab, setActiveTab] = useState('')
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isDark } = useThemeContext();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
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

  if (isLoading) return <div className="loading">Загрузка...</div>;
  if (error) return <div className="error">{error}</div>;

  const getIconComponent = (iconName: string) => {
    // Явное приведение типа для иконки
    const IconComponent = TablerIcons[iconName as keyof typeof TablerIcons] as React.ComponentType<{
      size?: number;
      className?: string;
      stroke?: number;
    }>;
    
    return IconComponent ? <IconComponent size={24} /> : null;
  };

  const handleClick = (link: string, id: string, tool: Tool) => {
    setActiveTab(tool.name)
    navigate(link, { state: { id } });
  };

  return (
    <AppShell.Navbar id="navigation" className={!navOpened ? 'collapsed' : ''}>
      <Link to={'/'} id="header-logo-group">
        {isDark ? (
          <img 
            src={navOpened ? logoDark : logoDarkMini} 
            id="header-logo" 
            alt="Dark Logo" 
          />
        ) : (
          <img 
            src={navOpened ? logoLight : logoLightMini} 
            id="header-logo" 
            alt="Light Logo" 
          />
        )}
      </Link>
      <ActionIcon
        variant="filled"
        size="md"
        onClick={toggleNav}
        aria-label={navOpened ? 'Close menu' : 'Open menu'}
      >
        {navOpened ? <IconChevronLeftPipe size={24} /> : <IconChevronRightPipe size={24} />}
      </ActionIcon>
      {navOpened ?
        <div id="nav-options">
          {tools
          .sort((a, b) => a.order - b.order)
          .map((tool) => (
            <div
              key={tool.id}
              className={`nav-option ${activeTab === tool.name ? 'active' : ''}`} 
              onClick={() => handleClick(`/${tool.link}`, tool.id, tool)}
              style={{ cursor: 'pointer' }}
            >
              {getIconComponent(tool.icon)}
              <span>{tool.name}</span>
            </div>
          ))}
        </div>
      :
        <div id="nav-options" className="collapsed">
          {tools
          .sort((a, b) => a.order - b.order)
          .map((tool) => (
            <div
              key={tool.id}
              className={`nav-option collapsed ${activeTab === tool.name ? 'active' : ''}`} 
              onClick={() => handleClick(`/${tool.link}`, tool.id, tool)}
              style={{ cursor: 'pointer' }}
            >
              <Tooltip label={tool.name} position="right" offset={12}>
                {getIconComponent(tool.icon)}
              </Tooltip>
            </div>
          ))}
        </div>
      }
    </AppShell.Navbar>
  )
}

export default Navigation;