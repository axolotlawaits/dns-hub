import { useEffect, useState } from "react"
import { useSearchParams } from "react-router"
import { BranchType } from "./Branch"
import { EmployeeType } from "./Employee"
import BranchCard from './BranchCard'
import { API } from "../../config/constants"
import { ActionIcon, Select } from "@mantine/core"
import { IconFilterOff } from "@tabler/icons-react"

function Handbook() {
  const [searchParams] = useSearchParams()
  const [branches, setBranches] = useState<BranchType[]>([])
  const [employees, setEmployees] = useState<EmployeeType[]>([])
  const [searchFilter, setSearchFilter] = useState<string | null>('')
  const query = searchParams.get('text')
  const [cities, setCities] = useState<string[]>([])
  const [cityFilter, setCityFilter] = useState<string | null>('')

  const getSearchResults = async () => {
    const response = await fetch(`${API}/search/all?text=${query}`)
    const json = await response.json()
    if (response.ok) {
      setBranches(json.branches)
      setEmployees(json.users)
    }
  }

  const getBranches = async () => {
    const response = await fetch(`${API}/search/branch?text=${query}&city=${cityFilter}`)
    const json = await response.json()
    if (response.ok) {
      setBranches(json)
    }
  }

  const getEmployees = async () => {
    const response = await fetch(`${API}/search/employee?text=${query}`)
    const json = await response.json()
    if (response.ok) {
      setEmployees(json)
    }
  }

  const getCities = async () => {
    const response = await fetch(`${API}/search/city?text=${query}`)
    const json = await response.json()
    if (response.ok) {
      setCities(json)
    }
  }

  useEffect(() => {
    getSearchResults()
    getCities()
  }, [searchParams])

  useEffect(() => {
    setBranches([])
    setEmployees([])
    searchFilter === 'branch' && getBranches()
    searchFilter === 'employee' && getEmployees()
  }, [searchFilter, cityFilter])

  const clearFilters = () => {
    setSearchFilter('')
    setCityFilter('')
    getSearchResults()
  }

  return (
    <div id="search-page">
      <div id="search-filters">
        <Select 
          data={[{value: 'branch', label: 'филиал'}, {value: 'employee', label: 'сотрудник'}]} 
          value={searchFilter} 
          onChange={setSearchFilter} 
          placeholder="Поиск по..." 
          style={{ width: 300 }}
        />
        {searchFilter === 'branch' &&
          <Select 
            data={cities} 
            value={cityFilter} 
            onChange={setCityFilter} 
            placeholder="Выбрать город" 
            style={{ width: 300 }}
          />
        }
        {(searchFilter || cityFilter) &&
          <ActionIcon onClick={clearFilters} variant="filled" color="red" size={36} aria-label="clear-filters">
            <IconFilterOff />
          </ActionIcon>
        }
      </div>
      <div id="search-info">
        <span className="search-info-text">Ключевая фраза: {query}</span>
        <span className="search-info-text">Найдено: филиалы: {branches.length}, сотрудники: {employees.length}</span>
      </div>
      {branches.length > 0 && 
        <div className="search-branches">
          <h2>Филиалы</h2>
          <div className="branch-cards-wrapper">
            {branches.map(branch => {
              return (
                <BranchCard key={branch.uuid} branch={branch} />
              )
            })}
          </div>
        </div>
      }
      {employees.length > 0 && 
        <div className="employee-cards-wrapper">
          <h2>Сотрудники</h2>
          {employees.map(employee => {
            return (
              <div key={employee.uuid} className="employee-card">
                <h1 className="employee-card-title">{employee.fio}</h1>
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
      }
    </div>
  )
}

export default Handbook