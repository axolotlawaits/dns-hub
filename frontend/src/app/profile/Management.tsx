import { useEffect, useState, useMemo, useCallback } from "react"
import { API } from "../../config/constants"
import { ActionIcon, Select, MultiSelect, TextInput, Tooltip, Box, Title, Text, Group, Card, Badge, LoadingOverlay, Progress, Button, Stack, SegmentedControl, Paper, ScrollArea } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { Tool } from "../../components/Tools"
import { IconExternalLink, IconLockAccess, IconSearch, IconUsers, IconUser, IconBriefcase, IconShield, IconClock, IconBell, IconEye, IconCheck, IconX, IconEdit } from "@tabler/icons-react"
import { useNavigate } from "react-router"
import { User, UserRole } from "../../contexts/UserContext"
import { useUserContext } from "../../hooks/useUserContext"
import { useAccessContext } from "../../hooks/useAccessContext"
import { DynamicFormModal } from "../../utils/formModal"
import { CustomModal } from "../../utils/CustomModal"
import { apiRequest, showSuccessNotification, showWarningNotification } from "../../utils/apiHelpers"
import { AccessRequestCard } from "../../components/AccessRequestCard"

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
  const [accessFilter, setAccessFilter] = useState<'all' | 'with' | 'without'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'access'>('name')
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
  
  // Загрузка запросов на доступ (упрощенная версия с использованием утилит)
  const loadAccessRequests = useCallback(async () => {
    if (!user) return
    
    const result = await apiRequest('/access/requests/all', {}, false)
    if (result.success && result.data) {
      setAccessRequests(result.data)
    }
  }, [user])
  
  useEffect(() => {
    loadAccessRequests()
  }, [loadAccessRequests])
  
  // Одобрение запроса на доступ (упрощенная версия с использованием утилит)
  const handleApproveRequest = useCallback(async (requestId: string, accessLevel: AccessLevel = 'READONLY') => {
    const result = await apiRequest(`/access/requests/${requestId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ accessLevel })
    })
    
    if (result.success) {
      showSuccessNotification('Доступ успешно предоставлен')
      loadAccessRequests()
    }
  }, [loadAccessRequests])
  
  // Отклонение запроса на доступ (упрощенная версия с использованием утилит)
  const handleRejectRequest = useCallback(async (requestId: string, reason?: string) => {
    const result = await apiRequest(`/access/requests/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    })
    
    if (result.success) {
      showSuccessNotification('Запрос отклонен')
      loadAccessRequests()
    }
  }, [loadAccessRequests])
  
  const modals = {
    changeAccess: useDisclosure(false),
    approveRequest: useDisclosure(false),
    accessRequests: useDisclosure(false),
    previewChanges: useDisclosure(false),
  }
  
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null)
  const [previewData, setPreviewData] = useState<{
    toolId: string;
    toolName: string;
    accessLevel: AccessLevel;
    changes: Array<{
      entityId: string;
      entityName: string;
      currentLevel: AccessLevel | null;
      newLevel: AccessLevel;
      action: 'add' | 'update' | 'remove';
    }>;
  } | null>(null)

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
    const result = await apiRequest('/search/group/all', {}, false)
    if (result.success && result.data) {
      setGroups(result.data)
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
    const result = await apiRequest(`/search/tool?text=${search || ''}`, {}, false)
    if (result.success && result.data) {
      setTools(result.data)
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

    const accessPromises = selectedEntities.map(async (entityId) => {
      const result = await apiRequest(`/access/${entityType}/${entityId}`, {}, false)
      return { 
        entityId, 
        access: result.success && result.data ? result.data : [] 
      }
    })

    const results = await Promise.all(accessPromises)
    const newAccessMap = new Map<string, EntityToolAccess[]>()
    results.forEach(({ entityId, access }) => {
      newAccessMap.set(entityId, access)
    })
    setEntitiesAccess(newAccessMap)
  }, [entityType, selectedEntities])

  useEffect(() => {
    getAccessedTools()
  }, [getAccessedTools])

  // Подготовка предпросмотра изменений
  const preparePreview = useCallback((toolId: string, accessLevel: AccessLevel) => {
    if (selectedEntities.length === 0) return null

    const tool = tools.find(t => t.id === toolId)
    const changes = selectedEntities.map(entityId => {
      const currentAccess = entitiesAccess.get(entityId) || []
      const existingAccess = currentAccess.find(acc => acc.toolId === toolId)
      const currentLevel = existingAccess?.accessLevel || null
      
      let action: 'add' | 'update' | 'remove' = 'add'
      if (existingAccess && accessLevel) {
        action = currentLevel === accessLevel ? 'update' : 'update'
      } else if (existingAccess && !accessLevel) {
        action = 'remove'
      }

      const entityName = entityType === 'group' 
        ? (groups.find((g: any) => g.uuid === entityId) as any)?.name || entityId
        : entityType === 'position'
        ? (positions.find((p: any) => p.uuid === entityId) as any)?.name || entityId
        : users.find(u => u.id === entityId)?.name || entityId

      return {
        entityId,
        entityName,
        currentLevel,
        newLevel: accessLevel,
        action
      }
    })

    return {
      toolId,
      toolName: tool?.name || 'Неизвестный инструмент',
      accessLevel,
      changes
    }
  }, [selectedEntities, entitiesAccess, tools, groups, positions, users, entityType])

  // Массовое обновление доступа для всех выбранных сущностей
  const updateGroupAccess = useCallback(async (
    toolId: string, 
    accessLevel: AccessLevel, 
    skipPreview: boolean = false,
    temporaryAccess?: {
      isTemporary: boolean;
      validFrom?: string;
      validUntil?: string;
      reason?: string;
    }
  ) => {
    if (selectedEntities.length === 0) return

    // Показываем предпросмотр, если не пропущен
    if (!skipPreview && selectedEntities.length > 1) {
      const preview = preparePreview(toolId, accessLevel)
      if (preview) {
        setPreviewData(preview)
        modals.previewChanges[1].open()
        return
      }
    }

    setBulkOperationProgress(0)
    const total = selectedEntities.length
    let successCount = 0
    let errorCount = 0

    try {
      const updatePromises = selectedEntities.map(async (entityId, index) => {
        try {
          // Подготовка тела запроса
          const requestBody: any = { toolId, accessLevel };
          
          // Добавляем параметры временного доступа, если указаны
          if (temporaryAccess?.isTemporary) {
            requestBody.isTemporary = true;
            if (temporaryAccess.validFrom) requestBody.validFrom = temporaryAccess.validFrom;
            if (temporaryAccess.validUntil) requestBody.validUntil = temporaryAccess.validUntil;
            if (temporaryAccess.reason) requestBody.reason = temporaryAccess.reason;
          }
          
          const response = await fetch(`${API}/access/${entityType}/${entityId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
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
        showWarningNotification(
          `Обновлено ${successCount} из ${total} сущностей. Ошибок: ${errorCount}`,
          'Частичный успех'
        )
      } else if (successCount > 0) {
        showSuccessNotification(
          `Доступ успешно обновлен для ${successCount} ${successCount === 1 ? 'сущности' : 'сущностей'}`
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
        showWarningNotification(
          `Доступ удален для ${successCount} из ${total} сущностей. Ошибок: ${errorCount}`,
          'Частичный успех'
        )
      } else if (successCount > 0) {
        showSuccessNotification(
          `Доступ успешно удален для ${successCount} ${successCount === 1 ? 'сущности' : 'сущностей'}`
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
      const result = await apiRequest(`/user/${selectedEntities[0]}`, {
        method: 'PATCH',
        body: JSON.stringify({role})
      })

      if (result.success && result.data) {
        setUsers(prevUsers => prevUsers.map(user => user.id === result.data.id ? {...user, role: result.data.role} : user))
        showSuccessNotification('Роль пользователя успешно обновлена')
      }
    }
  }, [entityType, selectedEntities])

  // Получаем информацию о выбранных сущностях
  const selectedEntitiesInfo = useMemo(() => {
    return selectedEntities.map(entityId => {
      if (entityType === 'group') return groups.find((g: any) => g.uuid === entityId)
      if (entityType === 'position') return positions.find((p: any) => p.uuid === entityId)
      if (entityType === 'user') return users.find((u: User) => u.id === entityId)
      return null
    }).filter(Boolean)
  }, [selectedEntities, entityType, groups, positions, users])

  // Агрегируем доступы для всех выбранных сущностей (должно быть определено ДО filteredTools)
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

  // Получаем информацию о родителях - создаем маппинг всех инструментов по их ID
  const parentToolsMap = useMemo(() => {
    const map = new Map<string | null, Tool>();
    // Добавляем все инструменты в маппинг по их ID, чтобы можно было найти родителя по parent_id
    tools.forEach(tool => {
      map.set(tool.id, tool);
    });
    return map;
  }, [tools]);

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
    
    // Применяем фильтр по доступу (только если выбраны сущности)
    if (selectedEntities.length > 0) {
      if (accessFilter === 'with') {
        accessibleTools = accessibleTools.filter(tool => aggregatedAccess.has(tool.id))
      } else if (accessFilter === 'without') {
        accessibleTools = accessibleTools.filter(tool => !aggregatedAccess.has(tool.id))
      }
    }
    
    // Затем применяем поисковый запрос
    if (searchQuery) {
      accessibleTools = accessibleTools.filter(tool => 
        tool.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    
    // Сортировка
    accessibleTools = [...accessibleTools].sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name, 'ru')
      } else {
        const aHasAccess = aggregatedAccess.has(a.id)
        const bHasAccess = aggregatedAccess.has(b.id)
        if (aHasAccess === bHasAccess) {
          return a.name.localeCompare(b.name, 'ru')
        }
        return aHasAccess ? -1 : 1
      }
    })
    
    return accessibleTools
  }, [tools, searchQuery, canManageToolAccess, checkIsProtectedTool, protectedToolLinks, user, accessFilter, sortBy, aggregatedAccess, selectedEntities.length])

  // Группировка отфильтрованных инструментов по родителям
  const groupedTools = useMemo(() => {
    if (filteredTools.length === 0) return new Map<string | null, Tool[]>();
    
    const groups = new Map<string | null, Tool[]>();
    
    filteredTools.forEach(tool => {
      const parentId = (tool as any).parent_id || null;
      if (!groups.has(parentId)) {
        groups.set(parentId, []);
      }
      groups.get(parentId)!.push(tool);
    });
    
    // Сортируем группы: сначала без родителя, потом по имени родителя
    const sortedGroups = new Map<string | null, Tool[]>();
    const entries = Array.from(groups.entries());
    
    // Сначала добавляем группы без родителя
    const noParent = entries.find(([id]) => id === null);
    if (noParent) {
      sortedGroups.set(null, noParent[1].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
    }
    
    // Затем добавляем остальные группы, отсортированные по имени родителя
    const withParent = entries
      .filter(([id]) => id !== null)
      .sort(([idA], [idB]) => {
        const parentA = parentToolsMap.get(idA!);
        const parentB = parentToolsMap.get(idB!);
        const nameA = parentA?.name || '';
        const nameB = parentB?.name || '';
        return nameA.localeCompare(nameB, 'ru');
      });
    
    withParent.forEach(([id, tools]) => {
      sortedGroups.set(id, tools.sort((a, b) => a.name.localeCompare(b.name, 'ru')));
    });
    
    return sortedGroups;
  }, [filteredTools, parentToolsMap])

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
          {accessRequests.length > 0 && (
            <Button
              variant="light"
              color="blue"
              leftSection={<IconBell size={18} />}
              onClick={modals.accessRequests[1].open}
              style={{ position: 'relative' }}
            >
              Запросы на доступ
              <Badge
                size="sm"
                variant="filled"
                color="red"
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  minWidth: 20,
                  height: 20,
                  padding: '0 6px',
                  fontSize: '11px',
                  fontWeight: 700
                }}
              >
                {accessRequests.length}
              </Badge>
            </Button>
          )}
        </Group>

        {/* Статистика - улучшенная визуализация */}
        <Group gap="md" mb="md" wrap="wrap">
          {statistics.selectedCount > 0 && (
            <Card
              padding="md"
              radius="md"
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                minWidth: '140px',
                flex: '0 0 auto'
              }}
            >
              <Text size="xl" fw={700} c="white" ta="center">
                {statistics.selectedCount}
              </Text>
              <Text size="sm" c="rgba(255,255,255,0.9)" ta="center" mt={4}>
                {statistics.selectedCount === 1 
                  ? entityType === 'group' ? 'Группа выбрана' :
                    entityType === 'user' ? 'Сотрудник выбран' : 'Должность выбрана'
                  : entityType === 'group' ? 'Групп выбрано' :
                    entityType === 'user' ? 'Сотрудников выбрано' : 'Должностей выбрано'
                }
              </Text>
            </Card>
          )}
          <Card
            padding="md"
            radius="md"
            style={{
              background: 'var(--theme-bg-primary)',
              border: '1px solid var(--theme-border-secondary)',
              minWidth: '140px',
              flex: '0 0 auto'
            }}
          >
            <Text size="xl" fw={700} c="var(--theme-text-primary)" ta="center">
              {statistics.totalTools}
            </Text>
            <Text size="sm" c="var(--theme-text-secondary)" ta="center" mt={4}>
              Всего инструментов
            </Text>
          </Card>
          {statistics.selectedCount > 0 && (
            <>
              <Card
                padding="md"
                radius="md"
                style={{
                  background: statistics.accessedTools > 0 
                    ? 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)'
                    : 'var(--theme-bg-primary)',
                  border: statistics.accessedTools > 0 
                    ? 'none'
                    : '1px solid var(--theme-border-secondary)',
                  minWidth: '140px',
                  flex: '0 0 auto'
                }}
              >
                <Text 
                  size="xl" 
                  fw={700} 
                  c={statistics.accessedTools > 0 ? 'white' : 'var(--theme-text-primary)'} 
                  ta="center"
                >
                  {statistics.accessedTools}
                </Text>
                <Text 
                  size="sm" 
                  c={statistics.accessedTools > 0 ? 'rgba(255,255,255,0.9)' : 'var(--theme-text-secondary)'} 
                  ta="center" 
                  mt={4}
                >
                  С доступом
                </Text>
              </Card>
              <Card
                padding="md"
                radius="md"
                style={{
                  background: statistics.fullCount > 0 
                    ? 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)'
                    : 'var(--theme-bg-primary)',
                  border: statistics.fullCount > 0 
                    ? 'none'
                    : '1px solid var(--theme-border-secondary)',
                  minWidth: '140px',
                  flex: '0 0 auto'
                }}
              >
                <Text 
                  size="xl" 
                  fw={700} 
                  c={statistics.fullCount > 0 ? 'white' : 'var(--theme-text-primary)'} 
                  ta="center"
                >
                  {statistics.fullCount}
                </Text>
                <Text 
                  size="sm" 
                  c={statistics.fullCount > 0 ? 'rgba(255,255,255,0.9)' : 'var(--theme-text-secondary)'} 
                  ta="center" 
                  mt={4}
                >
                  Полный доступ
                </Text>
              </Card>
              {statistics.readonlyCount > 0 && (
                <Card
                  padding="md"
                  radius="md"
                  style={{
                    background: 'var(--theme-bg-primary)',
                    border: '1px solid var(--theme-border-secondary)',
                    minWidth: '140px',
                    flex: '0 0 auto'
                  }}
                >
                  <Text size="xl" fw={700} c="var(--theme-text-primary)" ta="center">
                    {statistics.readonlyCount}
                  </Text>
                  <Text size="sm" c="var(--theme-text-secondary)" ta="center" mt={4}>
                    Только чтение
                  </Text>
                </Card>
              )}
              {statistics.contributorCount > 0 && (
                <Card
                  padding="md"
                  radius="md"
                  style={{
                    background: 'var(--theme-bg-primary)',
                    border: '1px solid var(--theme-border-secondary)',
                    minWidth: '140px',
                    flex: '0 0 auto'
                  }}
                >
                  <Text size="xl" fw={700} c="var(--theme-text-primary)" ta="center">
                    {statistics.contributorCount}
                  </Text>
                  <Text size="sm" c="var(--theme-text-secondary)" ta="center" mt={4}>
                    Без удаления
                  </Text>
                </Card>
              )}
            </>
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
              <Group gap="xs" align="center" mb="xs">
                <Text size="sm" fw={500} c="var(--theme-text-primary)">
                  {entityType === 'group' ? 'Группа должностей' : 
                   entityType === 'user' ? 'Сотрудник' : 'Должность'}
                </Text>
                {selectedEntities.length > 0 && (
                  <Badge size="sm" variant="light" color="blue">
                    {selectedEntities.length}
                  </Badge>
                )}
              </Group>
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
                    showWarningNotification(
                      `Можно выбрать максимум ${MAX_SELECTED_ENTITIES} сущностей для оптимальной производительности`
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

      {/* Модалка запросов на доступ */}
      <CustomModal
        opened={modals.accessRequests[0]}
        onClose={modals.accessRequests[1].close}
        title="Запросы на доступ"
        icon={<IconClock size={20} />}
        size="xl"
        maxHeight="90vh"
      >
        <Stack gap="md" style={{ maxHeight: 'calc(90vh - 100px)', overflowY: 'auto' }}>
          {accessRequests.length === 0 ? (
            <Box style={{ textAlign: 'center', padding: '48px 24px' }}>
              <IconClock size={48} color="var(--theme-text-secondary)" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.5 }} />
              <Text c="var(--theme-text-secondary)" size="lg" fw={500}>
                Нет запросов на доступ
              </Text>
              <Text c="var(--theme-text-secondary)" size="sm" mt="xs">
                Все запросы обработаны
              </Text>
            </Box>
          ) : (
            accessRequests.map((request) => (
              <AccessRequestCard
                key={request.id}
                request={request}
                onApprove={() => {
                  setSelectedRequest(request)
                  modals.accessRequests[1].close()
                  modals.approveRequest[1].open()
                }}
                onReject={() => handleRejectRequest(request.id)}
              />
            ))
          )}
        </Stack>
      </CustomModal>

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
            <Progress value={bulkOperationProgress} size="sm" radius="xl" style={{ flex: 1 }} />
          )}
          <Group gap="sm">
            {selectedEntities.length > 0 && (
              <>
                <SegmentedControl
                  value={accessFilter}
                  onChange={(value) => setAccessFilter(value as 'all' | 'with' | 'without')}
                  data={[
                    { label: 'Все', value: 'all' },
                    { label: 'С доступом', value: 'with' },
                    { label: 'Без доступа', value: 'without' },
                  ]}
                  size="sm"
                />
                <SegmentedControl
                  value={sortBy}
                  onChange={(value) => setSortBy(value as 'name' | 'access')}
                  data={[
                    { label: 'По имени', value: 'name' },
                    { label: 'По доступу', value: 'access' },
                  ]}
                  size="sm"
                />
              </>
            )}
            <TextInput
              placeholder="Поиск инструментов..."
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: 300 }}
            />
          </Group>
        </Group>

        {/* Группированные инструменты */}
        <Stack gap="xl">
          {Array.from(groupedTools.entries()).map(([parentId, toolsInGroup]) => {
              if (toolsInGroup.length === 0) return null;
              
              const parentTool = parentId ? parentToolsMap.get(parentId) : null;
              const groupName = parentTool ? parentTool.name : 'Без категории';
              
              return (
                <Box key={parentId || 'no-parent'}>
                  <Group mb="md" align="center">
                    <Text size="lg" fw={600} c="var(--theme-text-primary)">
                      {groupName}
                    </Text>
                    <Badge variant="light" color="gray" size="sm">
                      {toolsInGroup.length}
                    </Badge>
                  </Group>
                  <Box style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '16px'
                  }}>
                    {toolsInGroup.map(tool => {
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
                    );
                  })}
                  </Box>
                </Box>
              );
            })}
        </Stack>

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
          },
          {
            name: 'isTemporary',
            label: 'Временный доступ',
            type: 'boolean',
            required: false
          },
          {
            name: 'validFrom',
            label: 'Действует с',
            type: 'date',
            required: false,
            disabled: (values: any) => !values.isTemporary
          },
          {
            name: 'validUntil',
            label: 'Действует до',
            type: 'date',
            required: false,
            disabled: (values: any) => !values.isTemporary
          },
          {
            name: 'reason',
            label: 'Причина предоставления',
            type: 'textarea',
            required: false,
            disabled: (values: any) => !values.isTemporary
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
            const temporaryAccess = values.isTemporary ? {
              isTemporary: true,
              validFrom: values.validFrom,
              validUntil: values.validUntil,
              reason: values.reason
            } : undefined;
            
            updateGroupAccess(
              selectedTool.id, 
              values.accessLevel as AccessLevel, 
              false,
              temporaryAccess
            )
            modals.changeAccess[1].close()
            setSelectedTool(null)
          }
        }}
      />

      {/* Модальное окно предпросмотра изменений */}
      <CustomModal
        opened={modals.previewChanges[0]}
        onClose={modals.previewChanges[1].close}
        title="Предпросмотр изменений"
        icon={<IconEye size={20} />}
        size="xl"
      >
        {previewData && (
          <Stack gap="md">
            <Paper p="md" withBorder>
              <Text fw={500} mb="xs">Инструмент:</Text>
              <Text size="lg" fw={600}>{previewData.toolName}</Text>
              <Group gap="xs" mt="xs">
                <Text size="sm" c="dimmed">Новый уровень доступа:</Text>
                <Badge color={previewData.accessLevel === 'READONLY' ? 'green' : previewData.accessLevel === 'CONTRIBUTOR' ? 'yellow' : 'red'}>
                  {accessLevels.find(lvl => lvl.type === previewData.accessLevel)?.name || previewData.accessLevel}
                </Badge>
              </Group>
            </Paper>

            <Paper p="md" withBorder>
              <Text fw={500} mb="md">
                Изменения для {previewData.changes.length} {previewData.changes.length === 1 
                  ? entityType === 'group' ? 'группы' : entityType === 'user' ? 'пользователя' : 'должности'
                  : entityType === 'group' ? 'групп' : entityType === 'user' ? 'пользователей' : 'должностей'}:
              </Text>
              <ScrollArea h={400}>
                <Stack gap="xs">
                  {previewData.changes.map((change, idx) => (
                    <Paper key={idx} p="sm" withBorder style={{
                      backgroundColor: change.action === 'add' ? 'var(--mantine-color-green-0)' :
                                      change.action === 'remove' ? 'var(--mantine-color-red-0)' :
                                      'var(--mantine-color-blue-0)'
                    }}>
                      <Group justify="space-between" align="flex-start">
                        <Box style={{ flex: 1 }}>
                          <Text fw={500} size="sm">{change.entityName}</Text>
                          <Group gap="xs" mt="xs">
                            {change.currentLevel ? (
                              <>
                                <Group gap={4}>
                                  <IconX size={14} color="red" />
                                  <Text size="xs" c="dimmed">Было:</Text>
                                  <Badge size="xs" variant="light" color="gray">
                                    {accessLevels.find(lvl => lvl.type === change.currentLevel)?.name || change.currentLevel}
                                  </Badge>
                                </Group>
                                <IconEdit size={14} />
                                <Group gap={4}>
                                  <IconCheck size={14} color="green" />
                                  <Text size="xs" c="dimmed">Стало:</Text>
                                  <Badge size="xs" variant="light" color={change.newLevel === 'READONLY' ? 'green' : change.newLevel === 'CONTRIBUTOR' ? 'yellow' : 'red'}>
                                    {accessLevels.find(lvl => lvl.type === change.newLevel)?.name || change.newLevel}
                                  </Badge>
                                </Group>
                              </>
                            ) : (
                              <Group gap={4}>
                                <IconCheck size={14} color="green" />
                                <Text size="xs" c="dimmed">Будет добавлен:</Text>
                                <Badge size="xs" variant="light" color={change.newLevel === 'READONLY' ? 'green' : change.newLevel === 'CONTRIBUTOR' ? 'yellow' : 'red'}>
                                  {accessLevels.find(lvl => lvl.type === change.newLevel)?.name || change.newLevel}
                                </Badge>
                              </Group>
                            )}
                          </Group>
                        </Box>
                        <Badge
                          size="sm"
                          color={change.action === 'add' ? 'green' : change.action === 'remove' ? 'red' : 'blue'}
                          variant="light"
                        >
                          {change.action === 'add' ? 'Добавление' : change.action === 'remove' ? 'Удаление' : 'Изменение'}
                        </Badge>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              </ScrollArea>
            </Paper>

            <Group justify="flex-end" mt="md">
              <Button variant="light" onClick={modals.previewChanges[1].close}>
                Отмена
              </Button>
              <Button
                onClick={async () => {
                  modals.previewChanges[1].close()
                  if (previewData) {
                    await updateGroupAccess(previewData.toolId, previewData.accessLevel, true, undefined)
                    setPreviewData(null)
                  }
                }}
                color="blue"
              >
                Применить изменения
              </Button>
            </Group>
          </Stack>
        )}
      </CustomModal>
      
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