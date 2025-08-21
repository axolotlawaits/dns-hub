import { ActionIcon, Button, Group, Modal, Stack, Text } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import dayjs from "dayjs"
import { LoaderType } from "./Loaders"
import { IconTrash } from "@tabler/icons-react"
import { useState } from "react"
import { API } from "../../../config/constants"

function LoadersTimeRow({loaders, getDays}: {loaders: LoaderType[], getDays: () => void}) {
  const [opened, { open, close }] = useDisclosure(false)
  const [deleteLoaderId, setDeleteLoaderId] = useState<string | null>(null)

  const calculateHours = (startTime: Date, endTime: Date) => {
    const diffInMinutes = dayjs(endTime).diff(dayjs(dayjs(startTime)), 'minutes')
    const hours = Math.floor(diffInMinutes / 60)
    const minutes = diffInMinutes % 60
    const roundOffMinutes = minutes <= 40 && minutes > 10 ? 30 : 0 
    return `часы: ${hours}, минуты: ${roundOffMinutes} (без округления: ${minutes})`
  }

  const deleteLoader = async (loaderId: string) => {
    const response = await fetch(`${API}/loaders/filial/loader/${loaderId}`, {
      method: 'DELETE',
      headers: { 'Content-type': 'application/json' }
    })
    if (response.ok) {
      getDays()
    }
  }
  
  return (
    <>
      {loaders.length > 0 ? 
        <Button variant="outline" size="xs" onClick={open}>Посмотреть</Button>
      :
        <span>нет данных</span>
      }
      <Modal opened={opened} onClose={close}>
        <div className="loaders-info"> 
        {loaders.length > 0 && loaders.map((loader, i) => {
          return (
            <Stack key={loader.id} gap='5px'>
              <div className="loader-info-header">
                <h2 className="loader-info-heading">{`грузчик ${i + 1}`}</h2>
                <ActionIcon onClick={() => setDeleteLoaderId(loader.id)} variant="filled" color="red" aria-label="clear" size="md">
                  <IconTrash style={{ width: '70%', height: '70%' }} />
                </ActionIcon>
                <Modal opened={deleteLoaderId === loader.id} onClose={() => setDeleteLoaderId(null)}>
                  <Stack gap='10px'>
                    <Text>Удалить грузчика?</Text>
                    <Group>
                      <Button onClick={() => deleteLoader(loader.id)} color="red">Удалить</Button>
                      <Button variant="light">Отмена</Button>
                    </Group>
                  </Stack>
       
                </Modal>
              </div>
              <p>{`время работы на филиале: ${dayjs(loader.startTime).format('H:mm')} - ${dayjs(loader.endTime).format('H:mm')}`}</p>
              <p>{calculateHours(loader.startTime, loader.endTime)}</p>
            </Stack>
          )
        })}
        </div>
      </Modal>
    </>
  )
}

export default LoadersTimeRow