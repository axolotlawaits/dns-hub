import { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Paper,
  Title,
  Grid,
  Group,
  Text,
  Badge,
  Stack,
  Card,
  Progress,
  Alert,
  Box,
  Tabs,
  Button,
  Table,
  Select,
  ActionIcon,
} from '@mantine/core';
import { IconCpu, IconServer, IconDatabase, IconActivity, IconAlertCircle, IconNetwork, IconInfoCircle, IconClock, IconPlayerPlay, IconPlayerStop, IconTemperature, IconDownload, IconUpload, IconShield, IconUserCheck, IconGauge, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import useAuthFetch from '../../../hooks/useAuthFetch';
import { API } from '../../../config/constants';
import { useSocketIO } from '../../../hooks/useSocketIO';

interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  user?: string;
  command?: string;
}

interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
    model?: string;
    speed?: number;
    details?: Array<{ model: string; speed: number }>;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  swap?: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  disks?: Array<{
    device: string;
    mountPoint: string;
    total: number;
    used: number;
    free: number;
    percentage: number;
    filesystem?: string;
    type?: string;
  }>;
  uptime: {
    system: number;
    process: number;
  };
  processes: {
    total: number;
    running: number;
  };
  topProcesses?: {
    cpu: ProcessInfo[];
    memory: ProcessInfo[];
  };
  network?: Array<{
    name: string;
    address: string;
    netmask: string;
    family: string;
    mac: string;
  }>;
  networkActivity?: {
    interfaces: Array<{
      name: string;
      rxBytes: number;
      txBytes: number;
      rxPackets: number;
      txPackets: number;
      rxErrors: number;
      txErrors: number;
    }>;
  };
  temperature?: {
    cpu?: number;
    gpu?: number;
    disks?: Array<{ device: string; temperature: number }>;
  };
  system?: {
    platform: string;
    arch: string;
    type: string;
    release: string;
    hostname: string;
    nodeVersion: {
      version: string;
      major: number;
    };
  };
  gpu?: {
    model: string;
    vendor?: string;
    memoryTotal?: number;
    driverVersion?: string;
  } | null;
  extendedInfo?: {
    environment?: string;
    pid?: number;
    uptime?: number;
    memoryUsage?: any;
    versions?: any;
    uptimeString?: string;
    kernel?: string;
    distribution?: any;
    windowsInfo?: any;
  };
  performance?: {
    api?: {
      totalRequests?: number;
      averageResponseTime?: number;
      requestsPerSecond?: number;
    };
    database?: {
      totalQueries?: number;
      averageQueryTime?: number;
      slowQueries?: number;
      connectionPool?: {
        active?: number;
        idle?: number;
        total?: number;
      };
    };
    memory?: {
      heapUsed?: number;
      heapTotal?: number;
      external?: number;
      rss?: number;
      heapUsedMB?: number;
      heapTotalMB?: number;
      rssMB?: number;
    };
  };
  security?: {
    activeSessions?: number;
    recentLogins?: Array<{
      userId: string;
      email: string;
      role: string;
      lastActivity: string;
    }>;
    suspiciousActivity?: any[];
  };
}

interface MetricHistory {
  timestamp: number;
  cpu: number;
  memory: number;
  disk: number;
  network?: number;
  gpu?: number;
}

export default function SystemLoad() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MetricHistory[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>('cpu');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [timeRange, setTimeRange] = useState<string>('5m'); // 1m, 5m, 15m, 1h
  const [expandedDisks, setExpandedDisks] = useState<Set<string>>(new Set());
  const maxHistoryLength = 30; // Храним последние 30 точек данных (примерно 5 минут при обновлении каждые 10 секунд)

  const authFetch = useAuthFetch();
  const { isConnected, systemMetrics: wsMetrics } = useSocketIO();

  const fetchMetrics = useCallback(async (isFirstLoad: boolean = false) => {
    if (!isMonitoring) return; // Не загружаем если мониторинг не запущен
    
    try {
      setError(null);
      const startTime = performance.now();
      
      // При первой загрузке используем параметр для быстрого ответа
      const url = isFirstLoad 
        ? `${API}/admin/system/metrics?fast=true`
        : `${API}/admin/system/metrics`;
      
      const response = await authFetch(url);
      
      if (response && response.ok) {
        const data = await response.json();
        // API возвращает { success: true, data: {...} }
        const newMetrics = data.data || data;
        setMetrics(newMetrics);
        
        console.log('📊 [SystemLoad] Получены метрики:', {
          cpu: newMetrics.cpu?.usage,
          memory: newMetrics.memory?.percentage,
          disk: newMetrics.disk?.percentage,
        });

        // Добавляем данные в историю для графиков
        if (newMetrics && isMonitoring) {
          // Используем общий процент использования дисков для истории
          const diskPercentage = newMetrics.disk?.percentage ?? 
            (newMetrics.disks && newMetrics.disks.length > 0 
              ? newMetrics.disks.reduce((sum: number, d: any) => sum + d.percentage, 0) / newMetrics.disks.length 
              : 0);
          
          const historyPoint: MetricHistory = {
            timestamp: Date.now(),
            cpu: newMetrics.cpu?.usage ?? 0,
            memory: newMetrics.memory?.percentage ?? 0,
            disk: diskPercentage,
            network: 0,
            gpu: 0, // GPU usage не доступен из текущих метрик
          };

          setHistory(prev => {
            const updated = [...prev, historyPoint];
            return updated.slice(-maxHistoryLength);
          });
        }
        
        setLoading(false);
        
        const loadTime = performance.now() - startTime;
        if (loadTime > 2000) {
          console.warn(`⚠️ Метрики загружаются медленно: ${loadTime.toFixed(0)}ms`);
        }
      } else {
        setError('Не удалось загрузить метрики системы');
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching system metrics:', error);
      setError('Ошибка загрузки метрик системы');
      setLoading(false);
    }
  }, [isMonitoring, authFetch]);

  // Используем метрики из WebSocket, если доступны
  useEffect(() => {
    if (wsMetrics && isMonitoring) {
      console.log('📊 [SystemLoad] Received metrics via WebSocket');
      const newMetrics = wsMetrics;
      setMetrics(newMetrics);
      
      // Добавляем данные в историю для графиков
      const diskPercentage = newMetrics.disk?.percentage ?? 
        (newMetrics.disks && newMetrics.disks.length > 0 
          ? newMetrics.disks.reduce((sum: number, d: any) => sum + d.percentage, 0) / newMetrics.disks.length 
          : 0);
      
      const historyPoint: MetricHistory = {
        timestamp: wsMetrics.timestamp || Date.now(),
        cpu: newMetrics.cpu?.usage ?? 0,
        memory: newMetrics.memory?.percentage ?? 0,
        disk: diskPercentage,
        network: 0,
        gpu: 0,
      };

      setHistory(prev => {
        const updated = [...prev, historyPoint];
        // Ограничиваем историю в зависимости от выбранного диапазона
        const maxPoints = timeRange === '1m' ? 6 : timeRange === '5m' ? 30 : timeRange === '15m' ? 90 : 360;
        return updated.slice(-maxPoints);
      });
    }
  }, [wsMetrics, isMonitoring, timeRange]);

  // Загружаем метрики при старте мониторинга (fallback на HTTP если WebSocket недоступен)
  useEffect(() => {
    if (isMonitoring) {
      if (!isConnected) {
        // Первая загрузка - только быстрые данные
        fetchMetrics(true);
        // Последующие обновления - полные данные каждые 10 секунд
        const interval = setInterval(() => fetchMetrics(false), 10000);
        return () => clearInterval(interval);
      }
    }
  }, [isMonitoring, isConnected, fetchMetrics]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}д ${hours}ч ${minutes}м`;
  };

  const getPlatformName = (platform: string) => {
    const platforms: Record<string, string> = {
      'win32': 'Windows',
      'linux': 'Linux',
      'darwin': 'macOS',
      'freebsd': 'FreeBSD',
      'openbsd': 'OpenBSD',
      'sunos': 'SunOS',
    };
    return platforms[platform] || platform;
  };

  const getProgressColor = (percentage: number) => {
    if (percentage < 50) return 'green';
    if (percentage < 80) return 'yellow';
    return 'red';
  };

  if (loading && !metrics) {
    return (
      <Container size="xl">
        <Text c="dimmed">Загрузка метрик системы...</Text>
      </Container>
    );
  }

  const handleStartMonitoring = async () => {
    setIsMonitoring(true);
    setLoading(true);
    setError(null);
    // Сразу запускаем загрузку метрик
    await fetchMetrics(true);
  };

  const handleStopMonitoring = () => {
    setIsMonitoring(false);
    setHistory([]);
    setMetrics(null);
  };

  return (
    <Container size="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Нагрузка на систему</Title>
          <Group gap="md">
            {!isMonitoring ? (
              <Button 
                leftSection={<IconPlayerPlay size={18} />}
                onClick={handleStartMonitoring}
                color="green"
              >
                Запустить мониторинг
              </Button>
            ) : (
              <>
                <Button 
                  leftSection={<IconPlayerStop size={18} />}
                  onClick={handleStopMonitoring}
                  color="red"
                  variant="light"
                >
                  Остановить мониторинг
                </Button>
                {metrics?.uptime && (
                  <Group gap="md">
                    <Badge variant="light" size="lg" leftSection={<IconClock size={14} />}>
                      Система: {formatUptime(metrics.uptime.system)}
                    </Badge>
                    <Badge variant="light" size="lg" leftSection={<IconClock size={14} />}>
                      Процесс: {formatUptime(metrics.uptime.process)}
                    </Badge>
                  </Group>
                )}
              </>
            )}
          </Group>
        </Group>

        {error && (
          <Alert icon={<IconAlertCircle size={18} />} color="red" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        {!isMonitoring ? (
          <Paper p="xl" radius="md" withBorder>
            <Stack align="center" gap="md">
              <IconActivity size={64} stroke={1.5} style={{ opacity: 0.5 }} />
              <Text size="lg" fw={500}>Мониторинг не запущен</Text>
              <Text c="dimmed" ta="center">
                Нажмите кнопку "Запустить мониторинг" для начала сбора метрик системы
              </Text>
              <Button 
                leftSection={<IconPlayerPlay size={18} />}
                onClick={handleStartMonitoring}
                color="green"
                size="lg"
              >
                Запустить мониторинг
              </Button>
            </Stack>
          </Paper>
        ) : metrics ? (
          <>
            {/* Графики производительности */}
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Group justify="space-between" mb="md">
                <Title order={4}>Графики производительности</Title>
                <Group gap="xs">
                  <Select
                    value={timeRange}
                    onChange={(value) => value && setTimeRange(value)}
                    data={[
                      { value: '1m', label: '1 минута' },
                      { value: '5m', label: '5 минут' },
                      { value: '15m', label: '15 минут' },
                      { value: '1h', label: '1 час' },
                    ]}
                    size="xs"
                    style={{ width: 120 }}
                  />
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => {
                      // Экспорт данных в JSON
                      const dataStr = JSON.stringify(history, null, 2);
                      const dataBlob = new Blob([dataStr], { type: 'application/json' });
                      const url = URL.createObjectURL(dataBlob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `system-metrics-${new Date().toISOString()}.json`;
                      link.click();
                      URL.revokeObjectURL(url);
                    }}
                    disabled={history.length === 0}
                  >
                    Экспорт
                  </Button>
                </Group>
              </Group>
              <Tabs value={activeTab} onChange={setActiveTab}>
                <Tabs.List>
                  <Tabs.Tab value="cpu" leftSection={<IconCpu size={18} />}>
                    CPU
                  </Tabs.Tab>
                  <Tabs.Tab value="memory" leftSection={<IconServer size={18} />}>
                    Память
                  </Tabs.Tab>
                  <Tabs.Tab value="disk" leftSection={<IconDatabase size={18} />}>
                    Диск
                  </Tabs.Tab>
                  {metrics.gpu && metrics.gpu.model && (
                    <Tabs.Tab value="gpu" leftSection={<IconActivity size={18} />}>
                      GPU
                    </Tabs.Tab>
                  )}
                </Tabs.List>

                {activeTab === 'cpu' && (
                <Tabs.Panel value="cpu" pt="md">
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Использование CPU (%)</Text>
                      <Badge color={getProgressColor(metrics.cpu.usage)}>
                        {metrics.cpu.usage.toFixed(1)}%
                      </Badge>
                    </Group>
                    {history.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={history}>
                          <defs>
                            <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" />
                          <XAxis 
                            dataKey="timestamp" 
                            tickFormatter={(value) => {
                              const date = new Date(value);
                              return `${date.getMinutes()}:${date.getSeconds().toString().padStart(2, '0')}`;
                            }}
                            stroke="var(--theme-text-secondary)"
                          />
                          <YAxis 
                            domain={[0, 100]}
                            stroke="var(--theme-text-secondary)"
                          />
                        <RechartsTooltip 
                          contentStyle={{
                            backgroundColor: 'var(--theme-bg-elevated)',
                            border: '1px solid var(--theme-border)',
                            color: 'var(--theme-text-primary)'
                          }}
                          labelFormatter={(value: any) => {
                            const date = new Date(value);
                            return date.toLocaleTimeString();
                          }}
                          formatter={(value: any) => [`${Number(value).toFixed(1)}%`, 'CPU']}
                        />
                          <Area 
                            type="monotone" 
                            dataKey="cpu" 
                            stroke="#8884d8" 
                            fillOpacity={1} 
                            fill="url(#colorCpu)" 
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <Text c="dimmed" ta="center" py="xl">
                        Ожидание данных... График появится после первого обновления
                      </Text>
                    )}
                  </Stack>
                </Tabs.Panel>
                )}

                {activeTab === 'memory' && (
                <Tabs.Panel value="memory" pt="md">
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Использование памяти (%)</Text>
                      <Badge color={getProgressColor(metrics.memory.percentage)}>
                        {metrics.memory.percentage.toFixed(1)}%
                      </Badge>
                    </Group>
                    {history.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={history}>
                        <defs>
                          <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#82ca9d" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" />
                        <XAxis 
                          dataKey="timestamp" 
                          tickFormatter={(value: any) => {
                            const date = new Date(value);
                            const now = Date.now();
                            const diff = now - value;
                            if (diff < 60000) {
                              return `${date.getSeconds()}s`;
                            } else if (diff < 3600000) {
                              return `${date.getMinutes()}:${date.getSeconds().toString().padStart(2, '0')}`;
                            } else {
                              return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
                            }
                          }}
                          stroke="var(--theme-text-secondary)"
                        />
                        <YAxis 
                          domain={[0, 100]}
                          stroke="var(--theme-text-secondary)"
                        />
                        <RechartsTooltip 
                          contentStyle={{
                            backgroundColor: 'var(--theme-bg-elevated)',
                            border: '1px solid var(--theme-border)',
                            color: 'var(--theme-text-primary)'
                          }}
                          labelFormatter={(value: any) => {
                            const date = new Date(value);
                            return date.toLocaleTimeString();
                          }}
                          formatter={(value: any) => [`${Number(value).toFixed(1)}%`, 'Память']}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="memory" 
                          stroke="#82ca9d" 
                          fillOpacity={1} 
                          fill="url(#colorMemory)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                    ) : (
                      <Text c="dimmed" ta="center" py="xl">
                        Ожидание данных... График появится после первого обновления
                      </Text>
                    )}
                  </Stack>
                </Tabs.Panel>
                )}

                {activeTab === 'disk' && (
                <Tabs.Panel value="disk" pt="md">
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Использование диска (%)</Text>
                      <Badge color={getProgressColor(metrics.disk.percentage)}>
                        {metrics.disk.percentage.toFixed(1)}%
                      </Badge>
                    </Group>
                    {history.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={history}>
                        <defs>
                          <linearGradient id="colorDisk" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ffc658" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#ffc658" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" />
                        <XAxis 
                          dataKey="timestamp" 
                          tickFormatter={(value: any) => {
                            const date = new Date(value);
                            const now = Date.now();
                            const diff = now - value;
                            if (diff < 60000) {
                              return `${date.getSeconds()}s`;
                            } else if (diff < 3600000) {
                              return `${date.getMinutes()}:${date.getSeconds().toString().padStart(2, '0')}`;
                            } else {
                              return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
                            }
                          }}
                          stroke="var(--theme-text-secondary)"
                        />
                        <YAxis 
                          domain={[0, 100]}
                          stroke="var(--theme-text-secondary)"
                        />
                        <RechartsTooltip 
                          contentStyle={{
                            backgroundColor: 'var(--theme-bg-elevated)',
                            border: '1px solid var(--theme-border)',
                            color: 'var(--theme-text-primary)'
                          }}
                          labelFormatter={(value: any) => {
                            const date = new Date(value);
                            return date.toLocaleTimeString();
                          }}
                          formatter={(value: any) => [`${Number(value).toFixed(1)}%`, 'Диск']}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="disk" 
                          stroke="#ffc658" 
                          fillOpacity={1} 
                          fill="url(#colorDisk)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                    ) : (
                      <Text c="dimmed" ta="center" py="xl">
                        Ожидание данных... График появится после первого обновления
                      </Text>
                    )}
                  </Stack>
                </Tabs.Panel>
                )}

                {activeTab === 'gpu' && metrics.gpu && metrics.gpu.model && (
                  <Tabs.Panel value="gpu" pt="md">
                    <Stack gap="md">
                      <Group justify="space-between">
                        <Text size="sm" c="dimmed">Информация о GPU</Text>
                        <Badge color="blue">
                          {metrics.gpu.model}
                        </Badge>
                      </Group>
                      <Grid>
                        {metrics.gpu.vendor && (
                          <Grid.Col span={6}>
                            <Text size="sm" c="dimmed">Производитель</Text>
                            <Text fw={500}>{metrics.gpu.vendor}</Text>
                          </Grid.Col>
                        )}
                        {metrics.gpu.memoryTotal && (
                          <Grid.Col span={6}>
                            <Text size="sm" c="dimmed">Память</Text>
                            <Text fw={500}>{metrics.gpu.memoryTotal} MB</Text>
                          </Grid.Col>
                        )}
                        {metrics.gpu.driverVersion && (
                          <Grid.Col span={6}>
                            <Text size="sm" c="dimmed">Версия драйвера</Text>
                            <Text fw={500}>{metrics.gpu.driverVersion}</Text>
                          </Grid.Col>
                        )}
                      </Grid>
                      <Alert color="blue" variant="light">
                        <Text size="sm">
                          Использование GPU в реальном времени недоступно. Отображается только информация об устройстве.
                        </Text>
                      </Alert>
                    </Stack>
                  </Tabs.Panel>
                )}
              </Tabs>
            </Card>

            {/* Основные метрики */}
            <Grid gutter="lg" mt="md">
              {/* CPU и GPU в одну строку */}
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Card 
                  shadow="sm" 
                  padding="lg" 
                  radius="md" 
                  withBorder
                  style={{
                    background: 'var(--theme-bg-elevated)',
                    borderColor: 'var(--theme-border-primary)',
                    transition: 'all 0.2s ease',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <Stack gap="md" style={{ flex: 1 }}>
                    <Group justify="space-between" align="flex-start">
                      <Box
                        style={{
                          padding: '12px',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, rgba(136, 132, 216, 0.1), rgba(136, 132, 216, 0.05))',
                        }}
                      >
                        <IconCpu size={28} style={{ color: '#8884d8' }} />
                      </Box>
                      <Badge 
                        color={getProgressColor(metrics.cpu.usage)} 
                        size="lg"
                        variant="light"
                      >
                        {metrics.cpu.usage.toFixed(1)}%
                      </Badge>
                    </Group>
                    <Stack gap="xs" style={{ flex: 1 }}>
                      <Text size="sm" fw={600}>Процессор</Text>
                      <Progress
                        value={metrics.cpu.usage}
                        color={getProgressColor(metrics.cpu.usage)}
                        size="lg"
                        radius="xl"
                      />
                      <Group justify="space-between" mt="xs">
                        <Text size="xs" c="dimmed">Ядер: <Text span fw={500} c="var(--theme-text-primary)">{metrics.cpu.cores}</Text></Text>
                        {metrics.cpu.speed && (
                          <Text size="xs" c="dimmed">
                            {(metrics.cpu.speed / 1000).toFixed(2)} GHz
                          </Text>
                        )}
                      </Group>
                      {metrics.cpu.model && (
                        <Text size="xs" c="dimmed" lineClamp={2} title={metrics.cpu.model} style={{ marginTop: 'auto' }}>
                          {metrics.cpu.model}
                        </Text>
                      )}
                    </Stack>
                  </Stack>
                </Card>
              </Grid.Col>

              {/* GPU (если доступен) */}
              {metrics.gpu && metrics.gpu.model ? (
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <Card 
                    shadow="sm" 
                    padding="lg" 
                    radius="md" 
                    withBorder
                    style={{
                      background: 'var(--theme-bg-elevated)',
                      borderColor: 'var(--theme-border-primary)',
                      transition: 'all 0.2s ease',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <Stack gap="md" style={{ flex: 1 }}>
                      <Group justify="space-between" align="flex-start">
                        <Box
                          style={{
                            padding: '12px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, rgba(255, 99, 132, 0.1), rgba(255, 99, 132, 0.05))',
                          }}
                        >
                          <IconActivity size={28} style={{ color: '#ff6384' }} />
                        </Box>
                        {metrics.gpu.vendor && (
                          <Badge size="sm" variant="light" color="pink">
                            {metrics.gpu.vendor}
                          </Badge>
                        )}
                      </Group>
                      <Stack gap="xs" style={{ flex: 1 }}>
                        <Text size="sm" fw={600}>Видеокарта</Text>
                        <Text size="xs" c="dimmed" lineClamp={2} title={metrics.gpu.model}>
                          {metrics.gpu.model}
                        </Text>
                        {metrics.gpu.memoryTotal && (
                          <Text size="xs" c="dimmed" mt="xs" style={{ marginTop: 'auto' }}>
                            Память: <Text span fw={500} c="var(--theme-text-primary)">{formatBytes(metrics.gpu.memoryTotal * 1024 * 1024)}</Text>
                          </Text>
                        )}
                      </Stack>
                    </Stack>
                  </Card>
                </Grid.Col>
              ) : (
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <Card 
                    shadow="sm" 
                    padding="lg" 
                    radius="md" 
                    withBorder
                    style={{
                      background: 'var(--theme-bg-elevated)',
                      borderColor: 'var(--theme-border-primary)',
                      opacity: 0.5,
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Stack gap="md" align="center" justify="center">
                      <IconActivity size={28} style={{ color: 'var(--theme-text-tertiary)' }} />
                      <Text size="sm" c="dimmed">GPU не обнаружен</Text>
                    </Stack>
                  </Card>
                </Grid.Col>
              )}

              {/* Memory и Processes в одну строку */}
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Card 
                  shadow="sm" 
                  padding="lg" 
                  radius="md" 
                  withBorder
                  style={{
                    background: 'var(--theme-bg-elevated)',
                    borderColor: 'var(--theme-border-primary)',
                    transition: 'all 0.2s ease',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <Stack gap="md" style={{ flex: 1 }}>
                    <Group justify="space-between" align="flex-start">
                      <Box
                        style={{
                          padding: '12px',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, rgba(130, 202, 157, 0.1), rgba(130, 202, 157, 0.05))',
                        }}
                      >
                        <IconServer size={28} style={{ color: '#82ca9d' }} />
                      </Box>
                      <Badge 
                        color={getProgressColor(metrics.memory.percentage)} 
                        size="lg"
                        variant="light"
                      >
                        {metrics.memory.percentage.toFixed(1)}%
                      </Badge>
                    </Group>
                    <Stack gap="xs" style={{ flex: 1 }}>
                      <Text size="sm" fw={600}>Память</Text>
                      <Progress
                        value={metrics.memory.percentage}
                        color={getProgressColor(metrics.memory.percentage)}
                        size="lg"
                        radius="xl"
                      />
                      <Group justify="space-between" mt="xs" wrap="wrap">
                        <Text size="xs" c="dimmed">
                          Использовано: <Text span fw={500} c="var(--theme-text-primary)">{formatBytes(metrics.memory.used)}</Text>
                        </Text>
                        <Text size="xs" c="dimmed">
                          Всего: <Text span fw={500} c="var(--theme-text-primary)">{formatBytes(metrics.memory.total)}</Text>
                        </Text>
                      </Group>
                    </Stack>
                  </Stack>
                </Card>
              </Grid.Col>

              {/* Processes */}
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Card 
                  shadow="sm" 
                  padding="lg" 
                  radius="md" 
                  withBorder
                  style={{
                    background: 'var(--theme-bg-elevated)',
                    borderColor: 'var(--theme-border-primary)',
                    transition: 'all 0.2s ease',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <Stack gap="md" style={{ flex: 1 }}>
                    <Group justify="space-between" align="flex-start">
                      <Box
                        style={{
                          padding: '12px',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, rgba(255, 198, 88, 0.1), rgba(255, 198, 88, 0.05))',
                        }}
                      >
                        <IconActivity size={28} style={{ color: '#ffc658' }} />
                      </Box>
                      <Badge variant="light" size="lg" color="blue">
                        {metrics.processes.running}/{metrics.processes.total}
                      </Badge>
                    </Group>
                    <Stack gap="xs" style={{ flex: 1 }}>
                      <Text size="sm" fw={600}>Процессы</Text>
                      <Group justify="space-between" mt="xs" style={{ marginTop: 'auto' }}>
                        <Stack gap={4}>
                          <Text size="xs" c="dimmed">Всего</Text>
                          <Text size="lg" fw={700}>{metrics.processes.total}</Text>
                        </Stack>
                        <Stack gap={4} align="flex-end">
                          <Text size="xs" c="dimmed">Запущено</Text>
                          <Text size="lg" fw={700} c="green">{metrics.processes.running}</Text>
                        </Stack>
                      </Group>
                    </Stack>
                  </Stack>
                </Card>
              </Grid.Col>
            </Grid>

            {/* Диски */}
            <Card 
              shadow="sm" 
              padding="lg" 
              radius="md" 
              withBorder
              mt="lg"
              style={{
                background: 'var(--theme-bg-elevated)',
                borderColor: 'var(--theme-border-primary)',
              }}
            >
              <Group justify="space-between" mb="md">
                <Group gap="xs">
                  <Box
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, rgba(255, 198, 88, 0.1), rgba(255, 198, 88, 0.05))',
                    }}
                  >
                    <IconDatabase size={20} style={{ color: '#ffc658' }} />
                  </Box>
                  <Title order={4}>Диски</Title>
                </Group>
                {metrics.disk.total > 0 && (
                  <Badge color={getProgressColor(metrics.disk.percentage)} size="lg" variant="light">
                    Общее: {metrics.disk.percentage.toFixed(1)}%
                  </Badge>
                )}
              </Group>
              {metrics.disks && metrics.disks.length > 0 ? (() => {
                // Группируем диски по физическому устройству
                const groupedDisks: { [key: string]: typeof metrics.disks } = {};
                
                metrics.disks.forEach((disk) => {
                  // Определяем физическое устройство
                  let physicalDevice = disk.device;
                  
                  // На Linux: /dev/sda1, /dev/sda2 -> /dev/sda
                  if (disk.device.startsWith('/dev/')) {
                    const match = disk.device.match(/^(\/dev\/[a-z]+)/);
                    if (match) {
                      physicalDevice = match[1];
                    }
                  }
                  // На Windows: C:, D: -> группируем по типу или оставляем отдельно
                  // Для Windows каждый диск обычно отдельный физический диск
                  
                  if (!groupedDisks[physicalDevice]) {
                    groupedDisks[physicalDevice] = [];
                  }
                  groupedDisks[physicalDevice].push(disk);
                });

                const diskGroups = Object.entries(groupedDisks);

                return (
                  <Stack gap="md">
                    {diskGroups.map(([physicalDevice, partitions]) => {
                      const isExpanded = expandedDisks.has(physicalDevice);
                      const hasMultiplePartitions = partitions.length > 1;
                      const totalSize = partitions.reduce((sum, p) => sum + p.total, 0);
                      const totalUsed = partitions.reduce((sum, p) => sum + p.used, 0);
                      const totalFree = partitions.reduce((sum, p) => sum + p.free, 0);
                      const avgPercentage = partitions.reduce((sum, p) => sum + p.percentage, 0) / partitions.length;

                      return (
                        <Paper 
                          key={physicalDevice}
                          p="md" 
                          withBorder 
                          radius="md"
                          style={{
                            background: 'var(--theme-bg-primary)',
                            borderColor: 'var(--theme-border-primary)',
                          }}
                        >
                          <Stack gap="sm">
                            {/* Заголовок физического диска */}
                            <Group 
                              justify="space-between" 
                              align="flex-start"
                              style={{ cursor: hasMultiplePartitions ? 'pointer' : 'default' }}
                              onClick={() => {
                                if (hasMultiplePartitions) {
                                  setExpandedDisks(prev => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(physicalDevice)) {
                                      newSet.delete(physicalDevice);
                                    } else {
                                      newSet.add(physicalDevice);
                                    }
                                    return newSet;
                                  });
                                }
                              }}
                            >
                              <Group gap="xs" wrap="wrap">
                                {hasMultiplePartitions && (
                                  <ActionIcon 
                                    variant="subtle" 
                                    size="sm"
                                    style={{ color: 'var(--theme-text-primary)' }}
                                  >
                                    {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                                  </ActionIcon>
                                )}
                                <Text fw={600} size="sm">{physicalDevice}</Text>
                                {partitions[0].type && (
                                  <Badge size="xs" variant="light" color="blue">
                                    {partitions[0].type}
                                  </Badge>
                                )}
                                {hasMultiplePartitions && (
                                  <Badge size="xs" variant="light" color="gray">
                                    {partitions.length} разделов
                                  </Badge>
                                )}
                              </Group>
                              {hasMultiplePartitions && (
                                <Badge color={getProgressColor(avgPercentage)} variant="light">
                                  {avgPercentage.toFixed(1)}%
                                </Badge>
                              )}
                            </Group>

                            {/* Общая статистика для физического диска (если несколько разделов) */}
                            {hasMultiplePartitions && (
                              <>
                                <Progress
                                  value={avgPercentage}
                                  color={getProgressColor(avgPercentage)}
                                  size="md"
                                  radius="xl"
                                />
                                <Group justify="space-between" wrap="wrap" gap="xs">
                                  <Text size="xs" c="dimmed">
                                    <Text span fw={500} c="var(--theme-text-primary)">{formatBytes(totalUsed)}</Text> использовано
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    <Text span fw={500} c="var(--theme-text-primary)">{formatBytes(totalFree)}</Text> свободно
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    <Text span fw={500} c="var(--theme-text-primary)">{formatBytes(totalSize)}</Text> всего
                                  </Text>
                                </Group>
                              </>
                            )}

                            {/* Разделы (раскрываются если несколько) */}
                            {(!hasMultiplePartitions || isExpanded) && (
                              <Stack gap="sm" mt={hasMultiplePartitions ? "md" : 0} pl={hasMultiplePartitions ? "xl" : 0}>
                                {partitions.map((partition, idx) => (
                                  <Box 
                                    key={idx}
                                    p="sm"
                                    style={{
                                      background: 'var(--theme-bg-elevated)',
                                      borderRadius: '8px',
                                      border: '1px solid var(--theme-border-primary)',
                                    }}
                                  >
                                    <Stack gap="xs">
                                      <Group justify="space-between" align="flex-start">
                                        <Stack gap={4}>
                                          <Group gap="xs" wrap="wrap">
                                            <Text fw={500} size="sm">{partition.device}</Text>
                                            {partition.filesystem && (
                                              <Badge size="xs" variant="light" color="gray">
                                                {partition.filesystem}
                                              </Badge>
                                            )}
                                          </Group>
                                          {partition.mountPoint !== partition.device && (
                                            <Text size="xs" c="dimmed">{partition.mountPoint}</Text>
                                          )}
                                        </Stack>
                                        <Badge color={getProgressColor(partition.percentage)} variant="light">
                                          {partition.percentage.toFixed(1)}%
                                        </Badge>
                                      </Group>
                                      <Progress
                                        value={partition.percentage}
                                        color={getProgressColor(partition.percentage)}
                                        size="sm"
                                        radius="xl"
                                      />
                                      <Group justify="space-between" wrap="wrap" gap="xs">
                                        <Text size="xs" c="dimmed">
                                          <Text span fw={500} c="var(--theme-text-primary)">{formatBytes(partition.used)}</Text> использовано
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                          <Text span fw={500} c="var(--theme-text-primary)">{formatBytes(partition.free)}</Text> свободно
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                          <Text span fw={500} c="var(--theme-text-primary)">{formatBytes(partition.total)}</Text> всего
                                        </Text>
                                      </Group>
                                    </Stack>
                                  </Box>
                                ))}
                              </Stack>
                            )}

                            {/* Одиночный раздел (без группировки) */}
                            {!hasMultiplePartitions && (
                              <>
                                <Progress
                                  value={partitions[0].percentage}
                                  color={getProgressColor(partitions[0].percentage)}
                                  size="md"
                                  radius="xl"
                                />
                                <Group justify="space-between" wrap="wrap" gap="xs">
                                  <Text size="xs" c="dimmed">
                                    <Text span fw={500} c="var(--theme-text-primary)">{formatBytes(partitions[0].used)}</Text> использовано
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    <Text span fw={500} c="var(--theme-text-primary)">{formatBytes(partitions[0].free)}</Text> свободно
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    <Text span fw={500} c="var(--theme-text-primary)">{formatBytes(partitions[0].total)}</Text> всего
                                  </Text>
                                </Group>
                                {partitions[0].mountPoint !== partitions[0].device && (
                                  <Text size="xs" c="dimmed" mt="xs">
                                    Точка монтирования: {partitions[0].mountPoint}
                                  </Text>
                                )}
                              </>
                            )}
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Stack>
                );
              })() : (
                <Stack gap="sm">
                  <Progress
                    value={metrics.disk.percentage}
                    color={getProgressColor(metrics.disk.percentage)}
                    size="lg"
                    radius="xl"
                  />
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Использовано: {formatBytes(metrics.disk.used)}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Всего: {formatBytes(metrics.disk.total)}
                    </Text>
                  </Group>
                </Stack>
              )}
            </Card>

            {/* Информация о системе и сеть */}
            <Grid gutter="lg" mt="lg">
              {/* Информация о системе */}
              {metrics?.system && (
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Card 
                    shadow="sm" 
                    padding="lg" 
                    radius="md" 
                    withBorder
                    style={{
                      background: 'var(--theme-bg-elevated)',
                      borderColor: 'var(--theme-border-primary)',
                      height: '100%',
                    }}
                  >
                    <Group gap="xs" mb="md">
                      <Box
                        style={{
                          padding: '8px',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.05))',
                        }}
                      >
                        <IconInfoCircle size={20} style={{ color: '#3b82f6' }} />
                      </Box>
                      <Title order={4}>Информация о системе</Title>
                    </Group>
                    <Stack gap="md">
                      <Grid gutter="xs">
                        <Grid.Col span={6}>
                          <Stack gap="xs">
                            <Text size="xs" c="dimmed" fw={500}>Платформа</Text>
                            <Text size="sm" fw={600}>{getPlatformName(metrics.system.platform)}</Text>
                          </Stack>
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <Stack gap="xs">
                            <Text size="xs" c="dimmed" fw={500}>Архитектура</Text>
                            <Text size="sm" fw={600}>{metrics.system.arch}</Text>
                          </Stack>
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <Stack gap="xs">
                            <Text size="xs" c="dimmed" fw={500}>ОС</Text>
                            <Text size="sm" fw={600}>{metrics.system.type}</Text>
                          </Stack>
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <Stack gap="xs">
                            <Text size="xs" c="dimmed" fw={500}>Версия ОС</Text>
                            <Text size="sm" fw={600}>{metrics.system.release}</Text>
                          </Stack>
                        </Grid.Col>
                        <Grid.Col span={12}>
                          <Stack gap="xs">
                            <Text size="xs" c="dimmed" fw={500}>Имя хоста</Text>
                            <Text size="sm" fw={600}>{metrics.system.hostname}</Text>
                          </Stack>
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <Stack gap="xs">
                            <Text size="xs" c="dimmed" fw={500}>Node.js</Text>
                            <Badge variant="light" color="blue" size="lg">
                              {metrics.system.nodeVersion.version}
                            </Badge>
                          </Stack>
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <Stack gap="xs">
                            <Text size="xs" c="dimmed" fw={500}>Процессор</Text>
                            <Text size="sm" fw={600}>{metrics.cpu.cores} ядер</Text>
                          </Stack>
                        </Grid.Col>
                      </Grid>
                      {metrics.cpu.details && metrics.cpu.details.length > 0 && (
                        <Box mt="xs">
                          <Text size="xs" c="dimmed" fw={500} mb={4}>Модель CPU</Text>
                          <Text size="xs" c="dimmed" lineClamp={2}>
                            {metrics.cpu.details[0].model}
                          </Text>
                        </Box>
                      )}
                    </Stack>
                  </Card>
                </Grid.Col>
              )}

              {/* Сетевая информация */}
              {metrics?.network && metrics.network.length > 0 && (
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Card 
                    shadow="sm" 
                    padding="lg" 
                    radius="md" 
                    withBorder
                    style={{
                      background: 'var(--theme-bg-elevated)',
                      borderColor: 'var(--theme-border-primary)',
                      height: '100%',
                    }}
                  >
                    <Group gap="xs" mb="md">
                      <Box
                        style={{
                          padding: '8px',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(139, 92, 246, 0.05))',
                        }}
                      >
                        <IconNetwork size={20} style={{ color: '#8b5cf6' }} />
                      </Box>
                      <Title order={4}>Сетевые интерфейсы</Title>
                    </Group>
                    <Stack gap="md">
                      {metrics.network.map((iface, index) => (
                        <Paper 
                          key={index} 
                          p="md" 
                          withBorder 
                          radius="md"
                          style={{
                            background: 'var(--theme-bg-primary)',
                            borderColor: 'var(--theme-border-primary)',
                          }}
                        >
                          <Stack gap="xs">
                            <Group justify="space-between" align="flex-start">
                              <Text fw={600} size="sm">{iface.name}</Text>
                              <Badge variant="light" size="sm" color={iface.family === 'IPv4' ? 'blue' : 'purple'}>
                                {iface.family === 'IPv4' ? 'IPv4' : 'IPv6'}
                              </Badge>
                            </Group>
                            <Group gap="md" wrap="wrap">
                              <Stack gap={2}>
                                <Text size="xs" c="dimmed">IP адрес</Text>
                                <Text size="sm" fw={500}>{iface.address}</Text>
                              </Stack>
                              {iface.netmask && (
                                <Stack gap={2}>
                                  <Text size="xs" c="dimmed">Маска</Text>
                                  <Text size="sm" fw={500}>{iface.netmask}</Text>
                                </Stack>
                              )}
                            </Group>
                            {iface.mac && (
                              <Text size="xs" c="dimmed">
                                MAC: <Text span fw={500}>{iface.mac}</Text>
                              </Text>
                            )}
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  </Card>
                </Grid.Col>
              )}
            </Grid>

            {/* Swap память */}
            {metrics.swap && metrics.swap.total > 0 && (
              <Card 
                shadow="sm" 
                padding="lg" 
                radius="md" 
                withBorder
                mt="lg"
                style={{
                  background: 'var(--theme-bg-elevated)',
                  borderColor: 'var(--theme-border-primary)',
                }}
              >
                <Group justify="space-between" mb="md">
                  <Group gap="xs">
                    <Box
                      style={{
                        padding: '8px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(139, 92, 246, 0.05))',
                      }}
                    >
                      <IconServer size={20} style={{ color: '#8b5cf6' }} />
                    </Box>
                    <Title order={4}>Swap память</Title>
                  </Group>
                  <Badge color={getProgressColor(metrics.swap.percentage)} size="lg" variant="light">
                    {metrics.swap.percentage.toFixed(1)}%
                  </Badge>
                </Group>
                <Stack gap="sm">
                  <Progress
                    value={metrics.swap.percentage}
                    color={getProgressColor(metrics.swap.percentage)}
                    size="lg"
                    radius="xl"
                  />
                  <Group justify="space-between" wrap="wrap">
                    <Text size="sm" c="dimmed">
                      Использовано: <Text span fw={500} c="var(--theme-text-primary)">{formatBytes(metrics.swap.used)}</Text>
                    </Text>
                    <Text size="sm" c="dimmed">
                      Свободно: <Text span fw={500} c="var(--theme-text-primary)">{formatBytes(metrics.swap.free)}</Text>
                    </Text>
                    <Text size="sm" c="dimmed">
                      Всего: <Text span fw={500} c="var(--theme-text-primary)">{formatBytes(metrics.swap.total)}</Text>
                    </Text>
                  </Group>
                </Stack>
              </Card>
            )}

            {/* Температура */}
            {metrics.temperature && (metrics.temperature.cpu || metrics.temperature.gpu || (metrics.temperature.disks && metrics.temperature.disks.length > 0)) && (
              <Card 
                shadow="sm" 
                padding="lg" 
                radius="md" 
                withBorder
                mt="lg"
                style={{
                  background: 'var(--theme-bg-elevated)',
                  borderColor: 'var(--theme-border-primary)',
                }}
              >
                <Group gap="xs" mb="md" justify="space-between">
                  <Group gap="xs">
                    <Box
                      style={{
                        padding: '8px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, rgba(255, 99, 132, 0.1), rgba(255, 99, 132, 0.05))',
                      }}
                    >
                      <IconTemperature size={20} style={{ color: '#ff6384' }} />
                    </Box>
                    <Title order={4}>Температура</Title>
                  </Group>
                  {isConnected && (
                    <Badge color="green" variant="light" size="sm">
                      WebSocket
                    </Badge>
                  )}
                </Group>
                <Grid gutter="md">
                  {metrics.temperature.cpu !== undefined && (
                    <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
                      <Paper 
                        p="md" 
                        withBorder 
                        radius="md" 
                        style={{ 
                          background: 'var(--theme-bg-primary)',
                          borderLeft: `4px solid ${metrics.temperature.cpu > 70 ? '#ff6384' : metrics.temperature.cpu > 50 ? '#ffc658' : '#82ca9d'}`,
                        }}
                      >
                        <Stack gap="xs">
                          <Group justify="space-between" align="flex-start">
                            <Text size="xs" c="dimmed" fw={500}>CPU</Text>
                            <Badge 
                              size="sm" 
                              variant="light"
                              color={metrics.temperature.cpu > 70 ? 'red' : metrics.temperature.cpu > 50 ? 'yellow' : 'green'}
                            >
                              {metrics.temperature.cpu > 70 ? 'Критично' : metrics.temperature.cpu > 50 ? 'Высокая' : 'Норма'}
                            </Badge>
                          </Group>
                          <Group gap="xs" align="center">
                            <IconTemperature 
                              size={24} 
                              style={{ 
                                color: metrics.temperature.cpu > 70 ? '#ff6384' : metrics.temperature.cpu > 50 ? '#ffc658' : '#82ca9d',
                                filter: metrics.temperature.cpu > 70 ? 'drop-shadow(0 0 4px rgba(255, 99, 132, 0.5))' : 'none',
                              }} 
                            />
                            <Text size="xl" fw={700} c={metrics.temperature.cpu > 70 ? 'red' : metrics.temperature.cpu > 50 ? 'yellow' : 'green'}>
                              {metrics.temperature.cpu.toFixed(1)}°C
                            </Text>
                          </Group>
                          <Progress
                            value={Math.min((metrics.temperature.cpu / 100) * 100, 100)}
                            color={metrics.temperature.cpu > 70 ? 'red' : metrics.temperature.cpu > 50 ? 'yellow' : 'green'}
                            size="sm"
                            radius="xl"
                            style={{ marginTop: '8px' }}
                          />
                        </Stack>
                      </Paper>
                    </Grid.Col>
                  )}
                  {metrics.temperature.gpu !== undefined && (
                    <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
                      <Paper 
                        p="md" 
                        withBorder 
                        radius="md" 
                        style={{ 
                          background: 'var(--theme-bg-primary)',
                          borderLeft: `4px solid ${metrics.temperature.gpu > 80 ? '#ff6384' : metrics.temperature.gpu > 60 ? '#ffc658' : '#82ca9d'}`,
                        }}
                      >
                        <Stack gap="xs">
                          <Group justify="space-between" align="flex-start">
                            <Text size="xs" c="dimmed" fw={500}>GPU</Text>
                            <Badge 
                              size="sm" 
                              variant="light"
                              color={metrics.temperature.gpu > 80 ? 'red' : metrics.temperature.gpu > 60 ? 'yellow' : 'green'}
                            >
                              {metrics.temperature.gpu > 80 ? 'Критично' : metrics.temperature.gpu > 60 ? 'Высокая' : 'Норма'}
                            </Badge>
                          </Group>
                          <Group gap="xs" align="center">
                            <IconTemperature 
                              size={24} 
                              style={{ 
                                color: metrics.temperature.gpu > 80 ? '#ff6384' : metrics.temperature.gpu > 60 ? '#ffc658' : '#82ca9d',
                                filter: metrics.temperature.gpu > 80 ? 'drop-shadow(0 0 4px rgba(255, 99, 132, 0.5))' : 'none',
                              }} 
                            />
                            <Text size="xl" fw={700} c={metrics.temperature.gpu > 80 ? 'red' : metrics.temperature.gpu > 60 ? 'yellow' : 'green'}>
                              {metrics.temperature.gpu.toFixed(1)}°C
                            </Text>
                          </Group>
                          <Progress
                            value={Math.min((metrics.temperature.gpu / 100) * 100, 100)}
                            color={metrics.temperature.gpu > 80 ? 'red' : metrics.temperature.gpu > 60 ? 'yellow' : 'green'}
                            size="sm"
                            radius="xl"
                            style={{ marginTop: '8px' }}
                          />
                        </Stack>
                      </Paper>
                    </Grid.Col>
                  )}
                  {metrics.temperature.disks && metrics.temperature.disks.length > 0 && (
                    <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
                      <Paper p="md" withBorder radius="md" style={{ background: 'var(--theme-bg-primary)' }}>
                        <Stack gap="xs">
                          <Text size="xs" c="dimmed" fw={500} mb="xs">Диски</Text>
                          <Stack gap="sm">
                            {metrics.temperature.disks.slice(0, 5).map((disk, idx) => {
                              const tempColor = disk.temperature > 50 ? 'red' : disk.temperature > 40 ? 'yellow' : 'green';
                              return (
                                <Group key={idx} justify="space-between" p="xs" style={{ 
                                  background: 'var(--theme-bg-elevated)',
                                  borderRadius: '6px',
                                  borderLeft: `3px solid ${disk.temperature > 50 ? '#ff6384' : disk.temperature > 40 ? '#ffc658' : '#82ca9d'}`,
                                }}>
                                  <Group gap="xs">
                                    <IconTemperature size={16} style={{ color: disk.temperature > 50 ? '#ff6384' : disk.temperature > 40 ? '#ffc658' : '#82ca9d' }} />
                                    <Text size="xs" c="dimmed" lineClamp={1} style={{ maxWidth: '120px' }}>
                                      {disk.device.split('/').pop() || disk.device}
                                    </Text>
                                  </Group>
                                  <Group gap="xs">
                                    <Text size="sm" fw={600} c={tempColor}>
                                      {disk.temperature.toFixed(1)}°C
                                    </Text>
                                    {disk.temperature > 50 && (
                                      <Badge size="xs" color="red" variant="light">!</Badge>
                                    )}
                                  </Group>
                                </Group>
                              );
                            })}
                            {metrics.temperature.disks.length > 5 && (
                              <Text size="xs" c="dimmed" ta="center">
                                +{metrics.temperature.disks.length - 5} еще
                              </Text>
                            )}
                          </Stack>
                        </Stack>
                      </Paper>
                    </Grid.Col>
                  )}
                </Grid>
              </Card>
            )}

            {/* Топ процессов */}
            {metrics.topProcesses && (metrics.topProcesses.cpu.length > 0 || metrics.topProcesses.memory.length > 0) && (
              <Card 
                shadow="sm" 
                padding="lg" 
                radius="md" 
                withBorder
                mt="lg"
                style={{
                  background: 'var(--theme-bg-elevated)',
                  borderColor: 'var(--theme-border-primary)',
                }}
              >
                <Group gap="xs" mb="md">
                  <Box
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, rgba(255, 198, 88, 0.1), rgba(255, 198, 88, 0.05))',
                    }}
                  >
                    <IconActivity size={20} style={{ color: '#ffc658' }} />
                  </Box>
                  <Title order={4}>Топ процессов</Title>
                </Group>
                <Tabs defaultValue="cpu">
                  <Tabs.List>
                    <Tabs.Tab value="cpu" leftSection={<IconCpu size={16} />}>
                      По CPU
                    </Tabs.Tab>
                    <Tabs.Tab value="memory" leftSection={<IconServer size={16} />}>
                      По памяти
                    </Tabs.Tab>
                  </Tabs.List>
                  <Tabs.Panel value="cpu" pt="md">
                    {metrics.topProcesses.cpu.length > 0 ? (
                      <Table striped highlightOnHover>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>PID</Table.Th>
                            <Table.Th>Процесс</Table.Th>
                            <Table.Th>CPU %</Table.Th>
                            <Table.Th>Память %</Table.Th>
                            <Table.Th>Пользователь</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {metrics.topProcesses.cpu.map((proc, idx) => (
                            <Table.Tr key={idx}>
                              <Table.Td><Text size="sm" fw={500}>{proc.pid}</Text></Table.Td>
                              <Table.Td><Text size="sm">{proc.name}</Text></Table.Td>
                              <Table.Td>
                                <Badge color={proc.cpu > 50 ? 'red' : proc.cpu > 20 ? 'yellow' : 'green'} variant="light">
                                  {proc.cpu.toFixed(1)}%
                                </Badge>
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm">{proc.memory.toFixed(1)}%</Text>
                              </Table.Td>
                              <Table.Td>
                                <Text size="xs" c="dimmed">{proc.user || 'N/A'}</Text>
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    ) : (
                      <Text c="dimmed" ta="center" py="md">Нет данных</Text>
                    )}
                  </Tabs.Panel>
                  <Tabs.Panel value="memory" pt="md">
                    {metrics.topProcesses.memory.length > 0 ? (
                      <Table striped highlightOnHover>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>PID</Table.Th>
                            <Table.Th>Процесс</Table.Th>
                            <Table.Th>CPU %</Table.Th>
                            <Table.Th>Память %</Table.Th>
                            <Table.Th>Пользователь</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {metrics.topProcesses.memory.map((proc, idx) => (
                            <Table.Tr key={idx}>
                              <Table.Td><Text size="sm" fw={500}>{proc.pid}</Text></Table.Td>
                              <Table.Td><Text size="sm">{proc.name}</Text></Table.Td>
                              <Table.Td>
                                <Text size="sm">{proc.cpu.toFixed(1)}%</Text>
                              </Table.Td>
                              <Table.Td>
                                <Badge color={proc.memory > 50 ? 'red' : proc.memory > 20 ? 'yellow' : 'green'} variant="light">
                                  {proc.memory.toFixed(1)}%
                                </Badge>
                              </Table.Td>
                              <Table.Td>
                                <Text size="xs" c="dimmed">{proc.user || 'N/A'}</Text>
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    ) : (
                      <Text c="dimmed" ta="center" py="md">Нет данных</Text>
                    )}
                  </Tabs.Panel>
                </Tabs>
              </Card>
            )}

            {/* Сетевая активность */}
            {metrics.networkActivity && metrics.networkActivity.interfaces.length > 0 && (
              <Card 
                shadow="sm" 
                padding="lg" 
                radius="md" 
                withBorder
                mt="lg"
                style={{
                  background: 'var(--theme-bg-elevated)',
                  borderColor: 'var(--theme-border-primary)',
                }}
              >
                <Group gap="xs" mb="md">
                  <Box
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(139, 92, 246, 0.05))',
                    }}
                  >
                    <IconNetwork size={20} style={{ color: '#8b5cf6' }} />
                  </Box>
                  <Title order={4}>Сетевая активность</Title>
                </Group>
                <Stack gap="md">
                  {metrics.networkActivity.interfaces.map((iface, idx) => (
                    <Paper key={idx} p="md" withBorder radius="md" style={{ background: 'var(--theme-bg-primary)' }}>
                      <Stack gap="sm">
                        <Group justify="space-between">
                          <Text fw={600} size="sm">{iface.name}</Text>
                          <Group gap="md">
                            <Group gap="xs">
                              <IconDownload size={16} style={{ color: '#82ca9d' }} />
                              <Text size="xs" c="dimmed">Входящий</Text>
                              <Text size="sm" fw={500}>{formatBytes(iface.rxBytes)}</Text>
                            </Group>
                            <Group gap="xs">
                              <IconUpload size={16} style={{ color: '#8884d8' }} />
                              <Text size="xs" c="dimmed">Исходящий</Text>
                              <Text size="sm" fw={500}>{formatBytes(iface.txBytes)}</Text>
                            </Group>
                          </Group>
                        </Group>
                        <Group gap="md" wrap="wrap">
                          <Text size="xs" c="dimmed">
                            Пакетов получено: <Text span fw={500}>{iface.rxPackets.toLocaleString()}</Text>
                          </Text>
                          <Text size="xs" c="dimmed">
                            Пакетов отправлено: <Text span fw={500}>{iface.txPackets.toLocaleString()}</Text>
                          </Text>
                          {(iface.rxErrors > 0 || iface.txErrors > 0) && (
                            <>
                              {iface.rxErrors > 0 && (
                                <Badge color="red" size="sm" variant="light">
                                  Ошибок RX: {iface.rxErrors}
                                </Badge>
                              )}
                              {iface.txErrors > 0 && (
                                <Badge color="red" size="sm" variant="light">
                                  Ошибок TX: {iface.txErrors}
                                </Badge>
                              )}
                            </>
                          )}
                        </Group>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </Card>
            )}

            {/* Расширенная информация о системе */}
            {metrics.extendedInfo && Object.keys(metrics.extendedInfo).length > 0 && (
              <Card 
                shadow="sm" 
                padding="lg" 
                radius="md" 
                withBorder
                mt="lg"
                style={{
                  background: 'var(--theme-bg-elevated)',
                  borderColor: 'var(--theme-border-primary)',
                }}
              >
                <Group gap="xs" mb="md">
                  <Box
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.05))',
                    }}
                  >
                    <IconInfoCircle size={20} style={{ color: '#3b82f6' }} />
                  </Box>
                  <Title order={4}>Расширенная информация</Title>
                </Group>
                <Grid gutter="md">
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Stack gap="xs">
                      {metrics.extendedInfo.environment && (
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Окружение</Text>
                          <Badge variant="light" color={metrics.extendedInfo.environment === 'production' ? 'red' : 'blue'}>
                            {metrics.extendedInfo.environment}
                          </Badge>
                        </Group>
                      )}
                      {metrics.extendedInfo.pid && (
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">PID процесса</Text>
                          <Text size="sm" fw={500}>{metrics.extendedInfo.pid}</Text>
                        </Group>
                      )}
                      {metrics.extendedInfo.uptime !== undefined && (
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Uptime процесса</Text>
                          <Text size="sm" fw={500}>{formatUptime(metrics.extendedInfo.uptime)}</Text>
                        </Group>
                      )}
                      {metrics.extendedInfo.kernel && (
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Версия ядра</Text>
                          <Text size="sm" fw={500}>{metrics.extendedInfo.kernel}</Text>
                        </Group>
                      )}
                    </Stack>
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Stack gap="xs">
                      {metrics.extendedInfo.versions && (
                        <>
                          <Text size="sm" c="dimmed" fw={500} mb="xs">Версии</Text>
                          {metrics.extendedInfo.versions.node && (
                            <Group justify="space-between">
                              <Text size="xs" c="dimmed">Node.js</Text>
                              <Text size="xs" fw={500}>{metrics.extendedInfo.versions.node}</Text>
                            </Group>
                          )}
                          {metrics.extendedInfo.versions.v8 && (
                            <Group justify="space-between">
                              <Text size="xs" c="dimmed">V8</Text>
                              <Text size="xs" fw={500}>{metrics.extendedInfo.versions.v8}</Text>
                            </Group>
                          )}
                          {metrics.extendedInfo.versions.uv && (
                            <Group justify="space-between">
                              <Text size="xs" c="dimmed">UV</Text>
                              <Text size="xs" fw={500}>{metrics.extendedInfo.versions.uv}</Text>
                            </Group>
                          )}
                        </>
                      )}
                      {metrics.extendedInfo.distribution && (
                        <>
                          <Text size="sm" c="dimmed" fw={500} mt="xs" mb="xs">Дистрибутив</Text>
                          {metrics.extendedInfo.distribution.NAME && (
                            <Text size="xs" c="dimmed">{metrics.extendedInfo.distribution.NAME}</Text>
                          )}
                          {metrics.extendedInfo.distribution.VERSION && (
                            <Text size="xs" c="dimmed">{metrics.extendedInfo.distribution.VERSION}</Text>
                          )}
                        </>
                      )}
                    </Stack>
                  </Grid.Col>
                </Grid>
              </Card>
            )}

            {/* Метрики производительности */}
            {metrics.performance && (
              <Card 
                shadow="sm" 
                padding="lg" 
                radius="md" 
                withBorder
                mt="lg"
                style={{
                  background: 'var(--theme-bg-elevated)',
                  borderColor: 'var(--theme-border-primary)',
                }}
              >
                <Group gap="xs" mb="md">
                  <Box
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.05))',
                    }}
                  >
                    <IconGauge size={20} style={{ color: '#22c55e' }} />
                  </Box>
                  <Title order={4}>Производительность</Title>
                </Group>
                <Grid gutter="md">
                  {metrics.performance.memory && (
                    <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
                      <Paper p="md" withBorder radius="md" style={{ background: 'var(--theme-bg-primary)' }}>
                        <Stack gap="xs">
                          <Text size="xs" c="dimmed" fw={500}>Память Node.js</Text>
                          {metrics.performance.memory.heapUsedMB !== undefined && (
                            <Group justify="space-between">
                              <Text size="xs" c="dimmed">Heap Used</Text>
                              <Text size="sm" fw={500}>{metrics.performance.memory.heapUsedMB} MB</Text>
                            </Group>
                          )}
                          {metrics.performance.memory.heapTotalMB !== undefined && (
                            <Group justify="space-between">
                              <Text size="xs" c="dimmed">Heap Total</Text>
                              <Text size="sm" fw={500}>{metrics.performance.memory.heapTotalMB} MB</Text>
                            </Group>
                          )}
                          {metrics.performance.memory.rssMB !== undefined && (
                            <Group justify="space-between">
                              <Text size="xs" c="dimmed">RSS</Text>
                              <Text size="sm" fw={500}>{metrics.performance.memory.rssMB} MB</Text>
                            </Group>
                          )}
                        </Stack>
                      </Paper>
                    </Grid.Col>
                  )}
                  {metrics.performance.api && (
                    <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
                      <Paper p="md" withBorder radius="md" style={{ background: 'var(--theme-bg-primary)' }}>
                        <Stack gap="xs">
                          <Text size="xs" c="dimmed" fw={500}>API</Text>
                          {metrics.performance.api.totalRequests !== undefined && (
                            <Group justify="space-between">
                              <Text size="xs" c="dimmed">Всего запросов</Text>
                              <Text size="sm" fw={500}>{metrics.performance.api.totalRequests.toLocaleString()}</Text>
                            </Group>
                          )}
                          {metrics.performance.api.averageResponseTime !== undefined && (
                            <Group justify="space-between">
                              <Text size="xs" c="dimmed">Среднее время</Text>
                              <Text size="sm" fw={500}>{metrics.performance.api.averageResponseTime.toFixed(0)}ms</Text>
                            </Group>
                          )}
                          {metrics.performance.api.requestsPerSecond !== undefined && (
                            <Group justify="space-between">
                              <Text size="xs" c="dimmed">Запросов/сек</Text>
                              <Text size="sm" fw={500}>{metrics.performance.api.requestsPerSecond.toFixed(1)}</Text>
                            </Group>
                          )}
                        </Stack>
                      </Paper>
                    </Grid.Col>
                  )}
                  {metrics.performance.database && (
                    <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
                      <Paper p="md" withBorder radius="md" style={{ background: 'var(--theme-bg-primary)' }}>
                        <Stack gap="xs">
                          <Text size="xs" c="dimmed" fw={500}>База данных</Text>
                          {metrics.performance.database.totalQueries !== undefined && (
                            <Group justify="space-between">
                              <Text size="xs" c="dimmed">Всего запросов</Text>
                              <Text size="sm" fw={500}>{metrics.performance.database.totalQueries.toLocaleString()}</Text>
                            </Group>
                          )}
                          {metrics.performance.database.averageQueryTime !== undefined && (
                            <Group justify="space-between">
                              <Text size="xs" c="dimmed">Среднее время</Text>
                              <Text size="sm" fw={500}>{metrics.performance.database.averageQueryTime.toFixed(0)}ms</Text>
                            </Group>
                          )}
                          {metrics.performance.database.slowQueries !== undefined && metrics.performance.database.slowQueries > 0 && (
                            <Group justify="space-between">
                              <Text size="xs" c="dimmed">Медленные</Text>
                              <Badge color="red" size="sm">{metrics.performance.database.slowQueries}</Badge>
                            </Group>
                          )}
                        </Stack>
                      </Paper>
                    </Grid.Col>
                  )}
                </Grid>
              </Card>
            )}

            {/* Информация о безопасности */}
            {metrics.security && (
              <Card 
                shadow="sm" 
                padding="lg" 
                radius="md" 
                withBorder
                mt="lg"
                style={{
                  background: 'var(--theme-bg-elevated)',
                  borderColor: 'var(--theme-border-primary)',
                }}
              >
                <Group gap="xs" mb="md">
                  <Box
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05))',
                    }}
                  >
                    <IconShield size={20} style={{ color: '#ef4444' }} />
                  </Box>
                  <Title order={4}>Безопасность</Title>
                </Group>
                <Grid gutter="md">
                  <Grid.Col span={{ base: 12, md: 4 }}>
                    <Paper p="md" withBorder radius="md" style={{ background: 'var(--theme-bg-primary)' }}>
                      <Stack gap="xs" align="center">
                        <IconUserCheck size={32} style={{ color: '#3b82f6' }} />
                        <Text size="lg" fw={700}>{metrics.security.activeSessions || 0}</Text>
                        <Text size="sm" c="dimmed">Активных сессий</Text>
                      </Stack>
                    </Paper>
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 8 }}>
                    {metrics.security.recentLogins && metrics.security.recentLogins.length > 0 && (
                      <Paper p="md" withBorder radius="md" style={{ background: 'var(--theme-bg-primary)' }}>
                        <Stack gap="xs">
                          <Text size="sm" fw={600} mb="xs">Последние активности</Text>
                          <Table>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>Email</Table.Th>
                                <Table.Th>Роль</Table.Th>
                                <Table.Th>Последняя активность</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {metrics.security.recentLogins.slice(0, 5).map((login: any, idx: number) => (
                                <Table.Tr key={idx}>
                                  <Table.Td>
                                    <Text size="sm">{login.email}</Text>
                                  </Table.Td>
                                  <Table.Td>
                                    <Badge size="sm" variant="light">{login.role}</Badge>
                                  </Table.Td>
                                  <Table.Td>
                                    <Text size="xs" c="dimmed">
                                      {login.lastActivity ? new Date(login.lastActivity).toLocaleString('ru-RU') : 'N/A'}
                                    </Text>
                                  </Table.Td>
                                </Table.Tr>
                              ))}
                            </Table.Tbody>
                          </Table>
                        </Stack>
                      </Paper>
                    )}
                  </Grid.Col>
                </Grid>
              </Card>
            )}

          </>
        ) : (
          <Paper p="xl" radius="md" withBorder>
            <Text c="dimmed" ta="center">
              Метрики системы недоступны
            </Text>
          </Paper>
        )}
      </Stack>
    </Container>
  );
}

