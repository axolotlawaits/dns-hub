import { useEffect, useState, useMemo, useCallback } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { API } from "../../../config/constants"
import './styles/Route.css'
import Day from "./Day"
import { DayType } from "./Day"
import { ActionIcon, Button, TextInput, Box, Title, Text, Group, Card, Badge, LoadingOverlay, Stack } from "@mantine/core"
import { IconArrowLeft, IconRoute, IconTrash, IconCalendar, IconTruck, IconClock, IconMapPin } from "@tabler/icons-react"
import "react-datepicker/dist/react-datepicker.css"
import dayjs from "dayjs"

function RouteComponent() {
  const routeParams = useParams()
  const navigate = useNavigate()
  const [days, setDays] = useState<DayType[]>([])
  const [searchDay, setSearchDay] = useState('')
  const [loading, setLoading] = useState(true)

  const getDays = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API}/loaders/routeDay/route/${routeParams.id}`)
      const days = await response.json()
      if (response.ok) {
        setDays(days)
      }
    } catch (error) {
      console.error('Error fetching days:', error)
    } finally {
      setLoading(false)
    }
  }, [routeParams.id])

  useEffect(() => {
    getDays()
  }, [getDays])

  const onSearch = useCallback(async () => {
    if (!searchDay) {
      getDays()
      return
    }
    
    setLoading(true)
    try {
      const response = await fetch(`${API}/loaders/routeDay/route/search/${routeParams.id}?day=${searchDay}`)
      const json = await response.json()
      if (response.ok) {
        setDays(json)
      }
    } catch (error) {
      console.error('Error searching days:', error)
    } finally {
      setLoading(false)
    }
  }, [searchDay, routeParams.id, getDays])

  useEffect(() => {
    onSearch()
  }, [onSearch])

  // Мемоизированные данные
  const routeInfo = useMemo(() => {
    if (days.length === 0) return null
    return days[0]?.route
  }, [days])

  const statistics = useMemo(() => {
    const totalDays = days.length
    const totalFilials = days.reduce((acc, day) => acc + day.filials.length, 0)
    const totalLoaders = days.reduce((acc, day) => 
      acc + day.filials.reduce((filialAcc, filial) => filialAcc + filial.loaders.length, 0), 0
    )
    
    // Подсчет рабочих часов
    const totalWorkHours = days.reduce((acc, day) => {
      return acc + day.filials.reduce((filialAcc, filial) => {
        return filialAcc + filial.loaders.reduce((loaderAcc, loader) => {
          const startTime = dayjs(loader.startTime)
          const endTime = dayjs(loader.endTime)
          return loaderAcc + endTime.diff(startTime, 'hours', true)
        }, 0)
      }, 0)
    }, 0)

    return {
      totalDays,
      totalFilials,
      totalLoaders,
      totalWorkHours: Math.round(totalWorkHours * 10) / 10
    }
  }, [days])

  const filteredDays = useMemo(() => {
    if (!searchDay) return days
    return days.filter(day => 
      dayjs(day.day).format('YYYY-MM-DD') === searchDay
    )
  }, [days, searchDay])

  if (loading) return <LoadingOverlay visible />

  return (
    <Box p="md" style={{ background: 'var(--theme-bg-primary)', minHeight: '100vh' }}>
      {/* Современный заголовок */}
      <Box mb="xl" style={{ 
        background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid var(--theme-border-primary)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <Group justify="space-between" mb="md">
          <Group gap="md">
            <Box style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '12px',
              padding: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <IconRoute size={24} color="white" />
            </Box>
            <Box>
              <Title order={1} style={{ color: 'var(--theme-text-primary)', margin: 0 }}>
                {routeInfo?.name || 'Маршрут'}
              </Title>
              <Text size="sm" c="var(--theme-text-secondary)" mt={4}>
                Управление днями маршрута и погрузчиками
              </Text>
            </Box>
          </Group>
          <Button
            leftSection={<IconArrowLeft size={18} />}
            variant="outline"
            onClick={() => navigate(`/supply/loaders`)}
          >
            К маршрутам
          </Button>
        </Group>

        {/* Статистика */}
        <Group gap="lg" mb="md">
          <Box style={{
            background: 'var(--theme-bg-primary)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--theme-border-secondary)',
            textAlign: 'center',
            minWidth: '120px'
          }}>
            <Text size="xl" fw={700} c="var(--theme-text-primary)">
              {statistics.totalDays}
            </Text>
            <Text size="sm" c="var(--theme-text-secondary)">
              Дней в маршруте
            </Text>
          </Box>
          <Box style={{
            background: 'var(--theme-bg-primary)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--theme-border-secondary)',
            textAlign: 'center',
            minWidth: '120px'
          }}>
            <Text size="xl" fw={700} c="var(--theme-text-primary)">
              {statistics.totalFilials}
            </Text>
            <Text size="sm" c="var(--theme-text-secondary)">
              Филиалов
            </Text>
          </Box>
          <Box style={{
            background: 'var(--theme-bg-primary)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--theme-border-secondary)',
            textAlign: 'center',
            minWidth: '120px'
          }}>
            <Text size="xl" fw={700} c="var(--theme-text-primary)">
              {statistics.totalLoaders}
            </Text>
            <Text size="sm" c="var(--theme-text-secondary)">
              Погрузчиков
            </Text>
          </Box>
          <Box style={{
            background: 'var(--theme-bg-primary)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--theme-border-secondary)',
            textAlign: 'center',
            minWidth: '120px'
          }}>
            <Text size="xl" fw={700} c="var(--theme-text-primary)">
              {statistics.totalWorkHours}ч
            </Text>
            <Text size="sm" c="var(--theme-text-secondary)">
              Рабочих часов
            </Text>
          </Box>
        </Group>

        {/* Поиск и фильтры */}
        <Box style={{
          background: 'var(--theme-bg-primary)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid var(--theme-border-secondary)'
        }}>
          <Group gap="md" align="end">
            <Box style={{ flex: 1 }}>
              <Text size="sm" fw={500} c="var(--theme-text-primary)" mb="xs">
                Поиск по дате
              </Text>
              <TextInput 
                value={searchDay}
                onChange={(e) => setSearchDay(e.currentTarget.value)}
                type="date"
                leftSection={<IconCalendar size={16} />}
                placeholder="Выберите дату"
              />
            </Box>
            <ActionIcon 
              variant="light" 
              color="red" 
              size="lg"
              onClick={() => setSearchDay('')}
              disabled={!searchDay}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        </Box>
      </Box>

      {/* Список дней */}
      <Box style={{
        background: 'var(--theme-bg-elevated)',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid var(--theme-border-primary)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <Group justify="space-between" mb="md">
          <Group gap="sm">
            <Text size="lg" fw={600} c="var(--theme-text-primary)">
              Дни маршрута
            </Text>
            {searchDay && (
              <Badge color="blue" variant="light" size="lg">
                {dayjs(searchDay).format('DD.MM.YYYY')}
              </Badge>
            )}
          </Group>
          <Text size="sm" c="var(--theme-text-secondary)">
            {filteredDays.length} {filteredDays.length === 1 ? 'день' : 'дней'}
          </Text>
        </Group>

        {filteredDays.length > 0 ? (
          <Stack gap="md">
            {filteredDays.map(day => (
              <Card
                key={day.id}
                style={{
                  background: 'var(--theme-bg-primary)',
                  border: '1px solid var(--theme-border-secondary)',
                  borderRadius: '12px',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <Group justify="space-between" align="flex-start" mb="sm">
                  <Group gap="md">
                    <Box style={{
                      background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                      borderRadius: '8px',
                      padding: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <IconCalendar size={16} color="white" />
                    </Box>
                    <Box>
                      <Text size="md" fw={600} c="var(--theme-text-primary)" mb="xs">
                        {dayjs(day.day).format('DD MMMM YYYY')}
                      </Text>
                      <Group gap="lg">
                        <Group gap="xs">
                          <IconMapPin size={14} color="var(--theme-text-secondary)" />
                          <Text size="sm" c="var(--theme-text-secondary)">
                            {day.filials.length} филиалов
                          </Text>
                        </Group>
                        <Group gap="xs">
                          <IconTruck size={14} color="var(--theme-text-secondary)" />
                          <Text size="sm" c="var(--theme-text-secondary)">
                            {day.filials.reduce((acc, filial) => acc + filial.loaders.length, 0)} погрузчиков
                          </Text>
                        </Group>
                        <Group gap="xs">
                          <IconClock size={14} color="var(--theme-text-secondary)" />
                          <Text size="sm" c="var(--theme-text-secondary)">
                            {Math.round(day.filials.reduce((acc, filial) => 
                              acc + filial.loaders.reduce((loaderAcc, loader) => {
                                const startTime = dayjs(loader.startTime)
                                const endTime = dayjs(loader.endTime)
                                return loaderAcc + endTime.diff(startTime, 'hours', true)
                              }, 0)
                            , 0) * 10) / 10}ч
                          </Text>
                        </Group>
                      </Group>
                    </Box>
                  </Group>
                </Group>
                
                {/* Встроенный компонент Day */}
                <Box style={{ marginTop: '16px' }}>
                  <Day day={day} getDays={getDays} />
                </Box>
              </Card>
            ))}
          </Stack>
        ) : (
          <Box style={{
            textAlign: 'center',
            padding: '48px 24px',
            border: '2px dashed var(--theme-border-secondary)',
            borderRadius: '12px',
            background: 'var(--theme-bg-primary)'
          }}>
            <Text size="xl" mb="md">📅</Text>
            <Text size="lg" fw={500} c="var(--theme-text-primary)" mb="sm">
              {searchDay ? 'Дни не найдены' : 'Нет дней в маршруте'}
            </Text>
            <Text size="sm" c="var(--theme-text-secondary)">
              {searchDay ? 'Попробуйте выбрать другую дату' : 'Добавьте дни в маршрут для начала работы'}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}

export default RouteComponent