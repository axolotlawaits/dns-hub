import { useEffect, useState } from "react"
import { useSearchParams } from "react-router"
import { EmployeeType } from "./Employee"
import { API } from "../../config/constants"

function EmployeeSearch() {
  const [searchParams] = useSearchParams()
  const [employees, setEmployees] = useState<EmployeeType[]>([])
  const query = searchParams.get('text')

  const getEmployees = async () => {
    const response = await fetch(`${API}/search/employee?text=${query}`)
    const json = await response.json()
    if (response.ok) {
      setEmployees(json)
    }
  }

  useEffect(() => {
    getEmployees()
  }, [searchParams])

  return (
    <div className="employee-cards-wrapper">
      {employees.length > 0 && employees.map(employee => {
        return (
          <div className="employee-card">
            <h1>{employee.fio}</h1>
            <div className="employee-info">
              <span>Должность: {employee.position}</span>
              <span>Почта: {employee.email}</span>
              <span>Статус: {employee.status}</span>
              <span>Филиал: {employee.branch.name}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default EmployeeSearch

