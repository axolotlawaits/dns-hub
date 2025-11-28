import React, { useMemo } from 'react';
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
  Card
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
  IconAlertCircle
} from '@tabler/icons-react';

interface RadioDashboardProps {
  stats: {
    totalDevices: number;
    activeDevices: number;
    totalBranches: number;
    totalMusicFiles: number;
  } | null;
  radioStreams: Array<{
    id: string;
    name: string;
    branchTypeOfDist: string;
    isActive: boolean;
    startDate: string;
    endDate?: string;
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
  statusMap: Record<string, boolean>;
  expandedBranches: Set<string>;
  onToggleBranch: (branchId: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onCreateStream: () => void;
  onUploadMusic: () => void;
  onDeviceClick: (device: any) => void;
  hasFullAccess: boolean;
  user?: {
    branch?: string;
  } | null;
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
  hasFullAccess,
  user
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

  // Форматирование времени
  const formatTime = (time: string) => {
    if (!time) return '';
    const parts = time.split(':');
    return `${parts[0]}:${parts[1]}`;
  };

  return (
    <Stack gap="lg">
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
              overflow: 'hidden'
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
              </div>
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
              background: 'linear-gradient(90deg, var(--color-warning), #f59e0b)',
            }} />
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
              </div>
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
              background: 'linear-gradient(90deg, var(--color-primary-500), var(--color-primary-600))',
            }} />
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
              </div>
            </Group>
          </Card>
        </SimpleGrid>
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
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
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
                justifyContent: 'flex-start'
              }}
            >
              <Stack gap="xs" align="flex-start">
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
                justifyContent: 'flex-start'
              }}
            >
              <Stack gap="xs" align="flex-start">
                <Text fw={600} size="md">Загрузить музыку</Text>
                <Text size="xs" opacity={0.9}>Добавить MP3 файлы</Text>
              </Stack>
            </Button>
          </SimpleGrid>
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
            {activeStreams.slice(0, 6).map(stream => (
              <Card
                key={stream.id}
                p="md"
                radius="md"
                style={{
                  background: 'var(--theme-bg-primary)',
                  border: '1px solid var(--theme-border)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = 'var(--theme-shadow-md)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <Group gap="sm" align="flex-start">
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: 'var(--radius-md)',
                    background: 'linear-gradient(135deg, var(--color-warning), #f59e0b)',
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
                    <Text size="xs" c="var(--theme-text-secondary)">
                      {stream.branchTypeOfDist}
                    </Text>
                  </Stack>
                </Group>
              </Card>
            ))}
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

