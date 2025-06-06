import { Button, Modal, TextInput } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { useState } from 'react'
import { API } from '../config/constants'
import { useDisclosure } from '@mantine/hooks'
import { useNavigate } from 'react-router'
import { BranchType } from '../app/handbook/Branch'
import { EmployeeType } from '../app/handbook/Employee'
import { Tool } from './Tools'

function Search() {
  const [opened, { open, close }] = useDisclosure(false)
  const [branchResult, setBranchResult] = useState<BranchType[]>([])
  const [employeeResult, setEmployeeResult] = useState<EmployeeType[]>([])
  const [toolResult, setToolResult] = useState<Tool[]>([])
  const navigate = useNavigate()
  const [text, setText] = useState('')

  const onSearch = async (text: string) => {
    const response = await fetch(`${API}/search?text=${text}`)
    const json = await response.json()
    if (response.ok) {
      setBranchResult(json.branches)
      setEmployeeResult(json.users)
      setToolResult(json.tools)
    }
  }

  const onResultClick = (link: string) => {
    close()
    clearData()
    navigate(link)
  }

  const onSearchEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (text && e.key === 'Enter') {
      close()
      clearData()
      navigate(`/search?text=${text}`)
    }
  }

  const clearData = () => {
    setBranchResult([])
    setEmployeeResult([])
    setToolResult([])
  }

  return (
    <>
      <Modal opened={opened} onClose={() => {close(), setBranchResult([])}} title="Что будем искать?">
        <TextInput
          data-autofocus
          size='md'
          placeholder="поиск"
          leftSection={<IconSearch size={20} />}
          onChange={(e) => e.target.value ? (onSearch(e.target.value), setText(e.target.value)) : clearData()}
          onKeyDown={onSearchEnter}
        />
        <div id='search-results'>
          {branchResult.length > 0 && 
            <div className='search-group'>
              <h1 className='search-group-title'>Филиалы</h1>
              {branchResult.map(branch => {
                return (
                  <div key={branch.uuid} className='search-result' onClick={() => onResultClick(`/branch/${branch.uuid}`)}>
                    <span>{branch.name}</span>
                  </div>
                )
              })}
            </div>
          }
          {employeeResult.length > 0 &&
            <div className='search-group'>
              <h1 className='search-group-title'>Сотрудники</h1>
              {employeeResult.map(employee => {
                return (
                  <div key={employee.uuid} className='search-result' onClick={() => onResultClick(`/employee/${employee.uuid}`)}>
                    <span>{employee.fio}</span>
                  </div>
                )
              })}
            </div>
          }
          {toolResult.length > 0 &&
            <div className='search-group'>
              <h1 className='search-group-title'>Инструменты</h1>
              {toolResult.map(tool => {
                return (
                  <div key={tool.id} className='search-result' onClick={() => onResultClick(`/${tool.link}`)}>
                    <span>{tool.name}</span>
                  </div>
                )
              })}
            </div>
          }
        </div>
      </Modal>
      <Button
        style={{ width: 200, display: 'flex', color: 'GrayText', fontWeight: '200'}}
        size='sm'
        variant='default'
        leftSection={<IconSearch size={18} />}
        onClick={open}
      >
        поиск
      </Button>
    </>
  )
}

export default Search