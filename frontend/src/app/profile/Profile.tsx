import { 
  Tabs, 
  Stack, 
  Card,
  Box
} from "@mantine/core"
import { useState, useEffect } from "react";
import ProfileInfo from "./ProfileInfo";
import '../styles/Profile.css'
import { useUserContext } from "../../hooks/useUserContext";
import Management from "./Management";
import AdminPanel from "./AdminPanel";
import { 
  IconUser, 
  IconShield, 
  IconPhoto,
  IconSettings
} from '@tabler/icons-react';
import { usePageHeader } from "../../contexts/PageHeaderContext";

function Profile() {
  const { user } = useUserContext()
  const [activeTab, setActiveTab] = useState<string | null>('first');
  const { setHeader, clearHeader } = usePageHeader();

  useEffect(() => {
    setHeader({
      title: 'Личный кабинет',
      subtitle: 'Управление профилем и настройками',
      icon: <IconUser size={24} />
    });

    return () => {
      clearHeader();
    };
  }, [setHeader, clearHeader]);

  return (
    <Box className="profile-container">
      <Stack gap="lg">

        {/* Навигация по вкладкам */}
        <Card shadow="sm" radius="lg" p="md" className="profile-navigation">
          <Tabs 
            value={activeTab} 
            onChange={setActiveTab}
            variant="pills"
            classNames={{
              list: 'profile-tabs-list',
              tab: 'profile-tab'
            }}
          >
            <Tabs.List grow>
              <Tabs.Tab 
                value="first" 
                leftSection={<IconPhoto size={18} />}
                className="profile-tab-item"
              >
                Ваши данные
              </Tabs.Tab>
              {user?.role !== 'EMPLOYEE' && (
                <Tabs.Tab 
                  value="second" 
                  leftSection={<IconShield size={18} />}
                  className="profile-tab-item"
                >
                  Управление доступом
                </Tabs.Tab>
              )}
              {user?.role === 'DEVELOPER' && (
                <Tabs.Tab 
                  value="third" 
                  leftSection={<IconSettings size={18} />}
                  className="profile-tab-item"
                >
                  Админ панель
                </Tabs.Tab>
              )}
            </Tabs.List>
          </Tabs>
        </Card>

        {/* Контент вкладок */}
        <Box className="profile-content">
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.Panel value="first">
              <ProfileInfo />
            </Tabs.Panel>
            <Tabs.Panel value="second">
              <Management />
            </Tabs.Panel>
            {user?.role === 'DEVELOPER' && (
              <Tabs.Panel value="third">
                <AdminPanel />
              </Tabs.Panel>
            )}
          </Tabs>
        </Box>
      </Stack>
    </Box>
  )
}

export default Profile