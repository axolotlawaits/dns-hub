import React from 'react';
import { Skeleton, Stack, Group, Card } from '@mantine/core';

// Skeleton для карточек
export const CardSkeleton: React.FC = () => (
  <Card shadow="sm" padding="lg" radius="md" withBorder>
    <Stack gap="sm">
      <Skeleton height={20} width="70%" />
      <Skeleton height={16} width="100%" />
      <Skeleton height={16} width="80%" />
      <Group gap="xs">
        <Skeleton height={24} width={60} />
        <Skeleton height={24} width={80} />
      </Group>
    </Stack>
  </Card>
);

// Skeleton для списка карточек
export const CardListSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <Stack gap="md">
    {Array.from({ length: count }).map((_, index) => (
      <CardSkeleton key={index} />
    ))}
  </Stack>
);

// Skeleton для таблицы
export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({ 
  rows = 5, 
  columns = 4 
}) => (
  <Stack gap="xs">
    {/* Header */}
    <Group gap="md">
      {Array.from({ length: columns }).map((_, index) => (
        <Skeleton key={index} height={20} width="100%" />
      ))}
    </Group>
    
    {/* Rows */}
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <Group key={rowIndex} gap="md">
        {Array.from({ length: columns }).map((_, colIndex) => (
          <Skeleton key={colIndex} height={16} width="100%" />
        ))}
      </Group>
    ))}
  </Stack>
);

// Skeleton для формы
export const FormSkeleton: React.FC = () => (
  <Stack gap="md">
    <Skeleton height={40} width="100%" />
    <Skeleton height={40} width="100%" />
    <Skeleton height={80} width="100%" />
    <Group gap="md">
      <Skeleton height={40} width="48%" />
      <Skeleton height={40} width="48%" />
    </Group>
    <Group justify="flex-end">
      <Skeleton height={36} width={100} />
      <Skeleton height={36} width={100} />
    </Group>
  </Stack>
);

// Skeleton для статистики
export const StatsSkeleton: React.FC = () => (
  <Group gap="md">
    {Array.from({ length: 4 }).map((_, index) => (
      <Card key={index} padding="md" withBorder style={{ flex: 1 }}>
        <Stack gap="xs" align="center">
          <Skeleton height={32} width={32} circle />
          <Skeleton height={16} width="60%" />
          <Skeleton height={20} width="40%" />
        </Stack>
      </Card>
    ))}
  </Group>
);

// Skeleton для детальной страницы
export const DetailPageSkeleton: React.FC = () => (
  <Stack gap="lg">
    <Group justify="space-between">
      <Skeleton height={32} width="40%" />
      <Skeleton height={36} width={120} />
    </Group>
    
    <Skeleton height={200} width="100%" />
    
    <Group gap="md">
      <Skeleton height={40} width="30%" />
      <Skeleton height={40} width="30%" />
      <Skeleton height={40} width="30%" />
    </Group>
    
    <Stack gap="md">
      <Skeleton height={20} width="25%" />
      <Skeleton height={16} width="100%" />
      <Skeleton height={16} width="90%" />
      <Skeleton height={16} width="80%" />
    </Stack>
  </Stack>
);

// Skeleton для списка с фильтрами
export const ListWithFiltersSkeleton: React.FC = () => (
  <Stack gap="lg">
    {/* Filters */}
    <Group gap="md">
      <Skeleton height={40} width="30%" />
      <Skeleton height={40} width="20%" />
      <Skeleton height={40} width="20%" />
      <Skeleton height={36} width={100} />
    </Group>
    
    {/* List */}
    <CardListSkeleton count={5} />
    
    {/* Pagination */}
    <Group justify="center">
      <Skeleton height={36} width={200} />
    </Group>
  </Stack>
);

// Компонент для условного отображения скелетона
interface ConditionalSkeletonProps {
  loading: boolean;
  children: React.ReactNode;
  skeleton: React.ReactNode;
}

export const ConditionalSkeleton: React.FC<ConditionalSkeletonProps> = ({
  loading,
  children,
  skeleton
}) => {
  return loading ? <>{skeleton}</> : <>{children}</>;
};
