import { useEffect, useState } from "react"
import { API } from "../../../config/constants"
import dayjs from "dayjs"
import { DayType } from "./Day"
import DatePicker from "react-datepicker"
import { useThemeContext } from "../../../hooks/useThemeContext"

function LoadersSummary() {
  const [date, setDate] = useState<Date | null>(new Date())
  const [dayData, setDayData] = useState([])
  const { isDark } = useThemeContext()

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
  
  return (
    <div className="loaders-summary-wrapper">
      <div className="loaders-summary-block">
        <h2>Выберите день</h2>
        <DatePicker 
          selected={date} 
          onChange={setDate} 
          inline
          locale="ru"
          calendarStartDay={1}
          showMonthDropdown
          showYearDropdown
          dropdownMode="select"
          dateFormat="dd.MM.yyyy"
          className={isDark ? "dark-theme-datepicker" : ""}
          popperClassName="no-border-popper"
          calendarClassName={isDark ? "dark-calendar" : ""}
        />
      </div>
      <div className="day-summary-card">
        <h2>Отчет за день</h2>
        {calculateTotalHoursByContractor(dayData).map(({ contractor, hours, minutes }) => (
          <p key={contractor}>
            {contractor ? contractor : 'Без имени'}: часы: {hours} минуты: {minutes}
          </p>
        ))}
        <h3>Детально по маршрутам</h3>
        {dayData.length > 0 && dayData.map((routeDay: DayType) => {
          return (
            <>
              {calculateTotalRouteTime(routeDay) !== 0 &&
                <>
                  <p>Маршрут: {routeDay.route.name}</p>
                  <p>Поставщик: {routeDay.route.contractor}</p>
                  <p id="test">
                    {`Общее время работы: часы: ${Math.floor(calculateTotalRouteTime(routeDay) / 60)} 
                    минуты: ${calculateTotalRouteTime(routeDay) % 60}`}
                  </p>
                </>
              }
            </>
          )
        })}
      </div>
    </div>
  )
}

export default LoadersSummary

