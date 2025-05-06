import { ActionIcon, Button, Modal, Select, Stack, TextInput } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { IconEdit } from "@tabler/icons-react"
import { useState } from "react"
import { RouteType, rrsInitData } from "./LoadersHome"
import { FilialType } from "./Day"
import { API } from "../../../config/constants"

type RouteEditProps = {
  route: RouteType
  filialsData: string[]
}

function RouteEdit({route, filialsData}: RouteEditProps) {
  const [opened, { open, close }] = useDisclosure(false)
  const [name, setName] = useState(route.name)
  const [contractor, setContractor] = useState(route.contractor)
  const [rrs, setRrs] = useState<string | null>(route.rrs)
  const [filials, setFilials] = useState(route.filials.map((f: any, index: number) => ({
    id: f.id, place: index + 1, name: f.name
  })))

  const updateRoute = async () => {
    const response = await fetch(`${API}/loaders/route/${route.id}`, {
      method: 'PATCH',
      body: JSON.stringify({name, contractor, rrs, filials}),
      headers: { 'Content-type': 'application/json' }
    })

    if (response.ok) {
      close()
    }
  }

  return (
    <>
      <ActionIcon onClick={open} size={26} variant="default" aria-label="ActionIcon with size as a number">
        <IconEdit size={18} />
      </ActionIcon>
      <Modal opened={opened} onClose={close}>
        <Stack gap="md">
          <TextInput
            placeholder='Наименование'
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <TextInput
            placeholder='Подрядчик'
            value={contractor}
            onChange={(e) => setContractor(e.currentTarget.value)}
          />
          <Select data={rrsInitData} value={rrs} onChange={setRrs} placeholder='Выбрать РРС'/>
          {route.filials.map((filial: FilialType, index: number) => {
            return (
              <Select
                key={filial.id}
                label={`филиал ${index + 1}`}
                value={filials[index].name}
                onChange={value => setFilials(filials.map((filial: any) => filial.place === index + 1 ? {...filial, name: value} : filial))}
                data={filialsData}
                searchable
              />
            )
          })}
          <Button onClick={updateRoute}>обновить</Button>
        </Stack>
      </Modal>
    </>
  )
}

export default RouteEdit