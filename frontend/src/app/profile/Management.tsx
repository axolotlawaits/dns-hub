import { useEffect, useState } from "react"
import { API } from "../../config/constants"
import { Button, Select } from "@mantine/core"

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
    console.log('hey')
    const response = await fetch(`${API}/access/group/${curGroup}`)
    const json = await response.json()
    if (response.ok) {
      console.log(json)
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
      console.log(json)
    }
  }
  console.log(curGroup)
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
          return (
            <div key={tool.id} className="access-tool">
              <span>{tool.name}</span>
              <Button onClick={() => updateGroupAccess(tool.id, 'READONLY')}>выдать доступ 1</Button>
              <Button onClick={() => updateGroupAccess(tool.id, 'CONTRIBUTOR')}>выдать доступ 2</Button>
              <Button onClick={() => updateGroupAccess(tool.id, 'FULL')}>выдать доступ 3</Button>
            </div>
          )
        })}
      </div>
    </>
  )
}

export default Management