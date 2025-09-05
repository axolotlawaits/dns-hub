import { useEffect, useRef, useState } from "react"
import { API } from "../../../config/constants"
import dayjs from "dayjs"
import { DayType } from "./Day"
import { Button, Stack, Table } from "@mantine/core"
import html2canvas from "html2canvas"
import jsPDF from "jspdf"
import { IconDownload } from "@tabler/icons-react"
import { DatePicker } from '@mantine/dates'

const today = new Date().toISOString().slice(0, 10)

function LoadersSummary() {
  const [date, setDate] = useState<string | null>(today)
  const [dayData, setDayData] = useState<DayType[]>([])
  const printRef = useRef(null)

  const calculateTotalRouteTime = (day: DayType) => {
    let obj: Record<number, number> = {}
    for (let filial in day.filials) {
      for (let [index, loader] of day.filials[filial].loaders.entries()) {
        obj[index] = (obj[index] || 0) + dayjs(loader.endTime).diff(dayjs(dayjs(loader.startTime)), 'minutes')
      }
    }
    const netHours = Object.values(obj).reduce((total, cur) => total + cur, 0)

    return netHours
  }

  const calculateTotalHoursByContractor = (days: DayType[]) => {
    const contractorTimes: Record<string, number> = {}

    for (const day of days) {
      const contractor = day.route.contractor

      let totalMinutesForRoute = 0
      for (let filial in day.filials) {
        for (const loader of day.filials[filial].loaders) {
          const start = dayjs(loader.startTime)
          const end = dayjs(loader.endTime)
          totalMinutesForRoute += end.diff(start, 'minutes')
        }
      }

      contractorTimes[contractor] = (contractorTimes[contractor] || 0) + totalMinutesForRoute
    }

    return Object.entries(contractorTimes).map(([contractor, minutes]) => ({
      contractor,
      hours: Math.floor(minutes / 60),
      minutes: minutes % 60,
    }))
  }

  const getDaySummary = async () => {
    const response = await fetch(`${API}/loaders/routeDay/day-summary?date=${date}`)
    const json = await response.json()
    if (response.ok) {
      setDayData(json)
    }
  }

  useEffect(() => {
    if (date) {
      getDaySummary()
    }
  }, [date])

  const downloadPdf = async () => {
    const element = printRef.current;
    if (!element) return;

    const canvas = await html2canvas(element, { scale: 2 });

    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF('p', 'mm', 'a4');

    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(dayjs(dayData[0].day).format('MMMM D, YYYY'));
  }

  return (
    <div className="loaders-summary-wrapper">
      <Stack w='300px'>
        <h2>Выберите день</h2>
        <DatePicker value={date} onChange={setDate} size="md"/>
      </Stack>
      <div className="summary-and-download">
        <div ref={printRef} className="day-summary-card">
          <h2>Отчет за день</h2>
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Поставщик</Table.Th>
                <Table.Th>Часы</Table.Th>
                <Table.Th>Минуты</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {calculateTotalHoursByContractor(dayData).map(({ contractor, hours, minutes }) => (
                contractor &&
                <Table.Tr key={contractor}>
                  <Table.Td>{contractor}</Table.Td>
                  <Table.Td>{hours}</Table.Td>
                  <Table.Td>{minutes}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <h3>Детально по маршрутам</h3>
          <div className="summary-routes-wrapper">
            {dayData.length > 0 && dayData.map((routeDay: DayType) => {
              return (
                <>
                  {calculateTotalRouteTime(routeDay) !== 0 &&
                    <div key={routeDay.id} className="summary-route-card">
                      <p>Маршрут: {routeDay.route.name}</p>
                      <p>Поставщик: {routeDay.route.contractor}</p>
                      <p id="test">
                        {`Общее время работы: часы: ${Math.floor(calculateTotalRouteTime(routeDay) / 60)} 
                        минуты: ${calculateTotalRouteTime(routeDay) % 60}`}
                      </p>
                    </div>
                  }
                </>
              )
            })}
          </div>
        </div>
        <Button 
          onClick={downloadPdf} 
          variant="light" 
          rightSection={<IconDownload size={18} />} 
        >
          Скачать PDF
        </Button>
      </div>
    </div>
  )
}

export default LoadersSummary

