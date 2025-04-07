import { TextInput } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'

function Search() {

  return (
    <TextInput
      size='sm'
      placeholder="Input placeholder"
      leftSection={<IconSearch size={16} />}
    />
  )
}

export default Search