import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Title,
  Text,
  Group,
  Badge,
  Stack,
  Pagination,
  Select,
  TextInput,
  Button,
  Grid,
  Card,
  Alert,
  Tabs,
  Table,
  ScrollArea,
  ActionIcon,
  Tooltip,
  Modal,
  Textarea,
  Divider,
  Box
} from '@mantine/core';
import { 
  IconBug, 
  IconFilter, 
  IconRefresh,
  IconEye,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconInfoCircle,
  IconExclamationMark
} from '@tabler/icons-react';
import { CardListSkeleton, StatsSkeleton } from '../../../components/LoadingStates';
import useAuthFetch from '../../../hooks/useAuthFetch';

interface BugReport {
  id: string;
  createdAt: string;
  deviceId: string;
  userId?: string;
  userEmail?: string;
  branchType?: string;
  branchName?: string;
  errorType: string;
  errorMessage: string;
  stackTrace?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  appVersion: string;
  androidVersion?: string;
  deviceModel?: string;
  deviceManufacturer?: string;
  memoryUsage?: number;
  storageFree?: number;
  networkType?: string;
  isOnline?: boolean;
  userAction?: string;
  sessionId?: string;
  timestamp: string;
  additionalData?: {
    macAddress?: string;
    macMethod?: string;
    isRealMac?: string;
    isPseudoMac?: string;
    apiLevel?: string;
    device?: string;
    product?: string;
    buildVersion?: string;
    kernelVersion?: string;
    cpuArchitecture?: string;
    totalMemory?: number;
    availableMemory?: number;
    extra?: Record<string, unknown>;
  };
  isAutoReport: boolean;
  isResolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
}

interface BugReportStatistics {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsBySeverity: Record<string, number>;
  errorsByDay: Record<string, number>;
  mostCommonErrors: Array<{ message: string; count: number }>;
  averageResolutionTime: number;
  resolutionRate: number;
}

const BugReports: React.FC = () => {
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [statistics, setStatistics] = useState<BugReportStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [resolveModalOpened, setResolveModalOpened] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    severity: '',
    errorType: '',
    resolved: '',
    deviceId: '',
    branchType: '',
    userEmail: ''
  });

  const authFetch = useAuthFetch();

  // Загрузка отчетов
  const fetchBugReports = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        ...Object.fromEntries(Object.entries(filters).filter(([_, value]) => value))
      });

      const response = await authFetch(`/hub-api/bug-reports?${params}`);
      if (response && response.ok) {
        const data = await response.json();
        setBugReports(data.data);
        setTotalPages(data.pagination?.pages || 1);
      }
    } catch (error) {
      console.error('Error fetching bug reports:', error);
    } finally {
      setLoading(false);
    }
  };

  // Загрузка статистики
  const fetchStatistics = async () => {
    try {
      const response = await authFetch('/hub-api/bug-reports/statistics?days=7');
      if (response && response.ok) {
        const data = await response.json();
        setStatistics(data.data);
      }
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  };

  useEffect(() => {
    fetchBugReports();
    fetchStatistics();
  }, [currentPage, filters]);

  // Получение цвета для серьезности
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'red';
      case 'HIGH': return 'orange';
      case 'MEDIUM': return 'yellow';
      case 'LOW': return 'green';
      default: return 'gray';
    }
  };

  // Получение иконки для серьезности
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return <IconX size={16} />;
      case 'HIGH': return <IconAlertTriangle size={16} />;
      case 'MEDIUM': return <IconExclamationMark size={16} />;
      case 'LOW': return <IconInfoCircle size={16} />;
      default: return <IconInfoCircle size={16} />;
    }
  };

  // Решение отчета
  const resolveReport = async () => {
    if (!selectedReport) return;

    try {
      const response = await authFetch('/hub-api/bug-reports/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: selectedReport.id,
          resolvedBy: 'admin', // TODO: получить из контекста пользователя
          resolutionNotes: resolutionNotes
        })
      });

      if (response && response.ok) {
        setResolveModalOpened(false);
        setResolutionNotes('');
        fetchBugReports();
        fetchStatistics();
      }
    } catch (error) {
      console.error('Error resolving report:', error);
    }
  };

  // Форматирование даты
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ru-RU');
  };

  return (
    <Box style={{ width: '100%', padding: 'var(--mantine-spacing-md)' }}>
      <Stack gap="lg">
        <Title order={1} mb="lg" c="var(--theme-text-primary)">
          <Group>
            <IconBug size={32} />
            Отчеты об ошибках DNS Radio
          </Group>
        </Title>

      <Tabs defaultValue="reports">
        <Tabs.List>
          <Tabs.Tab value="reports">Отчеты</Tabs.Tab>
          <Tabs.Tab value="statistics">Статистика</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="reports" pt="md">
          {/* Фильтры */}
          <Paper 
            p="md" 
            mb="md"
            withBorder
            style={{
              background: 'var(--theme-bg-elevated)',
              borderColor: 'var(--theme-border-primary)'
            }}
          >
            <Title order={3} mb="md" c="var(--theme-text-primary)">
              <Group>
                <IconFilter size={20} />
                Фильтры
              </Group>
            </Title>
            <Grid>
              <Grid.Col span={2}>
                <Select
                  label="Серьезность"
                  placeholder="Все"
                  value={filters.severity}
                  onChange={(value) => setFilters({ ...filters, severity: value || '' })}
                  data={[
                    { value: '', label: 'Все' },
                    { value: 'CRITICAL', label: 'Критическая' },
                    { value: 'HIGH', label: 'Высокая' },
                    { value: 'MEDIUM', label: 'Средняя' },
                    { value: 'LOW', label: 'Низкая' }
                  ]}
                />
              </Grid.Col>
              <Grid.Col span={2}>
                <Select
                  label="Тип ошибки"
                  placeholder="Все"
                  value={filters.errorType}
                  onChange={(value) => setFilters({ ...filters, errorType: value || '' })}
                  data={[
                    { value: '', label: 'Все' },
                    { value: 'CRASH', label: 'Краш' },
                    { value: 'NETWORK_ERROR', label: 'Сеть' },
                    { value: 'MEDIA_ERROR', label: 'Медиа' },
                    { value: 'PERFORMANCE_ISSUE', label: 'Производительность' },
                    { value: 'AUTHENTICATION_ERROR', label: 'Аутентификация' },
                    { value: 'DOWNLOAD_ERROR', label: 'Загрузка' },
                    { value: 'PERMISSION_ERROR', label: 'Разрешения' },
                    { value: 'STORAGE_ERROR', label: 'Хранилище' },
                    { value: 'SOCKET_ERROR', label: 'Socket.IO' },
                    { value: 'UNKNOWN_ERROR', label: 'Неизвестная' }
                  ]}
                />
              </Grid.Col>
              <Grid.Col span={2}>
                <Select
                  label="Статус"
                  placeholder="Все"
                  value={filters.resolved}
                  onChange={(value) => setFilters({ ...filters, resolved: value || '' })}
                  data={[
                    { value: '', label: 'Все' },
                    { value: 'false', label: 'Не решено' },
                    { value: 'true', label: 'Решено' }
                  ]}
                />
              </Grid.Col>
              <Grid.Col span={2}>
                <TextInput
                  label="Device ID"
                  placeholder="Поиск по устройству"
                  value={filters.deviceId}
                  onChange={(e) => setFilters({ ...filters, deviceId: e.target.value })}
                />
              </Grid.Col>
              <Grid.Col span={2}>
                <TextInput
                  label="Email пользователя"
                  placeholder="Поиск по email"
                  value={filters.userEmail}
                  onChange={(e) => setFilters({ ...filters, userEmail: e.target.value })}
                />
              </Grid.Col>
              <Grid.Col span={2}>
                <Group mt="xl">
                  <Button onClick={fetchBugReports} leftSection={<IconRefresh size={16} />}>
                    Обновить
                  </Button>
                </Group>
              </Grid.Col>
            </Grid>
          </Paper>

          {/* Список отчетов */}
          <Paper p="md">
            {loading ? (
              <CardListSkeleton count={5} />
            ) : (
              <ScrollArea>
                <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Время</Table.Th>
                    <Table.Th>Устройство</Table.Th>
                    <Table.Th>Тип ошибки</Table.Th>
                    <Table.Th>Сообщение</Table.Th>
                    <Table.Th>Серьезность</Table.Th>
                    <Table.Th>Статус</Table.Th>
                    <Table.Th>Действия</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {bugReports.map((report) => (
                    <Table.Tr key={report.id}>
                      <Table.Td>
                        <Text size="sm">{formatDate(report.timestamp)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text size="sm" fw={500}>{report.deviceModel || 'Unknown'}</Text>
                          <Text size="xs" c="dimmed">{report.deviceId}</Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" size="sm">
                          {report.errorType}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" lineClamp={2}>
                          {report.errorMessage}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge 
                          color={getSeverityColor(report.severity)}
                          leftSection={getSeverityIcon(report.severity)}
                        >
                          {report.severity}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={report.isResolved ? 'green' : 'red'}>
                          {report.isResolved ? 'Решено' : 'Не решено'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Tooltip label="Просмотр">
                            <ActionIcon
                              variant="light"
                              onClick={() => {
                                setSelectedReport(report);
                                setModalOpened(true);
                              }}
                            >
                              <IconEye size={16} />
                            </ActionIcon>
                          </Tooltip>
                          {!report.isResolved && (
                            <Tooltip label="Решить">
                              <ActionIcon
                                variant="light"
                                color="green"
                                onClick={() => {
                                  setSelectedReport(report);
                                  setResolveModalOpened(true);
                                }}
                              >
                                <IconCheck size={16} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              </ScrollArea>
            )}

            {bugReports.length === 0 && !loading && (
              <Alert icon={<IconInfoCircle size={16} />} title="Нет данных">
                Отчеты об ошибках не найдены
              </Alert>
            )}

            <Group justify="center" mt="md">
              <Pagination
                value={currentPage}
                onChange={setCurrentPage}
                total={totalPages}
                size="sm"
              />
            </Group>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="statistics" pt="md">
          {loading ? (
            <StatsSkeleton />
          ) : statistics ? (
            <Grid>
              <Grid.Col span={6}>
                <Card>
                  <Title order={3} mb="md">Общая статистика</Title>
                  <Stack>
                    <Group justify="space-between">
                      <Text>Всего ошибок:</Text>
                      <Badge size="lg">{statistics.totalErrors}</Badge>
                    </Group>
                    <Group justify="space-between">
                      <Text>Процент решений:</Text>
                      <Badge size="lg" color="green">
                        {Math.round(statistics.resolutionRate * 100)}%
                      </Badge>
                    </Group>
                    <Group justify="space-between">
                      <Text>Среднее время решения:</Text>
                      <Badge size="lg" color="blue">
                        {statistics.averageResolutionTime.toFixed(1)}ч
                      </Badge>
                    </Group>
                  </Stack>
                </Card>
              </Grid.Col>

              <Grid.Col span={6}>
                <Card>
                  <Title order={3} mb="md">По серьезности</Title>
                  <Stack>
                    {Object.entries(statistics.errorsBySeverity).map(([severity, count]) => (
                      <Group key={severity} justify="space-between">
                        <Badge color={getSeverityColor(severity)} leftSection={getSeverityIcon(severity)}>
                          {severity}
                        </Badge>
                        <Text fw={500}>{count}</Text>
                      </Group>
                    ))}
                  </Stack>
                </Card>
              </Grid.Col>

              <Grid.Col span={12}>
                <Card>
                  <Title order={3} mb="md">Самые частые ошибки</Title>
                  <Stack>
                    {statistics.mostCommonErrors.slice(0, 10).map((error, index) => (
                      <Group key={index} justify="space-between">
                        <Text size="sm" lineClamp={1} style={{ flex: 1 }}>
                          {error.message}
                        </Text>
                        <Badge>{error.count}</Badge>
                      </Group>
                    ))}
                  </Stack>
                </Card>
              </Grid.Col>
            </Grid>
          ) : (
            <Alert icon={<IconInfoCircle size={16} />} title="Нет данных">
              Статистика недоступна
            </Alert>
          )}
        </Tabs.Panel>
      </Tabs>

      {/* Модальное окно просмотра отчета */}
      <Modal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        title="Детали отчета об ошибке"
        size="lg"
      >
        {selectedReport && (
          <Stack>
            <Group>
              <Badge color={getSeverityColor(selectedReport.severity)} leftSection={getSeverityIcon(selectedReport.severity)}>
                {selectedReport.severity}
              </Badge>
              <Badge color={selectedReport.isResolved ? 'green' : 'red'}>
                {selectedReport.isResolved ? 'Решено' : 'Не решено'}
              </Badge>
            </Group>

            <Divider />

            <Stack gap="sm">
              <Group>
                <Text fw={500}>Время ошибки:</Text>
                <Text>{formatDate(selectedReport.timestamp)}</Text>
              </Group>
              <Group>
                <Text fw={500}>Тип ошибки:</Text>
                <Badge>{selectedReport.errorType}</Badge>
              </Group>
              <Group>
                <Text fw={500}>Сообщение:</Text>
                <Text>{selectedReport.errorMessage}</Text>
              </Group>
              <Group>
                <Text fw={500}>Устройство:</Text>
                <Text>{selectedReport.deviceModel} ({selectedReport.deviceId})</Text>
              </Group>
              <Group>
                <Text fw={500}>Версия приложения:</Text>
                <Text>{selectedReport.appVersion}</Text>
              </Group>
              {selectedReport.userEmail && (
                <Group>
                  <Text fw={500}>Email пользователя:</Text>
                  <Text>{selectedReport.userEmail}</Text>
                </Group>
              )}
              {selectedReport.branchName && (
                <Group>
                  <Text fw={500}>Филиал:</Text>
                  <Text>{selectedReport.branchName}</Text>
                </Group>
              )}
            </Stack>

            {selectedReport.stackTrace && (
              <>
                <Divider />
                <Stack gap="sm">
                  <Text fw={500}>Стек вызовов:</Text>
                  <Textarea
                    value={selectedReport.stackTrace}
                    readOnly
                    rows={10}
                    style={{ fontFamily: 'monospace', fontSize: '12px' }}
                  />
                </Stack>
              </>
            )}

            {selectedReport.additionalData && (
              <>
                <Divider />
                <Stack gap="sm">
                  <Text fw={500}>Дополнительные данные:</Text>
                  <Textarea
                    value={JSON.stringify(selectedReport.additionalData, null, 2)}
                    readOnly
                    rows={6}
                    style={{ fontFamily: 'monospace', fontSize: '12px' }}
                  />
                </Stack>
              </>
            )}

            {selectedReport.isResolved && selectedReport.resolutionNotes && (
              <>
                <Divider />
                <Stack gap="sm">
                  <Text fw={500}>Заметки о решении:</Text>
                  <Text>{selectedReport.resolutionNotes}</Text>
                  <Text size="sm" c="dimmed">
                    Решено: {selectedReport.resolvedBy} в {formatDate(selectedReport.resolvedAt!)}
                  </Text>
                </Stack>
              </>
            )}
          </Stack>
        )}
      </Modal>

      {/* Модальное окно решения отчета */}
      <Modal
        opened={resolveModalOpened}
        onClose={() => setResolveModalOpened(false)}
        title="Решение отчета об ошибке"
      >
        <Stack>
          <Text>Отметить отчет как решенный?</Text>
          <Textarea
            label="Заметки о решении"
            placeholder="Опишите, как была решена проблема..."
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            rows={4}
          />
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setResolveModalOpened(false)}>
              Отмена
            </Button>
            <Button onClick={resolveReport}>
              Решить
            </Button>
          </Group>
        </Stack>
      </Modal>
      </Stack>
    </Box>
  );
};

export default BugReports;
