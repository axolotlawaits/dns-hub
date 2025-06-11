import { useEffect, useState } from "react"
import { API } from "../../config/constants"
import { Select } from "@mantine/core"

function Management() {
  const [positions, setPositions] = useState([])
  const [posGroups, setPosGroups] = useState([])
  const [currentPos, setCurrentPos] = useState<string | null>('')

  useEffect(() => {
    const getPositions = async () => {
      const response = await fetch(`${API}/search/all-positions`)
      const json = await response.json()
      if (response.ok) {
        setPositions(json.map(pos => pos.position))
        setPosGroups([...new Set(json.map(pos => pos.group))])
      }
    }

    getPositions()
  }, [])

  useEffect(() => {
    const getAccessedTools = async () => {
      
    }

  }, [])

  return (
    <>
      <Select 
        data={posGroups} 
        value={currentPos} 
        onChange={setCurrentPos} 
        placeholder="Выбрать группу должностей" 
        style={{ width: 300 }}
        searchable
        clearable
      />
    </>
  )
}

export default Management