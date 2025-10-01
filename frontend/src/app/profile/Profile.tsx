import { 
  Tabs, 
  Title, 
  Text, 
  Stack, 
  Card,
  Group,
  ThemeIcon,
  Box
} from "@mantine/core"
import { useState } from "react";
import ProfileInfo from "./ProfileInfo";
import '../styles/Profile.css'
import { useUserContext } from "../../hooks/useUserContext";
import Management from "./Management";
import { 
  IconUser, 
  IconShield, 
  IconPhoto
} from '@tabler/icons-react';

function Profile() {
  const { user } = useUserContext()
  const [activeTab, setActiveTab] = useState<string | null>('first');

  return (
    <Box className="profile-container" style={{ paddingRight: 'var(--mantine-spacing-md)' }}>
      <Stack gap="lg">
        {/* Заголовок страницы */}
        <Box className="profile-header">
          <Group gap="md" align="center">
            <ThemeIcon size="lg" color="blue" variant="light" radius="xl">
              <IconUser size={24} />
            </ThemeIcon>
            <Box>
              <Title order={2} c="var(--theme-text-primary)">
                Личный кабинет
              </Title>
              <Text size="md" c="var(--theme-text-secondary)">
                Управление профилем и настройками
              </Text>
            </Box>
          </Group>
        </Box>

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
          </Tabs>
        </Box>
      </Stack>
    </Box>
  )
}

export default Profile