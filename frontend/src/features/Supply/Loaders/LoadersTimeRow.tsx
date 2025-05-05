import { Button, Modal, Stack } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import dayjs from "dayjs"
import { LoaderType } from "./Loaders"

function LoadersTimeRow({loaders}: {loaders: LoaderType[]}) {
  const [opened, { open, close }] = useDisclosure(false)

  const calculateHours = (startTime: Date, endTime: Date) => {
    const diffInMinutes = dayjs(endTime).diff(dayjs(dayjs(startTime)), 'minutes')
    const hours = Math.floor(diffInMinutes / 60)
    const minutes = diffInMinutes % 60
    const roundOffMinutes = minutes <= 40 && minutes > 10 ? 30 : 0 
    return `часы: ${hours}, минуты: ${roundOffMinutes} (без округления: ${minutes})`
  }
  
  return (
    <>
      {loaders.length > 0 ? 
        <Button variant="outline" size="xs" onClick={open}>Посмотреть</Button>
      :
        <span>нет данных</span>
      }
      <Modal opened={opened} onClose={close}>
        {loaders.length > 0 && loaders.map((loader, i) => {
          return (
            <Stack key={loader.id}>
              <h2>{`грузчик ${i + 1}`}</h2>
              <p>{`время работы на филиале: ${dayjs(loader.startTime).format('H:mm')} - ${dayjs(loader.endTime).format('H:mm')}`}</p>
              <p>{calculateHours(loader.startTime, loader.endTime)}</p>
            </Stack>
          )
        })}
      </Modal>
    </>
  )
}

export default LoadersTimeRow