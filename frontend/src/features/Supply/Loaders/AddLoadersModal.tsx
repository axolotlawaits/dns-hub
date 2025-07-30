import { Button, Modal, Stack, TextInput } from "@mantine/core"
import Loaders from "./Loaders"
import { useDisclosure } from "@mantine/hooks"
import { useState } from "react"
import { API } from "../../../config/constants"
import { FilialType } from "./Day"

type LoadersDataType = {
  startTime: Date
  endTime: Date
  amount: number
}

function AddLoadersModal({filial, getDays}: {filial: FilialType, getDays: () => void}) {
  const [opened, { open, close }] = useDisclosure(false)
  const [loadersNumber, setLoadersNumber] = useState(1)
  const [feedback, setFeedback] = useState('')
  const [loadersData, setLoadersData] = useState<LoadersDataType[]>([])

  const addLoaders = async (filialId: string) => {
    const flatLoaders = loadersData.flatMap(({ amount, ...rest }) =>
      Array(amount).fill(null).map(() => ({ ...rest }))
    )

    const response = await fetch(`${API}/loaders/filial/${filialId}`, {
      method: 'POST',
      body: JSON.stringify({loaders: flatLoaders, feedback}),
      headers: { 'Content-type': 'application/json' }
    })

    if (response.ok) {
      close()
      getDays()
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

  const handleLoadersAmount = (index: number, amount: number) => {
    setLoadersData(loadersData.map((item, i) => i === index ? {...item, amount} : item))
  }

  function createDateWithTime(timeString: string) {
    const currentDate = new Date()
    const newDateString = `${currentDate.toDateString()} ${timeString}`
    const newDate = new Date(newDateString)
    return newDate
  }
  console.log(loadersData)
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
                handleLoadersAmount={handleLoadersAmount}
              >
              </Loaders>
            )
          })}
          <Button variant="outline" onClick={() => setLoadersNumber(prev => prev + 1)}>добавить грузчика с другим временем</Button>
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