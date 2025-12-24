import React, { useState, useEffect } from 'react';
import { 
  ActionIcon, 
  AppShell, 
  Tooltip, 
  Text, 
  Badge,
  Transition,
  ScrollArea,
  Loader,
  Alert,
  Button
} from '@mantine/core';
import { 
  IconLayoutSidebarLeftExpand, 
  IconLayoutSidebarRightExpand,
  IconHome,
  IconChevronRight,
  IconAlertCircle,
  IconMessageCircle
} from '@tabler/icons-react';
import * as TablerIcons from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { API } from '../config/constants';
import { useTheme } from '../contexts/ThemeContext';
import { useUserContext } from '../hooks/useUserContext';
import './styles/Navigation.css';
import { DynamicFormModal, type FormField } from '../utils/formModal';
import { notificationSystem } from '../utils/Push';

// Утилита для запросов с автоматическим обновлением токена
const fetchWithTokenRefresh = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  let response = await fetch(url, {
    ...options,
    headers,
  });

  // Если получили 401, пробуем обновить токен
  if (response.status === 401) {
    try {
      const refreshResponse = await fetch(`${API}/refresh-token`, {
        method: 'POST',
        credentials: 'include',
      });

      if (refreshResponse.ok) {
        const newToken = await refreshResponse.json();
        localStorage.setItem('token', newToken);
        
        // Повторяем запрос с новым токеном
        headers.set('Authorization', `Bearer ${newToken}`);
        response = await fetch(url, {
          ...options,
          headers,
        });
      }
      // Если refresh не удался, просто возвращаем исходный ответ (401)
    } catch (refreshError) {
      // Игнорируем ошибку refresh, возвращаем исходный ответ
    }
  }

  return response;
};

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
  const [feedbackModalOpened, setFeedbackModalOpened] = useState(false);
  const [feedbackParentTool, setFeedbackParentTool] = useState<string>('general');
  const [feedbackChildTool, setFeedbackChildTool] = useState<string>('');
  const [feedbackParentTools, setFeedbackParentTools] = useState<Array<{ value: string; label: string }>>([]);
  const [feedbackChildTools, setFeedbackChildTools] = useState<Array<{ value: string; label: string }>>([]);
  const [toolsData, setToolsData] = useState<any>(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const { } = useTheme();
  const { user } = useUserContext();
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

  // Загрузка инструментов для обратной связи
  useEffect(() => {
    const fetchFeedbackTools = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          return;
        }

        const response = await fetchWithTokenRefresh(`${API}/merch-bot/feedback/tools`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (!response.ok) {
          // Если все еще 401 после попытки обновления, просто выходим
          if (response.status === 401) {
            return;
          }
          return;
        }

        const data = await response.json();
        setFeedbackParentTools(data.parentTools || []);
        setToolsData(data); // Сохраняем все данные для использования в другом useEffect
      } catch (err) {
        // Игнорируем ошибки при загрузке инструментов обратной связи
      }
    };

    fetchFeedbackTools();
  }, []);

  // Загрузка дочерних инструментов при выборе родительского
  useEffect(() => {
    if (!feedbackParentTool || feedbackParentTool === 'general' || feedbackParentTool === 'other') {
      setFeedbackChildTools([]);
      setFeedbackChildTool('');
      return;
    }

    if (!toolsData) {
      return;
    }

    if (!toolsData.parentToolsWithChildren) {
      return;
    }
    
    // Находим родительский инструмент по link
    const parentTool = toolsData.parentToolsWithChildren.find((p: any) => p.value === feedbackParentTool);
    
    if (parentTool) {
      if (parentTool.children && parentTool.children.length > 0) {
        setFeedbackChildTools(parentTool.children);
      } else {
        setFeedbackChildTools([]);
      }
    } else {
      setFeedbackChildTools([]);
    }
    setFeedbackChildTool('');
  }, [feedbackParentTool, toolsData]);

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

  const handleSubmitFeedback = async (values: Record<string, any>) => {
    const text = (values.text || '').trim();
    if (!text) {
      setFeedbackError('Пожалуйста, введите текст обратной связи');
      return;
    }

    setIsSubmittingFeedback(true);
    setFeedbackError(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен не найден');
      }

      const parentTool = values.parentTool || feedbackParentTool || 'general';
      const childTool = values.childTool || feedbackChildTool || '';

      // Определяем финальный инструмент: если выбран дочерний, используем его, иначе родительский
      // Формат: parentTool:childTool или просто parentTool
      const finalTool = childTool 
        ? `${parentTool}:${childTool}` 
        : parentTool;

      // Собираем данные формы
      const formData = new FormData();
      formData.append('tool', finalTool);
      formData.append('text', text);
      if (user?.email) {
        formData.append('email', user.email);
      }

      // Добавляем фотографии
      const photos = (values.photos || []) as Array<{ source: File | string }>;
      photos.forEach((attachment) => {
        if (attachment && attachment.source && typeof attachment.source !== 'string') {
          formData.append('photos', attachment.source as File);
        }
      });

      // Функция для retry с обновлением токена
      const fetchWithAuthRetry = async (): Promise<Response> => {
        let currentToken = localStorage.getItem('token');
        const headers: HeadersInit = {};
        if (currentToken) {
          headers['Authorization'] = `Bearer ${currentToken}`;
        }

        let response = await fetch(`${API}/merch-bot/feedback`, {
          method: 'POST',
          headers,
          body: formData
        });

        // Если получили 401, пробуем обновить токен и повторить запрос
        if (response.status === 401) {
          try {
            const refreshResponse = await fetch(`${API}/refresh-token`, {
              method: 'POST',
              credentials: 'include',
            });

            if (refreshResponse.ok) {
              const newToken = await refreshResponse.json();
              localStorage.setItem('token', newToken);
              
              // Повторяем запрос с новым токеном
              headers['Authorization'] = `Bearer ${newToken}`;
              response = await fetch(`${API}/merch-bot/feedback`, {
                method: 'POST',
                headers,
                body: formData
              });
            } else if (refreshResponse.status === 403) {
              localStorage.removeItem('user');
              localStorage.removeItem('token');
              throw new Error('Сессия истекла. Пожалуйста, войдите снова.');
            }
          } catch (refreshError) {
            throw refreshError;
          }
        }

        return response;
      };

      const response = await fetchWithAuthRetry();

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ошибка HTTP: ${response.status} - ${errorText}`);
      }

      // Показываем уведомление об успехе
      notificationSystem.addNotification(
        'Успешно',
        'Обратная связь успешно отправлена',
        'success'
      );

      handleCloseFeedbackModal();
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : 'Не удалось отправить обратную связь');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleCloseFeedbackModal = () => {
    setFeedbackModalOpened(false);
    setFeedbackParentTool('general');
    setFeedbackChildTool('');
    setFeedbackChildTools([]);
    setFeedbackError(null);
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
            <>
              <ScrollArea className="navbar-scroll">
                <div className="nav-options">
                  {tools
                    .sort((a, b) => a.order - b.order)
                    .map((tool) => renderTool(tool, !navOpened))}
                </div>
              </ScrollArea>
              
              {/* Кнопка обратной связи - прямо под меню */}
              <div className="navbar-feedback-section">
                <Button
                  leftSection={<IconMessageCircle size={20} />}
                  onClick={() => {
                    setFeedbackModalOpened(true);
                  }}
                  className="navbar-feedback-button"
                  color="orange"
                  variant="filled"
                  fullWidth={navOpened}
                  size={navOpened ? "md" : "lg"}
                  radius="md"
                  style={{
                    marginTop: 'var(--space-2)',
                    background: 'linear-gradient(135deg, #ff6b35, #f7931e)',
                    boxShadow: '0 4px 12px rgba(255, 107, 53, 0.3)'
                  }}
                >
                  {navOpened ? 'Обратная связь' : ''}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Модальное окно обратной связи */}
      <DynamicFormModal
        opened={feedbackModalOpened}
        onClose={handleCloseFeedbackModal}
        title="Обратная связь"
        mode="create"
        size="md"
        fields={((): FormField[] => {
          const parentOptions = feedbackParentTools.length > 0
            ? feedbackParentTools
            : [
              { value: 'general', label: 'Общая обратная связь' },
              { value: 'other', label: 'Другое' }
              ];

          return [
            {
              name: 'parentTool',
              label: 'Инструмент',
              type: 'select',
              required: true,
              options: parentOptions,
              searchable: true,
              groupWith: ['childTool'],
              groupSize: 2,
              onChange: (value, setFieldValue) => {
                const selected = value || 'general';
                setFeedbackParentTool(selected);
                if (setFieldValue) {
                  setFieldValue('parentTool', selected);
                  setFieldValue('childTool', '');
                }
              }
            },
            {
              name: 'childTool',
              label: 'Дочерний инструмент',
              type: 'select',
              options: feedbackChildTools,
              searchable: true,
              disabled: feedbackChildTools.length === 0,
              groupSize: 2
            },
            {
              name: 'text',
              label: 'Текст обратной связи',
              type: 'textarea',
              required: true,
              placeholder: 'Опишите вашу проблему или предложение...'
            },
            {
              name: 'photos',
              label: 'Фотографии (необязательно)',
              type: 'file',
              withDnd: false,
              multiple: true,
              accept: 'image/*'
            }
          ];
        })()}
        initialValues={{
          parentTool: feedbackParentTool,
          childTool: feedbackChildTool,
          text: '',
          photos: []
        }}
        onSubmit={handleSubmitFeedback}
        loading={isSubmittingFeedback}
        error={feedbackError}
        submitButtonText="Отправить"
        cancelButtonText="Отмена"
      />
    </AppShell.Navbar>
  );
};

export default Navigation;