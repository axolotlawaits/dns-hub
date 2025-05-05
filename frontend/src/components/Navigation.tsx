import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import * as TablerIcons from "@tabler/icons-react";
import { API } from "../config/constants";

interface Tool {
  id: string;
  parent_id: string | null;
  name: string;
  icon: string;
  link: string;
  order: number;
  types: any[];
}

function Navigation() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const handleClick = (link: string, id: string) => {
    navigate(link, { state: { id } });
  };

  return (
    <div id="navigation">
      <div id="nav-options">
        {tools
          .sort((a, b) => a.order - b.order)
          .map((tool) => (
            <div
              key={tool.id}
              className="nav-option"
              onClick={() => handleClick(`/${tool.link}`, tool.id)}
              style={{ cursor: 'pointer' }}
            >
              {getIconComponent(tool.icon)}
              <span>{tool.name}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

export default Navigation;