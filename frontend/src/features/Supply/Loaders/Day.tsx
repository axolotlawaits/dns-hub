import { Button, Modal, Space, Stack, Table } from "@mantine/core"
import dayjs from "dayjs"
import LoadersTimeRow from "./LoadersTimeRow"
import { LoaderType } from "./Loaders"
import AddLoadersModal from "./AddLoadersModal"
import { useDisclosure } from "@mantine/hooks"
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useRef } from "react"
import { RouteType } from "./LoadersRoutes"
import { IconDownload, IconFileInfo } from "@tabler/icons-react"

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
  route: RouteType
}

function Day({day}: {day: DayType}) {
  const [opened, { open, close }] = useDisclosure(false)
  const printRef = useRef(null)

  const calculateWorkHours = () => {
    let obj: Record<number, number> = {}
    for (let filial in day.filials) {
      for (let [index, loader] of day.filials[filial].loaders.entries()) {
        obj[index] = (obj[index] || 0) + dayjs(loader.endTime).diff(dayjs(dayjs(loader.startTime)), 'minutes')
      }
    }
    return Object.values(obj)
  }

  const calculateTotalTime = () => {
    return calculateWorkHours().reduce((total, cur) => total + cur, 0)
  }

  const downloadSummary = async () => {
    const element = printRef.current;
    if (!element) return;

    const canvas = await html2canvas(element, { scale: 2 });

    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF('p', 'mm', 'a4');

    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${day.route.name}-${dayjs(day.day).format('MMMM D, YYYY')}`);
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
        <Button onClick={open} variant="light" rightSection={<IconFileInfo size={18} />}>Общий отчет</Button>
        <Modal opened={opened} onClose={close} size={"lg"}>
          <Stack gap="md">
            <div ref={printRef} className="day-summary">
              <h1 className="day-title">Общий отчет по маршруту {day.route.name} за {dayjs(day.day).format('MMMM D, YYYY')}</h1>
              <p>Подрядчик: {day.route.contractor}</p>
              <p id="test">{`Общее время работы: часы: ${Math.floor(calculateTotalTime() / 60)} минуты: ${calculateTotalTime() % 60}`}</p>
              {calculateWorkHours().length > 0 &&
              <>
                <p>Детальная информация по грузчикам:</p>
                <div className="day-summary-block">
                  {calculateWorkHours().map((loader, index) => {
                    return (
                      <p key={index} className="day-loader">
                        {`Общее время работы ${index + 1} грузчика - часы: ${Math.floor(loader / 60)} минуты: ${loader % 60}`}
                      </p>
                    )
                  })}
                </div>
              </>
              }
              {day.filials.some(fil => fil.feedback) && 
                <div className="day-summary-block">
                  <p>Обратная связь по филиалам:</p>
                  {day.filials.map(fil => {
                    return (
                      <p key={fil.id} className="day-feedback">{fil.name}: {fil.feedback ? fil.feedback : 'нет отзыва'}</p>
                    )
                  })}
                </div>
              }
            </div>
            <Button 
              onClick={downloadSummary} 
              variant="light" 
              rightSection={<IconDownload size={18} />} 
              fullWidth
            >
              скачать в PDF
            </Button>
          </Stack>
        </Modal>
      </>
    </div>
  )
}

export default Day
