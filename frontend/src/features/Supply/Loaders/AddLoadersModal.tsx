import { Button, Modal, Stack, TextInput } from "@mantine/core"
import Loaders from "./Loaders"
import { useDisclosure } from "@mantine/hooks"
import { useState } from "react"
import { API } from "../../../config/constants"
import { FilialType } from "./Day"

type LoadersTimeDataType = {
  startTime: Date
  endTime: Date
}

function AddLoadersModal({filial}: {filial: FilialType}) {
  const [opened, { open, close }] = useDisclosure(false)
  const [loadersNumber, setLoadersNumber] = useState(1)
  const [feedback, setFeedback] = useState('')
  const [loadersData, setLoadersData] = useState<LoadersTimeDataType[]>([])

  const addLoaders = async (filialId: string) => {
    const response = await fetch(`${API}/loaders/filial/${filialId}`, {
      method: 'POST',
      body: JSON.stringify({loaders: loadersData, feedback}),
      headers: { 'Content-type': 'application/json' }
    })

    if (response.ok) {
      close()
    }
  }

  const handleLoadersData = (data: string, index: number, isStart: boolean) => {
    if (isStart) {
      setLoadersData([
        ...loadersData.slice(0, index),
        {
          ...loadersData[index],
          startTime: createDateWithTime(data)
        },
        ...loadersData.slice(index + 1)
      ])
    } else {
      setLoadersData([
        ...loadersData.slice(0, index),
        {
          ...loadersData[index],
          endTime: createDateWithTime(data)
        },
        ...loadersData.slice(index + 1)
      ])
    }
  }

  function createDateWithTime(timeString: string) {
    const currentDate = new Date()
    const newDateString = `${currentDate.toDateString()} ${timeString}`
    const newDate = new Date(newDateString)
    return newDate
  }
  
  return (
    <>
      <Button size="xs" variant="outline" onClick={open}>добавить</Button>
      <Modal opened={opened} onClose={close}>
        <Stack>
          {[...Array(loadersNumber)].map((_e, i) => {
            return (
              <Loaders 
                key={i}
                index={i} 
                handleLoadersData={handleLoadersData} 
              >
              </Loaders>
            )
          })}
          <Button variant="outline" onClick={() => setLoadersNumber(prev => prev + 1)}>добавить грузчика</Button>
          <TextInput 
            label="Обратная связь" 
            value={feedback} 
            onChange={(e) => setFeedback(e.currentTarget.value)}
          >
          </TextInput>
          <Button onClick={() => addLoaders(filial.id)}>Подтвердить</Button>
        </Stack>
      </Modal>
    </>
  )
}

export default AddLoadersModal