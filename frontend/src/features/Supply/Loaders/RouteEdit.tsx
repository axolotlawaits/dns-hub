import { ActionIcon } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { IconEdit } from "@tabler/icons-react"
import { useState, useEffect } from "react"
import { RouteType, rrsInitData } from "./LoadersRoutes"
import { API } from "../../../config/constants"
import { DynamicFormModal } from "../../../utils/formModal"

type RouteEditProps = {
  route: RouteType
  onRouteUpdated?: (updatedRoute: RouteType) => void
}

function RouteEdit({route, onRouteUpdated}: RouteEditProps) {
  const [opened, { open, close }] = useDisclosure(false)
  const [valErrors, setValErrors] = useState<any>(null)
  const [filialsOptions, setFilialsOptions] = useState<any[]>([])

  const normalizeOptions = (list: any[]): { value: string; label: string }[] => {
    return (list || []).map((item: any) => {
      if (typeof item === 'string') {
        return { value: item, label: item }
      }
      const value = item?.id ?? item?.value ?? ''
      const label = item?.name ?? item?.label ?? item?.title ?? String(value)
      return { value, label }
    }).filter(opt => opt.value && opt.label)
  }

  useEffect(() => {
    // Префилл опций текущими филиалами, чтобы сразу видеть лейблы вместо UUID
    const prefill = normalizeOptions(route.filials)
    setFilialsOptions(prefill)

    // Загружаем филиалы для выбранного РРС и мерджим
    const loadFilials = async () => {
      const response = await fetch(`${API}/loaders/filial/${route.rrs}`)
      const filials = await response.json()
      if (response.ok) {
        const fetched = normalizeOptions(filials)
        // merge unique by value
        const map = new Map<string, { value: string; label: string }>()
        for (const o of [...prefill, ...fetched]) map.set(o.value, o)
        setFilialsOptions(Array.from(map.values()))
      }
    }
    loadFilials()
  }, [route.rrs])

  const updateRoute = async (values: any) => {
    const response = await fetch(`${API}/loaders/route/${route.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: values.name,
        contractor: values.contractor,
        rrs: values.rrs,
        filials: values.filials
      }),
      headers: { 'Content-type': 'application/json' }
    })

    const json = await response.json()

    if (response.ok) {
      close()
      setValErrors(null)
      if (onRouteUpdated) {
        onRouteUpdated({...route, ...values})
      }
    } else {
      setValErrors(json.errors)
    }
  }

  return (
    <>
      <ActionIcon 
        onClick={open} 
        size={26} 
        variant="light"
        color="blue"
        style={{
          background: 'var(--theme-bg-secondary)',
          border: '1px solid var(--theme-border-primary)'
        }}
        aria-label="Редактировать маршрут"
      >
        <IconEdit size={18} />
      </ActionIcon>
      
      <DynamicFormModal
        opened={opened}
        onClose={() => {close(), setValErrors(null)}}
        title="Редактирование маршрута"
        mode="edit"
        fields={[
          {
            name: 'name',
            label: 'Наименование маршрута',
            type: 'text',
            required: true,
            placeholder: 'Введите название маршрута'
          },
          {
            name: 'contractor',
            label: 'Подрядчик',
            type: 'text',
            required: true,
            placeholder: 'Введите название подрядчика'
          },
          {
            name: 'rrs',
            label: 'РРС',
            type: 'select',
            required: true,
            options: rrsInitData
              .filter(item => item && typeof item === 'string')
              .map(item => ({ value: item, label: item })),
            placeholder: 'Выберите РРС',
            onChange: async (value: any) => {
              if (value) {
                const response = await fetch(`${API}/loaders/filial/${value}`)
                const filials = await response.json()
                if (response.ok) {
                  setFilialsOptions(filials)
                }
              }
            }
          },
          {
            name: 'filials',
            label: 'Филиалы',
            type: 'select',
            required: true,
            options: (filialsOptions || []),
            placeholder: 'Выберите филиалы',
            multiple: true,
            searchable: true
          }
        ]}
        initialValues={{
          name: route.name,
          contractor: route.contractor,
          rrs: route.rrs,
          filials: route.filials.map((f: any) => (typeof f === 'string' ? f : (f.id ?? f.value)))
        }}
        onSubmit={updateRoute}
        error={valErrors ? Object.values(valErrors).join(', ') : undefined}
      />
    </>
  )
}

export default RouteEdit