import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { API } from "../../../config/constants"
import './styles/Route.css'
import Day from "./Day"
import { DayType } from "./Day"
import { Button } from "@mantine/core"
import { IconArrowLeft, IconRoute } from "@tabler/icons-react"

function RouteComponent() {
  const routeParams = useParams()
  const navigate = useNavigate()
  const [days, setDays] = useState<DayType[]>([])

  useEffect(() => {
    const getDays = async () => {
      const response = await fetch(`${API}/loaders/routeDay/route/${routeParams.id}`)
      const days = await response.json()
      if (response.ok) {
        setDays(days)
      }
    }
    getDays()
  }, [routeParams.id])

  return (
    <div id="route-wrapper">
      <Button
        leftSection={<IconArrowLeft size={22} />}
        rightSection={<IconRoute size={18} />}
        onClick={() => navigate(`/supply/loaders`)}
        style={{ width: 200 }}
      >
        к маршрутам
      </Button>
      <div id="route-days-wrapper">
        {days.length > 0 && days.map(day => {
          return (
            <Day key={day.id} day={day}></Day>
          )
        })}
      </div>
    </div>
  )
}

export default RouteComponent