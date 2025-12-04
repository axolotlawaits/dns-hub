import { useState, useEffect } from 'react';
import { Tabs, Box, Card } from '@mantine/core';
import { IconTerminal, IconMessageCircle, IconBug, IconTags, IconMenu2, IconBuilding, IconUsers, IconActivity } from '@tabler/icons-react';
import LogViewer from '../../components/LogViewer';
import FeedbackModule from '../../features/Feedback/Feedback';
import BugReports from '../../features/Retail/BugReports/BugReports';
import TypesManagement from './components/TypesManagement';
import NavigationManagement from './components/NavigationManagement';
import BranchesManagement from './components/BranchesManagement';
import UsersManagement from './components/UsersManagement';
import SystemLoad from './components/SystemLoad';

interface AdminPanelProps {
  initialTab?: string;
}

function AdminPanel({ initialTab = 'logs' }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<string | null>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

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
            <Tabs.Tab 
              value="types" 
              leftSection={<IconTags size={18} />}
            >
              Типы
            </Tabs.Tab>
            <Tabs.Tab 
              value="navigation" 
              leftSection={<IconMenu2 size={18} />}
            >
              Пункты меню
            </Tabs.Tab>
            <Tabs.Tab 
              value="branches" 
              leftSection={<IconBuilding size={18} />}
            >
              Филиалы
            </Tabs.Tab>
            <Tabs.Tab 
              value="users" 
              leftSection={<IconUsers size={18} />}
            >
              Пользователи
            </Tabs.Tab>
            <Tabs.Tab 
              value="system" 
              leftSection={<IconActivity size={18} />}
            >
              Нагрузка на систему
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Card>

      <Box>
        <Tabs value={activeTab} onChange={setActiveTab}>
          {activeTab === 'logs' && (
            <Tabs.Panel value="logs">
              <LogViewer />
            </Tabs.Panel>
          )}
          {activeTab === 'feedback' && (
            <Tabs.Panel value="feedback">
              <FeedbackModule />
            </Tabs.Panel>
          )}
          {activeTab === 'bugreports' && (
            <Tabs.Panel value="bugreports">
              <BugReports />
            </Tabs.Panel>
          )}
          {activeTab === 'types' && (
            <Tabs.Panel value="types">
              <TypesManagement />
            </Tabs.Panel>
          )}
          {activeTab === 'navigation' && (
            <Tabs.Panel value="navigation">
              <NavigationManagement />
            </Tabs.Panel>
          )}
          {activeTab === 'branches' && (
            <Tabs.Panel value="branches">
              <BranchesManagement />
            </Tabs.Panel>
          )}
          {activeTab === 'users' && (
            <Tabs.Panel value="users">
              <UsersManagement />
            </Tabs.Panel>
          )}
          {activeTab === 'system' && (
            <Tabs.Panel value="system">
              <SystemLoad />
            </Tabs.Panel>
          )}
        </Tabs>
      </Box>
    </Box>
  );
}

export default AdminPanel;

