import { Tabs } from "@mantine/core"
import { useState } from "react";
import ProfileInfo from "./ProfileInfo";
import '../styles/Profile.css'
import { useUserContext } from "../../hooks/useUserContext";
import Management from "./Management";

function Profile() {
  const { user } = useUserContext()
  const [activeTab, setActiveTab] = useState<string | null>('first');

  return (
    <Tabs value={activeTab} onChange={setActiveTab}>
      <div className="profile-page-wrapper">
        <Tabs.List grow>
          <Tabs.Tab value="first">Ваши данные</Tabs.Tab>
          {user?.role !== 'EMPLOYEE' && <Tabs.Tab value="second">Управление доступом</Tabs.Tab>}
        </Tabs.List>

        <Tabs.Panel value="first"><ProfileInfo /></Tabs.Panel>
        <Tabs.Panel value="second"><Management /></Tabs.Panel>
      </div>
    </Tabs>
  )
}

export default Profile