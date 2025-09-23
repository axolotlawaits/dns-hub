import { Card, Button, ActionIcon, Group, Text, ScrollArea, Box, Title, Badge, Tooltip, Grid, Paper, Stack, Modal } from '@mantine/core'
import './styles/Home.css'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react';
import { API } from '../../../config/constants';
import { useDisclosure } from '@mantine/hooks';
import { FilialType } from './Day';
import dayjs from 'dayjs';
import RouteEdit from './RouteEdit';
import { IconPlus, IconTrash, IconRoute, IconBuilding, IconCalendar, IconMapPin, IconChevronRight } from '@tabler/icons-react';
import useAuthFetch from '../../../hooks/useAuthFetch';
import { useUserContext } from '../../../hooks/useUserContext';
import { DynamicFormModal } from '../../../utils/formModal';

export const rrsInitData = ['Алтай', 'Барнаул', 'Кемерово', 'Новокузнецк', 'Новосибирск', 'Новосибирская область', 'Омск', 'Томск']

export type RouteType = {
  id: string
  name: string
  filials: FilialType[]
  contractor: string
  rrs: string
  createdAt: string
}

type ValErrors = {
  name: string
  contractor: string
  filials: string
}

function LoadersRoutes() {
  const authFetch = useAuthFetch()
  const { user } = useUserContext()
  const [filialsData, setFilialsData] = useState([])
  const [routes, setRoutes] = useState<RouteType[]>([])
  const [opened, { open, close }] = useDisclosure(false)
  const [valErrors, setValErrors] = useState<ValErrors | null>(null)
  const [routeDeleteId, setRouteDeleteId] = useState<string | null>(null)

  useEffect(() => {
    const getRoutes = async () => {
      const response = await authFetch(`${API}/loaders/route`)
      
      if (response && response.ok) {
        const json = await response.json()
        setRoutes(json)
      }
    }
    getRoutes()
  }, [])

  useEffect(() => {
    const getFilials = async () => {
      const response = await fetch(`${API}/loaders/filial/Новосибирск`)
      const filials = await response.json()
      if (response.ok) {
        // Нормализуем к { value, label }
        const normalized = (filials || []).map((item: any) => {
          if (typeof item === 'string') return { value: item, label: item }
          const value = item?.id ?? item?.value ?? ''
          const label = item?.name ?? item?.label ?? item?.title ?? String(value)
          return { value, label }
        }).filter((o: any) => o.value && o.label)
        setFilialsData(normalized as any)
      }
    }
    getFilials()
  }, [])


  const deleteRoute = async (routeId: string) => {
    const response = await fetch(`${API}/loaders/route/${routeId}`, {
      method: 'DELETE',
      headers: { 'Content-type': 'application/json' }
    })
    const json = await response.json()

    if (response.ok) {
      setRoutes(routes.filter(route => route.id !== json.id))
      close()
    } else {
      setValErrors(json.errors)
    }
  }

  const handleRouteUpdated = (updatedRoute: RouteType) => {
    setRoutes(routes.map(route => 
      route.id === updatedRoute.id ? updatedRoute : route
    ))
  }


  const getRouteStatus = (route: RouteType) => {
    const daysDiff = dayjs().diff(route.createdAt, 'day');
    if (daysDiff < 1) return { status: 'new', color: 'green', label: 'Новый' };
    if (daysDiff < 7) return { status: 'active', color: 'blue', label: 'Активный' };
    return { status: 'old', color: 'gray', label: 'Старый' };
  };

  return (
    <Box>
      {/* Заголовок и кнопка создания */}
      <Group justify="space-between" mb="xl">
        <Box>
          <Title order={2} style={{ color: 'var(--theme-text-primary)', margin: 0 }}>
            Маршруты грузчиков
          </Title>
          <Text size="sm" c="var(--theme-text-secondary)" mt={4}>
            Управление маршрутами и планирование работы грузчиков
          </Text>
        </Box>
      <Button 
        onClick={open} 
          leftSection={<IconPlus size={16} />} 
          variant="gradient"
          gradient={{ from: 'blue', to: 'cyan' }}
          size="md"
        >
          Создать маршрут
      </Button>
      </Group>

      {/* Модальное окно создания маршрута */}
      <DynamicFormModal
        opened={opened}
        onClose={() => {close(), setValErrors(null)}}
        title="Создание нового маршрута"
        mode="create"
        fields={[
          {
            name: 'name',
            label: 'Наименование маршрута',
            type: 'text',
            required: true,
            placeholder: 'Введите название маршрута'
          },
          {
            name: 'contractor',
            label: 'Подрядчик',
            type: 'text',
            required: true,
            placeholder: 'Введите название подрядчика'
          },
          {
            name: 'rrs',
            label: 'РРС',
            type: 'select',
            required: true,
            options: rrsInitData
              .filter(item => item && typeof item === 'string')
              .map(item => ({ value: item, label: item })),
            placeholder: 'Выберите РРС',
            onChange: async (value: any) => {
              if (value) {
                const response = await fetch(`${API}/loaders/filial/${value}`)
                const filials = await response.json()
                if (response.ok) {
                  setFilialsData(filials)
                }
              }
            }
          },
          {
            name: 'filials',
            label: 'Филиалы',
            type: 'select',
            required: true,
            options: (filialsData || []),
            placeholder: 'Выберите филиалы',
            multiple: true,
            searchable: true
          }
        ]}
        initialValues={{
          name: '',
          contractor: '',
          rrs: 'Новосибирск',
          filials: []
        }}
        onSubmit={async (values: any) => {
          const response = await fetch(`${API}/loaders/route`, {
            method: 'POST',
            body: JSON.stringify({
              name: values.name,
              contractor: values.contractor,
              rrs: values.rrs,
              filials: values.filials
            }),
            headers: { 'Content-type': 'application/json' }
          });
          const json = await response.json();

          if (response.ok) {
            setRoutes([...routes, json]);
            close();
            setValErrors(null);
          } else {
            setValErrors(json.errors);
          }
        }}
        error={valErrors ? Object.values(valErrors).join(', ') : undefined}
      />

      {/* Список маршрутов */}
      {routes.length > 0 ? (
        <Grid gutter="lg">
          {routes.map((route: RouteType) => {
            const status = getRouteStatus(route);
          return (
              <Grid.Col key={route.id} span={{ base: 12, sm: 6, md: 4 }}>
                <Card 
                  style={{
                    background: 'var(--theme-bg-elevated)',
                    borderRadius: '16px',
                    border: '1px solid var(--theme-border-primary)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    height: '100%',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)';
                  }}
                >
                  {/* Градиентная полоса сверху */}
                  <Box style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '16px 16px 0 0'
                  }} />

                  {/* Заголовок маршрута */}
                  <Group justify="space-between" align="flex-start" mb="md">
                    <Box style={{ flex: 1 }}>
                      <Link 
                        to={`./route/${route.id}`}
                        style={{ 
                          textDecoration: 'none',
                          color: 'var(--theme-text-primary)'
                        }}
                      >
                        <Title order={4} style={{ 
                          margin: 0, 
                          color: 'var(--theme-text-primary)',
                          lineHeight: 1.3
                        }}>
                          {route.name}
                        </Title>
                      </Link>
                      <Text size="sm" c="var(--theme-text-secondary)" mt={4}>
                        {route.contractor}
                      </Text>
                    </Box>
                    <Badge 
                      color={status.color} 
                      variant="light" 
                      size="sm"
                      style={{ 
                        background: `var(--mantine-color-${status.color}-light)`,
                        color: `var(--mantine-color-${status.color}-6)`
                      }}
                    >
                      {status.label}
                    </Badge>
                  </Group>

                  {/* Информация о маршруте */}
                  <Stack gap="sm" mb="md">
                    <Group gap="sm">
                      <Box style={{
                        background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                        borderRadius: '6px',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <IconMapPin size={12} color="white" />
                      </Box>
                      <Text size="sm" c="var(--theme-text-secondary)">
                        РРС: {route.rrs}
                      </Text>
                    </Group>
                    
                    <Group gap="sm">
                      <Box style={{
                        background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                        borderRadius: '6px',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <IconBuilding size={12} color="white" />
                      </Box>
                      <Text size="sm" c="var(--theme-text-secondary)">
                        Филиалов: {route.filials.length}
                      </Text>
                    </Group>

                    <Group gap="sm">
                      <Box style={{
                        background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
                        borderRadius: '6px',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <IconCalendar size={12} color="white" />
                      </Box>
                      <Text size="sm" c="var(--theme-text-secondary)">
                        {dayjs(route.createdAt).format('DD.MM.YYYY')}
                      </Text>
                    </Group>
        </Stack>

                  {/* Список филиалов */}
                  <Box mb="md">
                    <Text size="sm" fw={500} c="var(--theme-text-primary)" mb="xs">
                      Филиалы в маршруте:
                    </Text>
                    <ScrollArea style={{ height: '80px' }} scrollbarSize={6}>
                      <Stack gap="xs">
                        {route.filials.slice(0, 5).map(filial => (
                          <Group key={filial.id} gap="xs">
                            <Box style={{
                              width: '4px',
                              height: '4px',
                              borderRadius: '50%',
                              background: 'var(--theme-text-secondary)'
                            }} />
                            <Text size="xs" c="var(--theme-text-secondary)" style={{ lineHeight: 1.4 }}>
                              {filial.name}
                            </Text>
                          </Group>
                        ))}
                        {route.filials.length > 5 && (
                          <Text size="xs" c="var(--theme-text-secondary)" style={{ fontStyle: 'italic' }}>
                            и еще {route.filials.length - 5} филиалов...
                          </Text>
                        )}
                  </Stack>
                </ScrollArea>
                  </Box>

                  {/* Футер с действиями */}
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      {(dayjs().diff(route.createdAt, 'day') >= 5 && user?.role === 'EMPLOYEE') ? null : (
                        <RouteEdit 
                          route={route} 
                          onRouteUpdated={handleRouteUpdated}
                        />
                      )}
                      {user?.role !== 'EMPLOYEE' && (
                        <Tooltip label="Удалить маршрут">
                          <ActionIcon 
                            onClick={() => setRouteDeleteId(route.id)} 
                            size="sm" 
                            variant="light"
                            color="red"
                            style={{
                              background: 'var(--theme-bg-secondary)',
                              border: '1px solid var(--theme-border-primary)'
                            }}
                          >
                            <IconTrash size={14} />
                      </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                    
                    <Link 
                      to={`./route/${route.id}`}
                      style={{ 
                        textDecoration: 'none',
                        color: 'var(--theme-text-primary)'
                      }}
                    >
                      <Group gap="xs" style={{ cursor: 'pointer' }}>
                        <Text size="sm" c="var(--theme-text-primary)">
                          Открыть
                        </Text>
                        <IconChevronRight size={14} />
                      </Group>
                    </Link>
                  </Group>
              </Card>
              </Grid.Col>
            );
          })}
        </Grid>
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
            <IconRoute size={32} color="white" />
          </Box>
          <Title order={3} style={{ color: 'var(--theme-text-primary)', marginBottom: '8px' }}>
            Нет маршрутов
          </Title>
          <Text size="sm" c="var(--theme-text-secondary)" mb="md">
            Создайте первый маршрут для начала работы с грузчиками
          </Text>
          <Button 
            onClick={open}
            leftSection={<IconPlus size={16} />}
            variant="gradient"
            gradient={{ from: 'blue', to: 'cyan' }}
          >
            Создать маршрут
          </Button>
        </Paper>
      )}

      {/* Модальное окно удаления */}
      <Modal 
        opened={routeDeleteId !== null} 
        onClose={() => setRouteDeleteId(null)} 
        size="xs" 
        centered
        title="Подтверждение удаления"
      >
        <Stack gap="md">
          <Text>Вы уверены, что хотите удалить этот маршрут?</Text>
                          <Group grow>
            <Button 
              onClick={() => routeDeleteId && deleteRoute(routeDeleteId)} 
              color="red"
              variant="filled"
            >
              Удалить
            </Button>
            <Button 
              onClick={() => setRouteDeleteId(null)} 
              variant="light"
            >
              Отмена
            </Button>
                          </Group>
                        </Stack>
                      </Modal>
    </Box>
  )
}

export default LoadersRoutes