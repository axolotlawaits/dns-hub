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
  Alert,
  Modal,
  Button,
  Textarea,
  TextInput,
  Stack,
  Group,
  FileButton,
  Image,
  Box
} from '@mantine/core';
import { 
  IconLayoutSidebarLeftExpand, 
  IconLayoutSidebarRightExpand,
  IconHome,
  IconChevronRight,
  IconAlertCircle,
  IconMessageCircle,
  IconX,
  IconPhoto
} from '@tabler/icons-react';
import { Select } from '@mantine/core';
import * as TablerIcons from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { API } from '../config/constants';
import { useTheme } from '../contexts/ThemeContext';
import { useUserContext } from '../hooks/useUserContext';
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
  const [feedbackModalOpened, setFeedbackModalOpened] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackParentTool, setFeedbackParentTool] = useState<string>('general');
  const [feedbackChildTool, setFeedbackChildTool] = useState<string>('');
  const [feedbackParentTools, setFeedbackParentTools] = useState<Array<{ value: string; label: string }>>([]);
  const [feedbackChildTools, setFeedbackChildTools] = useState<Array<{ value: string; label: string }>>([]);
  const [toolsData, setToolsData] = useState<any>(null);
  const [feedbackPhotos, setFeedbackPhotos] = useState<File[]>([]);
  const [feedbackPhotoUrls, setFeedbackPhotoUrls] = useState<string[]>([]);
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

        const response = await fetch(`${API}/merch-bot/feedback/tools`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          console.error('Ошибка при загрузке инструментов для обратной связи');
          return;
        }

        const data = await response.json();
        console.log('📦 [Navigation] Загружены инструменты для обратной связи:', data);
        setFeedbackParentTools(data.parentTools || []);
        setToolsData(data); // Сохраняем все данные для использования в другом useEffect
      } catch (err) {
        console.error('Ошибка при загрузке инструментов для обратной связи:', err);
      }
    };

    fetchFeedbackTools();
  }, []);

  // Загрузка дочерних инструментов при выборе родительского
  useEffect(() => {
    console.log('🔄 [Navigation] Изменен родительский инструмент:', feedbackParentTool);
    console.log('📦 [Navigation] toolsData:', toolsData);
    
    if (!feedbackParentTool || feedbackParentTool === 'general' || feedbackParentTool === 'other') {
      console.log('❌ [Navigation] Родительский инструмент не выбран или это general/other');
      setFeedbackChildTools([]);
      setFeedbackChildTool('');
      return;
    }

    if (!toolsData) {
      console.log('⚠️ [Navigation] toolsData еще не загружены');
      return;
    }

    if (!toolsData.parentToolsWithChildren) {
      console.log('⚠️ [Navigation] parentToolsWithChildren отсутствует в toolsData');
      console.log('📦 [Navigation] Структура toolsData:', Object.keys(toolsData));
      return;
    }

    console.log('🔍 [Navigation] Ищем родительский инструмент:', feedbackParentTool);
    console.log('📋 [Navigation] Доступные родительские инструменты:', toolsData.parentToolsWithChildren.map((p: any) => ({ value: p.value, label: p.label, childrenCount: p.children?.length || 0 })));
    
    // Находим родительский инструмент по link
    const parentTool = toolsData.parentToolsWithChildren.find((p: any) => p.value === feedbackParentTool);
    console.log('✅ [Navigation] Найден родительский инструмент:', parentTool);
    
    if (parentTool) {
      if (parentTool.children && parentTool.children.length > 0) {
        console.log('👶 [Navigation] Найдено дочерних инструментов:', parentTool.children.length, parentTool.children);
        setFeedbackChildTools(parentTool.children);
      } else {
        console.log('⚠️ [Navigation] У родительского инструмента нет дочерних элементов');
        setFeedbackChildTools([]);
      }
    } else {
      console.log('❌ [Navigation] Родительский инструмент не найден в списке');
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

  const handleFeedbackPhotoChange = (file: File | null) => {
    if (file) {
      const newPhotos = [...feedbackPhotos, file];
      setFeedbackPhotos(newPhotos);
      const newUrls = newPhotos.map(f => URL.createObjectURL(f));
      setFeedbackPhotoUrls(newUrls);
    }
  };

  const removeFeedbackPhoto = (index: number) => {
    const newPhotos = feedbackPhotos.filter((_, i) => i !== index);
    const newUrls = feedbackPhotoUrls.filter((_, i) => i !== index);
    setFeedbackPhotos(newPhotos);
    setFeedbackPhotoUrls(newUrls);
    // Освобождаем память
    URL.revokeObjectURL(feedbackPhotoUrls[index]);
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim()) {
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

      // Определяем финальный инструмент: если выбран дочерний, используем его, иначе родительский
      // Формат: parentTool:childTool или просто parentTool
      const finalTool = feedbackChildTool 
        ? `${feedbackParentTool}:${feedbackChildTool}` 
        : feedbackParentTool;

      // Конвертируем файлы в base64 или отправляем как FormData
      const formData = new FormData();
      formData.append('tool', finalTool);
      formData.append('text', feedbackText.trim());
      if (user?.email) {
        formData.append('email', user.email);
      }

      // Добавляем фотографии
      feedbackPhotos.forEach((photo) => {
        formData.append('photos', photo);
      });

      const response = await fetch(`${API}/merch-bot/feedback`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ошибка HTTP: ${response.status} - ${errorText}`);
      }

      // Очищаем форму
      setFeedbackText('');
      setFeedbackParentTool('general');
      setFeedbackChildTool('');
      setFeedbackChildTools([]);
      setFeedbackPhotos([]);
      feedbackPhotoUrls.forEach(url => URL.revokeObjectURL(url));
      setFeedbackPhotoUrls([]);
      setFeedbackModalOpened(false);
      setFeedbackError(null);
    } catch (error) {
      console.error('Ошибка при отправке обратной связи:', error);
      setFeedbackError(error instanceof Error ? error.message : 'Не удалось отправить обратную связь');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleCloseFeedbackModal = () => {
    setFeedbackModalOpened(false);
    setFeedbackText('');
    setFeedbackParentTool('general');
    setFeedbackChildTool('');
    setFeedbackChildTools([]);
    setFeedbackPhotos([]);
    feedbackPhotoUrls.forEach(url => URL.revokeObjectURL(url));
    setFeedbackPhotoUrls([]);
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

        {/* Нижняя часть навигации */}
        <div className="navbar-footer">
          <div className="navbar-footer-content">
            <Text size="xs" c="var(--theme-text-tertiary)" ta="center">
              {navOpened ? `DNS Hub ${APP_VERSION}` : `v${APP_VERSION}`}
            </Text>
          </div>
        </div>
      </div>

      {/* Модальное окно обратной связи */}
      <Modal
        opened={feedbackModalOpened}
        onClose={handleCloseFeedbackModal}
        title="Обратная связь"
        size="md"
        centered
        overlayProps={{
          backgroundOpacity: 0.5,
        }}
        withCloseButton
        closeOnClickOutside
        closeOnEscape
      >
        <Stack gap="md">
          <Select
            label="Родительский инструмент"
            placeholder="Выберите родительский инструмент"
            value={feedbackParentTool}
            onChange={(value) => setFeedbackParentTool(value || 'general')}
            data={feedbackParentTools.length > 0 ? feedbackParentTools : [
              { value: 'general', label: 'Общая обратная связь' },
              { value: 'other', label: 'Другое' }
            ]}
            required
            searchable
          />

          <Select
            label="Дочерний инструмент"
            placeholder={feedbackChildTools.length > 0 ? "Выберите дочерний инструмент" : "Нет дочерних инструментов"}
            value={feedbackChildTool}
            onChange={(value) => setFeedbackChildTool(value || '')}
            data={feedbackChildTools}
            searchable
            clearable
            disabled={feedbackChildTools.length === 0}
            required={feedbackChildTools.length > 0}
          />
          
          {user?.email && (
            <TextInput
              label="Email"
              value={user.email}
              disabled
              readOnly
            />
          )}
          
          <Textarea
            label="Текст обратной связи"
            placeholder="Опишите вашу проблему или предложение..."
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            minRows={5}
            required
          />

          <Box>
            <Text size="sm" fw={500} mb="xs">Фотографии (необязательно)</Text>
            <Group gap="sm">
              <FileButton
                onChange={handleFeedbackPhotoChange}
                accept="image/*"
                multiple={false}
              >
                {(props) => (
                  <Button
                    {...props}
                    leftSection={<IconPhoto size={16} />}
                    variant="outline"
                    size="sm"
                  >
                    Добавить фото
                  </Button>
                )}
              </FileButton>
            </Group>
            {feedbackPhotoUrls.length > 0 && (
              <Group gap="sm" mt="md">
                {feedbackPhotoUrls.map((url, index) => (
                  <Box key={index} pos="relative" style={{ position: 'relative' }}>
                    <Image
                      src={url}
                      alt={`Фото ${index + 1}`}
                      width={100}
                      height={100}
                      fit="cover"
                      radius="md"
                    />
                    <ActionIcon
                      color="red"
                      variant="filled"
                      size="sm"
                      radius="xl"
                      pos="absolute"
                      top={-8}
                      right={-8}
                      onClick={() => removeFeedbackPhoto(index)}
                      style={{ zIndex: 1 }}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  </Box>
                ))}
              </Group>
            )}
          </Box>

          {feedbackError && (
            <Alert color="red" title="Ошибка">
              {feedbackError}
            </Alert>
          )}

          <Group justify="flex-end" mt="md">
            <Button variant="outline" onClick={handleCloseFeedbackModal}>
              Отмена
            </Button>
            <Button
              onClick={handleSubmitFeedback}
              loading={isSubmittingFeedback}
              color="orange"
              style={{
                background: 'linear-gradient(135deg, #ff6b35, #f7931e)'
              }}
            >
              Отправить
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AppShell.Navbar>
  );
};

export default Navigation;