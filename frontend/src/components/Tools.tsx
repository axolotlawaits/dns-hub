// components/Tools.tsx
import { Link } from "react-router-dom";
import * as TablerIcons from "@tabler/icons-react";
import { Card, SimpleGrid, Text, Group, ThemeIcon, Badge } from '@mantine/core';
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

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active': return 'green';
      case 'inactive': return 'gray';
      case 'maintenance': return 'yellow';
      default: return 'blue';
    }
  };

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="lg">
      {tools.map((tool) => {
        const IconComponent = TablerIcons[tool.icon as keyof typeof TablerIcons] as 
          React.ComponentType<{ size?: number; stroke?: number; color?: string }> | undefined;

        return (
          <Card
            component={Link}
            to={`/${tool.link}`}
            key={tool.id}
            shadow="sm"
            radius="lg"
            className={classes.card}
            padding="lg"
          >
            <div className={classes.cardContent}>
              <Group justify="space-between" align="flex-start" mb="sm">
                <ThemeIcon 
                  size="xl" 
                  color={tool.color || 'blue'} 
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
            </div>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}