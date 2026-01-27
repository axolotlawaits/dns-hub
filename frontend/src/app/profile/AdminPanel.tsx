import { useState, useEffect } from 'react';
import { Tabs, Box, Card } from '@mantine/core';
import { IconMessageCircle, IconTags, IconMenu2, IconBuilding, IconUsers, IconChartBar, IconShield, IconDashboard } from '@tabler/icons-react';
import FeedbackModule from '../../features/Feedback/Feedback';
import TypesManagement from './components/TypesManagement';
import NavigationManagement from './components/NavigationManagement';
import BranchesManagement from './components/BranchesManagement';
import UsersManagement from './components/UsersManagement';
import Analytics from './components/Analytics';
import Audit from './components/Audit';
import AccessDashboard from './components/AccessDashboard';

interface AdminPanelProps {
  initialTab?: string;
}

function AdminPanel({ initialTab = 'feedback' }: AdminPanelProps) {
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
              value="feedback" 
              leftSection={<IconMessageCircle size={18} />}
            >
              Обратная связь
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
              value="analytics" 
              leftSection={<IconChartBar size={18} />}
            >
              Аналитика
            </Tabs.Tab>
            <Tabs.Tab 
              value="audit" 
              leftSection={<IconShield size={18} />}
            >
              Аудит
            </Tabs.Tab>
            <Tabs.Tab 
              value="access-dashboard" 
              leftSection={<IconDashboard size={18} />}
            >
              Статистика доступа
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Card>

      <Box>
        <Tabs value={activeTab} onChange={setActiveTab}>
          {activeTab === 'feedback' && (
            <Tabs.Panel value="feedback">
              <FeedbackModule />
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
          {activeTab === 'analytics' && (
            <Tabs.Panel value="analytics">
              <Analytics />
            </Tabs.Panel>
          )}
          {activeTab === 'audit' && (
            <Tabs.Panel value="audit">
              <Audit />
            </Tabs.Panel>
          )}
          {activeTab === 'access-dashboard' && (
            <Tabs.Panel value="access-dashboard">
              <AccessDashboard />
            </Tabs.Panel>
          )}
        </Tabs>
      </Box>
    </Box>
  );
}

export default AdminPanel;

