import React, { useState, useEffect, useCallback } from 'react';
import {  Paper,  Text,  Button,  Group,  Modal,  LoadingOverlay, Badge, ActionIcon, Select, Grid, Card, Stack, Avatar, Divider, Box, Center, Menu, Collapse, ThemeIcon, Progress } from '@mantine/core';
import {  IconUpload,  IconDownload,  IconPlus,  IconEdit,  IconTrash,  IconApps, IconDeviceMobile, IconDeviceDesktop, IconTool, IconArchive, IconDots, IconCalendar, IconUsers, IconChevronDown, IconChevronUp, IconFileText } from '@tabler/icons-react';
import { notificationSystem } from '../../../utils/Push';
import { API } from '../../../config/constants';
import { DynamicFormModal } from '../../../utils/formModal';
import { DndProviderWrapper } from '../../../utils/dnd';
import { usePageHeader } from '../../../contexts/PageHeaderContext';
import { useUserContext } from '../../../hooks/useUserContext';
import './AppStore.css';

// Типы данных
interface App {
  id: string;
  name: string;
  category: 'MOBILE' | 'DESKTOP' | 'UTILITY' | 'TOOL';
  appType: 'ANDROID_APK' | 'WINDOWS_EXE' | 'WINDOWS_MSI' | 'MACOS_DMG' | 'LINUX_DEB' | 'LINUX_RPM' | 'ARCHIVE';
  description?: string;
  icon?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  versions: AppVersion[];
}

interface AppVersion {
  id: string;
  version: string;
  fileName: string;
  fileSize: number;
  description?: string;
  isActive: boolean;
  downloadCount: number;
  createdAt: string;
}

const AppStore: React.FC = () => {
  const { setHeader, clearHeader } = usePageHeader();
  const { user } = useUserContext();
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<App | null>(null);
  
  // Модальные окна
  const [createAppModalOpen, setCreateAppModalOpen] = useState(false);
  const [editAppModalOpen, setEditAppModalOpen] = useState(false);
  const [uploadVersionModalOpen, setUploadVersionModalOpen] = useState(false);
  const [deleteAppModalOpen, setDeleteAppModalOpen] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  
  // Состояние загрузки
  const [downloadingApp, setDownloadingApp] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Фильтры
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [appTypeFilter, setAppTypeFilter] = useState<string>('');
  
  // Состояние для раскрытых карточек
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Проверка ролей для доступа к функциям управления
  const hasManageAccess = user?.role === 'DEVELOPER' || user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';

  // Устанавливаем заголовок страницы
  useEffect(() => {
    setHeader({
      title: 'Магазин приложений',
      subtitle: 'Управляйте приложениями и их версиями',
      icon: <Text size="xl" fw={700} c="white">🏪</Text>,
      ...(hasManageAccess && {
        actionButton: {
          text: 'Создать приложение',
          onClick: () => setCreateAppModalOpen(true),
          icon: <IconPlus size={18} />
        }
      })
    });

    return () => clearHeader();
  }, [setHeader, clearHeader, hasManageAccess]);

  // Загрузка приложений
  const loadApps = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (categoryFilter) params.append('category', categoryFilter);
      if (appTypeFilter) params.append('appType', appTypeFilter);
      
      const response = await fetch(`${API}/retail/app-store?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setApps(data.apps);
      } else {
        notificationSystem.addNotification('Ошибка', data.message, 'error');
      }
    } catch (error) {
      notificationSystem.addNotification('Ошибка', 'Ошибка при загрузке приложений', 'error');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, appTypeFilter]);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  // Создание приложения
  const handleCreateApp = async (values: any) => {
    try {
      const response = await fetch(`${API}/retail/app-store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      
      const data = await response.json();
      
      if (data.success) {
        notificationSystem.addNotification('Успех', 'Приложение создано успешно', 'success');
        setCreateAppModalOpen(false);
        loadApps();
      } else {
        notificationSystem.addNotification('Ошибка', data.message, 'error');
      }
    } catch (error) {
      notificationSystem.addNotification('Ошибка', 'Ошибка при создании приложения', 'error');
    }
  };

  // Редактирование приложения
  const handleEditApp = async (values: any) => {
    if (!selectedApp) return;

    try {
      const response = await fetch(`${API}/retail/app-store/${selectedApp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      
      const data = await response.json();
      
      if (data.success) {
        notificationSystem.addNotification('Успех', 'Приложение обновлено успешно', 'success');
        setEditAppModalOpen(false);
        loadApps();
      } else {
        notificationSystem.addNotification('Ошибка', data.message, 'error');
      }
    } catch (error) {
      notificationSystem.addNotification('Ошибка', 'Ошибка при обновлении приложения', 'error');
    }
  };

  // Загрузка версии
  const handleUploadVersion = async (values: any) => {
    if (!selectedApp) return;

    try {
      const formData = new FormData();
      formData.append('appId', selectedApp.id);
      formData.append('version', values.version);
      formData.append('description', values.description || '');
      formData.append('file', values.file[0].source);

      const response = await fetch(`${API}/retail/app-store/${selectedApp.id}/versions`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (data.success) {
        notificationSystem.addNotification('Успех', 'Версия загружена успешно', 'success');
        setUploadVersionModalOpen(false);
        loadApps();
      } else {
        notificationSystem.addNotification('Ошибка', data.message, 'error');
      }
    } catch (error) {
      notificationSystem.addNotification('Ошибка', 'Ошибка при загрузке версии', 'error');
    }
  };

  // Скачивание приложения
  const handleDownload = async (appId: string) => {
    setDownloadingApp(appId);
    setDownloadModalOpen(true);
    setDownloadProgress(0);
    
    try {
      // Симулируем прогресс загрузки
      const progressInterval = setInterval(() => {
        setDownloadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 10;
        });
      }, 200);
      
      const response = await fetch(`${API}/retail/app-store/${appId}/download`);
      
      if (response.ok) {
        // Получаем имя файла из заголовка Content-Disposition
        const contentDisposition = response.headers.get('Content-Disposition');
        
        let fileName = `app-${appId}`; // fallback
        
        if (contentDisposition) {
          const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
          if (fileNameMatch) {
            fileName = fileNameMatch[1];
          }
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        clearInterval(progressInterval);
        setDownloadProgress(100);
        
        setTimeout(() => {
          setDownloadModalOpen(false);
          setDownloadingApp(null);
          setDownloadProgress(0);
          notificationSystem.addNotification('Успех', 'Приложение скачано', 'success');
        }, 500);
      } else {
        clearInterval(progressInterval);
        setDownloadModalOpen(false);
        setDownloadingApp(null);
        setDownloadProgress(0);
        notificationSystem.addNotification('Ошибка', 'Ошибка при скачивании', 'error');
      }
    } catch (error) {
      setDownloadModalOpen(false);
      setDownloadingApp(null);
      setDownloadProgress(0);
      notificationSystem.addNotification('Ошибка', 'Ошибка при скачивании', 'error');
    }
  };

  // Удаление приложения
  const handleDeleteApp = async () => {
    if (!selectedApp) return;

    try {
      const response = await fetch(`${API}/retail/app-store/${selectedApp.id}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.success) {
        notificationSystem.addNotification('Успех', 'Приложение удалено', 'success');
        setDeleteAppModalOpen(false);
        loadApps();
      } else {
        notificationSystem.addNotification('Ошибка', data.message, 'error');
      }
    } catch (error) {
      notificationSystem.addNotification('Ошибка', 'Ошибка при удалении', 'error');
    }
  };

  // Получение иконки категории
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'MOBILE': return <IconDeviceMobile size={24} />;
      case 'DESKTOP': return <IconDeviceDesktop size={24} />;
      case 'UTILITY': return <IconTool size={24} />;
      case 'TOOL': return <IconArchive size={24} />;
      default: return <IconApps size={24} />;
    }
  };

  // Получение цвета категории
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'MOBILE': return 'blue';
      case 'DESKTOP': return 'green';
      case 'UTILITY': return 'orange';
      case 'TOOL': return 'purple';
      default: return 'gray';
    }
  };

  // Получение лейбла категории
  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'MOBILE': return 'Мобильные';
      case 'DESKTOP': return 'Десктопные';
      case 'UTILITY': return 'Утилиты';
      case 'TOOL': return 'Инструменты';
      default: return category;
    }
  };

  // Получение лейбла типа приложения
  const getAppTypeLabel = (appType: string) => {
    switch (appType) {
      case 'ANDROID_APK': return 'Android';
      case 'WINDOWS_EXE': return 'Windows';
      case 'WINDOWS_MSI': return 'Windows MSI';
      case 'MACOS_DMG': return 'macOS';
      case 'LINUX_DEB': return 'Linux DEB';
      case 'LINUX_RPM': return 'Linux RPM';
      case 'ARCHIVE': return 'Архив';
      default: return appType;
    }
  };

  // Форматирование размера файла
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Переключение раскрытия карточки
  const toggleCardExpansion = (appId: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(appId)) {
        newSet.delete(appId);
      } else {
        newSet.add(appId);
      }
      return newSet;
    });
  };

  return (
    <DndProviderWrapper>
      <Box className="app-store-container">
        {/* Filters */}
        <Paper p="lg" mb="lg" className="app-store-filters">
          <Group gap="md">
            <Select
              placeholder="Все категории"
              data={[
                { value: '', label: 'Все категории' },
                { value: 'MOBILE', label: '📱 Мобильные' },
                { value: 'DESKTOP', label: '💻 Десктопные' },
                { value: 'UTILITY', label: '🔧 Утилиты' },
                { value: 'TOOL', label: '🛠️ Инструменты' }
              ]}
              value={categoryFilter}
              onChange={(value) => setCategoryFilter(value || '')}
              size="md"
            />
            <Select
              placeholder="Все типы"
              data={[
                { value: '', label: 'Все типы' },
                { value: 'ANDROID_APK', label: 'Android APK' },
                { value: 'WINDOWS_EXE', label: 'Windows EXE' },
                { value: 'WINDOWS_MSI', label: 'Windows MSI' },
                { value: 'MACOS_DMG', label: 'macOS DMG' },
                { value: 'LINUX_DEB', label: 'Linux DEB' },
                { value: 'LINUX_RPM', label: 'Linux RPM' },
                { value: 'ARCHIVE', label: 'Архив' }
              ]}
              value={appTypeFilter}
              onChange={(value) => setAppTypeFilter(value || '')}
              size="md"
            />
          </Group>
        </Paper>

        {/* Apps Grid */}
        <LoadingOverlay visible={loading} />
        <Grid gutter="lg">
          {apps.map((app) => (
            <Grid.Col key={app.id} span={{ base: 12, sm: 6, md: 4, lg: 3 }}>
              <Card 
                shadow="sm" 
                padding="lg" 
                radius="md" 
                withBorder
                className="app-card"
                data-category={app.category}
              >
                <Card.Section className="app-card-header">
                  <Group justify="space-between" p="md">
                    <Avatar
                      size={60}
                      radius="md"
                      className="app-icon"
                      color={getCategoryColor(app.category)}
                    >
                      {getCategoryIcon(app.category)}
                    </Avatar>
                    {hasManageAccess && (
                      <Menu shadow="md" width={200}>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray">
                            <IconDots size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconUpload size={14} />}
                            onClick={() => {
                              setSelectedApp(app);
                              setUploadVersionModalOpen(true);
                            }}
                          >
                            Загрузить версию
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconEdit size={14} />}
                            onClick={() => {
                              setSelectedApp(app);
                              setEditAppModalOpen(true);
                            }}
                          >
                            Редактировать
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item
                            color="red"
                            leftSection={<IconTrash size={14} />}
                            onClick={() => {
                              setSelectedApp(app);
                              setDeleteAppModalOpen(true);
                            }}
                          >
                            Удалить
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    )}
                  </Group>
                </Card.Section>

                <Stack gap="sm" mt="md">
                  <div>
                    <Text fw={600} size="lg" lineClamp={1}>
                      {app.name}
                    </Text>
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {app.description || 'Без описания'}
                    </Text>
                  </div>

                  <Group gap="xs">
                    <Badge 
                      variant="light" 
                      color={getCategoryColor(app.category)}
                      size="sm"
                    >
                      {getCategoryLabel(app.category)}
                    </Badge>
                    <Badge variant="outline" size="sm">
                      {getAppTypeLabel(app.appType)}
                    </Badge>
                  </Group>

                  {app.versions[0] && (
                    <Box>
                      <Group justify="space-between" mb="xs">
                        <Text size="sm" fw={500}>
                          Версия {app.versions[0].version}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {formatFileSize(app.versions[0].fileSize)}
                        </Text>
                      </Group>
                      
                      <Group justify="space-between" mb="xs">
                        <Group gap="xs">
                          <IconUsers size={14} />
                          <Text size="sm" c="dimmed">
                            {app.versions[0].downloadCount} скачиваний
                          </Text>
                        </Group>
                        <Group gap="xs">
                          <IconCalendar size={14} />
                          <Text size="sm" c="dimmed">
                            {new Date(app.versions[0].createdAt).toLocaleDateString('ru-RU')}
                          </Text>
                        </Group>
                      </Group>

                      {/* Описание обновления с раскрытием */}
                      {app.versions[0].description && (
                        <Box>
                          <Button
                            variant="subtle"
                            size="xs"
                            fullWidth
                            leftSection={
                              <ThemeIcon size="xs" variant="light" color="blue">
                                <IconFileText size={12} />
                              </ThemeIcon>
                            }
                            rightSection={
                              expandedCards.has(app.id) ? 
                                <IconChevronUp size={12} /> : 
                                <IconChevronDown size={12} />
                            }
                            onClick={() => toggleCardExpansion(app.id)}
                            className="description-toggle-button"
                          >
                            Описание обновления
                          </Button>
                          
                          <Collapse in={expandedCards.has(app.id)}>
                            <Paper 
                              p="sm" 
                              mt="xs" 
                              radius="md" 
                              className="description-content"
                              withBorder
                            >
                              <Text size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>
                                {app.versions[0].description}
                              </Text>
                            </Paper>
                          </Collapse>
                        </Box>
                      )}
                    </Box>
                  )}

                  <Divider />

                  <Button
                    fullWidth
                    size="md"
                    leftSection={<IconDownload size={16} />}
                    onClick={() => handleDownload(app.id)}
                    disabled={!app.versions[0]}
                    className="download-button"
                  >
                    {app.versions[0] ? 'Скачать' : 'Нет версий'}
                  </Button>
                </Stack>
              </Card>
            </Grid.Col>
          ))}
        </Grid>

        {apps.length === 0 && !loading && (
          <Center py="xl">
            <Stack align="center" gap="md">
              <IconApps size={64} color="var(--mantine-color-gray-4)" />
              <Text size="lg" c="dimmed">
                Приложения не найдены
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                Создайте первое приложение или измените фильтры поиска
              </Text>
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => setCreateAppModalOpen(true)}
              >
                Создать приложение
              </Button>
            </Stack>
          </Center>
        )}

        {/* Модальное окно создания приложения - только для пользователей с правами */}
        {hasManageAccess && (
          <DynamicFormModal
            opened={createAppModalOpen}
            onClose={() => setCreateAppModalOpen(false)}
            title="Создать приложение"
            mode="create"
            fields={[
              {
                name: 'name',
                label: 'Название',
                type: 'text',
                required: true,
                placeholder: 'Введите название приложения'
              },
              {
                name: 'category',
                label: 'Категория',
                type: 'select',
                required: true,
                options: [
                  { value: 'MOBILE', label: 'Мобильные' },
                  { value: 'DESKTOP', label: 'Десктопные' },
                  { value: 'UTILITY', label: 'Утилиты' },
                  { value: 'TOOL', label: 'Инструменты' }
                ]
              },
              {
                name: 'appType',
                label: 'Тип приложения',
                type: 'select',
                required: true,
                options: [
                  { value: 'ANDROID_APK', label: 'Android APK' },
                  { value: 'WINDOWS_EXE', label: 'Windows EXE' },
                  { value: 'WINDOWS_MSI', label: 'Windows MSI' },
                  { value: 'MACOS_DMG', label: 'macOS DMG' },
                  { value: 'LINUX_DEB', label: 'Linux DEB' },
                  { value: 'LINUX_RPM', label: 'Linux RPM' },
                  { value: 'ARCHIVE', label: 'Архив' }
                ]
              },
              {
                name: 'description',
                label: 'Описание',
                type: 'textarea',
                placeholder: 'Описание приложения'
              }
            ]}
            initialValues={{
              name: '',
              category: '',
              appType: '',
              description: ''
            }}
            onSubmit={handleCreateApp}
            submitButtonText="Создать"
            cancelButtonText="Отмена"
            size="md"
          />
        )}

        {/* Модальное окно редактирования приложения - только для пользователей с правами */}
        {hasManageAccess && (
          <DynamicFormModal
            opened={editAppModalOpen}
            onClose={() => setEditAppModalOpen(false)}
            title={`Редактировать приложение - ${selectedApp?.name}`}
            mode="edit"
            fields={[
              {
                name: 'name',
                label: 'Название',
                type: 'text',
                required: true,
                placeholder: 'Введите название приложения'
              },
              {
                name: 'description',
                label: 'Описание',
                type: 'textarea',
                placeholder: 'Описание приложения'
              },
              {
                name: 'category',
                label: 'Категория',
                type: 'select',
                required: true,
                options: [
                  { value: 'MOBILE', label: 'Мобильное приложение' },
                  { value: 'DESKTOP', label: 'Десктопное приложение' },
                  { value: 'UTILITY', label: 'Утилита' },
                  { value: 'TOOL', label: 'Инструмент' }
                ]
              },
              {
                name: 'appType',
                label: 'Тип приложения',
                type: 'select',
                required: true,
                options: [
                  { value: 'ANDROID_APK', label: 'Android APK' },
                  { value: 'WINDOWS_EXE', label: 'Windows EXE' },
                  { value: 'WINDOWS_MSI', label: 'Windows MSI' },
                  { value: 'MACOS_DMG', label: 'macOS DMG' },
                  { value: 'LINUX_DEB', label: 'Linux DEB' },
                  { value: 'LINUX_RPM', label: 'Linux RPM' },
                  { value: 'ARCHIVE', label: 'Архив' }
                ]
              },
              {
                name: 'isActive',
                label: 'Активно',
                type: 'boolean'
              }
            ]}
            initialValues={selectedApp || {}}
            onSubmit={handleEditApp}
            submitButtonText="Сохранить"
            cancelButtonText="Отмена"
            size="md"
          />
        )}

        {/* Модальное окно загрузки версии - только для пользователей с правами */}
        {hasManageAccess && (
          <DynamicFormModal
            opened={uploadVersionModalOpen}
            onClose={() => setUploadVersionModalOpen(false)}
            title={`Загрузить версию - ${selectedApp?.name}`}
            mode="create"
            fields={[
              {
                name: 'version',
                label: 'Версия',
                type: 'text',
                required: true,
                placeholder: 'Например: 1.0.0'
              },
              {
                name: 'description',
                label: 'Описание изменений',
                type: 'textarea',
                placeholder: 'Что изменилось в этой версии'
              },
              {
                name: 'file',
                label: 'Файл приложения',
                type: 'file',
                required: true,
                multiple: false
              }
            ]}
            initialValues={{
              version: '',
              description: ''
            }}
            onSubmit={handleUploadVersion}
            submitButtonText="Загрузить"
            cancelButtonText="Отмена"
            size="md"
          />
        )}

        {/* Модальное окно удаления - только для пользователей с правами */}
        {hasManageAccess && (
          <Modal
            opened={deleteAppModalOpen}
            onClose={() => setDeleteAppModalOpen(false)}
            title="Удалить приложение"
            size="sm"
          >
            <Text>Вы уверены, что хотите удалить приложение "{selectedApp?.name}"?</Text>
            <Text size="sm" c="red" mt="sm">
              Это действие нельзя отменить. Все версии и файлы будут удалены.
            </Text>
            <Group justify="flex-end" mt="md">
              <Button variant="outline" onClick={() => setDeleteAppModalOpen(false)}>
                Отмена
              </Button>
              <Button color="red" onClick={handleDeleteApp}>
                Удалить
              </Button>
            </Group>
          </Modal>
        )}

        {/* Модальное окно прогресса загрузки */}
        <Modal
          opened={downloadModalOpen}
          onClose={() => {}}
          title="Загрузка приложения"
          size="sm"
          closeOnClickOutside={false}
          closeOnEscape={false}
          withCloseButton={false}
        >
          <Stack gap="md" align="center">
            <ThemeIcon size={60} radius="xl" color="blue">
              <IconDownload size={30} />
            </ThemeIcon>
            <Text ta="center" fw={500}>
              Загружаем приложение...
            </Text>
            <Box w="100%">
              <Progress 
                value={downloadProgress} 
                size="lg" 
                radius="xl"
                color="blue"
                animated
              />
              <Text size="sm" c="dimmed" ta="center" mt="xs">
                {Math.round(downloadProgress)}%
              </Text>
            </Box>
            <Text size="sm" c="dimmed" ta="center">
              Пожалуйста, подождите...
            </Text>
          </Stack>
        </Modal>
      </Box>
    </DndProviderWrapper>
  );
};

export default AppStore;
