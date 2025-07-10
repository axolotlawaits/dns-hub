import { Tabs } from "@mantine/core"
import { useState } from "react"
import LoadersRoutes from "./LoadersRoutes"
import LoadersSummary from "./LoadersSummary"

function LoadersHome() {
  const [activeTab, setActiveTab] = useState<string | null>('routes')
  
  return (
    <Tabs 
      value={activeTab} 
      onChange={setActiveTab} 
      styles={{ panel: { padding: '20px' }}}
    >
      <Tabs.List grow>
        <Tabs.Tab value="routes">Маршруты</Tabs.Tab>
        <Tabs.Tab value="summaries">Отчеты</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="routes">
        <LoadersRoutes />
      </Tabs.Panel>
      <Tabs.Panel value="summaries">
        <LoadersSummary />
      </Tabs.Panel>
    </Tabs>
  )
}

export default LoadersHome