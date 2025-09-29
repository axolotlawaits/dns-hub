import { ActionIcon, Button, Group, Stack, Text } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import dayjs from "dayjs"
import { LoaderType } from "./Loaders"
import { IconMoodEmpty, IconTrash } from "@tabler/icons-react"
import { useState } from "react"
import { API } from "../../../config/constants"
import { useUserContext } from "../../../hooks/useUserContext"
import { TimeInput } from "@mantine/dates"
import { DynamicFormModal } from "../../../utils/formModal"

function LoadersTimeRow({loaders, getDays}: {loaders: LoaderType[], getDays: () => void}) {
  const { user } = useUserContext()
  const [opened, { open, close }] = useDisclosure(false)
  const [deleteLoaderId, setDeleteLoaderId] = useState<string | null>(null)
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false)

  const calculateHours = (startTime: Date, endTime: Date) => {
    const diffInMinutes = dayjs(endTime).diff(dayjs(dayjs(startTime)), 'minutes')
    const hours = Math.floor(diffInMinutes / 60)
    const minutes = diffInMinutes % 60
    const roundOffMinutes = minutes <= 40 && minutes > 10 ? 30 : 0 
    return `часы: ${hours}, минуты: ${roundOffMinutes} (без округления: ${minutes})`
  }

  const deleteLoader = async (loaderId: string) => {
    const response = await fetch(`${API}/loaders/filial/loader/${loaderId}`, {
      method: 'DELETE',
      headers: { 'Content-type': 'application/json' }
    })
    if (response.ok) {
      getDays()
    }
  }

  const updateLoader = async (loader: LoaderType, time: string, isStart: boolean) => {
    const currentDate = new Date()
    const newDateString = `${currentDate.toDateString()} ${time}`
    const newDate = new Date(newDateString)

    const newTime = {
      startTime: isStart ? newDate : loader.startTime, 
      endTime: isStart ? loader.endTime : newDate,
    }

    const response = await fetch(`${API}/loaders/filial/loader/${loader.id}`, {
      method: 'PATCH',
      body: JSON.stringify(newTime),
      headers: { 'Content-type': 'application/json' }
    })
    if (response.ok) {
      getDays()
    }
  }

  // Конфигурация формы для просмотра грузчиков
  const formConfig = {
    title: "Информация о грузчиках",
    mode: "view" as const,
    fields: [] as any[],
    initialValues: {},
    onSubmit: async () => {},
    submitButtonText: "Закрыть",
    hideButtons: true
  }

  // Конфигурация формы для удаления грузчика
  const deleteFormConfig = {
    title: "Удаление грузчика",
    mode: "delete" as const,
    fields: [] as any[],
    initialValues: {},
    onSubmit: async () => {
      if (deleteLoaderId) {
        await deleteLoader(deleteLoaderId)
        setDeleteLoaderId(null)
        closeDeleteModal()
      }
    },
    submitButtonText: "Удалить",
    cancelButtonText: "Отмена"
  }
  
  return (
    <>
      {loaders.length > 0 ? 
        <Button variant="outline" size="xs" onClick={open}>Посмотреть</Button>
      :
        <span>нет данных</span>
      }
      
      {/* Модальное окно для просмотра грузчиков */}
      <DynamicFormModal
        opened={opened}
        onClose={close}
        title={formConfig.title}
        mode={formConfig.mode}
        fields={formConfig.fields}
        initialValues={formConfig.initialValues}
        onSubmit={formConfig.onSubmit}
        submitButtonText={formConfig.submitButtonText}
        hideButtons={formConfig.hideButtons}
        viewExtraContent={() => (
          <Stack gap="md">
            {loaders.length > 0 ? loaders.map((loader, i) => {
              return (
                <Stack key={loader.id} gap="sm" p="md" style={{
                  background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--theme-shadow-sm)'
                }}>
                  <Group justify="space-between" align="center">
                    <Text size="lg" fw={600} c="var(--theme-text-primary)">
                      Грузчик {i + 1}
                    </Text>
                    {user?.role !== 'EMPLOYEE' && (
                      <ActionIcon 
                        onClick={() => {
                          setDeleteLoaderId(loader.id)
                          openDeleteModal()
                        }} 
                        variant="filled" 
                        color="red" 
                        aria-label="Удалить грузчика" 
                        size="md"
                      >
                        <IconTrash style={{ width: '70%', height: '70%' }} />
                      </ActionIcon>
                    )}
                  </Group>
                  
                  <Group align="center" gap="sm">
                    <Text size="sm" c="var(--theme-text-secondary)">Время работы на филиале:</Text>
                    <Text size="sm" c="var(--theme-text-primary)">с</Text>
                    <TimeInput 
                      value={dayjs(loader.startTime).format('HH:mm')}
                      onChange={(e) => updateLoader(loader, e.currentTarget.value, true)}
                      size="xs"
                      style={{ minWidth: '80px' }}
                    />
                    <Text size="sm" c="var(--theme-text-primary)">до</Text>
                    <TimeInput 
                      value={dayjs(loader.endTime).format('HH:mm')}
                      onChange={(e) => updateLoader(loader, e.currentTarget.value, false)}
                      size="xs"
                      style={{ minWidth: '80px' }}
                    />
                  </Group>
                  
                  <Text size="sm" c="var(--theme-text-secondary)" style={{ fontStyle: 'italic' }}>
                    {calculateHours(loader.startTime, loader.endTime)}
                  </Text>
                </Stack>
              )
            }) : (
              <Group gap="sm" justify="center" p="xl">
                <Text c="var(--theme-text-secondary)">Список грузчиков пуст</Text>
                <IconMoodEmpty size={20} />
              </Group>
            )}
          </Stack>
        )}
      />

      {/* Модальное окно для подтверждения удаления */}
      <DynamicFormModal
        opened={deleteModalOpened}
        onClose={() => {
          closeDeleteModal()
          setDeleteLoaderId(null)
        }}
        title={deleteFormConfig.title}
        mode={deleteFormConfig.mode}
        fields={deleteFormConfig.fields}
        initialValues={deleteFormConfig.initialValues}
        onSubmit={deleteFormConfig.onSubmit}
        submitButtonText={deleteFormConfig.submitButtonText}
        cancelButtonText={deleteFormConfig.cancelButtonText}
        viewExtraContent={() => (
          <Stack gap="md" p="md">
            <Text size="lg" c="var(--theme-text-primary)" ta="center">
              Вы уверены, что хотите удалить этого грузчика?
            </Text>
            <Text size="sm" c="var(--theme-text-secondary)" ta="center">
              Это действие нельзя отменить.
            </Text>
          </Stack>
        )}
      />
    </>
  )
}

export default LoadersTimeRow