import { Button, Modal, TextInput } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { useState } from 'react'
import { API } from '../config/constants'
import { useDisclosure } from '@mantine/hooks'
import { useNavigate } from 'react-router'
import { BranchType } from '../app/Branch'

function Search() {
  const [opened, { open, close }] = useDisclosure(false)
  const [branchResult, setBranchResult] = useState<BranchType[]>([])
  const navigate = useNavigate()
  const [text, setText] = useState('')

  const branchSearch = async (text: string) => {
    const response = await fetch(`${API}/search?text=${text}`)
    const json = await response.json()
    if (response.ok) {
      setBranchResult(json)
      console.log('ee')
    }
  }

  const onBranchClick = (id: string) => {
    close()
    navigate(`/branch/${id}`)
  }

  const onSearchEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (text && e.key === 'Enter') {
      close()
      navigate(`/branch?text=${text}`)
    }
  }

  return (
    <>
      <Modal opened={opened} onClose={() => {close(), setBranchResult([])}} title="Что будем искать?">
        <TextInput
          size='md'
          placeholder="поиск"
          leftSection={<IconSearch size={20} />}
          onChange={(e) => e.target.value ? (branchSearch(e.target.value), setText(e.target.value)) : setBranchResult([])}
          onKeyDown={onSearchEnter}
        />
        <div id='search-results'>
          {branchResult.length > 0 && branchResult.map(branch => {
            return (
              <div key={branch.uuid} className='search-result'>
                <span onClick={() => onBranchClick(branch.uuid)}>{branch.name}</span>
              </div>
            )
          })}
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