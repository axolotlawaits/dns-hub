import { useEffect, useState } from "react"
import { API } from "../../../config/constants"
import dayjs from "dayjs"
import { DayType } from "./Day"
import { DatePicker } from "@mantine/dates"

function LoadersSummary() {
  const [date, setDate] = useState<string | null>(null)
  const [dayData, setDayData] = useState([])

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
  
  return (
    <>
      <DatePicker value={date} onChange={setDate} />
      <div className="day-summary-card">
        {dayData.length > 0 && dayData.map((routeDay: DayType) => {
          return (
            <>
              <p>Маршрут: {routeDay.route.name}</p>
              <p>Поставщик: {routeDay.route.contractor}</p>
              <p id="test">{`Общее время работы: часы: ${Math.floor(calculateTotalRouteTime(routeDay) / 60)} минуты: ${calculateTotalRouteTime(routeDay) % 60}`}</p>
              {/* <p>{calculateNetHoursByContractor()}</p> */}
            </>
          )
        })}
      </div>
    </>
  )
}

export default LoadersSummary

