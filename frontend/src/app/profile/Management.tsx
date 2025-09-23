import { useEffect, useState, useMemo, useCallback } from "react"
import { API } from "../../config/constants"
import { ActionIcon, Select, TextInput, Tooltip, Box, Title, Text, Group, Card, Badge, LoadingOverlay } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { Tool } from "../../components/Tools"
import { IconExternalLink, IconLockAccess, IconLockOpen2, IconSearch, IconUsers, IconUser, IconBriefcase, IconShield } from "@tabler/icons-react"
import { useNavigate } from "react-router"
import { User, UserRole } from "../../contexts/UserContext"
import { DynamicFormModal } from "../../utils/formModal"

export type AccessLevel = 'READONLY' | 'CONTRIBUTOR' | 'FULL'

type EntityType = 'group' | 'position' | 'user'

type AccessLevelName = {
  type: AccessLevel
  name: string
}

type GroupAccess = {
  id: string
  toolId: string
  groupId: string
  accessLevel: AccessLevel
}

const accessLevels: AccessLevelName[] = [
  {type: 'READONLY', name: 'чтение'},
  {type: 'CONTRIBUTOR', name: 'без удаления'},
  {type: 'FULL', name: 'полный'}
]

type RolesTypeObject = {
  value: UserRole
  label: string
}

const rolesData: RolesTypeObject[] = [
  { value: 'DEVELOPER', label: 'Разработчик' },
  { value: 'ADMIN', label: 'Администратор' },
  { value: 'SUPERVISOR', label: 'Руководитель' },
  { value: 'EMPLOYEE', label: 'Сотрудник' },
]

function Management() {
  const [entityType, setEntityType] = useState<EntityType>('group')
  const [groups, setGroups] = useState([])
  const [positions, setPositions] = useState([])
  const [users, setUsers] = useState<User[]>([])
  const [curEntity, setCurEntity] = useState<string | null>(null)
  const [curAccess, setCurAccess] = useState<GroupAccess[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null)
  const navigate = useNavigate()

  const modals = {
    changeAccess: useDisclosure(false),
    changeRole: useDisclosure(false),
  }

  const getEntities = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API}/search/${entityType}/all`)
      const json = await response.json()
      if (response.ok) {
        entityType === 'group' && (setGroups(json), setUsers([]), setPositions([]))
        entityType === 'position' && (setPositions(json), setUsers([]), setGroups([]))
        entityType === 'user' && (setUsers(json), setGroups([]), setPositions([]))
      }
    } catch (error) {
      console.error('Error fetching entities:', error)
    } finally {
      setLoading(false)
    }
  }, [entityType])

  useEffect(() => {
    getEntities()
    setCurEntity(null)
  }, [getEntities])

  const getTools = useCallback(async (search?: string) => {
    try {
      const response = await fetch(`${API}/search/tool?text=${search || ''}`)
      const json = await response.json()
      if (response.ok) {
        setTools(json)
      }
    } catch (error) {
      console.error('Error fetching tools:', error)
    }
  }, [])

  useEffect(() => {
    getTools()
  }, [getTools])

  const getAccessedTools = useCallback(async () => {
    if (!curEntity) return
    try {
      const response = await fetch(`${API}/access/${entityType}/${curEntity}`)
      const json = await response.json()
      if (response.ok) {
        setCurAccess(json)
      }
    } catch (error) {
      console.error('Error fetching accessed tools:', error)
    }
  }, [entityType, curEntity])

  useEffect(() => {
    if (!curEntity) {
      setCurAccess([])
    } else {
      getAccessedTools()
    }
  }, [curEntity, getAccessedTools])

  const updateGroupAccess = useCallback(async (toolId: string, accessLevel: AccessLevel) => {
    if (!curEntity) return
    try {
      const response = await fetch(`${API}/access/${entityType}/${curEntity}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({toolId, accessLevel}),
      })
      const json = await response.json()
      if (response.ok) {
        setCurAccess(prevAccess => {
          const exists = prevAccess.some(access => access.id === json.id);
          return exists
            ? prevAccess.map(access => access.id === json.id ? json : access)
            : [...prevAccess, json];
        })
      }
    } catch (error) {
      console.error('Error updating access:', error)
    }
  }, [entityType, curEntity])

  const deleteGroupAccess = useCallback(async (toolId: string) => {
    if (!curEntity) return
    try {
      const response = await fetch(`${API}/access/${entityType}/${curEntity}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({toolId}),
      })
      const json = await response.json()
      if (response.ok) {
        setCurAccess(prevAccess => prevAccess.filter(access => access.id !== json.id))
      }
    } catch (error) {
      console.error('Error deleting access:', error)
    }
  }, [entityType, curEntity])

  const updateUserRole = useCallback(async (role: string | null) => {
    if (role && entityType === 'user' && curEntity) {
      try {
        const response = await fetch(`${API}/user/${curEntity}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({role})
        })
        const json = await response.json()

        if (response.ok) {
          setUsers(prevUsers => prevUsers.map(user => user.id === json.id ? {...user, role: json.role} : user))
        }
      } catch (error) {
        console.error('Error updating user role:', error)
      }
    }
  }, [entityType, curEntity])

  // Мемоизированные данные
  const filteredTools = useMemo(() => {
    if (!searchQuery) return tools
    return tools.filter(tool => 
      tool.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [tools, searchQuery])

  const currentEntity = useMemo(() => {
    if (!curEntity) return null
    if (entityType === 'group') return groups.find((g: any) => g.uuid === curEntity)
    if (entityType === 'position') return positions.find((p: any) => p.uuid === curEntity)
    if (entityType === 'user') return users.find((u: User) => u.id === curEntity)
    return null
  }, [curEntity, entityType, groups, positions, users])

  const entityOptions = useMemo(() => {
    if (entityType === 'group') return groups.map((g: any) => ({value: g.uuid, label: g.name}))
    if (entityType === 'position') return positions.map((p: any) => ({value: p.uuid, label: p.name}))
    if (entityType === 'user') return users.map((u: User) => ({value: u.id, label: u.name}))
    return []
  }, [entityType, groups, positions, users])

  const statistics = useMemo(() => {
    const totalTools = tools.length
    const accessedTools = curAccess.length
    const readonlyCount = curAccess.filter(access => access.accessLevel === 'READONLY').length
    const contributorCount = curAccess.filter(access => access.accessLevel === 'CONTRIBUTOR').length
    const fullCount = curAccess.filter(access => access.accessLevel === 'FULL').length

    return {
      totalTools,
      accessedTools,
      readonlyCount,
      contributorCount,
      fullCount
    }
  }, [tools.length, curAccess])

  if (loading) return <LoadingOverlay visible />

  return (
    <Box p="md" style={{ background: 'var(--theme-bg-primary)', minHeight: '100vh' }}>
      {/* Современный заголовок */}
      <Box mb="xl" style={{ 
        background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid var(--theme-border-primary)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <Group justify="space-between" mb="md">
          <Group gap="md">
            <Box style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '12px',
              padding: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <IconShield size={24} color="white" />
            </Box>
            <Box>
              <Title order={1} style={{ color: 'var(--theme-text-primary)', margin: 0 }}>
                Управление доступами
              </Title>
              <Text size="sm" c="var(--theme-text-secondary)" mt={4}>
                Настройка прав доступа для групп, должностей и сотрудников
              </Text>
            </Box>
          </Group>
        </Group>

        {/* Статистика */}
        <Group gap="lg" mb="md">
          <Box style={{
            background: 'var(--theme-bg-primary)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--theme-border-secondary)',
            textAlign: 'center',
            minWidth: '120px'
          }}>
            <Text size="xl" fw={700} c="var(--theme-text-primary)">
              {statistics.totalTools}
            </Text>
            <Text size="sm" c="var(--theme-text-secondary)">
              Всего инструментов
            </Text>
          </Box>
          <Box style={{
            background: 'var(--theme-bg-primary)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--theme-border-secondary)',
            textAlign: 'center',
            minWidth: '120px'
          }}>
            <Text size="xl" fw={700} c="var(--theme-text-primary)">
              {statistics.accessedTools}
            </Text>
            <Text size="sm" c="var(--theme-text-secondary)">
              С доступом
            </Text>
          </Box>
          <Box style={{
            background: 'var(--theme-bg-primary)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--theme-border-secondary)',
            textAlign: 'center',
            minWidth: '120px'
          }}>
            <Text size="xl" fw={700} c="var(--theme-text-primary)">
              {statistics.fullCount}
            </Text>
            <Text size="sm" c="var(--theme-text-secondary)">
              Полный доступ
            </Text>
          </Box>
        </Group>

        {/* Выбор типа сущности */}
        <Box style={{
          background: 'var(--theme-bg-primary)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid var(--theme-border-secondary)'
        }}>
          <Group gap="md" align="end">
            <Box style={{ flex: 1 }}>
              <Text size="sm" fw={500} c="var(--theme-text-primary)" mb="xs">
                Тип сущности
              </Text>
              <Select 
                data={[
                  {value: 'group', label: 'Группа должностей'}, 
                  {value: 'position', label: 'Должность'}, 
                  {value: 'user', label: 'Сотрудник'}
                ]} 
                value={entityType} 
                onChange={(value) => setEntityType(value as EntityType)} 
                placeholder="Выбрать тип" 
                searchable
                clearable
                leftSection={
                  entityType === 'group' ? <IconUsers size={16} /> :
                  entityType === 'position' ? <IconBriefcase size={16} /> :
                  <IconUser size={16} />
                }
              />
            </Box>
            <Box style={{ flex: 2 }}>
              <Text size="sm" fw={500} c="var(--theme-text-primary)" mb="xs">
                {entityType === 'group' ? 'Группа должностей' : 
                 entityType === 'user' ? 'Сотрудник' : 'Должность'}
              </Text>
              <Select 
                data={entityOptions} 
                value={curEntity} 
                onChange={setCurEntity} 
                placeholder={`Выбрать ${entityType === 'group' ? 'группу' : entityType === 'user' ? 'сотрудника' : 'должность'}`}
                searchable
                clearable
                disabled={loading}
              />
            </Box>
            {entityType === 'user' && curEntity && (
              <Box style={{ flex: 1 }}>
                <Text size="sm" fw={500} c="var(--theme-text-primary)" mb="xs">
                  Роль
                </Text>
                <Group gap="xs">
                  <Select 
                    data={rolesData} 
                    value={users.find((u: User) => u.id === curEntity)?.role} 
                    onChange={updateUserRole} 
                    placeholder="Выберите роль" 
                    clearable
                    style={{ flex: 1 }}
                  />
                  <ActionIcon 
                    variant="light" 
                    color="blue"
                    onClick={() => modals.changeRole[1].open()}
                  >
                    <IconLockOpen2 size={16} />
                  </ActionIcon>
                </Group>
              </Box>
            )}
          </Group>
        </Box>
      </Box>

      {/* Поиск и инструменты */}
      <Box style={{
        background: 'var(--theme-bg-elevated)',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid var(--theme-border-primary)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <Group justify="space-between" mb="md">
          <Group gap="sm">
            <Text size="lg" fw={600} c="var(--theme-text-primary)">
              Инструменты
            </Text>
            {currentEntity && (
              <Badge color="blue" variant="light" size="lg">
                {currentEntity.name}
              </Badge>
            )}
          </Group>
          <TextInput
            placeholder="Поиск инструментов..."
            leftSection={<IconSearch size={16} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: 300 }}
          />
        </Group>

        {/* Сетка инструментов */}
        <Box style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '16px'
        }}>
          {filteredTools.map(tool => {
            const accessLevel = curAccess.find(t => t.toolId === tool.id)?.accessLevel
            const hasAccess = curAccess.some(t => t.toolId === tool.id)
            
            return (
              <Card
                key={tool.id}
                style={{
                  background: hasAccess 
                    ? accessLevel === 'READONLY' ? 'var(--theme-bg-primary)' :
                      accessLevel === 'CONTRIBUTOR' ? 'var(--theme-bg-secondary)' :
                      'var(--theme-bg-elevated)'
                    : 'var(--theme-bg-primary)',
                  border: hasAccess 
                    ? accessLevel === 'READONLY' ? '1px solid var(--theme-border-secondary)' :
                      accessLevel === 'CONTRIBUTOR' ? '1px solid var(--theme-border-primary)' :
                      '2px solid var(--theme-color-primary)'
                    : '1px solid var(--theme-border-secondary)',
                  borderRadius: '12px',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <Group justify="space-between" align="flex-start" mb="sm">
                  <Box style={{ flex: 1 }}>
                    <Text size="md" fw={600} c="var(--theme-text-primary)" mb="xs">
                      {tool.name}
                    </Text>
                    {hasAccess && (
                      <Badge 
                        color={
                          accessLevel === 'READONLY' ? 'gray' :
                          accessLevel === 'CONTRIBUTOR' ? 'blue' : 'green'
                        }
                        variant="light"
                        size="sm"
                      >
                        {accessLevels.find(lvl => lvl.type === accessLevel)?.name}
                      </Badge>
                    )}
                  </Box>
                  <Group gap="xs">
                    {hasAccess && (
                      <>
                        <Tooltip label="Изменить доступ">
                          <ActionIcon 
                            variant="light" 
                            color="blue"
                            onClick={() => {
                              setSelectedTool(tool)
                              modals.changeAccess[1].open()
                            }}
                          >
                            <IconLockOpen2 size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Убрать доступ">
                          <ActionIcon 
                            variant="light" 
                            color="red"
                            onClick={() => deleteGroupAccess(tool.id)}
                          >
                            <IconLockAccess size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </>
                    )}
                    {!hasAccess && curEntity && (
                      <Tooltip label="Добавить доступ">
                        <ActionIcon 
                          variant="light" 
                          color="green"
                          onClick={() => {
                            setSelectedTool(tool)
                            modals.changeAccess[1].open()
                          }}
                        >
                          <IconLockOpen2 size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <Tooltip label="Перейти к инструменту">
                      <ActionIcon 
                        variant="light" 
                        color="gray"
                        onClick={() => navigate(`/${tool.link}`)}
                      >
                        <IconExternalLink size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
              </Card>
            )
          })}
        </Box>

        {filteredTools.length === 0 && (
          <Box style={{
            textAlign: 'center',
            padding: '48px 24px',
            border: '2px dashed var(--theme-border-secondary)',
            borderRadius: '12px',
            background: 'var(--theme-bg-primary)'
          }}>
            <Text size="xl" mb="md">🔍</Text>
            <Text size="lg" fw={500} c="var(--theme-text-primary)" mb="sm">
              Инструменты не найдены
            </Text>
            <Text size="sm" c="var(--theme-text-secondary)">
              {searchQuery ? 'Попробуйте изменить поисковый запрос' : 'Выберите сущность для просмотра доступов'}
            </Text>
          </Box>
        )}
      </Box>

      {/* Модалки */}
      <DynamicFormModal
        opened={modals.changeAccess[0]}
        onClose={modals.changeAccess[1].close}
        title={selectedTool ? `Настройка доступа: ${selectedTool.name}` : 'Настройка доступа'}
        mode="edit"
        fields={[
          {
            name: 'accessLevel',
            label: 'Уровень доступа',
            type: 'select',
            required: true,
            options: accessLevels.map(lvl => ({ value: lvl.type, label: lvl.name }))
          }
        ]}
        initialValues={{ 
          accessLevel: selectedTool ? curAccess.find(t => t.toolId === selectedTool.id)?.accessLevel || '' : ''
        }}
        onSubmit={(values) => {
          if (selectedTool) {
            updateGroupAccess(selectedTool.id, values.accessLevel as AccessLevel)
            modals.changeAccess[1].close()
            setSelectedTool(null)
          }
        }}
      />

      <DynamicFormModal
        opened={modals.changeRole[0]}
        onClose={modals.changeRole[1].close}
        title="Изменение роли пользователя"
        mode="edit"
        fields={[
          {
            name: 'role',
            label: 'Роль',
            type: 'select',
            required: true,
            options: rolesData
          }
        ]}
        initialValues={{ 
          role: curEntity && entityType === 'user' ? users.find((u: User) => u.id === curEntity)?.role || '' : ''
        }}
        onSubmit={(values) => {
          updateUserRole(values.role)
          modals.changeRole[1].close()
        }}
      />
    </Box>
  )
}


export default Management