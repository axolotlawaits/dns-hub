import { ActionIcon, NumberInput, Stack } from "@mantine/core"
import { TimeInput } from "@mantine/dates"
import { IconClock } from "@tabler/icons-react";
import { useRef, useState } from "react";

export type LoaderType = {
  id: string
  startTime: Date
  endTime: Date
}

type LoadersProps = {
  index: number
  handleLoadersData: (time: string, index: number, isStart: boolean) => void
  handleLoadersAmount: (index: number, amount: number) => void
}

function Loaders({index, handleLoadersData, handleLoadersAmount}: LoadersProps) {
  const startTimeRef = useRef<HTMLInputElement>(null)
  const [startTime, setStartTime] = useState('')
  const endTimeRef = useRef<HTMLInputElement>(null)
  const [endTime, setEndTime] = useState('')
  const [amount, setAmount] = useState<string | number>(1)

  const pickerControl = (
    <ActionIcon variant="subtle" color="gray" onClick={() => startTimeRef.current?.showPicker()}>
      <IconClock size={16} stroke={1.5} />
    </ActionIcon>
  )

  const pickerControl2 = (
    <ActionIcon variant="subtle" color="gray" onClick={() => endTimeRef.current?.showPicker()}>
      <IconClock size={16} stroke={1.5} />
    </ActionIcon>
  )

  const updateLoadersData = (time: string, isStart: boolean) => {
    if (isStart) {
      setStartTime(time)
    } else {
      setEndTime(time)
    }
    
    handleLoadersData(time, index, isStart)
  }

  const updateLoadersAmount = (amount: number | string) => {
    console.log(typeof amount)
    setAmount(amount)
    handleLoadersAmount(index, Number(amount))
  }

  return (
    <Stack gap={10}>
      <p>Время начала</p>
      <TimeInput 
        value={startTime}
        onChange={(e) => updateLoadersData(e.currentTarget.value, true)}
        ref={startTimeRef} 
        rightSection={pickerControl}
      />
      <p>Время конца</p>
      <TimeInput 
        value={endTime}
        onChange={(e) => updateLoadersData(e.currentTarget.value, false)}
        ref={endTimeRef} 
        rightSection={pickerControl2}
      />
      <p>Кол-во грузчиков с данным временем</p>
      <NumberInput value={amount} onChange={updateLoadersAmount}></NumberInput>
    </Stack>
  )
}

export default Loaders