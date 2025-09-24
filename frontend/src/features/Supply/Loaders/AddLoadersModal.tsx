import { Button, Stack, Group, Text, ActionIcon, Box } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { useState } from "react"
import { API } from "../../../config/constants"
import { FilialType } from "./Day"
import { DynamicFormModal, FormField } from "../../../utils/formModal"
import { IconPlus, IconTrash } from "@tabler/icons-react"

export type ValErrorsFilialUpdate = {
  loaders: string
}

type LoaderData = {
  id: string
  startTime: string
  endTime: string
  amount: number
}

function AddLoadersModal({filial, getDays}: {filial: FilialType, getDays: () => void}) {
  const [opened, { open, close }] = useDisclosure(false)
  const [valErrors, setValErrors] = useState<ValErrorsFilialUpdate | null>(null)
  const [loaders, setLoaders] = useState<LoaderData[]>([
    { id: '1', startTime: '', endTime: '', amount: 1 }
  ])

  // Функции для управления грузчиками
  const addLoader = () => {
    const newId = (loaders.length + 1).toString()
    setLoaders([...loaders, { id: newId, startTime: '', endTime: '', amount: 1 }])
  }

  const removeLoader = (id: string) => {
    if (loaders.length > 1) {
      setLoaders(loaders.filter(loader => loader.id !== id))
    }
  }

  const updateLoader = (id: string, field: keyof LoaderData, value: string | number) => {
    setLoaders(loaders.map(loader => 
      loader.id === id ? { ...loader, [field]: value } : loader
    ))
  }

  // Конфигурация полей для DynamicFormModal
  const fields: FormField[] = [
    {
      name: 'feedback',
      label: 'Обратная связь',
      type: 'textarea',
      required: false,
      placeholder: 'Введите обратную связь по филиалу'
    }
  ]

  const addLoaders = async (values: Record<string, any>) => {
    const { feedback } = values
    
    // Создаем массив грузчиков из всех добавленных
    const allLoaders = loaders.flatMap(loader => 
      Array(Number(loader.amount)).fill(null).map(() => ({
        startTime: createDateWithTime(loader.startTime),
        endTime: createDateWithTime(loader.endTime)
      }))
    )

    const response = await fetch(`${API}/loaders/filial/${filial.id}`, {
      method: 'PATCH',
      body: JSON.stringify({loaders: allLoaders, feedback}),
      headers: { 'Content-type': 'application/json' }
    })
    const json = await response.json()

    if (response.ok) {
      close()
      getDays()
      // Сброс состояния при закрытии
      setLoaders([{ id: '1', startTime: '', endTime: '', amount: 1 }])
    } else {
      setValErrors(json.errors)
    }
  }

  function createDateWithTime(timeString: string) {
    const currentDate = new Date()
    const newDateString = `${currentDate.toDateString()} ${timeString}`
    const newDate = new Date(newDateString)
    return newDate
  }

  return (
    <>
      <Button size="xs" variant="outline" onClick={open}>добавить</Button>
      <DynamicFormModal
        opened={opened}
        onClose={() => {close(), setValErrors(null), setLoaders([{ id: '1', startTime: '', endTime: '', amount: 1 }])}}
        title="Добавить грузчиков"
        mode="create"
        fields={fields}
        initialValues={{
          feedback: ''
        }}
        onSubmit={addLoaders}
        submitButtonText="Добавить грузчиков"
        error={valErrors ? Object.values(valErrors).join(', ') : undefined}
        extraContent={() => (
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Text size="sm" fw={500} c="var(--theme-text-primary)">
                Грузчики с разным временем
              </Text>
              <Button 
                size="xs" 
                variant="light" 
                leftSection={<IconPlus size={14} />}
                onClick={addLoader}
              >
                Добавить грузчика
              </Button>
            </Group>
            
            {loaders.map((loader, index) => (
              <Box 
                key={loader.id}
                style={{
                  background: 'var(--theme-bg-secondary)',
                  borderRadius: '8px',
                  padding: '12px',
                  border: '1px solid var(--theme-border-primary)'
                }}
              >
                <Group justify="space-between" align="center" mb="sm">
                  <Text size="sm" fw={500} c="var(--theme-text-primary)">
                    Грузчик #{index + 1}
                  </Text>
                  {loaders.length > 1 && (
                    <ActionIcon 
                      size="sm" 
                      variant="light" 
                      color="red"
                      onClick={() => removeLoader(loader.id)}
                    >
                      <IconTrash size={12} />
                    </ActionIcon>
                  )}
                </Group>
                
                <Stack gap="sm">
                  <Group grow>
                    <Box>
                      <Text size="xs" c="var(--theme-text-secondary)" mb="xs">
                        Время начала
                      </Text>
                      <input
                        type="time"
                        value={loader.startTime}
                        onChange={(e) => updateLoader(loader.id, 'startTime', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '4px',
                          border: '1px solid var(--theme-border-primary)',
                          background: 'var(--theme-bg-primary)',
                          color: 'var(--theme-text-primary)'
                        }}
                      />
                    </Box>
                    <Box>
                      <Text size="xs" c="var(--theme-text-secondary)" mb="xs">
                        Время окончания
                      </Text>
                      <input
                        type="time"
                        value={loader.endTime}
                        onChange={(e) => updateLoader(loader.id, 'endTime', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '4px',
                          border: '1px solid var(--theme-border-primary)',
                          background: 'var(--theme-bg-primary)',
                          color: 'var(--theme-text-primary)'
                        }}
                      />
                    </Box>
                    <Box>
                      <Text size="xs" c="var(--theme-text-secondary)" mb="xs">
                        Количество
                      </Text>
                      <input
                        type="number"
                        min="1"
                        value={loader.amount}
                        onChange={(e) => updateLoader(loader.id, 'amount', Number(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '4px',
                          border: '1px solid var(--theme-border-primary)',
                          background: 'var(--theme-bg-primary)',
                          color: 'var(--theme-text-primary)'
                        }}
                      />
                    </Box>
                  </Group>
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      />
    </>
  )
}

export default AddLoadersModal