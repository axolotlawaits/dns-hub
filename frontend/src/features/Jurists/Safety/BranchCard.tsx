import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { API } from '../../../config/constants';
import { notificationSystem } from '../../../utils/Push';
import { Button, Box, Group, ActionIcon, Text, Stack, Paper, Badge, Tooltip, Divider, Select, Popover, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronDown, IconChevronUp, IconUsers, IconX, IconEyePlus, IconMessageDots, IconBell, IconFileText, IconClock } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { Branch, SafetyJournal } from './SafetyJournal';
import useAuthFetch from '../../../hooks/useAuthFetch';
import LocalJournalTable from './JournalTable';
import { CustomModal } from '../../../utils/CustomModal';

interface ResponsibleEmployeeAddType {
  responsibilityType: 'ОТ' | 'ПБ' | '',
  employeeId: string
}

type ResponsibleDataType = {
  employee_id: string
  employee_name: string
  responsibility_type: 'ОТ' | 'ПБ'
}

type ResponsibleObjDataType = {
  responsibles: ResponsibleDataType[]
}

interface BranchCardProps {
  branch: Branch;
  onApproveJournal: (journal: SafetyJournal, status: 'approved', comment?: string) => void;
  onRejectJournal: (journal: SafetyJournal, status: 'rejected', rejectMessage: string) => void;
  onViewFile: (journal: SafetyJournal) => void;
  onUploadFiles: (journal: SafetyJournal) => void;
  onOpenChat: (branchId: string, branchName: string) => void;
  onNotifyBranch?: (branchId: string) => Promise<void>;
  onResponsibleChange?: () => void; // Callback для обновления списка филиалов после изменения ответственных
  forceUpdate?: number;
  canManageStatuses: boolean;
  expandedBranches: Set<string>;
  setExpandedBranches: (branches: Set<string>) => void;
  lastNotification?: {
    notifiedAt: string;
    notifiedBy?: string;
    unfilledJournals?: Array<{ id: string; title: string; type: string }>;
  };
  viewMode?: 'list' | 'grid';
  // ИСПРАВЛЕНО: Передаем данные ответственных из кэша, чтобы избежать множественных запросов
  responsibleData?: ResponsibleObjDataType;
  onResponsibleDataChange?: (branchId: string, data: ResponsibleObjDataType | undefined) => void;
}

const STYLES = {
  branchIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px'
  },
  buttonHover: {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
    }
  }
} as const;

const BranchCardComponent = function BranchCardComponent({ 
  branch, 
  onApproveJournal, 
  onRejectJournal, 
  onViewFile,
  onUploadFiles,
  onOpenChat,
  onNotifyBranch,
  onResponsibleChange,
  forceUpdate,
  canManageStatuses,
  expandedBranches,
  setExpandedBranches,
  lastNotification,
  viewMode: _viewMode = 'list', // Используется для мемоизации, но не в рендере
  responsibleData: propResponsibleData,
  onResponsibleDataChange
}: BranchCardProps) {
  const [isExpanded, setIsExpanded] = useState(expandedBranches.has(branch.branch_id));
  const [journalsModalOpened, { open: openJournalsModal, close: closeJournalsModal }] = useDisclosure(false);
  const [responsibleOpened, { open: responsibleOpen, close: responsibleClose }] = useDisclosure(false)
  const [deleteResId, setDeleteResId] = useState<string | null>(null)
  const [deleteResType, setDeleteResType] = useState<string | null>(null)
  const [employeesData, setEmployeesData] = useState([])
  const [responsible, setResponsible] = useState<ResponsibleEmployeeAddType>({employeeId: '', responsibilityType: ''})
  const [responsibleData, setResponsibleData] = useState<ResponsibleObjDataType>()
  const [resPopoverOpened, setResPopoverOpened] = useState(false)
  const [notifyingBranch, setNotifyingBranch] = useState(false)
  const authFetch  = useAuthFetch()

  // Проверяем, есть ли не заполненные журналы у филиала
  const hasUnfilledJournals = branch.journals.some((journal: SafetyJournal) => 
    journal.status === 'pending' && !journal.filled_at
  )

  // Обработчик отправки уведомления филиалу
  const handleNotifyBranch = useCallback(async () => {
    if (!onNotifyBranch) return;
    
    setNotifyingBranch(true);
    try {
      await onNotifyBranch(branch.branch_id);
    } catch (error: any) {
      console.error('[BranchCard] Ошибка при отправке уведомления филиалу:', error);
      // Исключение уже обработано в handleNotifyBranch родительского компонента
      // Здесь просто логируем для отладки
    } finally {
      // Всегда сбрасываем состояние загрузки, даже если произошла ошибка
      setNotifyingBranch(false);
    }
  }, [onNotifyBranch, branch.branch_id]);

  // Синхронизируем локальное состояние с глобальным
  useEffect(() => {
    setIsExpanded(expandedBranches.has(branch.branch_id));
  }, [expandedBranches, branch.branch_id]);

  const getEmployees = async (text: string) => {
    const response = await fetch(`${API}/search/employee/summary?text=${text}`)
    const json = await response.json()
    if (response.ok) {
      setEmployeesData(json)
    }
  }

  const handleResponsibleOpen = () => {
    responsibleOpen()
  }

  // ИСПРАВЛЕНО: Используем данные из props, если они есть, иначе загружаем
  const getResponsive = useCallback(async () => {
    // Если данные переданы из родителя, используем их
    if (propResponsibleData !== undefined) {
      setResponsibleData(propResponsibleData);
      return;
    }
    
    // Иначе загружаем самостоятельно (fallback для обратной совместимости)
    try {
      const response = await authFetch(`${API}/jurists/safety/branch/responsible?branchId=${branch.branch_id}`)
      if (response && response.ok) {
        const json = await response?.json()
        
        // ИСПРАВЛЕНО: API возвращает массив [{ branch_id, branch_name, responsibles: [...] }]
        // Нужно найти элемент с нужным branch_id
        let branchData: ResponsibleObjDataType | undefined = undefined;
        if (Array.isArray(json)) {
          if (json.length > 0) {
            branchData = json.find((item: any) => item.branch_id === branch.branch_id) || json[0]
          }
        } else if (json && typeof json === 'object') {
          // Если это объект напрямую (старый формат)
          branchData = json
        }
        
        setResponsibleData(branchData);
        // Уведомляем родителя об обновлении данных
        if (onResponsibleDataChange) {
          onResponsibleDataChange(branch.branch_id, branchData);
        }
      } else {
        setResponsibleData(undefined);
        if (onResponsibleDataChange) {
          onResponsibleDataChange(branch.branch_id, undefined);
        }
      }
    } catch (error) {
      setResponsibleData(undefined);
      if (onResponsibleDataChange) {
        onResponsibleDataChange(branch.branch_id, undefined);
      }
    } finally {
      loadingRef.current = false;
    }
  }, [branch.branch_id]); // УБРАЛИ authFetch, propResponsibleData, onResponsibleDataChange из зависимостей

  const initialLoadDoneRef = useRef(false);
  const loadingRef = useRef(false);

  // ИСПРАВЛЕНО: Загружаем ответственных только один раз при монтировании
  useEffect(() => {
    // Предотвращаем повторные запросы
    if (loadingRef.current || initialLoadDoneRef.current) return;
    
    if (propResponsibleData === undefined) {
      loadingRef.current = true;
      getResponsive();
      initialLoadDoneRef.current = true;
    } else {
      setResponsibleData(propResponsibleData);
      initialLoadDoneRef.current = true;
    }
  }, []); // Загружаем только один раз при монтировании

  const addResponsive = async () => {
    // ИСПРАВЛЕНО: Валидация перед отправкой
    if (!responsible?.employeeId || !responsible?.responsibilityType || 
        (responsible.responsibilityType !== 'ОТ' && responsible.responsibilityType !== 'ПБ')) {
      notificationSystem.addNotification('Ошибка', 'Заполните все поля корректно', 'error')
      return
    }

    const response = await authFetch(`${API}/jurists/safety/branch/responsible`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        branchId: branch.branch_id,
        employeeId: responsible.employeeId,
        responsibilityType: responsible.responsibilityType
      }),
    })

    if (response && response.ok) {
      notificationSystem.addNotification('Успех', 'Ответственный добавлен', 'success')
      // Обновляем список ответственных после успешного добавления
      await getResponsive()
      // ИСПРАВЛЕНО: Вызываем колбэк для обновления списка филиалов в родительском компоненте
      if (onResponsibleChange) {
        onResponsibleChange()
      }
      // ИСПРАВЛЕНО: Обновляем кэш в родительском компоненте
      if (onResponsibleDataChange && responsibleData) {
        onResponsibleDataChange(branch.branch_id, responsibleData);
      }
    } else {
      // ИСПРАВЛЕНО: Показываем детали ошибки
      let errorMessage = 'Ошибка при добавлении ответственного'
      let errorCode = null
      try {
        const errorData = await response?.json()
        errorMessage = errorData?.message || errorData?.detail || errorMessage
        errorCode = errorData?.code
      } catch (e) {
        // Игнорируем ошибку парсинга
      }
      
      // ИСПРАВЛЕНО: Если это ошибка дубликата, обновляем список т.к. запись уже существует
      if (errorCode === 'DUPLICATE' || response?.status === 409 || response?.status === 422) {
        notificationSystem.addNotification('Информация', errorMessage || 'Ответственный уже назначен', 'info')
        // ИСПРАВЛЕНО: Небольшая задержка перед обновлением
        await new Promise(resolve => setTimeout(resolve, 500))
        // Обновляем список, т.к. запись уже существует
        await getResponsive()
        if (onResponsibleChange) {
          onResponsibleChange()
        }
        // ИСПРАВЛЕНО: Обновляем кэш в родительском компоненте
        if (onResponsibleDataChange && responsibleData) {
          onResponsibleDataChange(branch.branch_id, responsibleData);
        }
      } else {
        notificationSystem.addNotification('Ошибка', errorMessage, 'error')
      }
    }
  }

  const deleteResponsive = async () => {
    const response = await authFetch(`${API}/jurists/safety/branch/responsible`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        branchId: branch.branch_id,
        employeeId: deleteResId,
        responsibilityType: deleteResType
      }),
    })
    if (response && response.ok) {
      notificationSystem.addNotification('Успех', 'Ответственный удален', 'success')
      // ИСПРАВЛЕНО: Небольшая задержка перед обновлением
      await new Promise(resolve => setTimeout(resolve, 500))
      // Обновляем список ответственных после успешного удаления
      await getResponsive()
      // ИСПРАВЛЕНО: Вызываем колбэк для обновления списка филиалов в родительском компоненте
      if (onResponsibleChange) {
        onResponsibleChange()
      }
      // ИСПРАВЛЕНО: Обновляем кэш в родительском компоненте
      if (onResponsibleDataChange && responsibleData) {
        onResponsibleDataChange(branch.branch_id, responsibleData);
      }
    } else {
      notificationSystem.addNotification('Ошибка', 'Ошибка при удалении ответственного', 'error')
    }
  }

  const handleEmployeeSearch = (value: string) => {
    if (value) {
      getEmployees(value)
    } else {
      employeesData.length > 0 && setEmployeesData([])
    }
  }

  const openDeleteModal = (id: string, type: 'ОТ' | 'ПБ') => {
    setDeleteResId(id)
    setDeleteResType(type)
  }

  const closeDeleteModal = () => {
    setDeleteResId(null)
    setDeleteResType(null)
  }

  const closeAddResonsibleModal = () => {
    responsibleClose()
    setEmployeesData([])
    setResponsible({employeeId: '', responsibilityType: ''})
  }

  const isGridMode = _viewMode === 'grid';
  
  return (
    <Paper 
      withBorder 
      radius="md" 
      p={isGridMode ? "md" : "lg"} 
      style={{ 
        background: 'var(--theme-bg-primary)',
        height: isGridMode ? '100%' : 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <Stack gap={isGridMode ? "sm" : "md"} style={{ flex: 1 }}>
        {/* Заголовок филиала */}
        <Group justify="space-between" align="flex-start" wrap={isGridMode ? 'wrap' : 'nowrap'}>
          <Group gap={isGridMode ? "sm" : "md"} wrap={isGridMode ? 'wrap' : 'nowrap'} style={{ flex: 1 }}>
            <Box style={{
              ...STYLES.branchIcon,
              width: isGridMode ? '40px' : '48px',
              height: isGridMode ? '40px' : '48px',
              fontSize: isGridMode ? '18px' : '20px'
            }}>
              🏢
            </Box>
            <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
              <Group gap="xs" align="center" wrap="nowrap">
                <Text 
                  size={isGridMode ? "sm" : "sm"} 
                  fw={600} 
                  truncate="end" 
                  component="div"
                  style={{ flex: 1 }}
                >
                  {branch.branch_name}
                </Text>
                <Group gap="xs">
                  {lastNotification && (
                    <Tooltip 
                      label={`Последнее оповещение: ${dayjs(lastNotification.notifiedAt).format('DD.MM.YYYY HH:mm')}`}
                      multiline
                      w={300}
                    >
                      <Group gap={4} style={{ cursor: 'default' }}>
                        <IconClock size={12} style={{ color: 'var(--mantine-color-orange-6)' }} />
                        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                          {dayjs(lastNotification.notifiedAt).format('DD.MM HH:mm')}
                        </Text>
                      </Group>
                    </Tooltip>
                  )}
                  {onNotifyBranch && hasUnfilledJournals && (
                    <Tooltip label="Отправить уведомление филиалу">
                      <ActionIcon 
                        size="xs" 
                        variant="light" 
                        color="orange"
                        onClick={handleNotifyBranch}
                        loading={notifyingBranch}
                        style={{ cursor: 'pointer' }}
                      >
                        <IconBell size={12} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Group>
              {isGridMode ? (
                <Stack gap="xs">
                  <Group gap="xs" wrap="wrap">
                    <Badge size="sm" variant="light" color="blue">
                      {branch.rrs_name}
                    </Badge>
                    <Badge size="sm" variant="light" color="gray">
                      {branch.journals.length} журналов
                    </Badge>
                  </Group>
                  <Text size="xs" style={{ color: 'var(--theme-text-secondary)' }} lineClamp={2}>
                    {branch.branch_address}
                  </Text>
                </Stack>
              ) : (
                <Group gap="xs" wrap='nowrap'>
                  <Badge size="sm" variant="outline" color="blue">
                    {branch.rrs_name}
                  </Badge>
                  <Badge size="sm" variant="outline" color="gray">
                    {branch.journals.length} журналов
                  </Badge>
                  <Tooltip label="Чат по филиалу">
                    <ActionIcon
                      size="sm"
                      variant="outline"
                      color="violet"
                      style={{ cursor: 'pointer' }}
                      onClick={() => onOpenChat(branch.branch_id, branch.branch_name)}
                    >
                      <IconMessageDots size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Popover width={300} position="bottom" withArrow shadow="md" opened={resPopoverOpened} onChange={(opened) => {
                    setResPopoverOpened(opened)
                    // Загружаем данные при открытии Popover
                    if (opened) {
                      getResponsive()
                    }
                  }} zIndex={100}>
                    <Popover.Target>
                      <Tooltip label="Ответственные по ПБ и ОТ">
                        <ActionIcon
                          size="sm"
                          variant="outline"
                          color="blue"
                          style={{ cursor: 'pointer' }}
                          onClick={() => setResPopoverOpened((o) => !o)}
                        >
                          <IconUsers size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <Stack gap="sm">
                        <Text size="sm" fw={600}>Ответственные</Text>
                        {canManageStatuses &&
                          <Button leftSection={<IconEyePlus size={18} />} variant="outline" onClick={handleResponsibleOpen} size='xs'>Назначить</Button>
                        }
                        <Divider />
                        <Stack gap="xs">
                          <Text size="xs" fw={500} c="blue">По пожарной безопасности:</Text>
                          {responsibleData && responsibleData.responsibles?.length > 0 ? (
                            responsibleData.responsibles.filter((res: ResponsibleDataType) => res.responsibility_type === 'ПБ').length > 0 ? (
                              responsibleData.responsibles.filter((res: ResponsibleDataType) => res.responsibility_type === 'ПБ').map((res: ResponsibleDataType) => (
                                <Group key={res.employee_id}>
                                  <Text size="xs" c="dimmed">{res.employee_name}</Text>
                                  {canManageStatuses && (
                                    <Tooltip label="Удалить ответственного">
                                      <ActionIcon variant="light" aria-label="Settings" size='sm' color='red' onClick={() => openDeleteModal(res.employee_id, 'ПБ')}>
                                        <IconX stroke={1.5} />
                                      </ActionIcon>
                                    </Tooltip>
                                  )}
                                </Group>
                              ))
                            ) : (
                              <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>Нет назначенных</Text>
                            )
                          ) : (
                            <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>Нет назначенных</Text>
                          )}
                        </Stack>
                        <Stack gap="xs">
                          <Text size="xs" fw={500} c="green">По охране труда:</Text>
                          {responsibleData && responsibleData.responsibles?.length > 0 ? (
                            responsibleData.responsibles.filter((res: ResponsibleDataType) => res.responsibility_type === 'ОТ').length > 0 ? (
                              responsibleData.responsibles.filter((res: ResponsibleDataType) => res.responsibility_type === 'ОТ').map((res: ResponsibleDataType) => (
                                <Group key={res.employee_id}>
                                  <Text size="xs" c="dimmed">{res.employee_name}</Text>
                                  {canManageStatuses && (
                                    <Tooltip label="Удалить ответственного">
                                      <ActionIcon variant="light" aria-label="Settings" size='sm' color='red' onClick={() => openDeleteModal(res.employee_id, 'ОТ')}>
                                        <IconX stroke={1.5} />
                                      </ActionIcon>
                                    </Tooltip>
                                  )}
                                </Group>
                              ))
                            ) : (
                              <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>Нет назначенных</Text>
                            )
                          ) : (
                            <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>Нет назначенных</Text>
                          )}
                        </Stack>
                      </Stack>
                    </Popover.Dropdown>
                  </Popover>
                  <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }} truncate="end">
                    {branch.branch_address}
                  </Text>
                </Group>
              )}
            </Stack>
          </Group>
          <Group gap="xs" wrap="nowrap">
            {isGridMode && (
              <>
                <Tooltip label="Чат по филиалу">
                  <ActionIcon
                    size="sm"
                    variant="light"
                    color="violet"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onOpenChat(branch.branch_id, branch.branch_name)}
                  >
                    <IconMessageDots size={16} />
                  </ActionIcon>
                </Tooltip>
                <Popover width={300} position="bottom" withArrow shadow="md" opened={resPopoverOpened} onChange={(opened) => {
                  setResPopoverOpened(opened)
                  // Загружаем данные при открытии Popover
                  if (opened) {
                    getResponsive()
                  }
                }} zIndex={100}>
                  <Popover.Target>
                    <Tooltip label="Ответственные по ПБ и ОТ">
                      <ActionIcon
                        size="sm"
                        variant="light"
                        color="blue"
                        style={{ cursor: 'pointer' }}
                        onClick={() => setResPopoverOpened((o) => !o)}
                      >
                        <IconUsers size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <Stack gap="sm">
                      <Text size="sm" fw={600}>Ответственные</Text>
                      {canManageStatuses &&
                        <Button leftSection={<IconEyePlus size={18} />} variant="outline" onClick={handleResponsibleOpen} size='xs'>Назначить</Button>
                      }
                      <Divider />
                      <Stack gap="xs">
                        <Text size="xs" fw={500} c="blue">По пожарной безопасности:</Text>
                        {responsibleData && responsibleData.responsibles?.length > 0 ? (
                          responsibleData.responsibles.filter((res: ResponsibleDataType) => res.responsibility_type === 'ПБ').length > 0 ? (
                            responsibleData.responsibles.filter((res: ResponsibleDataType) => res.responsibility_type === 'ПБ').map((res: ResponsibleDataType) => (
                              <Group key={res.employee_id}>
                                <Text size="xs" c="dimmed">{res.employee_name}</Text>
                                {canManageStatuses && (
                                  <Tooltip label="Удалить ответственного">
                                    <ActionIcon variant="light" aria-label="Settings" size='sm' color='red' onClick={() => openDeleteModal(res.employee_id, 'ПБ')}>
                                      <IconX stroke={1.5} />
                                    </ActionIcon>
                                  </Tooltip>
                                )}
                              </Group>
                            ))
                          ) : (
                            <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>Нет назначенных</Text>
                          )
                        ) : (
                          <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>Нет назначенных</Text>
                        )}
                      </Stack>
                      <Stack gap="xs">
                        <Text size="xs" fw={500} c="green">По охране труда:</Text>
                        {responsibleData && responsibleData.responsibles?.length > 0 ? (
                          responsibleData.responsibles.filter((res: ResponsibleDataType) => res.responsibility_type === 'ОТ').length > 0 ? (
                            responsibleData.responsibles.filter((res: ResponsibleDataType) => res.responsibility_type === 'ОТ').map((res: ResponsibleDataType) => (
                              <Group key={res.employee_id}>
                                <Text size="xs" c="dimmed">{res.employee_name}</Text>
                                {canManageStatuses && (
                                  <Tooltip label="Удалить ответственного">
                                    <ActionIcon variant="light" aria-label="Settings" size='sm' color='red' onClick={() => openDeleteModal(res.employee_id, 'ОТ')}>
                                      <IconX stroke={1.5} />
                                    </ActionIcon>
                                  </Tooltip>
                                )}
                              </Group>
                            ))
                          ) : (
                            <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>Нет назначенных</Text>
                          )
                        ) : (
                          <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>Нет назначенных</Text>
                        )}
                      </Stack>
                    </Stack>
                  </Popover.Dropdown>
                </Popover>
              </>
            )}
            <Button
              size={isGridMode ? "xs" : "sm"}
              leftSection={isExpanded ? <IconChevronUp size={isGridMode ? 14 : 16} /> : <IconChevronDown size={isGridMode ? 14 : 16} />}
              onClick={() => {
                if (isGridMode) {
                  // В режиме сетки открываем модальное окно
                  openJournalsModal();
                } else {
                  // В режиме списка разворачиваем карточку
                  const newExpanded = !isExpanded;
                  setIsExpanded(newExpanded);
                  
                  // Обновляем глобальное состояние развернутых филиалов
                  const newExpandedBranches = new Set(expandedBranches);
                  if (newExpanded) {
                    newExpandedBranches.add(branch.branch_id);
                  } else {
                    newExpandedBranches.delete(branch.branch_id);
                  }
                  setExpandedBranches(newExpandedBranches);
                }
              }}
              variant="light"
              style={{ flexShrink: 0 }}
            >
              {isGridMode ? 'Журналы' : (isExpanded ? 'Свернуть' : 'Развернуть')}
            </Button>
          </Group>
          <Modal opened={responsibleOpened} onClose={closeAddResonsibleModal} title="Назначение ответственного" centered>
            <Stack gap='lg'>
              <Stack>
                <Group>
                  <Select
                    placeholder="Выберите сотрудника"
                    data={employeesData.map((emp: any) => ({label: emp.fio, value: emp.uuid}))}
                    value={responsible?.employeeId || ''}
                    onChange={(value) => value && setResponsible({...responsible, employeeId: value})}
                    searchable
                    onSearchChange={(value) => handleEmployeeSearch(value)}
                    clearable
                    style={{ minWidth: 200 }}
                  />
                  <Select
                    placeholder="ОТ или ПБ?"
                    data={['ОТ', 'ПБ']}
                    value={responsible?.responsibilityType}
                    onChange={(value) => (value === 'ОТ' || value === 'ПБ') && setResponsible({...responsible, responsibilityType: value})}
                    searchable
                    clearable
                    w={150}
                  />
                </Group>
              </Stack>
              <Button variant='light' onClick={async () => {
                await addResponsive()
                closeAddResonsibleModal()
                // Открываем Popover после добавления, чтобы показать обновленный список
                if (!resPopoverOpened) {
                  setResPopoverOpened(true)
                }
              }}>Назначить</Button>
            </Stack>
          </Modal>
          <Modal opened={deleteResId !== null} onClose={closeDeleteModal} title="Удаление ответственного" centered>
            <Group grow>
              <Button variant='light' onClick={closeDeleteModal}>Отмена</Button>
              <Button onClick={async () => {
                await deleteResponsive()
                closeDeleteModal()
                // Открываем Popover после удаления, чтобы показать обновленный список
                if (!resPopoverOpened) {
                  setResPopoverOpened(true)
                }
              }}>Удалить</Button>
            </Group>
          </Modal>
        </Group>
        {/* Список журналов - только в режиме списка */}
        {isExpanded && !isGridMode && (
          <Box style={{ flex: 1, overflow: 'hidden' }}>
            <Divider mb="md" />
            {branch.journals.length === 0 ? (
              <Text size="sm" style={{ color: 'var(--theme-text-secondary)', textAlign: 'center', padding: '1rem' }}>
                Нет журналов в этом филиале
              </Text>
            ) : (
              <LocalJournalTable
                key={`${branch.branch_id}-${branch.journals.length}-${branch.journals.map(j => j.status).join(',')}-${forceUpdate}`}
                journals={branch.journals}
                onApproveJournal={onApproveJournal}
                onRejectJournal={onRejectJournal}
                onViewFile={onViewFile}
                onUploadFiles={onUploadFiles}
                canManageStatuses={canManageStatuses}
              />
            )}
          </Box>
        )}
      </Stack>

      {/* Модальное окно с журналами для режима сетки */}
      {isGridMode && (
        <CustomModal
          opened={journalsModalOpened}
          onClose={closeJournalsModal}
          title={`Журналы филиала: ${branch.branch_name}`}
          icon={<IconFileText size={20} />}
          size="xl"
          maxWidth="90vw"
          maxHeight="85vh"
        >
          <Box style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {branch.journals.length === 0 ? (
              <Text size="sm" style={{ color: 'var(--theme-text-secondary)', textAlign: 'center', padding: '2rem' }}>
                Нет журналов в этом филиале
              </Text>
            ) : (
              <LocalJournalTable
                key={`modal-${branch.branch_id}-${branch.journals.length}-${branch.journals.map(j => j.status).join(',')}-${forceUpdate}`}
                journals={branch.journals}
                onApproveJournal={onApproveJournal}
                onRejectJournal={onRejectJournal}
                onViewFile={onViewFile}
                onUploadFiles={onUploadFiles}
                canManageStatuses={canManageStatuses}
              />
            )}
          </Box>
        </CustomModal>
      )}
    </Paper>
  );
};

// Кастомная функция сравнения для оптимизации
BranchCardComponent.displayName = 'BranchCard';

// Мемоизация с кастомной функцией сравнения
const BranchCard = memo(BranchCardComponent, (prevProps: BranchCardProps, nextProps: BranchCardProps) => {
  // Оптимизированное сравнение - перерисовываем только если изменились ключевые данные
  // Возвращаем true если пропсы равны (не перерисовывать), false если отличаются (перерисовывать)
  const propsEqual = (
    prevProps.branch.branch_id === nextProps.branch.branch_id &&
    prevProps.branch.journals.length === nextProps.branch.journals.length &&
    prevProps.branch.journals.every((j: SafetyJournal, i: number) => {
      const nextJournal = nextProps.branch.journals[i];
      return j.id === nextJournal?.id && j.status === nextJournal?.status;
    }) &&
    prevProps.forceUpdate === nextProps.forceUpdate &&
    prevProps.canManageStatuses === nextProps.canManageStatuses &&
    prevProps.expandedBranches.size === nextProps.expandedBranches.size &&
    prevProps.expandedBranches.has(prevProps.branch.branch_id) === nextProps.expandedBranches.has(nextProps.branch.branch_id) &&
    prevProps.viewMode === nextProps.viewMode &&
    prevProps.onNotifyBranch === nextProps.onNotifyBranch &&
    prevProps.onResponsibleChange === nextProps.onResponsibleChange
  );
  
  // Если viewMode изменился, обязательно перерисовываем
  if (prevProps.viewMode !== nextProps.viewMode) {
    return false; // Перерисовывать
  }
  
  return propsEqual;
});

export default BranchCard;
