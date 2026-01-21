// components/Tools.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as TablerIcons from "@tabler/icons-react";
import { Card, SimpleGrid, Text, Group, ThemeIcon, Badge, Button, Stack, Modal } from '@mantine/core';
import { useAccessContext } from "../hooks/useAccessContext";
import { useUserContext } from "../hooks/useUserContext";
import { API } from "../config/constants";
import { notificationSystem } from "../utils/Push";
import { IconLock, IconCheck } from "@tabler/icons-react";
import classes from './styles/Tools.module.css';

export interface Tool {
  id: string;
  parent_id: string | null;
  name: string;
  icon: string;
  link: string;
  description: string;
  order: number;
  types: any[];
  count?: number;
  status?: 'active' | 'inactive' | 'maintenance';
  color?: string;
}

interface ToolsProps {
  tools: Tool[];
}

export default function Tools({ tools }: ToolsProps) {
  const { access } = useAccessContext();
  const { user } = useUserContext();
  const navigate = useNavigate();
  const [requestingAccess, setRequestingAccess] = useState<string | null>(null);
  const [requestModalOpened, setRequestModalOpened] = useState(false);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [protectedToolLinks, setProtectedToolLinks] = useState<string[]>([]);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active': return 'green';
      case 'inactive': return 'gray';
      case 'maintenance': return 'yellow';
      default: return 'blue';
    }
  };

  // Загружаем список защищенных инструментов
  useEffect(() => {
    const loadProtectedTools = async () => {
      try {
        const response = await fetch(`${API}/access/protected-tools`);
        if (response.ok) {
          const links = await response.json();
          setProtectedToolLinks(links);
        }
      } catch (error) {
        console.error('Error loading protected tools:', error);
      }
    };
    loadProtectedTools();
  }, []);

  // Проверяем, является ли инструмент защищенным
  const isProtectedTool = (tool: Tool): boolean => {
    return protectedToolLinks.includes(tool.link) || 
           protectedToolLinks.some(link => tool.link.startsWith(link + '/'));
  };

  const hasAccess = (tool: Tool): boolean => {
    if (!user) return false;
    // Админы и разработчики имеют доступ ко всем инструментам
    if (['ADMIN', 'DEVELOPER'].includes(user.role)) return true;
    // Проверяем доступ через AccessContext
    return access.some(a => a.toolId === tool.id || a.link === tool.link);
  };

  const handleRequestAccess = async (tool: Tool) => {
    setSelectedTool(tool);
    setRequestModalOpened(true);
  };

  const confirmRequestAccess = async () => {
    if (!selectedTool) return;
    
    setRequestingAccess(selectedTool.id);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/access/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ toolId: selectedTool.id })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to request access');
      }

      notificationSystem.addNotification(
        'Запрос отправлен',
        `Запрос доступа к инструменту "${selectedTool.name}" отправлен администраторам`,
        'success'
      );

      setRequestModalOpened(false);
      setSelectedTool(null);
    } catch (error) {
      notificationSystem.addNotification(
        'Ошибка',
        error instanceof Error ? error.message : 'Не удалось отправить запрос доступа',
        'error'
      );
    } finally {
      setRequestingAccess(null);
    }
  };

  return (
    <>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="lg">
        {tools.map((tool) => {
          const IconComponent = TablerIcons[tool.icon as keyof typeof TablerIcons] as 
            React.ComponentType<{ size?: number; stroke?: number; color?: string }> | undefined;
          
          const toolHasAccess = hasAccess(tool);
          const isRequesting = requestingAccess === tool.id;

          const CardContent = (
            <>
              {!toolHasAccess && isProtectedTool(tool) && (
                <div style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  zIndex: 10
                }}>
                  <Badge size="sm" color="gray" variant="filled" leftSection={<IconLock size={12} />}>
                    Нет доступа
                  </Badge>
                </div>
              )}
              
              <div className={classes.cardContent}>
                <Group justify="space-between" align="flex-start" mb="sm">
                  <ThemeIcon 
                    size="xl" 
                    color={toolHasAccess ? (tool.color || 'blue') : 'gray'} 
                    variant="light"
                    className={classes.toolIcon}
                  >
                    {IconComponent && <IconComponent size={32} stroke={1.5} />}
                  </ThemeIcon>
                  <Group gap="xs">
                    {tool.status && (
                      <Badge size="sm" color={getStatusColor(tool.status)} variant="light">
                        {tool.status === 'active' ? 'Активен' : 
                         tool.status === 'inactive' ? 'Неактивен' : 'Обслуживание'}
                      </Badge>
                    )}
                    {tool.count !== undefined && (
                      <Badge size="sm" color="blue" variant="light">
                        {tool.count}
                      </Badge>
                    )}
                  </Group>
                </Group>
                
                <Text fz="lg" fw={600} mb="xs" className={classes.toolName}>
                  {tool.name}
                </Text>
                
                <Text fz="sm" c="dimmed" lineClamp={3} className={classes.toolDescription}>
                  {tool.description}
                </Text>
                
                {tool.types && tool.types.length > 0 && (
                  <Group gap="xs" mt="sm">
                    {tool.types.slice(0, 3).map((type, index) => (
                      <Badge key={index} size="xs" variant="outline" color="gray">
                        {type.name || type}
                      </Badge>
                    ))}
                    {tool.types.length > 3 && (
                      <Badge size="xs" variant="outline" color="gray">
                        +{tool.types.length - 3}
                      </Badge>
                    )}
                  </Group>
                )}

                {!toolHasAccess && isProtectedTool(tool) && (
                  <Button
                    fullWidth
                    mt="md"
                    variant="light"
                    color="blue"
                    leftSection={<IconLock size={16} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleRequestAccess(tool);
                    }}
                    loading={isRequesting}
                    disabled={isRequesting}
                  >
                    Запросить доступ
                  </Button>
                )}
              </div>
            </>
          );

          return (
            <Card
              key={tool.id}
              shadow="sm"
              radius="lg"
              className={classes.card}
              padding="lg"
              style={{
                opacity: toolHasAccess || !isProtectedTool(tool) ? 1 : 0.6,
                cursor: toolHasAccess || !isProtectedTool(tool) ? 'pointer' : 'not-allowed',
                position: 'relative'
              }}
              onClick={toolHasAccess ? () => navigate(`/${tool.link}`) : isProtectedTool(tool) ? (e) => {
                e.preventDefault();
                setSelectedTool(tool);
                setRequestModalOpened(true);
              } : () => navigate(`/${tool.link}`)}
            >
              {CardContent}
            </Card>
          );
        })}
      </SimpleGrid>

      <Modal
        opened={requestModalOpened}
        onClose={() => {
          setRequestModalOpened(false);
          setSelectedTool(null);
        }}
        title="Запрос доступа"
        centered
      >
        <Stack gap="md">
          <Text>
            Вы хотите запросить доступ к инструменту <strong>{selectedTool?.name}</strong>?
          </Text>
          <Text size="sm" c="dimmed">
            Запрос будет отправлен администраторам инструмента и разработчикам системы.
          </Text>
          <Group justify="flex-end" mt="md">
            <Button
              variant="subtle"
              onClick={() => {
                setRequestModalOpened(false);
                setSelectedTool(null);
              }}
            >
              Отмена
            </Button>
            <Button
              onClick={confirmRequestAccess}
              loading={requestingAccess !== null}
              leftSection={<IconCheck size={16} />}
            >
              Отправить запрос
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}