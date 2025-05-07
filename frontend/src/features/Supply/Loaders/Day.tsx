import { Button, Modal, Space, Table } from "@mantine/core"
import dayjs from "dayjs"
import LoadersTimeRow from "./LoadersTimeRow"
import { LoaderType } from "./Loaders"
import AddLoadersModal from "./AddLoadersModal"
import { useDisclosure } from "@mantine/hooks"

export type FilialType = {
  id: string
  name: string
  feedback?: string
  place: number
  loaders: LoaderType[]
}

export type DayType = {
  id: string,
  day: Date
  filials: FilialType[]
}

function Day({day}: {day: DayType}) {
  const [opened, { open, close }] = useDisclosure(false)

  function calculateWorkHours() {
    let obj: Record<number, number> = {}
    for (let filial in day.filials) {
      for (let [index, loader] of day.filials[filial].loaders.entries()) {
        obj[index] = (obj[index] || 0) + dayjs(loader.endTime).diff(dayjs(dayjs(loader.startTime)), 'minutes')
      }
    }
    return Object.values(obj)
  }

  function calculateTotalTime() {
    return calculateWorkHours().reduce((total, cur) => total + cur, 0)
  }
  
  return (
    <div key={day.id} className="day-table">
      <p>{dayjs(day.day).format('MMMM D, YYYY')}</p>
      <Table highlightOnHover >
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Филиал</Table.Th>
            <Table.Th>Кол-во грузчиков</Table.Th>
            <Table.Th>Время работы</Table.Th>
            <Table.Th>Обратная связь</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {Object.values(day.filials).map(filial => (
            <Table.Tr key={filial.id}>
              <Table.Td>{filial.name}</Table.Td>
              <Table.Td>
                {filial.loaders.length > 0 ? 
                  filial.loaders.length
                :
                  <AddLoadersModal filial={filial}/>
                }
              </Table.Td>
              <Table.Td>
                <LoadersTimeRow loaders={filial.loaders}></LoadersTimeRow>
              </Table.Td>
              <Table.Td>{filial.feedback}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Space h="md" />
      <>
        <Button onClick={open} variant="light">общее количество работы грузчиков</Button>
        <Modal opened={opened} onClose={close}>
          {calculateWorkHours().length > 0 && calculateWorkHours().map((loader, index) => {
            return (
              <p key={index}>{`Общее время работы ${index + 1} грузчика - ${Math.floor(loader / 60)} часа ${loader % 60} минут`}</p>
            )
          })}
          <p>{`Общее время работы по всем грузчикам - ${Math.floor(calculateTotalTime() / 60)} часа ${calculateTotalTime() % 60} минут`}</p>
        </Modal>
      </>
    </div>
  )
}

export default Day
