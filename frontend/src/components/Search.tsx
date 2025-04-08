import { TextInput } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { ChangeEvent, useState } from 'react'
import { API } from '../config/constants'

function Search() {
  const [text, setText] = useState('')

  const onSearch = async () => {
    const response = await fetch(`${API}/user/search?search=${text}`)
    const json = await response.json()
    if (response.ok) {
      console.log(json)
    }
  }

  return (
    <TextInput
      size='sm'
      placeholder="Input placeholder"
      leftSection={<IconSearch size={16} />}
      value={text}
      onChange={(e) => setText(e.currentTarget.value)}
    />
  )
}

export default Search