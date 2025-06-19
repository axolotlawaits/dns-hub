import { useEffect, useState } from "react"
import { API } from "../../config/constants"
import { ActionIcon, Button, Modal, Select, TextInput, Tooltip } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { Tool } from "../../components/Tools"
import { IconExternalLink, IconLockAccess, IconLockOpen2, IconSearch } from "@tabler/icons-react"
import { useNavigate } from "react-router"

type AccessLevel = 'READONLY' | 'CONTRIBUTOR' | 'FULL'

type EntityType = 'group' | 'position' | 'user'

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
  const [entityType, setEntityType] = useState<EntityType>('group')
  const [groups, setGroups] = useState([])
  const [positions, setPositions] = useState([])
  const [users, setUsers] = useState([])
  const [curEntity, setCurEntity] = useState<string | null>(null)
  const [curAccess, setCurAccess] = useState<GroupAccess[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const navigate = useNavigate()

  const getEntities = async () => {
    const response = await fetch(`${API}/search/${entityType}/all`)
    const json = await response.json()
    if (response.ok) {
      entityType === 'group' && (setGroups(json), setUsers([]), setPositions([]))
      entityType === 'position' && (setPositions(json), setUsers([]), setGroups([]))
      entityType === 'user' && (setUsers(json), setGroups([]), setPositions([]))
    }
  }

  useEffect(() => {
    getEntities()
    setCurEntity(null)
  }, [entityType])

  const getTools = async (search?: string) => {
    const response = await fetch(`${API}/search/tool?text=${search || ''}`)
    const json = await response.json()
    if (response.ok) {
      setTools(json)
    }
  }

  useEffect(() => {
    getTools()
  }, [])

  const getAccessedTools = async () => {
    const response = await fetch(`${API}/access/${entityType}/${curEntity}`)
    const json = await response.json()
    if (response.ok) {
      setCurAccess(json)
    }
  }

  useEffect(() => {
    !curEntity && setCurAccess([])
    curEntity && getAccessedTools()
  }, [curEntity])

  const updateGroupAccess = async (toolId: string, accessLevel: AccessLevel) => {
    const response = await fetch(`${API}/access/${entityType}/${curEntity}`, {
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
    const response = await fetch(`${API}/access/${entityType}/${curEntity}`, {
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
      <div className="access-selection-area">
        <div className="access-select-block">
          <h2 className="access-heading">Кому выдать права?</h2>
          <Select 
            data={[
              {value: 'group', label: 'Группе должностей'}, 
              {value: 'position', label: 'Должности'}, 
              {value: 'user', label: 'Сотруднику'}
            ]} 
            value={entityType} 
            onChange={(value) => setEntityType(value as EntityType)} 
            placeholder="Выбрать тип доступа" 
            style={{ width: 300 }}
            searchable
            clearable
          />
        </div>
        <div className="access-select-block">
          <h2 className="access-heading">
            {`Выберите ${
              entityType === 'group' ? 'группу' : entityType === 'user' ? 'сотрудника' : 'должность'
            }`}
          </h2>
          {entityType === 'user' ?
            <Select 
              data={users.map((u: any) => ({value: u.id, label: u.name}))} 
              value={curEntity} 
              onChange={setCurEntity} 
              placeholder="Выбрать группу должностей" 
              style={{ width: 300 }}
              searchable
              clearable
            />
          :
            <Select 
              data={entityType === 'group' ? groups.map((e: any) => e.name) : positions.map((e: any) => e.name)} 
              value={curEntity} 
              onChange={setCurEntity} 
              placeholder="Выбрать группу должностей" 
              style={{ width: 300 }}
              searchable
              clearable
            />
          }
        </div>
      </div>
      <div className="access-tools-block">
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
                  {curEntity &&
                    <ChangeAccessLevelModal 
                      tool={tool} 
                      updateGroupAccess={updateGroupAccess} 
                      accessLevel={accessLevel} 
                    />
                  }
                  <Tooltip label="к инструменту">
                    <ActionIcon variant="default" aria-label="Settings" onClick={() => navigate(`/${tool.link}`)} size="lg">
                      <IconExternalLink size={24}/>
                    </ActionIcon>
                  </Tooltip>
                </div>
              </div>
              :
              <div key={tool.id} className={`tool-card access ${curEntity ? '' : 'showcase'}`}>
                <span className="tool-name">{tool.name}</span>
                <div className="tool-card-action">
                  {curEntity &&
                    <ChangeAccessLevelModal 
                      tool={tool} 
                      updateGroupAccess={updateGroupAccess} 
                      accessLevel={accessLevel} 
                    />
                  }
                  <Tooltip label="к инструменту">
                    <ActionIcon variant="default" aria-label="Settings" onClick={() => navigate(`/${tool.link}`)} size="lg">
                      <IconExternalLink size={24}/>
                    </ActionIcon>
                  </Tooltip>
                </div>
              </div>
          })}
        </div>
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