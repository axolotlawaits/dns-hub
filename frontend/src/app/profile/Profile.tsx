import { 
  Tabs, 
  Stack, 
  Card,
  Box
} from "@mantine/core"
import { useState, useEffect, useMemo } from "react";
import ProfileInfo from "./ProfileInfo";
import '../styles/Profile.css'
import { useUserContext } from "../../hooks/useUserContext";
import { useAccessContext } from "../../hooks/useAccessContext";
import Management from "./Management";
import AdminPanel from "./AdminPanel";
import { 
  IconUser, 
  IconShield, 
  IconPhoto,
  IconSettings
} from '@tabler/icons-react';
import { usePageHeader } from "../../contexts/PageHeaderContext";
import { API } from "../../config/constants";

function Profile() {
  const { user } = useUserContext()
  const { access } = useAccessContext()
  const [activeTab, setActiveTab] = useState<string | null>('first');
  const [protectedToolLinks, setProtectedToolLinks] = useState<string[]>([]);
  const { setHeader, clearHeader } = usePageHeader();
  
  // Загружаем список защищенных инструментов
  useEffect(() => {
    const loadProtectedTools = async () => {
      try {
        const response = await fetch(`${API}/access/protected-tools`);
        if (response.ok) {
          const links = await response.json();
          setProtectedToolLinks(links);
        }
      } catch (error) {
        console.error('Error loading protected tools:', error);
      }
    };
    loadProtectedTools();
  }, []);
  
  // Проверяем, может ли пользователь управлять доступом
  const canManageAccess = useMemo(() => {
    if (!user) return false
    // DEVELOPER имеет приоритетный доступ ко всему
    if (user.role === 'DEVELOPER') {
      return true
    }
    // Админы могут управлять доступом только к тем инструментам, к которым у них есть FULL доступ
    if (user.role === 'ADMIN') {
      return access.some(a => {
        const isProtected = protectedToolLinks.includes(a.link) || 
                           protectedToolLinks.some(link => a.link.startsWith(link + '/'));
        return isProtected && a.accessLevel === 'FULL'
      })
    }
    // Пользователи с FULL доступом хотя бы к одному защищенному инструменту могут управлять доступом
    return access.some(a => {
      const isProtected = protectedToolLinks.includes(a.link) || 
                         protectedToolLinks.some(link => a.link.startsWith(link + '/'));
      return isProtected && a.accessLevel === 'FULL'
    })
  }, [user, access, protectedToolLinks])

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
              {canManageAccess && (
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