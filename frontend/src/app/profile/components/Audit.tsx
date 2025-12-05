import { useState, useEffect } from 'react';
import {
  Card,
  Title,
  Text,
  Group,
  Stack,
  Table,
  TextInput,
  Select,
  Badge,
  Paper,
  Box,
  LoadingOverlay,
  Pagination,
  ActionIcon,
  Tooltip,
  Modal,
  Code,
  ScrollArea
} from '@mantine/core';
import {
  IconSearch,
  IconFilter,
  IconEye,
  IconRefresh,
  IconShield
} from '@tabler/icons-react';
import useAuthFetch from '../../../hooks/useAuthFetch';
import { API } from '../../../config/constants';
import { useDisclosure } from '@mantine/hooks';

interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  userRole: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: any;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: string;
}

interface AuditData {
  logs: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats: {
    actions: Array<{ action: string; count: number }>;
    entities: Array<{ entityType: string; count: number }>;
  };
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  LOGIN: 'cyan',
  LOGOUT: 'gray',
  READ: 'yellow',
  EXPORT: 'orange'
};

export default function Audit() {
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [entityFilter, setEntityFilter] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [detailsOpened, { open: openDetails, close: closeDetails }] = useDisclosure(false);
  const authFetch = useAuthFetch();

  useEffect(() => {
    fetchAuditLogs();
  }, [page, search, actionFilter, entityFilter]);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50'
      });
      if (search) params.append('search', search);
      if (actionFilter) params.append('action', actionFilter);
      if (entityFilter) params.append('entityType', entityFilter);

      const response = await authFetch(`${API}/admin/audit?${params.toString()}`);
      if (response && response.ok) {
        const auditData = await response.json();
        setData(auditData);
      }
    } catch (error) {
      console.error('Ошибка при загрузке логов аудита:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (log: AuditLog) => {
    setSelectedLog(log);
    openDetails();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActionColor = (action: string) => {
    return ACTION_COLORS[action] || 'gray';
  };

  return (
    <Stack gap="lg">
      {/* Заголовок и фильтры */}
      <Group justify="space-between" align="center">
        <Title order={2}>Аудит и безопасность</Title>
        <Group>
          <ActionIcon variant="light" onClick={fetchAuditLogs} loading={loading}>
            <IconRefresh size={18} />
          </ActionIcon>
        </Group>
      </Group>

      {/* Фильтры */}
      <Card shadow="sm" padding="md" radius="md" withBorder>
        <Group gap="md">
          <TextInput
            placeholder="Поиск по email, действию, типу..."
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
            style={{ flex: 1 }}
          />
          <Select
            placeholder="Действие"
            leftSection={<IconFilter size={16} />}
            value={actionFilter}
            onChange={setActionFilter}
            data={data?.stats.actions.map((a) => ({ value: a.action, label: `${a.action} (${a.count})` })) || []}
            clearable
            style={{ width: 200 }}
          />
          <Select
            placeholder="Тип сущности"
            leftSection={<IconShield size={16} />}
            value={entityFilter}
            onChange={setEntityFilter}
            data={data?.stats.entities.map((e) => ({ value: e.entityType, label: `${e.entityType} (${e.count})` })) || []}
            clearable
            style={{ width: 200 }}
          />
        </Group>
      </Card>

      {/* Статистика */}
      {data && (
        <Group gap="md">
          <Card shadow="sm" padding="md" radius="md" withBorder>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Всего действий
            </Text>
            <Text fw={700} size="xl">
              {data.pagination.total}
            </Text>
          </Card>
          {data.stats.actions.slice(0, 5).map((stat) => (
            <Card key={stat.action} shadow="sm" padding="md" radius="md" withBorder>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                {stat.action}
              </Text>
              <Text fw={700} size="xl">
                {stat.count}
              </Text>
            </Card>
          ))}
        </Group>
      )}

      {/* Таблица логов */}
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Box pos="relative">
          <LoadingOverlay visible={loading} />
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Время</Table.Th>
                <Table.Th>Пользователь</Table.Th>
                <Table.Th>Действие</Table.Th>
                <Table.Th>Тип сущности</Table.Th>
                <Table.Th>ID сущности</Table.Th>
                <Table.Th>IP адрес</Table.Th>
                <Table.Th>Действия</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data?.logs.map((log) => (
                <Table.Tr key={log.id}>
                  <Table.Td>
                    <Text size="sm">{formatDate(log.timestamp)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={2}>
                      <Text size="sm" fw={500}>
                        {log.userEmail}
                      </Text>
                      <Badge size="xs" variant="light">
                        {log.userRole}
                      </Badge>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={getActionColor(log.action)}>{log.action}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{log.entityType || '-'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {log.entityId ? log.entityId.substring(0, 8) + '...' : '-'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {log.ipAddress || '-'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label="Просмотр деталей">
                      <ActionIcon variant="light" onClick={() => handleViewDetails(log)}>
                        <IconEye size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          {data && data.logs.length === 0 && (
            <Paper p="xl" ta="center">
              <Text c="dimmed">Логи не найдены</Text>
            </Paper>
          )}
        </Box>

        {/* Пагинация */}
        {data && data.pagination.totalPages > 1 && (
          <Group justify="center" mt="md">
            <Pagination
              value={page}
              onChange={setPage}
              total={data.pagination.totalPages}
            />
            <Text size="sm" c="dimmed">
              Показано {(page - 1) * data.pagination.limit + 1}–
              {Math.min(page * data.pagination.limit, data.pagination.total)} из {data.pagination.total}
            </Text>
          </Group>
        )}
      </Card>

      {/* Модальное окно с деталями */}
      <Modal
        opened={detailsOpened}
        onClose={closeDetails}
        title="Детали действия"
        size="lg"
      >
        {selectedLog && (
          <Stack gap="md">
            <Group>
              <Text fw={500}>Пользователь:</Text>
              <Text>{selectedLog.userEmail}</Text>
              <Badge>{selectedLog.userRole}</Badge>
            </Group>
            <Group>
              <Text fw={500}>Действие:</Text>
              <Badge color={getActionColor(selectedLog.action)}>{selectedLog.action}</Badge>
            </Group>
            {selectedLog.entityType && (
              <Group>
                <Text fw={500}>Тип сущности:</Text>
                <Text>{selectedLog.entityType}</Text>
              </Group>
            )}
            {selectedLog.entityId && (
              <Group>
                <Text fw={500}>ID сущности:</Text>
                <Code>{selectedLog.entityId}</Code>
              </Group>
            )}
            {selectedLog.ipAddress && (
              <Group>
                <Text fw={500}>IP адрес:</Text>
                <Code>{selectedLog.ipAddress}</Code>
              </Group>
            )}
            {selectedLog.userAgent && (
              <Group>
                <Text fw={500}>User Agent:</Text>
                <Text size="sm" c="dimmed">
                  {selectedLog.userAgent}
                </Text>
              </Group>
            )}
            <Group>
              <Text fw={500}>Время:</Text>
              <Text>{formatDate(selectedLog.timestamp)}</Text>
            </Group>
            {selectedLog.details && (
              <div>
                <Text fw={500} mb="xs">
                  Дополнительные детали:
                </Text>
                <ScrollArea h={200}>
                  <Code block>{JSON.stringify(selectedLog.details, null, 2)}</Code>
                </ScrollArea>
              </div>
            )}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

