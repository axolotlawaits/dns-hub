import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { API } from "../../../config/constants"
import './styles/Route.css'
import Day from "./Day"
import { DayType } from "./Day"
import { ActionIcon, Button, TextInput } from "@mantine/core"
import { IconArrowLeft, IconRoute, IconTrash } from "@tabler/icons-react"
import "react-datepicker/dist/react-datepicker.css"

function RouteComponent() {
  const routeParams = useParams()
  const navigate = useNavigate()
  const [days, setDays] = useState<DayType[]>([])
  const [searchDay, setSearchDay] = useState('')

  const getDays = async () => {
    const response = await fetch(`${API}/loaders/routeDay/route/${routeParams.id}`)
    const days = await response.json()
    if (response.ok) {
      setDays(days)
    }
  }

  useEffect(() => {
    getDays()
  }, [routeParams.id])

  const onSearch = async () => {
    const response = await fetch(`${API}/loaders/routeDay/route/search/${routeParams.id}?day=${searchDay}`)
    const json = await response.json()
    if (response.ok) {
      setDays(json)
    }
  }

  useEffect(() => {
    if (searchDay) {
      onSearch()
    } else {
      getDays()
    }
  }, [searchDay])

  return (
    <div id="route-wrapper">
      <div className="route-header">
        <Button
          leftSection={<IconArrowLeft size={22} />}
          rightSection={<IconRoute size={18} />}
          onClick={() => navigate(`/supply/loaders`)}
          style={{ width: 200 }}
        >
          к маршрутам
        </Button>
        <div className="route-filter-block">
          <TextInput 
            value={searchDay}
            onChange={(e) => setSearchDay(e.currentTarget.value)}
            type="date"
          />
          <ActionIcon variant="filled" color="red" aria-label="clear" size="md">
            <IconTrash style={{ width: '70%', height: '70%' }} />
          </ActionIcon>
        </div>
      </div>
      <div id="route-days-wrapper">
        {days.length > 0 && days.map(day => {
          return (
            <Day key={day.id} day={day} getDays={getDays}></Day>
          )
        })}
      </div>
    </div>
  )
}

export default RouteComponent