import { memo } from 'react';
import { Card, Group, Box, Text, Badge, Button, Tooltip } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import dayjs from 'dayjs';

interface AccessRequest {
  id: string;
  createdAt: string;
  user?: {
    name?: string;
    email?: string;
    branchRrs?: string | null;
    branchName?: string | null;
    positionName?: string | null;
  };
  metadata?: {
    toolName?: string;
    requestedByName?: string;
    requestedByEmail?: string;
    toolId?: string;
  };
  email?: string;
}

interface AccessRequestCardProps {
  request: AccessRequest;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}

export const AccessRequestCard = memo(({ request, onApprove, onReject }: AccessRequestCardProps) => {
  const metadata = request.metadata as any;
  const toolName = metadata?.toolName || 'Неизвестный инструмент';
  const requesterName = request.user?.name || metadata?.requestedByName || 'Неизвестный пользователь';
  const requesterEmail = request.user?.email || metadata?.requestedByEmail || request.email;
  const branchRrs = request.user?.branchRrs || null;
  const branchName = request.user?.branchName || null;
  const positionName = request.user?.positionName || null;

  return (
    <Card
      style={{
        border: '1px solid var(--theme-border-primary)',
        borderRadius: '12px',
        background: 'var(--theme-bg-primary)',
        transition: 'all 0.2s ease',
      }}
      padding="md"
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <Group justify="space-between" align="flex-start">
        <Box style={{ flex: 1 }}>
          <Group gap="xs" mb="xs" wrap="wrap">
            <Text fw={600} size="md" c="var(--theme-text-primary)">
              {requesterName}
            </Text>
            <Badge size="sm" variant="light" color="blue">
              {requesterEmail}
            </Badge>
            {branchRrs && (
              <Badge size="sm" variant="light" color="gray">
                РРС: {branchRrs}
              </Badge>
            )}
            {branchName && (
              <Badge size="sm" variant="light" color="teal">
                {branchName}
              </Badge>
            )}
            {positionName && (
              <Badge size="sm" variant="light" color="violet">
                {positionName}
              </Badge>
            )}
          </Group>
          <Text size="sm" c="var(--theme-text-secondary)" mb="xs">
            Запрашивает доступ к инструменту: <strong>{toolName}</strong>
          </Text>
          <Text size="xs" c="var(--theme-text-secondary)">
            {dayjs(request.createdAt).format('DD.MM.YYYY HH:mm')}
          </Text>
        </Box>
        <Group gap="xs">
          <Tooltip label="Одобрить с уровнем доступа">
            <Button
              size="sm"
              variant="light"
              color="green"
              leftSection={<IconCheck size={16} />}
              onClick={() => onApprove(request.id)}
            >
              Одобрить
            </Button>
          </Tooltip>
          <Tooltip label="Отклонить запрос">
            <Button
              size="sm"
              variant="light"
              color="red"
              leftSection={<IconX size={16} />}
              onClick={() => onReject(request.id)}
            >
              Отклонить
            </Button>
          </Tooltip>
        </Group>
      </Group>
    </Card>
  );
});

AccessRequestCard.displayName = 'AccessRequestCard';