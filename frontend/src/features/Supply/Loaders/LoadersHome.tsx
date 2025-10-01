import { Tabs, Box, Card, Text } from "@mantine/core"
import { useState, useEffect } from "react"
import { IconChartBar, IconRoute} from "@tabler/icons-react"
import LoadersRoutes from "./LoadersRoutes"
import LoadersSummary from "./LoadersSummary"
import { usePageHeader } from "../../../contexts/PageHeaderContext"

function LoadersHome() {
  const { setHeader, clearHeader } = usePageHeader();
  const [activeTab, setActiveTab] = useState<string | null>('routes')

  // Устанавливаем заголовок страницы
  useEffect(() => {
    setHeader({
      title: 'Управление грузчиками',
      subtitle: 'Планирование маршрутов и контроль работы грузчиков',
      icon: <Text size="xl" fw={700} c="white">🚛</Text>
    });

    return () => clearHeader();
  }, [setHeader, clearHeader]);
  
  return (
    <Box p="md" style={{ background: 'var(--theme-bg-primary)', minHeight: '100vh' }}>
      
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