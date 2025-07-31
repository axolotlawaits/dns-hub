import { Card, Button, TextInput, MultiSelect, Stack, Select, Modal, Divider } from '@mantine/core'
import './styles/Home.css'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react';
import { API } from '../../../config/constants';
import { useDisclosure } from '@mantine/hooks';
import { FilialType } from './Day';
import dayjs from 'dayjs';
import RouteEdit from './RouteEdit';
import { IconPlus } from '@tabler/icons-react';

export const rrsInitData = ['Алтай', 'Барнаул', 'Кемерово', 'Новокузнецк', 'Новосибирск', 'Новосибирская область', 'Омск', 'Томск']

export type RouteType = {
  id: string
  name: string
  filials: FilialType[]
  contractor: string
  rrs: string
  createdAt: string
}

type valErrors = {
  name: string
  contractor: string
  filials: string
}

function LoadersRoutes() {
  const [name, setName] = useState('')
  const [contractor, setContractor] = useState('')
  const [rrs, setRrs] = useState<string | null>('Новосибирск')
  const [filialsData, setFilialsData] = useState([])
  const [filialSearch, setFilialSearch] = useState('')
  const [filials, setFilials] = useState<string[]>([])
  const [routes, setRoutes] = useState<RouteType[]>([])
  const [opened, { open, close }] = useDisclosure(false)
  const [valErrors, setValErrors] = useState<valErrors | null>(null)

  useEffect(() => {
    const getRoutes = async () => {
      const response = await fetch(`${API}/loaders/route`)
      const routes = await response.json()
      if (response.ok) {
        setRoutes(routes)
      }
    }
    getRoutes()
  }, [])

  useEffect(() => {
    const getFilials = async () => {
      const response = await fetch(`${API}/loaders/filial/${rrs}`)
      const filials = await response.json()
      if (response.ok) {
        setFilialsData(filials)
      }
    }
    getFilials()
  }, [rrs])

  const createRoute = async () => {
    const response = await fetch(`${API}/loaders/route`, {
      method: 'POST',
      body: JSON.stringify({name, contractor, rrs, filials}),
      headers: { 'Content-type': 'application/json' }
    })
    const json = await response.json()

    if (response.ok) {
      setRoutes([...routes, json])
      close()
    } else {
      setValErrors(json.errors)
    }
  }
  console.log(valErrors)
  return (
    <div id='routes-page-wrapper'>
      <Button 
        onClick={open} 
        leftSection={<IconPlus size={18} />} 
        variant='light'
      >
        создать новый маршрут
      </Button>
      <Modal opened={opened} onClose={() => {close(), setValErrors(null)}} closeOnClickOutside={false}>
        <Stack gap="md">
          <TextInput
            placeholder='Наименование'
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            error={valErrors?.name}
          />
          <TextInput
            placeholder='Подрядчик'
            value={contractor}
            onChange={(e) => setContractor(e.currentTarget.value)}
            error={valErrors?.contractor}
          />
          <Select data={rrsInitData} value={rrs} onChange={setRrs} placeholder='Выбрать РРС'/>
          <MultiSelect 
            data={filialsData} 
            searchValue={filialSearch} 
            onSearchChange={setFilialSearch}
            placeholder='Выбрать филиалы'
            value={filials}
            onChange={setFilials}
            searchable 
            error={valErrors?.filials}
          />
          <Button onClick={createRoute}>создать</Button>
        </Stack>
      </Modal>
      <h1>Маршруты</h1>
      <div id='routes-wrapper'>
        {routes.length > 0 && routes.map((route: RouteType) => {
          return (
            <div key={route.id} >
              <Card shadow="sm" padding="lg" radius="md" withBorder className='route-card'>
                <Link className='card-text-link' to={`./route/${route.id}`}>{route.name}</Link>
                <div>
                  {route.filials.map(filial => {
                    return (
                      <p key={filial.id}>{filial.name}</p>
                    )
                  })}
                </div>
                <Divider my="md" />
                <div className='route-card-footer'>
                  <span className='route-created'>{dayjs(route.createdAt).format('MMMM D, YYYY')}</span>
                  <RouteEdit route={route} filialsData={filialsData} />
                </div>
              </Card>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default LoadersRoutes