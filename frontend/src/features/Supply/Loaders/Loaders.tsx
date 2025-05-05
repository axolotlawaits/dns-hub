import { ActionIcon, Stack } from "@mantine/core"
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
}

function Loaders({index, handleLoadersData}: LoadersProps) {
  const startTimeRef = useRef<HTMLInputElement>(null)
  const [startTime, setStartTime] = useState('')
  const endTimeRef = useRef<HTMLInputElement>(null)
  const [endTime, setEndTime] = useState('')

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

  return (
    <Stack gap={10}>
      <p>{`Грузчик ${index + 1}`}</p>
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
    </Stack>
  )
}

export default Loaders