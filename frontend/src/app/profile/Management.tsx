import { useEffect, useState, useMemo, useCallback } from "react"
import { API } from "../../config/constants"
import { ActionIcon, Select, MultiSelect, TextInput, Tooltip, Box, Title, Text, Group, Card, Badge, LoadingOverlay, Progress, Button, Stack } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { Tool } from "../../components/Tools"
import { IconExternalLink, IconLockAccess, IconSearch, IconUsers, IconUser, IconBriefcase, IconShield, IconCheck, IconX, IconClock } from "@tabler/icons-react"
import { useNavigate } from "react-router"
import { User, UserRole } from "../../contexts/UserContext"
import { useUserContext } from "../../hooks/useUserContext"
import { useAccessContext } from "../../hooks/useAccessContext"
import { DynamicFormModal } from "../../utils/formModal"
import { notificationSystem } from "../../utils/Push"

export type AccessLevel = 'READONLY' | 'CONTRIBUTOR' | 'FULL'

type EntityType = 'group' | 'position' | 'user'

type AccessLevelName = {
  type: AccessLevel
  name: string
}

// Универсальный тип для доступа к инструменту (для всех типов сущностей)
type EntityToolAccess = {
  id: string
  toolId: string
  groupId?: string  // Опционально, так как используется не только для групп
  positionId?: string
  userId?: string
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
  const { user } = useUserContext()
  const { access } = useAccessContext()
  const [entityType, setEntityType] = useState<EntityType>('group')
  const [groups, setGroups] = useState([])
  const [positions, setPositions] = useState([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedEntities, setSelectedEntities] = useState<string[]>([])
  const [entitiesAccess, setEntitiesAccess] = useState<Map<string, EntityToolAccess[]>>(new Map())
  const [bulkOperationProgress, setBulkOperationProgress] = useState<number | null>(null)
  
  // Ограничение на максимальное количество выбранных сущностей для производительности
  const MAX_SELECTED_ENTITIES = 50
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null)
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string | null>(null)
  const [accessRequests, setAccessRequests] = useState<any[]>([])
  const [protectedToolLinks, setProtectedToolLinks] = useState<string[]>([])
  const navigate = useNavigate()
  
  // Загружаем список защищенных инструментов
  useEffect(() => {
    const loadProtectedTools = async () => {
      try {
        const response = await fetch(`${API}/access/protected-tools`);
        if (response.ok) {
          const links = await response.json();
          setProtectedToolLinks(links);
        }
      } catch (error) {
        console.error('Error loading protected tools:', error);
      }
    };
    loadProtectedTools();
  }, []);
  
  // Проверка, является ли инструмент защищенным (требует доступа)
  const checkIsProtectedTool = useCallback((tool: Tool): boolean => {
    return protectedToolLinks.includes(tool.link) || 
           protectedToolLinks.some(link => tool.link.startsWith(link + '/'))
  }, [protectedToolLinks])
  
  // Проверка, может ли пользователь управлять доступом к инструменту
  const canManageToolAccess = useCallback((tool: Tool): boolean => {
    if (!user) return false
    
    // DEVELOPER имеет приоритетный доступ ко всему - может управлять всеми инструментами
    if (user.role === 'DEVELOPER') {
      return true
    }
    
    // Админы могут управлять только теми защищенными инструментами, к которым у них есть FULL доступ
    if (user.role === 'ADMIN') {
      // Если список еще не загружен, не показываем инструменты
      if (protectedToolLinks.length === 0) {
        return false
      }
      
      // Проверяем, что инструмент защищенный
      if (!checkIsProtectedTool(tool)) {
        return false
      }
      
      // Проверяем, что у админа есть FULL доступ к этому инструменту
      const toolAccess = access.find(a => a.toolId === tool.id || a.link === tool.link)
      return toolAccess?.accessLevel === 'FULL'
    }
    
    // Пользователи с FULL доступом к защищенному инструменту могут управлять им
    // Если список еще не загружен, не показываем инструмент
    if (protectedToolLinks.length === 0) {
      return false
    }
    
    if (!checkIsProtectedTool(tool)) {
      return false // Открытые инструменты не требуют управления доступом
    }
    
    const toolAccess = access.find(a => a.toolId === tool.id || a.link === tool.link)
    return toolAccess?.accessLevel === 'FULL'
  }, [user, access, checkIsProtectedTool, protectedToolLinks])
  
  // Загрузка запросов на доступ
  const loadAccessRequests = useCallback(async () => {
    if (!user) return
    
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API}/access/requests/all`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setAccessRequests(data)
      } else {
        console.error('Failed to load access requests')
      }
    } catch (error) {
      console.error('Error loading access requests:', error)
    }
  }, [user])
  
  useEffect(() => {
    loadAccessRequests()
  }, [loadAccessRequests])
  
  // Одобрение запроса на доступ
  const handleApproveRequest = useCallback(async (requestId: string, accessLevel: AccessLevel = 'READONLY') => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API}/access/requests/${requestId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ accessLevel })
      })
      
      if (response.ok) {
        notificationSystem.addNotification(
          'Успех',
          'Доступ успешно предоставлен',
          'success'
        )
        loadAccessRequests()
      } else {
        const error = await response.json()
        notificationSystem.addNotification(
          'Ошибка',
          error.error || 'Не удалось предоставить доступ',
          'error'
        )
      }
    } catch (error) {
      notificationSystem.addNotification(
        'Ошибка',
        'Ошибка при предоставлении доступа',
        'error'
      )
    }
  }, [loadAccessRequests])
  
  // Отклонение запроса на доступ
  const handleRejectRequest = useCallback(async (requestId: string, reason?: string) => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API}/access/requests/${requestId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reason })
      })
      
      if (response.ok) {
        notificationSystem.addNotification(
          'Успех',
          'Запрос отклонен',
          'success'
        )
        loadAccessRequests()
      } else {
        const error = await response.json()
        notificationSystem.addNotification(
          'Ошибка',
          error.error || 'Не удалось отклонить запрос',
          'error'
        )
      }
    } catch (error) {
      notificationSystem.addNotification(
        'Ошибка',
        'Ошибка при отклонении запроса',
        'error'
      )
    }
  }, [loadAccessRequests])
  
  const modals = {
    changeAccess: useDisclosure(false),
    approveRequest: useDisclosure(false),
  }
  
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null)

  const getEntities = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API}/search/${entityType}/all`)
      const json = await response.json()
      if (response.ok) {
        if (entityType === 'group') {
          setGroups(json)
          setUsers([])
          setPositions([])
        } else if (entityType === 'position') {
          setPositions(json)
          setUsers([])
          // Не очищаем группы, они нужны для фильтрации
        } else if (entityType === 'user') {
          setUsers(json)
          setGroups([])
          setPositions([])
        }
      }
    } catch (error) {
      console.error('Error fetching entities:', error)
    } finally {
      setLoading(false)
    }
  }, [entityType])

  // Загружаем группы для фильтрации должностей отдельно
  const getGroups = useCallback(async () => {
    try {
      const response = await fetch(`${API}/search/group/all`)
      const json = await response.json()
      if (response.ok) {
        setGroups(json)
      }
    } catch (error) {
      console.error('Error fetching groups:', error)
    }
  }, [])

  useEffect(() => {
    getEntities()
    setSelectedEntities([])
    setSelectedGroupFilter(null) // Сбрасываем фильтр при смене типа сущности
  }, [getEntities, entityType])

  // Загружаем группы для фильтрации должностей отдельно
  useEffect(() => {
    if (entityType === 'position') {
      getGroups()
    }
  }, [entityType, getGroups])

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

  // Загружаем доступы для всех выбранных сущностей параллельно
  const getAccessedTools = useCallback(async () => {
    if (selectedEntities.length === 0) {
      setEntitiesAccess(new Map())
      return
    }

    try {
      const accessPromises = selectedEntities.map(async (entityId) => {
        try {
          const response = await fetch(`${API}/access/${entityType}/${entityId}`)
          const json = await response.json()
          if (response.ok) {
            return { entityId, access: json }
          }
          return { entityId, access: [] }
        } catch (error) {
          console.error(`Error fetching access for ${entityId}:`, error)
          return { entityId, access: [] }
        }
      })

      const results = await Promise.all(accessPromises)
      const newAccessMap = new Map<string, EntityToolAccess[]>()
      results.forEach(({ entityId, access }) => {
        newAccessMap.set(entityId, access)
      })
      setEntitiesAccess(newAccessMap)
    } catch (error) {
      console.error('Error fetching accessed tools:', error)
    }
  }, [entityType, selectedEntities])

  useEffect(() => {
    getAccessedTools()
  }, [getAccessedTools])

  // Массовое обновление доступа для всех выбранных сущностей
  const updateGroupAccess = useCallback(async (toolId: string, accessLevel: AccessLevel) => {
    if (selectedEntities.length === 0) return

    setBulkOperationProgress(0)
    const total = selectedEntities.length
    let successCount = 0
    let errorCount = 0

    try {
      const updatePromises = selectedEntities.map(async (entityId, index) => {
        try {
          const response = await fetch(`${API}/access/${entityType}/${entityId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({toolId, accessLevel}),
          })
          const json = await response.json()
          if (response.ok) {
            successCount++
            // Обновляем доступ для конкретной сущности
            setEntitiesAccess(prev => {
              const newMap = new Map(prev)
              const currentAccess = newMap.get(entityId) || []
              const exists = currentAccess.some(access => access.id === json.id)
              newMap.set(entityId, exists
                ? currentAccess.map(access => access.id === json.id ? json : access)
                : [...currentAccess, json]
              )
              return newMap
            })
            return { success: true, entityId }
          } else {
            errorCount++
            return { success: false, entityId }
          }
        } catch (error) {
          console.error(`Error updating access for ${entityId}:`, error)
          errorCount++
          return { success: false, entityId }
        } finally {
          setBulkOperationProgress(Math.round(((index + 1) / total) * 100))
        }
      })

      await Promise.all(updatePromises)
      
      // Показываем уведомление о результате операции
      if (errorCount > 0) {
        console.warn(`Updated ${successCount} of ${total} entities. ${errorCount} errors.`)
        notificationSystem.addNotification(
          'Частичный успех',
          `Обновлено ${successCount} из ${total} сущностей. Ошибок: ${errorCount}`,
          'warning'
        )
      } else if (successCount > 0) {
        notificationSystem.addNotification(
          'Успех',
          `Доступ успешно обновлен для ${successCount} ${successCount === 1 ? 'сущности' : 'сущностей'}`,
          'success'
        )
      }
    } catch (error) {
      console.error('Error in bulk update:', error)
    } finally {
      setTimeout(() => setBulkOperationProgress(null), 1000)
    }
  }, [entityType, selectedEntities])

  // Массовое удаление доступа для всех выбранных сущностей
  const deleteGroupAccess = useCallback(async (toolId: string) => {
    if (selectedEntities.length === 0) return

    setBulkOperationProgress(0)
    const total = selectedEntities.length
    let successCount = 0
    let errorCount = 0

    try {
      const deletePromises = selectedEntities.map(async (entityId, index) => {
        try {
          const response = await fetch(`${API}/access/${entityType}/${entityId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({toolId}),
          })
          const json = await response.json()
          if (response.ok) {
            successCount++
            // Удаляем доступ для конкретной сущности
            setEntitiesAccess(prev => {
              const newMap = new Map(prev)
              const currentAccess = newMap.get(entityId) || []
              newMap.set(entityId, currentAccess.filter(access => access.id !== json.id))
              return newMap
            })
            return { success: true, entityId }
          } else {
            errorCount++
            return { success: false, entityId }
          }
        } catch (error) {
          console.error(`Error deleting access for ${entityId}:`, error)
          errorCount++
          return { success: false, entityId }
        } finally {
          setBulkOperationProgress(Math.round(((index + 1) / total) * 100))
        }
      })

      await Promise.all(deletePromises)
      
      // Показываем уведомление о результате операции
      if (errorCount > 0) {
        console.warn(`Deleted access from ${successCount} of ${total} entities. ${errorCount} errors.`)
        notificationSystem.addNotification(
          'Частичный успех',
          `Доступ удален для ${successCount} из ${total} сущностей. Ошибок: ${errorCount}`,
          'warning'
        )
      } else if (successCount > 0) {
        notificationSystem.addNotification(
          'Успех',
          `Доступ успешно удален для ${successCount} ${successCount === 1 ? 'сущности' : 'сущностей'}`,
          'success'
        )
      }
    } catch (error) {
      console.error('Error in bulk delete:', error)
    } finally {
      setTimeout(() => setBulkOperationProgress(null), 1000)
    }
  }, [entityType, selectedEntities])

  const updateUserRole = useCallback(async (role: string | null) => {
    if (role && entityType === 'user' && selectedEntities.length === 1) {
      try {
        const response = await fetch(`${API}/user/${selectedEntities[0]}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({role})
        })
        const json = await response.json()

        if (response.ok) {
          setUsers(prevUsers => prevUsers.map(user => user.id === json.id ? {...user, role: json.role} : user))
          notificationSystem.addNotification(
            'Успех',
            'Роль пользователя успешно обновлена',
            'success'
          )
        } else {
          notificationSystem.addNotification(
            'Ошибка',
            json.error || 'Не удалось обновить роль пользователя',
            'error'
          )
        }
      } catch (error) {
        console.error('Error updating user role:', error)
        notificationSystem.addNotification(
          'Ошибка',
          'Ошибка при обновлении роли пользователя',
          'error'
        )
      }
    }
  }, [entityType, selectedEntities])

  // Мемоизированные данные - фильтруем инструменты по доступу пользователя
  const filteredTools = useMemo(() => {
    // DEVELOPER видит все инструменты
    if (user?.role === 'DEVELOPER') {
      let allTools = tools;
      if (searchQuery) {
        allTools = allTools.filter(tool => 
          tool.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      }
      return allTools;
    }
    
    // Для остальных: сначала фильтруем только защищенные инструменты
    // Если список еще не загружен, не показываем инструменты (кроме DEVELOPER)
    let protectedTools = protectedToolLinks.length > 0 
      ? tools.filter(tool => checkIsProtectedTool(tool))
      : [];
    
    // Затем фильтруем по доступу пользователя для управления
    let accessibleTools = protectedTools.filter(tool => canManageToolAccess(tool))
    
    // Затем применяем поисковый запрос
    if (searchQuery) {
      accessibleTools = accessibleTools.filter(tool => 
        tool.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    
    return accessibleTools
  }, [tools, searchQuery, canManageToolAccess, checkIsProtectedTool, protectedToolLinks, user])

  // Получаем информацию о выбранных сущностях
  const selectedEntitiesInfo = useMemo(() => {
    return selectedEntities.map(entityId => {
      if (entityType === 'group') return groups.find((g: any) => g.uuid === entityId)
      if (entityType === 'position') return positions.find((p: any) => p.uuid === entityId)
      if (entityType === 'user') return users.find((u: User) => u.id === entityId)
      return null
    }).filter(Boolean)
  }, [selectedEntities, entityType, groups, positions, users])

  // Агрегируем доступы для всех выбранных сущностей
  const aggregatedAccess = useMemo(() => {
    const toolAccessMap = new Map<string, {
      toolId: string
      accessLevels: AccessLevel[]
      entityAccesses: Array<{ entityId: string, access: EntityToolAccess | null }>
    }>()

    selectedEntities.forEach(entityId => {
      const accessList = entitiesAccess.get(entityId) || []
      accessList.forEach(access => {
        const existing = toolAccessMap.get(access.toolId)
        if (existing) {
          if (!existing.accessLevels.includes(access.accessLevel)) {
            existing.accessLevels.push(access.accessLevel)
          }
          existing.entityAccesses.push({ entityId, access })
        } else {
          toolAccessMap.set(access.toolId, {
            toolId: access.toolId,
            accessLevels: [access.accessLevel],
            entityAccesses: [{ entityId, access }]
          })
        }
      })
    })

    return toolAccessMap
  }, [selectedEntities, entitiesAccess])

  const entityOptions = useMemo(() => {
    if (entityType === 'group') return groups.map((g: any) => ({value: g.uuid, label: g.name}))
    if (entityType === 'position') {
      // Фильтруем должности по выбранной группе, если выбрана
      let filteredPositions = positions;
      if (selectedGroupFilter) {
        filteredPositions = positions.filter((p: any) => p.groupUuid === selectedGroupFilter);
      }
      return filteredPositions.map((p: any) => ({
        value: p.uuid, 
        label: p.name,
        groupName: p.group?.name || 'Группа не указана'
      }))
    }
    if (entityType === 'user') return users.map((u: User) => ({value: u.id, label: u.name}))
    return []
  }, [entityType, groups, positions, users, selectedGroupFilter])

  const statistics = useMemo(() => {
    // DEVELOPER видит все инструменты
    if (user?.role === 'DEVELOPER') {
      return {
        totalTools: tools.length,
        accessedTools: aggregatedAccess.size,
        readonlyCount: 0,
        contributorCount: 0,
        fullCount: 0,
        selectedCount: selectedEntities.length
      }
    }
    
    // Учитываем только защищенные инструменты, к которым у пользователя есть доступ для управления
    const protectedTools = protectedToolLinks.length > 0 
      ? tools.filter(tool => checkIsProtectedTool(tool))
      : []
    const manageableTools = protectedTools.filter(tool => canManageToolAccess(tool))
    const totalTools = manageableTools.length
    const accessedTools = aggregatedAccess.size
    
    // Подсчитываем уровни доступа (если у всех выбранных сущностей одинаковый уровень)
    let readonlyCount = 0
    let contributorCount = 0
    let fullCount = 0

    aggregatedAccess.forEach(({ accessLevels }) => {
      if (accessLevels.length === 1) {
        const level = accessLevels[0]
        if (level === 'READONLY') readonlyCount++
        else if (level === 'CONTRIBUTOR') contributorCount++
        else if (level === 'FULL') fullCount++
      }
    })

    return {
      totalTools,
      accessedTools,
      readonlyCount,
      contributorCount,
      fullCount,
      selectedCount: selectedEntities.length
    }
  }, [tools, aggregatedAccess, selectedEntities.length, canManageToolAccess, checkIsProtectedTool, protectedToolLinks, user])

  // Показываем предупреждение, если у пользователя нет доступов для управления
  const hasManageableTools = useMemo(() => {
    // DEVELOPER всегда имеет доступ ко всем инструментам
    if (user?.role === 'DEVELOPER') {
      return tools.length > 0
    }
    // Для остальных проверяем наличие защищенных инструментов с доступом
    return tools.some(tool => checkIsProtectedTool(tool) && canManageToolAccess(tool))
  }, [tools, canManageToolAccess, checkIsProtectedTool, user])

  if (loading) return <LoadingOverlay visible />
  
  if (!hasManageableTools && !loading) {
    return (
      <Box style={{ 
        background: 'var(--theme-bg-elevated)', 
        borderRadius: '16px', 
        padding: '48px 24px',
        textAlign: 'center',
        border: '1px solid var(--theme-border-primary)'
      }}>
        <IconShield size={64} color="var(--theme-text-secondary)" style={{ margin: '0 auto 24px', display: 'block' }} />
        <Title order={3} mb="md" c="var(--theme-text-primary)">
          Нет доступных инструментов для управления
        </Title>
        <Text c="var(--theme-text-secondary)" mb="lg">
          У вас нет полного доступа ни к одному инструменту. 
          {user?.role !== 'ADMIN' && user?.role !== 'DEVELOPER' && 
            ' Для управления доступом к инструменту необходимо иметь полный (FULL) доступ к нему.'
          }
        </Text>
        <Text size="sm" c="var(--theme-text-secondary)">
          Запросите доступ к инструментам, чтобы получить возможность управлять правами доступа для других пользователей.
        </Text>
      </Box>
    )
  }

  return (
    <Box style={{ background: 'var(--theme-bg-primary)', minHeight: '100vh' }}>
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
          {statistics.selectedCount > 0 && (
            <Box style={{
              background: 'var(--theme-bg-primary)',
              borderRadius: '12px',
              padding: '16px',
              border: '1px solid var(--theme-border-secondary)',
              textAlign: 'center',
              minWidth: '120px'
            }}>
              <Text size="xl" fw={700} c="var(--theme-text-primary)">
                {statistics.selectedCount}
              </Text>
              <Text size="sm" c="var(--theme-text-secondary)">
                {statistics.selectedCount === 1 
                  ? entityType === 'group' ? 'Группа выбрана' :
                    entityType === 'user' ? 'Сотрудник выбран' : 'Должность выбрана'
                  : entityType === 'group' ? 'Групп выбрано' :
                    entityType === 'user' ? 'Сотрудников выбрано' : 'Должностей выбрано'
                }
              </Text>
            </Box>
          )}
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
          {statistics.selectedCount > 0 && (
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
          )}
          {statistics.selectedCount > 0 && (
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
          )}
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
            {entityType === 'position' && (
              <Box style={{ flex: 1 }}>
                <Text size="sm" fw={500} c="var(--theme-text-primary)" mb="xs">
                  Группа должностей
                </Text>
                <Select 
                  data={groups.map((g: any) => ({value: g.uuid, label: g.name}))} 
                  value={selectedGroupFilter} 
                  onChange={setSelectedGroupFilter} 
                  placeholder="Все группы"
                  searchable
                  clearable
                  disabled={loading}
                />
              </Box>
            )}
            <Box style={{ flex: 2 }}>
              <Text size="sm" fw={500} c="var(--theme-text-primary)" mb="xs">
                {entityType === 'group' ? 'Группа должностей' : 
                 entityType === 'user' ? 'Сотрудник' : 'Должность'}
                {selectedEntities.length > 0 && (
                  <Badge size="sm" variant="light" color="blue" ml="xs">
                    {selectedEntities.length}
                  </Badge>
                )}
              </Text>
              <MultiSelect 
                data={entityOptions.map((opt: any) => {
                  // Для должностей добавляем информацию о группе в label с tooltip через title
                  if (entityType === 'position' && opt.groupName) {
                    return {
                      ...opt,
                      label: opt.label,
                      title: `Группа: ${opt.groupName}`
                    };
                  }
                  return opt;
                })} 
                value={selectedEntities} 
                onChange={(values) => {
                  // Ограничиваем количество выбранных сущностей
                  if (values.length > MAX_SELECTED_ENTITIES) {
                    notificationSystem.addNotification(
                      'Предупреждение',
                      `Можно выбрать максимум ${MAX_SELECTED_ENTITIES} сущностей для оптимальной производительности`,
                      'warning'
                    )
                    setSelectedEntities(values.slice(0, MAX_SELECTED_ENTITIES))
                  } else {
                    setSelectedEntities(values)
                  }
                }}
                placeholder={`Выбрать ${entityType === 'group' ? 'группы' : entityType === 'user' ? 'сотрудников' : 'должности'} (макс. ${MAX_SELECTED_ENTITIES})`}
                searchable
                clearable
                disabled={loading}
                maxDropdownHeight={300}
                classNames={entityType === 'position' ? {
                  option: 'position-option-with-tooltip'
                } : undefined}
              />
            </Box>
            {entityType === 'user' && selectedEntities.length === 1 && (
              <Box style={{ flex: 1 }}>
                <Text size="sm" fw={500} c="var(--theme-text-primary)" mb="xs">
                  Роль
                </Text>
                <Select 
                  data={rolesData} 
                  value={users.find((u: User) => u.id === selectedEntities[0])?.role} 
                  onChange={updateUserRole} 
                  placeholder="Выберите роль" 
                  clearable
                  style={{ width: '100%' }}
                />
              </Box>
            )}
          </Group>
        </Box>
      </Box>

      {/* Запросы на доступ */}
      {accessRequests.length > 0 && (
        <Box style={{
          background: 'var(--theme-bg-elevated)',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid var(--theme-border-primary)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          marginBottom: '24px'
        }}>
          <Group justify="space-between" mb="md">
            <Group gap="sm">
              <IconClock size={24} color="var(--theme-color-primary)" />
              <Title order={3} c="var(--theme-text-primary)">
                Запросы на доступ
              </Title>
              <Badge size="lg" variant="light" color="blue">
                {accessRequests.length}
              </Badge>
            </Group>
          </Group>
          
          <Stack gap="md">
            {accessRequests.map((request) => {
              const metadata = request.metadata as any
              const toolName = metadata?.toolName || 'Неизвестный инструмент'
              const requesterName = request.user?.name || metadata?.requestedByName || 'Неизвестный пользователь'
              const requesterEmail = request.user?.email || metadata?.requestedByEmail || request.email
              
              return (
                <Card
                  key={request.id}
                  style={{
                    border: '1px solid var(--theme-border-primary)',
                    borderRadius: '12px',
                    background: 'var(--theme-bg-primary)'
                  }}
                  padding="md"
                >
                  <Group justify="space-between" align="flex-start">
                    <Box style={{ flex: 1 }}>
                      <Group gap="xs" mb="xs">
                        <Text fw={600} size="md" c="var(--theme-text-primary)">
                          {requesterName}
                        </Text>
                        <Badge size="sm" variant="light" color="blue">
                          {requesterEmail}
                        </Badge>
                      </Group>
                      <Text size="sm" c="var(--theme-text-secondary)" mb="xs">
                        Запрашивает доступ к инструменту: <strong>{toolName}</strong>
                      </Text>
                      <Text size="xs" c="var(--theme-text-secondary)">
                        {new Date(request.createdAt).toLocaleString('ru-RU')}
                      </Text>
                    </Box>
                    <Group gap="xs">
                      <Tooltip label="Одобрить с уровнем доступа">
                        <Button
                          size="sm"
                          variant="light"
                          color="green"
                          leftSection={<IconCheck size={16} />}
                          onClick={() => {
                            setSelectedRequest(request)
                            modals.approveRequest[1].open()
                          }}
                        >
                          Одобрить
                        </Button>
                      </Tooltip>
                      <Tooltip label="Отклонить запрос">
                        <Button
                          size="sm"
                          variant="light"
                          color="red"
                          leftSection={<IconX size={16} />}
                          onClick={() => handleRejectRequest(request.id)}
                        >
                          Отклонить
                        </Button>
                      </Tooltip>
                    </Group>
                  </Group>
                </Card>
              )
            })}
          </Stack>
        </Box>
      )}

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
            {selectedEntitiesInfo.length > 0 && (
              <Group gap="xs">
                {selectedEntitiesInfo.slice(0, 3).map((entity: any, index: number) => (
                  <Badge key={index} color="blue" variant="light" size="lg">
                    {entity?.name || entity?.firstName || 'Unknown'}
                  </Badge>
                ))}
                {selectedEntitiesInfo.length > 3 && (
                  <Badge color="blue" variant="light" size="lg">
                    +{selectedEntitiesInfo.length - 3} еще
                  </Badge>
                )}
              </Group>
            )}
          </Group>
          {bulkOperationProgress !== null && (
            <Progress value={bulkOperationProgress} size="sm" radius="xl" />
          )}
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
            const toolAccess = aggregatedAccess.get(tool.id)
            const hasAccess = !!toolAccess
            const accessLevelsArray = toolAccess?.accessLevels || [] // Массив строк AccessLevel[]
            const isUniformAccess = accessLevelsArray.length === 1
            const accessLevel = isUniformAccess ? accessLevelsArray[0] : null
            
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
                      <Tooltip
                        label={isUniformAccess 
                          ? (accessLevels.find(lvl => lvl.type === accessLevel)?.name || accessLevel)
                          : `Разные права: ${accessLevelsArray.map(levelStr => {
                            const found = accessLevels.find(a => a.type === levelStr)
                            return found?.name || levelStr
                          }).join(', ')}`
                        }
                        withArrow
                      >
                        <Badge 
                          color={
                            isUniformAccess
                              ? accessLevel === 'READONLY' ? 'gray' :
                                accessLevel === 'CONTRIBUTOR' ? 'blue' : 'green'
                              : 'orange'
                          }
                          variant="light"
                          size="sm"
                        >
                          {isUniformAccess
                            ? (accessLevels.find(lvl => lvl.type === accessLevel)?.name || accessLevel)
                            : `Разные права (${accessLevelsArray.length})`
                          }
                        </Badge>
                      </Tooltip>
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
                            <IconLockAccess size={16} />
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
                    {!hasAccess && selectedEntities.length > 0 && (
                      <Tooltip label="Добавить доступ">
                        <ActionIcon 
                          variant="light" 
                          color="green"
                          onClick={() => {
                            setSelectedTool(tool)
                            modals.changeAccess[1].open()
                          }}
                        >
                          <IconLockAccess size={16} />
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
              {searchQuery ? 'Попробуйте изменить поисковый запрос' : selectedEntities.length === 0 ? 'Выберите сущности для просмотра доступов' : 'Инструменты не найдены'}
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
          accessLevel: selectedTool ? (() => {
            const toolAccess = aggregatedAccess.get(selectedTool.id)
            if (toolAccess && toolAccess.accessLevels.length === 1) {
              return toolAccess.accessLevels[0]
            }
            return ''
          })() : ''
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
        opened={modals.approveRequest[0]}
        onClose={() => {
          modals.approveRequest[1].close()
          setSelectedRequest(null)
        }}
        title={selectedRequest ? `Одобрение запроса на доступ: ${(selectedRequest.metadata as any)?.toolName || 'Инструмент'}` : 'Одобрение запроса'}
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
          accessLevel: 'READONLY'
        }}
        onSubmit={(values) => {
          if (selectedRequest) {
            handleApproveRequest(selectedRequest.id, values.accessLevel as AccessLevel)
            modals.approveRequest[1].close()
            setSelectedRequest(null)
          }
        }}
      />

    </Box>
  )
}


export default Management