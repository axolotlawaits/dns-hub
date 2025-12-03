import { useState } from 'react';
import { Tabs, Box, Card } from '@mantine/core';
import { IconTerminal, IconMessageCircle, IconBug } from '@tabler/icons-react';
import LogViewer from '../../components/LogViewer';
import FeedbackModule from '../../features/Feedback/Feedback';
import BugReports from '../../features/Retail/BugReports/BugReports';

function AdminPanel() {
  const [activeTab, setActiveTab] = useState<string | null>('logs');

  return (
    <Box style={{ width: '100%' }}>
      <Card shadow="sm" radius="lg" p="md" mb="lg">
        <Tabs 
          value={activeTab} 
          onChange={setActiveTab}
          variant="pills"
        >
          <Tabs.List>
            <Tabs.Tab 
              value="logs" 
              leftSection={<IconTerminal size={18} />}
            >
              Логи
            </Tabs.Tab>
            <Tabs.Tab 
              value="feedback" 
              leftSection={<IconMessageCircle size={18} />}
            >
              Обратная связь
            </Tabs.Tab>
            <Tabs.Tab 
              value="bugreports" 
              leftSection={<IconBug size={18} />}
            >
              Отчеты об ошибках
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Card>

      <Box>
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.Panel value="logs">
            <LogViewer />
          </Tabs.Panel>
          <Tabs.Panel value="feedback">
            <FeedbackModule />
          </Tabs.Panel>
          <Tabs.Panel value="bugreports">
            <BugReports />
          </Tabs.Panel>
        </Tabs>
      </Box>
    </Box>
  );
}

export default AdminPanel;

