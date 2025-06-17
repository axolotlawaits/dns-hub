import { useEffect, useState } from "react"
import { API } from "../../config/constants"
import { ActionIcon, Button, Modal, Select, TextInput, Tooltip } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { Tool } from "../../components/Tools"
import { IconLockAccess, IconLockOpen2, IconSearch } from "@tabler/icons-react"

type AccessLevel = 'READONLY' | 'CONTRIBUTOR' | 'FULL'

type AccessLevelName = {
  type: AccessLevel
  name: string
}

type GroupAccess = {
  id: string
  toolId: string
  groupName: string
  accessLevel: AccessLevel
}

const accessLevels: AccessLevelName[] = [
  {type: 'READONLY', name: 'чтение'},
  {type: 'CONTRIBUTOR', name: 'без удаления'},
  {type: 'FULL', name: 'полный'}
]

function Management() {
  const [groups, setGroups] = useState([])
  const [curGroup, setCurGroup] = useState<string | null>('')
  const [curAccess, setCurAccess] = useState<GroupAccess[]>([])
  const [tools, setTools] = useState<Tool[]>([])

  const getGroups = async () => {
    const response = await fetch(`${API}/search/all-groups`)
    const json = await response.json()
    if (response.ok) {
      setGroups(json)
    }
  }

  const getTools = async (search?: string) => {
    const response = await fetch(`${API}/search/tool?text=${search || ''}`)
    const json = await response.json()
    if (response.ok) {
      setTools(json)
    }
  }

  useEffect(() => {
    getGroups()
    getTools()
  }, [])

  const getAccessedTools = async () => {
    const response = await fetch(`${API}/access/group/${curGroup}`)
    const json = await response.json()
    if (response.ok) {
      setCurAccess(json)
    }
  }

  useEffect(() => {
    curGroup && getAccessedTools()
  }, [curGroup])

  const updateGroupAccess = async (toolId: string, accessLevel: AccessLevel) => {
    const response = await fetch(`${API}/access/group/${curGroup}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({toolId, accessLevel}),
    })
    const json = await response.json()
    if (response.ok) {
      setCurAccess(prevAccess => {
        const exists = prevAccess.some(access => access.id === json.id);
        return exists
          ? prevAccess.map(access => access.id === json.id ? json : access)
          : [...prevAccess, json];
      })
    }
  }

  const deleteGroupAccess = async (toolId: string) => {
    const response = await fetch(`${API}/access/group/${curGroup}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({toolId}),
    })
    const json = await response.json()
    if (response.ok) {
      setCurAccess(curAccess.filter(access => access.id !== json.id))
    }
  }

  return (
    <div id="profile-management">
      <Select 
        data={groups.map((g: any) => g.name)} 
        value={curGroup} 
        onChange={setCurGroup} 
        placeholder="Выбрать группу должностей" 
        style={{ width: 300 }}
        searchable
        clearable
      />
      <TextInput
        data-autofocus
        size='md'
        placeholder="поиск"
        leftSection={<IconSearch size={20} />}
        onChange={(e) => e.target.value ? (getTools(e.target.value)) : getTools()}
      />
      <div className="access-tools">
        {tools.map(tool => {
          const accessLevel = curAccess.find(t => t.toolId === tool.id)?.accessLevel
          return curAccess.some(t => t.toolId === tool.id) ?
            <div 
              key={tool.id} 
              className={`tool-card access ${
                accessLevel === 'READONLY' ? 'lvl1' : 
                accessLevel === 'CONTRIBUTOR' ? 'lvl2' : 'lvl3'
              }`}
            >
              <div className="tool-text">
                <span className="tool-name">{tool.name}</span>
                <span className="tool-access">{accessLevels.find(lvl => lvl.type === accessLevel)?.name}</span>
              </div>
              <div className="tool-card-action">
                <Tooltip label="убрать доступ">
                  <ActionIcon variant="filled" aria-label="Settings" onClick={() => deleteGroupAccess(tool.id)} color="red" size="lg">
                    <IconLockAccess size={24}/>
                  </ActionIcon>
                </Tooltip>
                <ChangeAccessLevelModal 
                  tool={tool} 
                  updateGroupAccess={updateGroupAccess}
                  accessLevel={accessLevel}
                />
              </div>
            </div>
            :
            <div key={tool.id} className="tool-card access">
              <span className="tool-name">{tool.name}</span>
              <div className="tool-card-action">
                <ChangeAccessLevelModal 
                  tool={tool} 
                  updateGroupAccess={updateGroupAccess} 
                  accessLevel={accessLevel} 
                />
              </div>
            </div>
        })}
      </div>
    </div>
  )
}

type ChangeAccessLevelModalProps = {
  tool: Tool
  updateGroupAccess: (toolId: string, accessLevel: AccessLevel) => void
  accessLevel: AccessLevel | undefined
}

function ChangeAccessLevelModal({tool, updateGroupAccess, accessLevel}: ChangeAccessLevelModalProps) {
  const [opened, { open, close }] = useDisclosure(false)

  return (
    <>
      <Tooltip label="окно доступа">
        <ActionIcon onClick={open} size="lg">
          <IconLockOpen2 size={24} />
        </ActionIcon>
      </Tooltip>
      <Modal opened={opened} onClose={close} title="Изменение уровня доступа" centered>
        <div className="access-modal-action">
          {accessLevels.map(lvl => {
            return (
              <Button 
                color={accessLevel === lvl.type ? 'green' : undefined}
                onClick={() => {updateGroupAccess(tool.id, lvl.type), close()}}
              >
                {lvl.name}
              </Button>
            )
          })}
        </div>
      </Modal>
    </>
  )
}

export default Management