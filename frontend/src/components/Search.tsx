import { Button, Modal, TextInput } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { useState } from 'react'
import { API } from '../config/constants'
import { useDisclosure } from '@mantine/hooks'
import { useNavigate } from 'react-router'
import { BranchType } from '../app/handbook/Branch'
import { UserDataType } from '../app/handbook/Branch'

function Search() {
  const [opened, { open, close }] = useDisclosure(false)
  const [branchResult, setBranchResult] = useState<BranchType[]>([])
  const [userResult, setUserResult] = useState<UserDataType[]>([])
  const navigate = useNavigate()
  const [text, setText] = useState('')

  const branchSearch = async (text: string) => {
    const response = await fetch(`${API}/search?text=${text}`)
    const json = await response.json()
    if (response.ok) {
      setBranchResult(json.branches)
      setUserResult(json.users)
    }
  }

  const onBranchClick = (id: string) => {
    close()
    setBranchResult([])
    navigate(`/branch/${id}`)
  }

  const onSearchEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (text && e.key === 'Enter') {
      close()
      setBranchResult([])
      navigate(`/branch?text=${text}`)
    }
  }

  return (
    <>
      <Modal opened={opened} onClose={() => {close(), setBranchResult([])}} title="Что будем искать?">
        <TextInput
          data-autofocus
          size='md'
          placeholder="поиск"
          leftSection={<IconSearch size={20} />}
          onChange={(e) => e.target.value ? (branchSearch(e.target.value), setText(e.target.value)) : setBranchResult([])}
          onKeyDown={onSearchEnter}
        />
        <div id='search-results'>
          {branchResult.length > 0 && 
          <>
            <h1 className='search-group-title'>Филиалы</h1>
            {branchResult.map(branch => {
              return (
                <div key={branch.uuid} className='search-result' onClick={() => onBranchClick(branch.uuid)}>
                  <span>{branch.name}</span>
                </div>
              )
            })}
            <h1 className='search-group-title'>Сотрудники</h1>
            {userResult.map(user => {
              return (
                <div key={user.uuid} className='search-result' onClick={() => onBranchClick(user.uuid)}>
                  <span>{user.fio}</span>
                </div>
              )
            })}
          </>
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