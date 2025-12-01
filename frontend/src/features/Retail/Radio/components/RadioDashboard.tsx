import React, { useMemo } from 'react';
import { formatMonthFolder } from '../../../../utils/format';
import { 
  Paper, 
  Group, 
  Stack, 
  Text, 
  Title, 
  Button, 
  Box,
  Badge,
  SimpleGrid,
  Card,
  Alert,
  Timeline,
  RingProgress
} from '@mantine/core';
import { 
  IconMusic, 
  IconRadio, 
  IconDeviceMobile, 
  IconPlus,
  IconUpload,
  IconChevronRight,
  IconChevronDown,
  IconBuilding,
  IconCheck,
  IconAlertTriangle,
  IconClock,
  IconWifiOff,
  IconCalendar,
  IconQrcode,
  IconChartBar,
  IconArrowRight,
  IconExclamationCircle,
  IconExternalLink
} from '@tabler/icons-react';

interface RadioDashboardProps {
  stats: {
    totalDevices: number;
    activeDevices: number;
    totalBranches: number;
    storesCount?: number;
    discountCentersCount?: number;
    totalMusicFiles: number;
  } | null;
  radioStreams: Array<{
    id: string;
    name: string;
    branchTypeOfDist: string;
    isActive: boolean;
    startDate: string;
    endDate?: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
  branchesWithDevices: Array<{
    branch: {
      uuid: string;
      name: string;
      typeOfDist: string;
    };
    devices: Array<{
      id: string;
      name: string;
      branchId: string;
      branchName: string;
      network: string;
      number: string;
      os: string;
      app: string;
      user?: {
        id: string;
        name: string;
        login: string;
      };
    }>;
  }>;
  musicStatus?: {
    currentMonthFolder?: string;
    nextMonthFolder?: string;
    shouldWarn?: boolean;
  } | null;
  statusMap: Record<string, boolean>;
  expandedBranches: Set<string>;
  onToggleBranch: (branchId: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onCreateStream: () => void;
  onUploadMusic: () => void;
  onDeviceClick: (device: any) => void;
  onAddDevice?: () => void;
  hasFullAccess: boolean;
  user?: {
    branch?: string;
  } | null;
  onNavigateToTab?: (tab: string, filters?: Record<string, any>) => void;
}

const RadioDashboard: React.FC<RadioDashboardProps> = ({
  stats,
  radioStreams,
  branchesWithDevices,
  statusMap,
  expandedBranches,
  onToggleBranch,
  onExpandAll,
  onCollapseAll,
  onCreateStream,
  onUploadMusic,
  onDeviceClick,
  onAddDevice,
  hasFullAccess,
  user,
  musicStatus,
  onNavigateToTab
}) => {
  // Активные потоки
  const activeStreams = useMemo(() => {
    return radioStreams.filter(stream => stream.isActive);
  }, [radioStreams]);

  // Все устройства
  const allDevices = useMemo(() => {
    return branchesWithDevices.flatMap(branch => branch.devices);
  }, [branchesWithDevices]);

  // Активные устройства
  const activeDevicesCount = useMemo(() => {
    return allDevices.filter(device => statusMap[device.id]).length;
  }, [allDevices, statusMap]);

  // Офлайн устройства
  const offlineDevices = useMemo(() => {
    return allDevices.filter(device => !statusMap[device.id]);
  }, [allDevices, statusMap]);

  // Истекающие потоки (заканчиваются в течение 7 дней)
  const expiringStreams = useMemo(() => {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    return activeStreams.filter(stream => {
      if (!stream.endDate) return false;
      const endDate = new Date(stream.endDate);
      return endDate <= sevenDaysFromNow && endDate >= now;
    });
  }, [activeStreams]);

  // Процент активных устройств
  const activeDevicesPercentage = useMemo(() => {
    if (allDevices.length === 0) return 0;
    return Math.round((activeDevicesCount / allDevices.length) * 100);
  }, [allDevices.length, activeDevicesCount]);

  // Статистика филиалов по типам (данные приходят с бэкенда)
  const branchesByType = useMemo(() => {
    return {
      stores: stats?.storesCount ?? 0, // Количество магазинов с бэкенда
      discountCenters: stats?.discountCentersCount ?? 0, // Количество дисконт-центров с бэкенда
      total: stats?.totalBranches ?? 0 // Всего (Магазин + Дисконт центр) с бэкенда
    };
  }, [stats]);

  // Статистика потоков по типам филиалов
  const streamsByBranchType = useMemo(() => {
    const byType: Record<string, number> = {};
    activeStreams.forEach(stream => {
      const type = stream.branchTypeOfDist || 'Неизвестный';
      byType[type] = (byType[type] || 0) + 1;
    });
    return byType;
  }, [activeStreams]);

  // Топ филиалов по количеству устройств
  const topBranchesByDevices = useMemo(() => {
    return branchesWithDevices
      .map(branch => ({
        name: branch.branch.name,
        uuid: branch.branch.uuid,
        type: branch.branch.typeOfDist,
        deviceCount: branch.devices.length,
        onlineCount: branch.devices.filter(d => statusMap[d.id]).length
      }))
      .sort((a, b) => b.deviceCount - a.deviceCount)
      .slice(0, 5);
  }, [branchesWithDevices, statusMap]);


  // Филиалы без активных потоков
  const branchesWithoutActiveStreams = useMemo(() => {
    const branchesWithStreams = new Set(
      activeStreams.map(stream => stream.branchTypeOfDist)
    );
    return branchesWithDevices
      .filter(branch => !branchesWithStreams.has(branch.branch.typeOfDist))
      .map(branch => ({
        name: branch.branch.name,
        uuid: branch.branch.uuid,
        type: branch.branch.typeOfDist,
        deviceCount: branch.devices.length
      }));
  }, [branchesWithDevices, activeStreams]);

  // Филиалы где все устройства офлайн
  const branchesWithAllOffline = useMemo(() => {
    return branchesWithDevices
      .filter(branch => {
        const hasDevices = branch.devices.length > 0;
        const allOffline = branch.devices.every(device => !statusMap[device.id]);
        return hasDevices && allOffline;
      })
      .map(branch => ({
        name: branch.branch.name,
        uuid: branch.branch.uuid,
        type: branch.branch.typeOfDist,
        deviceCount: branch.devices.length
      }));
  }, [branchesWithDevices, statusMap]);

  // Процент активных потоков от общего количества
  const activeStreamsPercentage = useMemo(() => {
    if (radioStreams.length === 0) return 0;
    return Math.round((activeStreams.length / radioStreams.length) * 100);
  }, [activeStreams.length, radioStreams.length]);

  // Форматирование даты
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', { 
      day: 'numeric', 
      month: 'short',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  };

  // Дней до окончания потока
  const daysUntilExpiry = (endDate: string) => {
    const now = new Date();
    const end = new Date(endDate);
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Последние события (недавно созданные/обновленные потоки)
  const recentEvents = useMemo(() => {
    const events: Array<{
      id: string;
      type: 'stream_created' | 'stream_updated';
      title: string;
      description: string;
      date: Date;
      stream?: typeof radioStreams[0];
    }> = [];

    radioStreams.forEach(stream => {
      if (stream.createdAt) {
        const createdDate = new Date(stream.createdAt);
        const daysAgo = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysAgo <= 7) {
          events.push({
            id: `created-${stream.id}`,
            type: 'stream_created',
            title: `Создан поток: ${stream.name}`,
            description: stream.branchTypeOfDist,
            date: createdDate,
            stream
          });
        }
      }
      if (stream.updatedAt && stream.updatedAt !== stream.createdAt) {
        const updatedDate = new Date(stream.updatedAt);
        const daysAgo = (Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysAgo <= 7) {
          events.push({
            id: `updated-${stream.id}`,
            type: 'stream_updated',
            title: `Обновлен поток: ${stream.name}`,
            description: stream.branchTypeOfDist,
            date: updatedDate,
            stream
          });
        }
      }
    });

    return events
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 5);
  }, [radioStreams]);

  // Форматирование относительного времени
  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'только что';
    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'минуту' : diffMins < 5 ? 'минуты' : 'минут'} назад`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'час' : diffHours < 5 ? 'часа' : 'часов'} назад`;
    if (diffDays === 1) return 'вчера';
    if (diffDays < 7) return `${diffDays} ${diffDays < 5 ? 'дня' : 'дней'} назад`;
    return formatDate(date.toISOString());
  };

  return (
    <Stack gap="lg">
      {/* Улучшенный блок предупреждений */}
      {(offlineDevices.length > 0 || expiringStreams.length > 0 || branchesWithAllOffline.length > 0 || branchesWithoutActiveStreams.length > 0) && (
        <Paper 
          p="md" 
          radius="lg" 
          shadow="sm"
          style={{
            background: 'var(--theme-bg-elevated)',
            border: '1px solid var(--theme-border)'
          }}
        >
          <Group justify="space-between" mb="md">
            <Title order={4} c="var(--theme-text-primary)">
              Предупреждения и проблемы
            </Title>
            <Badge color="orange" variant="light" size="lg">
              {offlineDevices.length + expiringStreams.length + branchesWithAllOffline.length + branchesWithoutActiveStreams.length}
            </Badge>
          </Group>
          <Stack gap="sm">
            {offlineDevices.length > 0 && (
              <Alert
                icon={<IconWifiOff size={20} />}
                title="Офлайн устройства"
                color="orange"
                variant="light"
                style={{
                  background: 'var(--theme-bg-primary)',
                  border: '1px solid var(--theme-border)'
                }}
              >
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text size="sm" c="var(--theme-text-secondary)" mb="xs">
                      {offlineDevices.length} {offlineDevices.length === 1 ? 'устройство' : offlineDevices.length < 5 ? 'устройства' : 'устройств'} не в сети
                    </Text>
                    {offlineDevices.slice(0, 3).map(device => (
                      <Text key={device.id} size="xs" c="var(--theme-text-tertiary)">
                        • {device.name} ({device.branchName})
                      </Text>
                    ))}
                    {offlineDevices.length > 3 && (
                      <Text size="xs" c="var(--theme-text-tertiary)" mt={4}>
                        и еще {offlineDevices.length - 3}...
                      </Text>
                    )}
                  </div>
                  {onNavigateToTab && (
                    <Button
                      size="xs"
                      variant="light"
                      rightSection={<IconArrowRight size={14} />}
                      onClick={() => onNavigateToTab('devices', { status: 'offline' })}
                    >
                      Перейти
                    </Button>
                  )}
                </Group>
              </Alert>
            )}
            
            {branchesWithAllOffline.length > 0 && (
              <Alert
                icon={<IconExclamationCircle size={20} />}
                title="Филиалы с офлайн устройствами"
                color="red"
                variant="light"
                style={{
                  background: 'var(--theme-bg-primary)',
                  border: '1px solid var(--theme-border)'
                }}
              >
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text size="sm" c="var(--theme-text-secondary)" mb="xs">
                      В {branchesWithAllOffline.length} {branchesWithAllOffline.length === 1 ? 'филиале' : branchesWithAllOffline.length < 5 ? 'филиалах' : 'филиалах'} все устройства офлайн:
                    </Text>
                    {branchesWithAllOffline.slice(0, 3).map(branch => (
                      <Text key={branch.uuid} size="xs" c="var(--theme-text-tertiary)">
                        • {branch.name} ({branch.deviceCount} {branch.deviceCount === 1 ? 'устройство' : 'устройств'})
                      </Text>
                    ))}
                    {branchesWithAllOffline.length > 3 && (
                      <Text size="xs" c="var(--theme-text-tertiary)" mt={4}>
                        и еще {branchesWithAllOffline.length - 3}...
                      </Text>
                    )}
                  </div>
                  {onNavigateToTab && (
                    <Button
                      size="xs"
                      variant="light"
                      rightSection={<IconArrowRight size={14} />}
                      onClick={() => onNavigateToTab('devices', { allOffline: true })}
                    >
                      Перейти
                    </Button>
                  )}
                </Group>
              </Alert>
            )}

            {branchesWithoutActiveStreams.length > 0 && (
              <Alert
                icon={<IconRadio size={20} />}
                title="Филиалы без активных потоков"
                color="yellow"
                variant="light"
                style={{
                  background: 'var(--theme-bg-primary)',
                  border: '1px solid var(--theme-border)'
                }}
              >
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text size="sm" c="var(--theme-text-secondary)" mb="xs">
                      {branchesWithoutActiveStreams.length} {branchesWithoutActiveStreams.length === 1 ? 'филиал' : branchesWithoutActiveStreams.length < 5 ? 'филиала' : 'филиалов'} без активных потоков:
                    </Text>
                    {branchesWithoutActiveStreams.slice(0, 3).map(branch => (
                      <Text key={branch.uuid} size="xs" c="var(--theme-text-tertiary)">
                        • {branch.name} ({branch.type})
                      </Text>
                    ))}
                    {branchesWithoutActiveStreams.length > 3 && (
                      <Text size="xs" c="var(--theme-text-tertiary)" mt={4}>
                        и еще {branchesWithoutActiveStreams.length - 3}...
                      </Text>
                    )}
                  </div>
                  {onNavigateToTab && (
                    <Button
                      size="xs"
                      variant="light"
                      rightSection={<IconArrowRight size={14} />}
                      onClick={() => onNavigateToTab('streams', { active: false })}
                    >
                      Перейти
                    </Button>
                  )}
                </Group>
              </Alert>
            )}

            {expiringStreams.length > 0 && (
              <Alert
                icon={<IconAlertTriangle size={20} />}
                title="Истекающие потоки"
                color="yellow"
                variant="light"
                style={{
                  background: 'var(--theme-bg-primary)',
                  border: '1px solid var(--theme-border)'
                }}
              >
                <Group justify="space-between" align="flex-start">
                  <Stack gap="xs" style={{ flex: 1 }}>
                    <Text size="sm" c="var(--theme-text-secondary)">
                      {expiringStreams.length} {expiringStreams.length === 1 ? 'поток' : expiringStreams.length < 5 ? 'потока' : 'потоков'} заканчивается в ближайшие 7 дней:
                    </Text>
                    {expiringStreams.slice(0, 3).map(stream => (
                      <Text key={stream.id} size="xs" c="var(--theme-text-tertiary)">
                        • {stream.name} — через {daysUntilExpiry(stream.endDate!)} {daysUntilExpiry(stream.endDate!) === 1 ? 'день' : daysUntilExpiry(stream.endDate!) < 5 ? 'дня' : 'дней'} ({formatDate(stream.endDate!)})
                      </Text>
                    ))}
                    {expiringStreams.length > 3 && (
                      <Text size="xs" c="var(--theme-text-tertiary)" mt={4}>
                        и еще {expiringStreams.length - 3}...
                      </Text>
                    )}
                  </Stack>
                  {onNavigateToTab && (
                    <Button
                      size="xs"
                      variant="light"
                      rightSection={<IconArrowRight size={14} />}
                      onClick={() => onNavigateToTab('streams', { expiring: true })}
                    >
                      Перейти
                    </Button>
                  )}
                </Group>
              </Alert>
            )}
          </Stack>
        </Paper>
      )}

      {/* Статистика */}
      {stats && (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
          <Card 
            p="md" 
            radius="lg" 
            shadow="sm"
            className="radio-stats-card"
            style={{
              background: 'var(--theme-bg-elevated)',
              border: '1px solid var(--theme-border)',
              position: 'relative',
              overflow: 'hidden',
              cursor: onNavigateToTab ? 'pointer' : 'default'
            }}
            onClick={() => onNavigateToTab && onNavigateToTab('devices')}
            onMouseEnter={(e) => {
              if (onNavigateToTab) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = 'var(--theme-shadow-md)';
              }
            }}
            onMouseLeave={(e) => {
              if (onNavigateToTab) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: 'linear-gradient(90deg, var(--color-primary-500), var(--color-primary-600))',
            }} />
            <Group gap="md" justify="space-between">
              <Group gap="md">
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'var(--theme-shadow-md)'
                }}>
                  <IconDeviceMobile size={24} color="white" />
                </div>
                <div>
                  <Text size="sm" fw={500} c="var(--theme-text-tertiary)">
                    Всего устройств
                  </Text>
                  <Text size="xl" fw={700} c="var(--theme-text-primary)">
                    {stats.totalDevices}
                  </Text>
                </div>
              </Group>
              {onNavigateToTab && (
                <IconExternalLink size={16} style={{ color: 'var(--theme-text-tertiary)', opacity: 0.6 }} />
              )}
            </Group>
          </Card>

          <Card 
            p="md" 
            radius="lg" 
            shadow="sm"
            className="radio-stats-card"
            style={{
              background: 'var(--theme-bg-elevated)',
              border: '1px solid var(--theme-border)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: 'linear-gradient(90deg, var(--color-success), #059669)',
            }} />
            <Group gap="md" justify="space-between">
              <Group gap="md">
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'linear-gradient(135deg, var(--color-success), #059669)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'var(--theme-shadow-md)'
                }}>
                  <IconCheck size={24} color="white" />
                </div>
                <div>
                  <Text size="sm" fw={500} c="var(--theme-text-tertiary)">
                    Активных
                  </Text>
                  <Text size="xl" fw={700} c="var(--theme-text-primary)">
                    {activeDevicesCount}
                  </Text>
                  {allDevices.length > 0 && (
                    <Text size="xs" c="var(--theme-text-tertiary)" mt={4}>
                      {activeDevicesPercentage}% от всех
                    </Text>
                  )}
                </div>
              </Group>
              {allDevices.length > 0 && (
                <RingProgress
                  size={60}
                  thickness={6}
                  sections={[{ value: activeDevicesPercentage, color: 'var(--color-success)' }]}
                  label={
                    <Text size="xs" ta="center" fw={700} c="var(--theme-text-primary)">
                      {activeDevicesPercentage}%
                    </Text>
                  }
                />
              )}
            </Group>
          </Card>

          <Card 
            p="md" 
            radius="lg" 
            shadow="sm"
            className="radio-stats-card"
            style={{
              background: 'var(--theme-bg-elevated)',
              border: '1px solid var(--theme-border)',
              position: 'relative',
              overflow: 'hidden',
              cursor: onNavigateToTab ? 'pointer' : 'default'
            }}
            onClick={() => onNavigateToTab && onNavigateToTab('streams', { active: true })}
            onMouseEnter={(e) => {
              if (onNavigateToTab) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = 'var(--theme-shadow-md)';
              }
            }}
            onMouseLeave={(e) => {
              if (onNavigateToTab) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: 'linear-gradient(90deg, var(--color-warning), #f59e0b)',
            }} />
            <Group gap="md" justify="space-between">
              <Group gap="md">
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'linear-gradient(135deg, var(--color-warning), #f59e0b)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'var(--theme-shadow-md)'
                }}>
                  <IconRadio size={24} color="white" />
                </div>
                <div>
                  <Text size="sm" fw={500} c="var(--theme-text-tertiary)">
                    Активных потоков
                  </Text>
                  <Text size="xl" fw={700} c="var(--theme-text-primary)">
                    {activeStreams.length}
                  </Text>
                  {radioStreams.length > 0 && (
                    <Text size="xs" c="var(--theme-text-tertiary)" mt={4}>
                      {activeStreamsPercentage}% от всех
                    </Text>
                  )}
                </div>
              </Group>
              {radioStreams.length > 0 && (
                <RingProgress
                  size={60}
                  thickness={6}
                  sections={[{ value: activeStreamsPercentage, color: 'var(--color-warning)' }]}
                  label={
                    <Text size="xs" ta="center" fw={700} c="var(--theme-text-primary)">
                      {activeStreamsPercentage}%
                    </Text>
                  }
                />
              )}
              {onNavigateToTab && (
                <IconExternalLink size={16} style={{ color: 'var(--theme-text-tertiary)', opacity: 0.6 }} />
              )}
            </Group>
          </Card>

          <Card 
            p="md" 
            radius="lg" 
            shadow="sm"
            className="radio-stats-card"
            style={{
              background: 'var(--theme-bg-elevated)',
              border: '1px solid var(--theme-border)',
              position: 'relative',
              overflow: 'hidden',
              cursor: onNavigateToTab ? 'pointer' : 'default'
            }}
            onClick={() => onNavigateToTab && onNavigateToTab('music')}
            onMouseEnter={(e) => {
              if (onNavigateToTab) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = 'var(--theme-shadow-md)';
              }
            }}
            onMouseLeave={(e) => {
              if (onNavigateToTab) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: 'linear-gradient(90deg, var(--color-primary-500), var(--color-primary-600))',
            }} />
            <Group gap="md" justify="space-between">
              <Group gap="md">
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'var(--theme-shadow-md)'
                }}>
                  <IconMusic size={24} color="white" />
                </div>
                <div>
                  <Text size="sm" fw={500} c="var(--theme-text-tertiary)">
                    Музыкальных файлов
                  </Text>
                  <Text size="xl" fw={700} c="var(--theme-text-primary)">
                    {stats.totalMusicFiles}
                  </Text>
                  {musicStatus && (
                    <Text size="xs" c="var(--theme-text-tertiary)" mt={4}>
                      Папка: {formatMonthFolder(musicStatus.shouldWarn ? (musicStatus.nextMonthFolder || '') : (musicStatus.currentMonthFolder || ''))}
                    </Text>
                  )}
                </div>
              </Group>
              {onNavigateToTab && (
                <IconExternalLink size={16} style={{ color: 'var(--theme-text-tertiary)', opacity: 0.6 }} />
              )}
            </Group>
          </Card>
        </SimpleGrid>
      )}

      {/* Статистика филиалов по типам */}
      {stats && (
        <Paper 
          p="md" 
          radius="lg" 
          shadow="sm"
          style={{
            background: 'var(--theme-bg-elevated)',
            border: '1px solid var(--theme-border)'
          }}
        >
          <Title order={4} mb="md" c="var(--theme-text-primary)">
            Филиалы по типам
          </Title>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            <Card 
              p="md" 
              radius="md" 
              style={{
                background: 'var(--theme-bg-primary)',
                border: '1px solid var(--theme-border)'
              }}
            >
              <Group gap="sm">
                <IconBuilding size={24} style={{ color: 'var(--color-primary-500)' }} />
                <div>
                  <Text size="sm" fw={500} c="var(--theme-text-tertiary)">
                    Магазин
                  </Text>
                  <Text size="lg" fw={700} c="var(--theme-text-primary)">
                    {branchesByType.stores}
                  </Text>
                </div>
              </Group>
            </Card>
            <Card 
              p="md" 
              radius="md" 
              style={{
                background: 'var(--theme-bg-primary)',
                border: '1px solid var(--theme-border)'
              }}
            >
              <Group gap="sm">
                <IconBuilding size={24} style={{ color: 'var(--color-primary-500)' }} />
                <div>
                  <Text size="sm" fw={500} c="var(--theme-text-tertiary)">
                    Дисконт центр
                  </Text>
                  <Text size="lg" fw={700} c="var(--theme-text-primary)">
                    {branchesByType.discountCenters}
                  </Text>
                </div>
              </Group>
            </Card>
            <Card 
              p="md" 
              radius="md" 
              style={{
                background: 'var(--theme-bg-primary)',
                border: '1px solid var(--theme-border)'
              }}
            >
              <Group gap="sm">
                <IconBuilding size={24} style={{ color: 'var(--color-primary-500)' }} />
                <div>
                  <Text size="sm" fw={500} c="var(--theme-text-tertiary)">
                    Всего филиалов
                  </Text>
                  <Text size="lg" fw={700} c="var(--theme-text-primary)">
                    {branchesByType.total}
                  </Text>
                </div>
              </Group>
            </Card>
          </SimpleGrid>
        </Paper>
      )}

      {/* Статистика потоков по типам */}
      {Object.keys(streamsByBranchType).length > 0 && (
        <Paper 
          p="md" 
          radius="lg" 
          shadow="sm"
          style={{
            background: 'var(--theme-bg-elevated)',
            border: '1px solid var(--theme-border)'
          }}
        >
          <Group justify="space-between" mb="md">
            <Title order={4} c="var(--theme-text-primary)">
              Потоки по типам филиалов
            </Title>
            <Badge color="blue" variant="light">
              {activeStreams.length} активных
            </Badge>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {Object.entries(streamsByBranchType).map(([type, count]) => (
              <Card 
                key={type}
                p="md" 
                radius="md" 
                style={{
                  background: 'var(--theme-bg-primary)',
                  border: '1px solid var(--theme-border)'
                }}
              >
                <Group gap="sm">
                  <IconRadio size={24} style={{ color: 'var(--color-primary-500)' }} />
                  <div>
                    <Text size="sm" fw={500} c="var(--theme-text-tertiary)">
                      {type}
                    </Text>
                    <Text size="lg" fw={700} c="var(--theme-text-primary)">
                      {count}
                    </Text>
                  </div>
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        </Paper>
      )}

      {/* Проблемные филиалы */}
      {(branchesWithAllOffline.length > 0 || branchesWithoutActiveStreams.length > 0) && (
        <Paper 
          p="md" 
          radius="lg" 
          shadow="sm"
          style={{
            background: 'var(--theme-bg-elevated)',
            border: '1px solid var(--theme-border)'
          }}
        >
          <Group justify="space-between" mb="md">
            <Title order={4} c="var(--theme-text-primary)">
              Проблемные филиалы
            </Title>
            <Badge color="red" variant="light" size="lg">
              {branchesWithAllOffline.length + branchesWithoutActiveStreams.length}
            </Badge>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {branchesWithAllOffline.length > 0 && (
              <Card p="md" radius="md" style={{
                background: 'var(--theme-bg-primary)',
                border: '1px solid var(--color-error)',
                borderLeftWidth: '4px'
              }}>
                <Group gap="sm" mb="xs">
                  <IconWifiOff size={20} style={{ color: 'var(--color-error)' }} />
                  <Text fw={600} size="sm" c="var(--theme-text-primary)">
                    Все устройства офлайн
                  </Text>
                </Group>
                <Stack gap="xs">
                  {branchesWithAllOffline.slice(0, 5).map(branch => (
                    <Group key={branch.uuid} justify="space-between">
                      <Text size="xs" c="var(--theme-text-secondary)">
                        {branch.name}
                      </Text>
                      <Badge size="xs" color="red" variant="light">
                        {branch.deviceCount} устройств
                      </Badge>
                    </Group>
                  ))}
                  {branchesWithAllOffline.length > 5 && (
                    <Text size="xs" c="var(--theme-text-tertiary)" mt="xs">
                      и еще {branchesWithAllOffline.length - 5}...
                    </Text>
                  )}
                  {onNavigateToTab && (
                    <Button
                      size="xs"
                      variant="light"
                      color="red"
                      rightSection={<IconArrowRight size={14} />}
                      onClick={() => onNavigateToTab('devices', { allOffline: true })}
                      mt="xs"
                    >
                      Показать все
                    </Button>
                  )}
                </Stack>
              </Card>
            )}
            {branchesWithoutActiveStreams.length > 0 && (
              <Card p="md" radius="md" style={{
                background: 'var(--theme-bg-primary)',
                border: '1px solid var(--color-warning)',
                borderLeftWidth: '4px'
              }}>
                <Group gap="sm" mb="xs">
                  <IconRadio size={20} style={{ color: 'var(--color-warning)' }} />
                  <Text fw={600} size="sm" c="var(--theme-text-primary)">
                    Без активных потоков
                  </Text>
                </Group>
                <Stack gap="xs">
                  {branchesWithoutActiveStreams.slice(0, 5).map(branch => (
                    <Group key={branch.uuid} justify="space-between">
                      <Text size="xs" c="var(--theme-text-secondary)">
                        {branch.name}
                      </Text>
                      <Badge size="xs" color="yellow" variant="light">
                        {branch.type}
                      </Badge>
                    </Group>
                  ))}
                  {branchesWithoutActiveStreams.length > 5 && (
                    <Text size="xs" c="var(--theme-text-tertiary)" mt="xs">
                      и еще {branchesWithoutActiveStreams.length - 5}...
                    </Text>
                  )}
                  {onNavigateToTab && (
                    <Button
                      size="xs"
                      variant="light"
                      color="yellow"
                      rightSection={<IconArrowRight size={14} />}
                      onClick={() => onNavigateToTab('streams', { active: false })}
                      mt="xs"
                    >
                      Показать все
                    </Button>
                  )}
                </Stack>
              </Card>
            )}
          </SimpleGrid>
        </Paper>
      )}

      {/* Топ филиалов по устройствам */}
      {topBranchesByDevices.length > 0 && (
        <Paper 
          p="md" 
          radius="lg" 
          shadow="sm"
          style={{
            background: 'var(--theme-bg-elevated)',
            border: '1px solid var(--theme-border)'
          }}
        >
          <Group justify="space-between" mb="md">
            <Title order={4} c="var(--theme-text-primary)">
              Топ филиалов по устройствам
            </Title>
            <IconChartBar size={20} style={{ color: 'var(--theme-text-secondary)' }} />
          </Group>
          <Stack gap="sm">
            {topBranchesByDevices.map((branch, index) => {
              const onlinePercentage = branch.deviceCount > 0 
                ? Math.round((branch.onlineCount / branch.deviceCount) * 100)
                : 0;
              
              return (
                <Group 
                  key={branch.uuid} 
                  justify="space-between" 
                  p="sm" 
                  style={{
                    background: 'var(--theme-bg-primary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--theme-border)',
                    cursor: onNavigateToTab ? 'pointer' : 'default',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => onNavigateToTab && onNavigateToTab('devices', { branchId: branch.uuid })}
                  onMouseEnter={(e) => {
                    if (onNavigateToTab) {
                      e.currentTarget.style.transform = 'translateX(4px)';
                      e.currentTarget.style.boxShadow = 'var(--theme-shadow-sm)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (onNavigateToTab) {
                      e.currentTarget.style.transform = 'translateX(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                >
                  <Group gap="sm" style={{ flex: 1 }}>
                    <Badge size="lg" variant="light" color="blue">
                      {index + 1}
                    </Badge>
                    <div style={{ flex: 1 }}>
                      <Text fw={500} size="sm" c="var(--theme-text-primary)">
                        {branch.name}
                      </Text>
                      <Text size="xs" c="var(--theme-text-secondary)">
                        {branch.type}
                      </Text>
                      {branch.deviceCount > 0 && (
                        <Group gap={4} mt={4}>
                          <RingProgress
                            size={40}
                            thickness={4}
                            sections={[{ value: onlinePercentage, color: onlinePercentage >= 80 ? 'green' : onlinePercentage >= 50 ? 'yellow' : 'red' }]}
                            label={
                              <Text size="xs" ta="center" fw={700}>
                                {onlinePercentage}%
                              </Text>
                            }
                          />
                          <Text size="xs" c="var(--theme-text-tertiary)">
                            онлайн
                          </Text>
                        </Group>
                      )}
                    </div>
                  </Group>
                  <Group gap="xs">
                    <Badge color="green" variant="light" size="sm">
                      {branch.onlineCount} онлайн
                    </Badge>
                    <Badge color="gray" variant="light" size="sm">
                      {branch.deviceCount} всего
                    </Badge>
                    {onNavigateToTab && (
                      <IconExternalLink size={14} style={{ color: 'var(--theme-text-tertiary)', opacity: 0.6 }} />
                    )}
                  </Group>
                </Group>
              );
            })}
          </Stack>
        </Paper>
      )}

      {/* Последние события */}
      {recentEvents.length > 0 && (
        <Paper 
          p="md" 
          radius="lg" 
          shadow="sm"
          style={{
            background: 'var(--theme-bg-elevated)',
            border: '1px solid var(--theme-border)'
          }}
        >
          <Group justify="space-between" mb="md">
            <Title order={4} c="var(--theme-text-primary)">
              Последние события
            </Title>
            <Badge color="blue" variant="light">
              {recentEvents.length}
            </Badge>
          </Group>
          <Timeline active={-1} bulletSize={24} lineWidth={2}>
            {recentEvents.map((event) => (
              <Timeline.Item
                key={event.id}
                bullet={
                  event.type === 'stream_created' ? (
                    <IconPlus size={12} />
                  ) : (
                    <IconRadio size={12} />
                  )
                }
                title={
                  <Text size="sm" fw={500} c="var(--theme-text-primary)">
                    {event.title}
                  </Text>
                }
              >
                <Text size="xs" c="var(--theme-text-secondary)" mt={4}>
                  {event.description}
                </Text>
                <Text size="xs" c="var(--theme-text-tertiary)" mt={2}>
                  <IconClock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  {formatRelativeTime(event.date)}
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </Paper>
      )}

      {/* Быстрые действия */}
      {hasFullAccess && (
        <Paper 
          p="md" 
          radius="lg" 
          shadow="sm"
          style={{
            background: 'var(--theme-bg-elevated)',
            border: '1px solid var(--theme-border)'
          }}
        >
          <Title order={4} mb="md" c="var(--theme-text-primary)">
            Быстрые действия
          </Title>
          <Group gap="md" grow style={{ width: '100%' }}>
            <Button
              leftSection={<IconPlus size={20} />}
              onClick={onCreateStream}
              size="lg"
              variant="light"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                color: 'white',
                border: 'none',
                height: '80px',
                justifyContent: 'flex-start',
                flex: 1,
                minWidth: 0
              }}
            >
              <Stack gap="xs" align="flex-start" style={{ width: '100%' }}>
                <Text fw={600} size="md">Создать поток</Text>
                <Text size="xs" opacity={0.9}>Добавить новый радио поток</Text>
              </Stack>
            </Button>

            <Button
              leftSection={<IconUpload size={20} />}
              onClick={onUploadMusic}
              size="lg"
              variant="light"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                color: 'white',
                border: 'none',
                height: '80px',
                justifyContent: 'flex-start',
                flex: 1,
                minWidth: 0
              }}
            >
              <Stack gap="xs" align="flex-start" style={{ width: '100%' }}>
                <Text fw={600} size="md">Загрузить музыку</Text>
                <Text size="xs" opacity={0.9}>Добавить MP3 файлы</Text>
              </Stack>
            </Button>

            {onAddDevice && (
              <Button
                leftSection={<IconQrcode size={20} />}
                onClick={onAddDevice}
                size="lg"
                variant="light"
                style={{
                  background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                  color: 'white',
                  border: 'none',
                  height: '80px',
                  justifyContent: 'flex-start',
                  flex: 1,
                  minWidth: 0
                }}
              >
                <Stack gap="xs" align="flex-start" style={{ width: '100%' }}>
                  <Text fw={600} size="md">Добавить устройство</Text>
                  <Text size="xs" opacity={0.9}>QR код для регистрации</Text>
                </Stack>
              </Button>
            )}
          </Group>
        </Paper>
      )}

      {/* Активные потоки */}
      {activeStreams.length > 0 && (
        <Paper 
          p="md" 
          radius="lg" 
          shadow="sm"
          style={{
            background: 'var(--theme-bg-elevated)',
            border: '1px solid var(--theme-border)'
          }}
        >
          <Group justify="space-between" mb="md">
            <Title order={4} c="var(--theme-text-primary)">
              Активные потоки
            </Title>
            <Badge color="green" variant="light">
              {activeStreams.length}
            </Badge>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {activeStreams.slice(0, 6).map(stream => {
              const isExpiring = expiringStreams.some(s => s.id === stream.id);
              const daysLeft = stream.endDate ? daysUntilExpiry(stream.endDate) : null;
              
              return (
                <Card
                  key={stream.id}
                  p="md"
                  radius="md"
                  style={{
                    background: 'var(--theme-bg-primary)',
                    border: `1px solid ${isExpiring ? 'var(--color-warning)' : 'var(--theme-border)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = 'var(--theme-shadow-md)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  onClick={() => onNavigateToTab && onNavigateToTab('streams', { streamId: stream.id })}
                >
                  {isExpiring && (
                    <Badge
                      size="xs"
                      color="yellow"
                      variant="filled"
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        zIndex: 1
                      }}
                    >
                      <IconAlertTriangle size={12} style={{ marginRight: 4 }} />
                      {daysLeft} {daysLeft === 1 ? 'день' : daysLeft! < 5 ? 'дня' : 'дней'}
                    </Badge>
                  )}
                  <Group gap="sm" align="flex-start" justify="space-between">
                    <Group gap="sm" align="flex-start" style={{ flex: 1 }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: 'var(--radius-md)',
                        background: isExpiring 
                          ? 'linear-gradient(135deg, var(--color-warning), #f59e0b)'
                          : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <IconRadio size={20} color="white" />
                      </div>
                      <Stack gap="xs" style={{ flex: 1 }}>
                        <Text fw={600} size="sm" c="var(--theme-text-primary)">
                          {stream.name}
                        </Text>
                        <Badge size="xs" variant="light" color="blue">
                          {stream.branchTypeOfDist}
                        </Badge>
                        {stream.endDate && (
                          <Group gap={4} align="center" mt={4}>
                            <IconCalendar size={12} style={{ color: 'var(--theme-text-tertiary)' }} />
                            <Text size="xs" c="var(--theme-text-tertiary)">
                              До {formatDate(stream.endDate)}
                            </Text>
                          </Group>
                        )}
                      </Stack>
                    </Group>
                    {onNavigateToTab && (
                      <IconExternalLink size={14} style={{ color: 'var(--theme-text-tertiary)', opacity: 0.6 }} />
                    )}
                  </Group>
                </Card>
              );
            })}
          </SimpleGrid>
        </Paper>
      )}

      {/* Устройства по филиалам */}
      {branchesWithDevices.length > 0 && (
        <Paper 
          p="md" 
          radius="lg" 
          shadow="sm"
          style={{
            background: 'var(--theme-bg-elevated)',
            border: '1px solid var(--theme-border)'
          }}
        >
          <Group justify="space-between" mb="md">
            <Title order={4} c="var(--theme-text-primary)">
              Устройства по филиалам
            </Title>
            {branchesWithDevices.length > 1 && (
              <Group gap="xs">
                <Button
                  variant="subtle"
                  size="xs"
                  leftSection={<IconChevronDown size={14} />}
                  onClick={onExpandAll}
                >
                  Развернуть все
                </Button>
                <Button
                  variant="subtle"
                  size="xs"
                  leftSection={<IconChevronRight size={14} />}
                  onClick={onCollapseAll}
                >
                  Свернуть все
                </Button>
              </Group>
            )}
          </Group>

          <Stack gap="md">
            {branchesWithDevices
              .sort((a, b) => {
                if (user && a.branch.name === user.branch) return -1;
                if (user && b.branch.name === user.branch) return 1;
                return a.branch.name.localeCompare(b.branch.name);
              })
              .map((branchData) => {
                const uniqueDevices = branchData.devices.filter((device, index, self) => 
                  index === self.findIndex(d => d.id === device.id)
                );
                const isExpanded = expandedBranches.has(branchData.branch.uuid);
                const onlineCount = uniqueDevices.filter(device => statusMap[device.id]).length;

                return (
                  <Card
                    key={branchData.branch.uuid}
                    p="md"
                    radius="md"
                    style={{
                      background: 'var(--theme-bg-primary)',
                      border: '1px solid var(--theme-border)',
                      borderColor: user && branchData.branch.name === user.branch 
                        ? 'var(--color-primary-500)' 
                        : 'var(--theme-border)',
                      borderWidth: user && branchData.branch.name === user.branch ? '2px' : '1px'
                    }}
                  >
                    <Group justify="space-between" mb={isExpanded ? "md" : 0}>
                      <Group gap="sm" style={{ flex: 1 }}>
                        {branchesWithDevices.length > 1 && (
                          <Button
                            variant="subtle"
                            size="xs"
                            p={4}
                            onClick={() => onToggleBranch(branchData.branch.uuid)}
                            style={{
                              color: 'var(--theme-text-secondary)',
                              minWidth: 'auto',
                              height: 'auto'
                            }}
                          >
                            {isExpanded ? 
                              <IconChevronDown size={16} /> : 
                              <IconChevronRight size={16} />
                            }
                          </Button>
                        )}
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: 'var(--radius-md)',
                          background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <IconBuilding size={20} color="white" />
                        </div>
                        <div>
                          <Group gap="xs" align="center">
                            <Text fw={600} size="sm" c="var(--theme-text-primary)">
                              {branchData.branch.name}
                            </Text>
                            {user && branchData.branch.name === user.branch && (
                              <Badge size="xs" color="blue" variant="light">
                                Ваш филиал
                              </Badge>
                            )}
                          </Group>
                          <Text size="xs" c="var(--theme-text-secondary)">
                            {branchData.branch.typeOfDist}
                          </Text>
                        </div>
                      </Group>
                      <Badge 
                        color="blue" 
                        variant="light"
                        size="lg"
                      >
                        {onlineCount}/{uniqueDevices.length}
                      </Badge>
                    </Group>

                    {isExpanded && (
                      <Stack gap="sm" mt="md">
                        {uniqueDevices.map((device) => {
                          const online = !!statusMap[device.id];
                          return (
                            <Box
                              key={device.id}
                              p="sm"
                              style={{
                                background: 'var(--theme-bg-elevated)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--theme-border)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                              }}
                              onClick={() => onDeviceClick(device)}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateX(4px)';
                                e.currentTarget.style.boxShadow = 'var(--theme-shadow-sm)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateX(0)';
                                e.currentTarget.style.boxShadow = 'none';
                              }}
                            >
                              <Group justify="space-between" align="center">
                                <div>
                                  <Group gap="xs" align="center">
                                    <Text fw={500} size="sm" c="var(--theme-text-primary)">
                                      {device.name}
                                    </Text>
                                  </Group>
                                  <Text size="xs" c="var(--theme-text-secondary)">
                                    {device.network}{device.number} • {device.os} • {device.app}
                                  </Text>
                                  {device.user && (
                                    <Text size="xs" c="var(--theme-text-tertiary)" style={{ fontStyle: 'italic', marginTop: '2px' }}>
                                      👤 {device.user.name || device.user.login}
                                    </Text>
                                  )}
                                </div>
                                <Badge 
                                  size="sm" 
                                  color={online ? 'green' : 'gray'} 
                                  variant="filled"
                                >
                                  {online ? 'Онлайн' : 'Оффлайн'}
                                </Badge>
                              </Group>
                            </Box>
                          );
                        })}
                      </Stack>
                    )}
                  </Card>
                );
              })}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
};

export default RadioDashboard;

