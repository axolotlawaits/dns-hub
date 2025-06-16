import { useEffect, useState } from "react"
import { API } from "../../config/constants"
import { Button, Modal, Select } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"

type AccessLevel = 'READONLY' | 'CONTRIBUTOR' | 'FULL'

const accessLevels = [
  {type: 'READONLY', name: 'чтение'},
  {type: 'CONTRIBUTOR', name: 'без удаления'},
  {type: 'FULL', name: 'полный'}
]

function Management() {
  const [positions, setPositions] = useState([])
  const [groups, setGroups] = useState([])
  const [curGroup, setCurGroup] = useState<string | null>('')
  const [curAccess, setCurAccess] = useState([])
  const [tools, setTools] = useState([])

  const getPositions = async () => {
    const response = await fetch(`${API}/search/all-groups`)
    const json = await response.json()
    if (response.ok) {
      setGroups(json)
    }
  }

  const getTools = async () => {
    const response = await fetch(`${API}/navigation/all-sub`)
    const json = await response.json()
    if (response.ok) {
      setTools(json)
    }
  }

  useEffect(() => {
    getPositions()
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

  const updateGroupAccess = async (toolId, accessLevel) => {
    const response = await fetch(`${API}/access/group/${curGroup}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({toolId, accessLevel}),
    })
    const json = await response.json()
    if (response.ok) {
      setCurAccess(curAccess.map(access => access.id === json.id ? json : access))
    }
  }

  const deleteGroupAccess = async (toolId) => {
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
  console.log(curAccess)
  return (
    <>
      <Select 
        data={groups.map(g => g.name)} 
        value={curGroup} 
        onChange={setCurGroup} 
        placeholder="Выбрать группу должностей" 
        style={{ width: 300 }}
        searchable
        clearable
      />
      <div className="access-tools">
        {tools.map(tool => {
          const accessLevel = curAccess.find(t => t.toolId === tool.id)?.accessLevel
          return curAccess.some(t => t.toolId === tool.id) ?
            <div key={tool.id} className="access-tool-exist">
              <span>{tool.name}</span>
              <span>{accessLevel}</span>
              <Button onClick={() => deleteGroupAccess(tool.id)} color="red">убрать доступ</Button>
              <ChangeAccessLevelModal 
                tool={tool} 
                updateGroupAccess={updateGroupAccess}
                accessLevel={accessLevel}
              />
            </div>
            :
            <div key={tool.id} className="access-tool">
              <span>{tool.name}</span>
              <ChangeAccessLevelModal 
                tool={tool} 
                updateGroupAccess={updateGroupAccess} 
                accessLevel={accessLevel} 
              />
            </div>
        })}
      </div>
    </>
  )
}

function ChangeAccessLevelModal({tool, updateGroupAccess, accessLevel}) {
  const [opened, { open, close }] = useDisclosure(false)

  return (
    <>
      <Button onClick={open}>изменить уровень доступа</Button>
      <Modal opened={opened} onClose={close} title="Изменение уровня доступа" centered>
        {accessLevels.map(lvl => {
          console.log(lvl, accessLevel)
          return (
            <Button 
              color={accessLevel === lvl.type ? 'green' : undefined}
              onClick={() => updateGroupAccess(tool.id, lvl.type)}
            >
              {lvl.name}
            </Button>
          )
        })}
      </Modal>
    </>
  )
}

export default Management