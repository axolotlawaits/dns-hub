import { useEffect, useRef, useState } from "react"
import { API } from "../../../config/constants"
import dayjs from "dayjs"
import { DayType } from "./Day"
import { Button, Stack, Table, Box, Title, Text, Group, Card, Badge, Paper, Divider, ScrollArea } from "@mantine/core"
import html2canvas from "html2canvas"
import jsPDF from "jspdf"
import { IconDownload, IconFileText } from "@tabler/icons-react"
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
    <Box>
      {/* Заголовок и выбор даты */}
      <Group justify="space-between" mb="xl">
        <Box>
          <Title order={2} style={{ color: 'var(--theme-text-primary)', margin: 0 }}>
            Отчеты по грузчикам
          </Title>
          <Text size="sm" c="var(--theme-text-secondary)" mt={4}>
            Аналитика работы грузчиков и маршрутов
          </Text>
        </Box>
        <Group gap="md">
          <DatePicker 
            value={date} 
            onChange={setDate} 
            size="md"
            style={{ minWidth: '200px' }}
          />
          <Button 
            onClick={downloadPdf} 
            variant="gradient"
            gradient={{ from: 'blue', to: 'cyan' }}
            leftSection={<IconDownload size={16} />}
            disabled={dayData.length === 0}
          >
            Скачать PDF
          </Button>
        </Group>
      </Group>

      {dayData.length > 0 ? (
        <Box>
          {/* Детальная таблица */}
          <Card style={{
            background: 'var(--theme-bg-elevated)',
            borderRadius: '16px',
            border: '1px solid var(--theme-border-primary)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            position: 'relative',
            overflow: 'hidden'
          }} ref={printRef}>
            <Box style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '4px',
              background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '16px 16px 0 0'
            }} />
            <Group gap="md" mb="lg">
              <Box style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '8px',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <IconFileText size={20} color="white" />
              </Box>
              <Box>
                <Title order={3} style={{ color: 'var(--theme-text-primary)', margin: 0 }}>
                  Отчет за {dayjs(date).format('DD MMMM YYYY')}
                </Title>
                <Text size="sm" c="var(--theme-text-secondary)" mt={4}>
                  Детальная статистика по подрядчикам
                </Text>
              </Box>
            </Group>

            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr style={{ background: 'var(--theme-bg-secondary)' }}>
                  <Table.Th style={{ color: 'var(--theme-text-primary)', fontWeight: 600 }}>Подрядчик</Table.Th>
                  <Table.Th style={{ color: 'var(--theme-text-primary)', fontWeight: 600 }}>Часы</Table.Th>
                  <Table.Th style={{ color: 'var(--theme-text-primary)', fontWeight: 600 }}>Минуты</Table.Th>
                  <Table.Th style={{ color: 'var(--theme-text-primary)', fontWeight: 600 }}>Всего часов</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {calculateTotalHoursByContractor(dayData).map(({ contractor, hours, minutes }) => (
                  contractor && (
                    <Table.Tr key={contractor}>
                      <Table.Td style={{ color: 'var(--theme-text-primary)' }}>{contractor}</Table.Td>
                      <Table.Td style={{ color: 'var(--theme-text-primary)' }}>{hours}</Table.Td>
                      <Table.Td style={{ color: 'var(--theme-text-primary)' }}>{minutes}</Table.Td>
                      <Table.Td style={{ color: 'var(--theme-text-primary)', fontWeight: 600 }}>
                        {(hours + minutes / 60).toFixed(1)} ч
                      </Table.Td>
                    </Table.Tr>
                  )
                ))}
              </Table.Tbody>
            </Table>

            <Divider my="lg" />

            <Title order={4} style={{ color: 'var(--theme-text-primary)', marginBottom: '16px' }}>
              Детально по маршрутам
            </Title>
            <ScrollArea style={{ maxHeight: '400px' }}>
              <Stack gap="md">
                {dayData.length > 0 && dayData.map((routeDay: DayType) => {
                  const totalTime = calculateTotalRouteTime(routeDay);
                  if (totalTime === 0) return null;
                  
                  return (
                    <Paper key={routeDay.id} style={{
                      background: 'var(--theme-bg-primary)',
                      borderRadius: '12px',
                      padding: '16px',
                      border: '1px solid var(--theme-border-secondary)'
                    }}>
                      <Group justify="space-between" mb="sm">
                        <Text fw={600} c="var(--theme-text-primary)">
                          {routeDay.route.name}
                        </Text>
                        <Badge color="blue" variant="light">
                          {routeDay.route.contractor}
                        </Badge>
                      </Group>
                      <Text size="sm" c="var(--theme-text-secondary)">
                        Общее время работы: {Math.floor(totalTime / 60)}ч {totalTime % 60}м
                      </Text>
                    </Paper>
                  );
                })}
              </Stack>
            </ScrollArea>
          </Card>
        </Box>
      ) : (
        <Paper style={{
          background: 'var(--theme-bg-elevated)',
          borderRadius: '16px',
          padding: '48px 24px',
          textAlign: 'center',
          border: '2px dashed var(--theme-border-secondary)'
        }}>
          <Box style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '50%',
            padding: '16px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px'
          }}>
            <IconFileText size={32} color="white" />
          </Box>
          <Title order={3} style={{ color: 'var(--theme-text-primary)', marginBottom: '8px' }}>
            Нет данных за выбранную дату
          </Title>
          <Text size="sm" c="var(--theme-text-secondary)" mb="md">
            Выберите другую дату для просмотра отчета
          </Text>
        </Paper>
      )}
    </Box>
  )
}

export default LoadersSummary

