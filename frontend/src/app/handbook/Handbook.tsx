import { useEffect, useState } from "react"
import { useSearchParams } from "react-router"
import { BranchType } from "./Branch"
import { EmployeeType } from "./Employee"
import BranchCard from './BranchCard'
import { API } from "../../config/constants"

function Handbook() {
  const [searchParams] = useSearchParams()
  const [branches, setBranches] = useState<BranchType[]>([])
  const [employees, setEmployees] = useState<EmployeeType[]>([])
  const query = searchParams.get('text')

  const getSearchResults = async () => {
    const response = await fetch(`${API}/search/all?text=${query}`)
    const json = await response.json()
    if (response.ok) {
      console.log(json)
      setBranches(json.branches)
      setEmployees(json.users)
    }
  }

  useEffect(() => {
    getSearchResults()
  }, [searchParams])
  
  return (
    <div id="search-page">
      <h2>Филиалы</h2>
      <div className="branch-cards-wrapper">
        {branches.length > 0 && branches.map(branch => {
          return (
            <BranchCard key={branch.uuid} branch={branch} />
          )
        })}
      </div>
      <h2>Сотрудники</h2>
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
    </div>
  )
}

export default Handbook