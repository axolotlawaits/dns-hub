// components/Tools.tsx
import { Link } from "react-router-dom";
import * as TablerIcons from "@tabler/icons-react";
import { Card, SimpleGrid, Text, useMantineTheme } from '@mantine/core';
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
}

interface ToolsProps {
  tools: Tool[];
}

export default function Tools({ tools }: ToolsProps) {
  const theme = useMantineTheme();

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
            radius="md"
            className={classes.card}
            padding="lg"
          >
            <div className={classes.cardContent}>
              {IconComponent && <IconComponent size={40} stroke={1.5} color={theme.colors.blue[6]} />}
              <Text fz="md" fw={600} mt="sm">
                {tool.name}
              </Text>
              <Text fz="sm" c="dimmed" mt={4} lineClamp={2}>
                {tool.description}
              </Text>
            </div>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}