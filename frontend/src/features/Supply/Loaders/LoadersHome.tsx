import { Tabs, Box, Title, Text, Group, Button, Card } from "@mantine/core"
import { useState, useMemo } from "react"
import { IconTruck, IconChartBar, IconPlus, IconUsers, IconRoute, IconClock } from "@tabler/icons-react"
import LoadersRoutes from "./LoadersRoutes"
import LoadersSummary from "./LoadersSummary"

function LoadersHome() {
  const [activeTab, setActiveTab] = useState<string | null>('routes')
  
  // Моковые данные для статистики
  const stats = useMemo(() => ({
    totalRoutes: 12,
    activeLoaders: 8,
    completedToday: 15,
    totalHours: 120
  }), [])
  
  return (
    <Box p="md" style={{ background: 'var(--theme-bg-primary)', minHeight: '100vh' }}>
      {/* Современный заголовок */}
      <Box mb="xl" style={{ 
        background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid var(--theme-border-primary)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <Group justify="space-between" mb="md">
          <Group gap="md">
            <Box style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '12px',
              padding: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <IconTruck size={24} color="white" />
            </Box>
            <Box>
              <Title order={1} style={{ color: 'var(--theme-text-primary)', margin: 0 }}>
                Управление грузчиками
              </Title>
              <Text size="sm" c="var(--theme-text-secondary)" mt={4}>
                Планирование маршрутов и контроль работы грузчиков
              </Text>
            </Box>
          </Group>
          <Button
            size="md"
            variant="gradient"
            gradient={{ from: 'blue', to: 'cyan' }}
            leftSection={<IconPlus size={16} />}
          >
            Создать маршрут
          </Button>
        </Group>

        {/* Статистика */}
        <Group gap="lg" mb="md">
          <Card style={{
            background: 'var(--theme-bg-primary)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--theme-border-secondary)',
            textAlign: 'center',
            minWidth: '120px',
            flex: 1
          }}>
            <Group gap="sm" justify="center" mb="sm">
              <Box style={{
                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                borderRadius: '8px',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <IconRoute size={16} color="white" />
              </Box>
              <Text size="sm" fw={600} c="var(--theme-text-primary)">Маршруты</Text>
            </Group>
            <Text size="xl" fw={700} c="var(--theme-text-primary)">
              {stats.totalRoutes}
            </Text>
            <Text size="xs" c="var(--theme-text-secondary)">
              Всего маршрутов
            </Text>
          </Card>

          <Card style={{
            background: 'var(--theme-bg-primary)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--theme-border-secondary)',
            textAlign: 'center',
            minWidth: '120px',
            flex: 1
          }}>
            <Group gap="sm" justify="center" mb="sm">
              <Box style={{
                background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                borderRadius: '8px',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <IconUsers size={16} color="white" />
              </Box>
              <Text size="sm" fw={600} c="var(--theme-text-primary)">Грузчики</Text>
            </Group>
            <Text size="xl" fw={700} c="var(--theme-text-primary)">
              {stats.activeLoaders}
            </Text>
            <Text size="xs" c="var(--theme-text-secondary)">
              Активных
            </Text>
          </Card>

          <Card style={{
            background: 'var(--theme-bg-primary)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--theme-border-secondary)',
            textAlign: 'center',
            minWidth: '120px',
            flex: 1
          }}>
            <Group gap="sm" justify="center" mb="sm">
              <Box style={{
                background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
                borderRadius: '8px',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <IconChartBar size={16} color="white" />
              </Box>
              <Text size="sm" fw={600} c="var(--theme-text-primary)">Выполнено</Text>
            </Group>
            <Text size="xl" fw={700} c="var(--theme-text-primary)">
              {stats.completedToday}
            </Text>
            <Text size="xs" c="var(--theme-text-secondary)">
              Сегодня
            </Text>
          </Card>

          <Card style={{
            background: 'var(--theme-bg-primary)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--theme-border-secondary)',
            textAlign: 'center',
            minWidth: '120px',
            flex: 1
          }}>
            <Group gap="sm" justify="center" mb="sm">
              <Box style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '8px',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <IconClock size={16} color="white" />
              </Box>
              <Text size="sm" fw={600} c="var(--theme-text-primary)">Часы</Text>
            </Group>
            <Text size="xl" fw={700} c="var(--theme-text-primary)">
              {stats.totalHours}
            </Text>
            <Text size="xs" c="var(--theme-text-secondary)">
              Отработано
            </Text>
          </Card>
        </Group>
      </Box>

      {/* Основной контент */}
      <Card style={{
        background: 'var(--theme-bg-elevated)',
        borderRadius: '16px',
        border: '1px solid var(--theme-border-primary)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        <Tabs 
          value={activeTab} 
          onChange={setActiveTab}
          styles={{
            list: {
              background: 'var(--theme-bg-secondary)',
              borderBottom: '1px solid var(--theme-border-primary)',
              padding: '0 24px'
            },
            panel: { 
              padding: '24px',
              background: 'var(--theme-bg-elevated)'
            }
          }}
        >
          <Tabs.List>
            <Tabs.Tab 
              value="routes" 
              leftSection={<IconRoute size={16} />}
              style={{
                fontWeight: activeTab === 'routes' ? 600 : 400,
                color: activeTab === 'routes' ? 'var(--theme-text-primary)' : 'var(--theme-text-secondary)'
              }}
            >
              Маршруты
            </Tabs.Tab>
            <Tabs.Tab 
              value="summaries" 
              leftSection={<IconChartBar size={16} />}
              style={{
                fontWeight: activeTab === 'summaries' ? 600 : 400,
                color: activeTab === 'summaries' ? 'var(--theme-text-primary)' : 'var(--theme-text-secondary)'
              }}
            >
              Отчеты
            </Tabs.Tab>
          </Tabs.List>
          
          <Tabs.Panel value="routes">
            <LoadersRoutes />
          </Tabs.Panel>
          
          <Tabs.Panel value="summaries">
            <LoadersSummary />
          </Tabs.Panel>
        </Tabs>
      </Card>
    </Box>
  )
}

export default LoadersHome