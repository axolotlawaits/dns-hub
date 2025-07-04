import { useParams } from "react-router"
import { API } from "../../config/constants"
import { useEffect, useState } from "react"
import { BranchType } from "./Branch"

export type PositionType = {
  uuid: string
  name: string
}

export type EmployeeType = {
  uuid: string
  fio: string
  position: PositionType
  email: string
  status: string
  branch: BranchType
}

function Employee() {
  const params = useParams()
  const [employee, setEmployee] = useState<EmployeeType>()

  const getEmployee = async () => {
    const response = await fetch(`${API}/search/employee/${params.id}`)
    const json = await response.json()
    if (response.ok) {
      setEmployee(json)
    }
  }

  useEffect(() => {
    getEmployee()
  }, [params.id])

  return (
    employee &&
    <div className="employee-card">
      <h1 className="employee-card-title">{employee.fio}</h1>
      <div className="employee-info">
        <span>Должность: {employee.position.name}</span>
        <span>Почта: {employee.email}</span>
        <span>Статус: {employee.status}</span>
        <span>Филиал: {employee.branch.name}</span>
      </div>
    </div>
  )
}

export default Employee