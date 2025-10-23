import { useState, useEffect } from 'react';
import { API } from '../../../config/constants';
import { notificationSystem } from '../../../utils/Push';
import { Button, Box, Group, ActionIcon, Text, Stack, Paper, Badge, Tooltip, Divider, Select, Popover, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronDown, IconChevronUp, IconUsers, IconX, IconEyePlus } from '@tabler/icons-react';
import { Branch, SafetyJournal } from './SafetyJournal';
import useAuthFetch from '../../../hooks/useAuthFetch';
import LocalJournalTable from './JournalTable';

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

const BranchCard = function BranchCard({ 
  branch, 
  onApproveJournal, 
  onRejectJournal, 
  onViewFile,
  onUploadFiles,
  forceUpdate,
  canManageStatuses,
  expandedBranches,
  setExpandedBranches
}: { 
  branch: Branch;
  updateState: (newState: any) => void
  onApproveJournal: (journal: SafetyJournal) => void;
  onRejectJournal: (journal: SafetyJournal, status: 'rejected', rejectMessage: string) => void;
  onViewFile: (journal: SafetyJournal) => void;
  onUploadFiles: (journal: SafetyJournal) => void;
  forceUpdate?: number;
  canManageStatuses: boolean;
  expandedBranches: Set<string>;
  setExpandedBranches: (branches: Set<string>) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(expandedBranches.has(branch.branch_id));
  const [responsibleOpened, { open: responsibleOpen, close: responsibleClose }] = useDisclosure(false)
  const [deleteResId, setDeleteResId] = useState<string | null>(null)
  const [deleteResType, setDeleteResType] = useState<string | null>(null)
  const [employeesData, setEmployeesData] = useState([])
  const [responsible, setResponsible] = useState<ResponsibleEmployeeAddType>({employeeId: '', responsibilityType: ''})
  const [responsibleData, setResponsibleData] = useState<ResponsibleObjDataType>()
  const [resPopoverOpened, setResPopoverOpened] = useState(false)
  const authFetch  = useAuthFetch()

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

  // const getResponsive = async () => {
  //   const response = await authFetch(`${JOURNAL_API}/v1/branch_responsibles/?branchId=${branch.branch_id}`)
  //   if (response && response.ok) {
  //     const json = await response?.json()
  //     const [responsible] = json
  //     setResponsibleData(responsible)
  //   }
  // }

  const getResponsive = async () => {
    const response = await authFetch(`${API}/jurists/safety/branch/responsible?branchId=${branch.branch_id}`)
    if (response && response.ok) {
      const json = await response?.json()
      const [responsible] = json
      setResponsibleData(responsible)
    }
  }
  
  // const addResponsive = async () => {
  //   const response = await authFetch(`${JOURNAL_API}/v1/branch_responsibles`, {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json',
  //     },
  //     body: JSON.stringify({
  //       branchId: branch.branch_id,
  //       employeeId: responsible?.employeeId,
  //       responsibilityType: responsible?.responsibilityType
  //     }),
  //   })
  //   if (response && response.ok) {
  //     notificationSystem.addNotification('Успех', 'Ответственный добавлен', 'success')
  //   } else {
  //     notificationSystem.addNotification('Ошибка', 'Ошибка при добавлении ответственного', 'error')
  //   }
  // }

  const addResponsive = async () => {
    const response = await authFetch(`${API}/jurists/safety/branch/responsible`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        branchId: branch.branch_id,
        employeeId: responsible?.employeeId,
        responsibilityType: responsible?.responsibilityType
      }),
    })

    if (response && response.ok) {
      notificationSystem.addNotification('Успех', 'Ответственный добавлен', 'success')
    } else {
      notificationSystem.addNotification('Ошибка', 'Ошибка при добавлении ответственного', 'error')
    }
  }

  // const deleteResponsive = async () => {
  //   const response = await authFetch(`${JOURNAL_API}/v1/branch_responsibles`, {
  //     method: 'DELETE',
  //     headers: {
  //       'Content-Type': 'application/json',
  //     },
  //     body: JSON.stringify({
  //       branchId: branch.branch_id,
  //       employeeId: deleteResId,
  //       responsibilityType: deleteResType
  //     }),
  //   })
  //   if (response && response.ok) {
  //     notificationSystem.addNotification('Успех', 'Ответственный удален', 'success')
  //   } else {
  //     notificationSystem.addNotification('Ошибка', 'Ошибка при удалении ответственного', 'error')
  //   }
  // }

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

  return (
    <Paper withBorder radius="md" p="lg" style={{ background: 'var(--theme-bg-primary)' }}>
      <Stack gap="md">
        {/* Заголовок филиала */}
        <Group justify="space-between" align="center" wrap='nowrap'>
          <Group gap="md" wrap='nowrap'>
                  <Box style={STYLES.branchIcon}>
              🏢
            </Box>
            <Stack gap="xs">
              <Text size="lg" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
                {branch.branch_name}
              </Text>
              <Group gap="xs" wrap='nowrap'>
                <Badge size="sm" variant="outline" color="blue">
                  {branch.rrs_name}
                </Badge>
                <Badge size="sm" variant="outline" color="gray">
                  {branch.journals.length} журналов
                </Badge>
                <Popover width={300} position="bottom" withArrow shadow="md" opened={resPopoverOpened} onChange={setResPopoverOpened} zIndex={100}>
                  <Popover.Target>
                    <Tooltip label="Ответственные по ПБ и ОТ">
                      <ActionIcon
                        size="sm"
                        variant="outline"
                        color="blue"
                        style={{ cursor: 'pointer' }}
                        onClick={() => {setResPopoverOpened((o) => !o), getResponsive()}}
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
                        {responsibleData && responsibleData.responsibles?.length > 0 && 
                        responsibleData.responsibles.filter(res => res.responsibility_type === 'ПБ').map(res => (
                          <Group key={res.employee_id}>
                            <Text size="xs" c="dimmed">{res.employee_name}</Text>
                            <Tooltip label="Удалить ответственного">
                              <ActionIcon variant="light" aria-label="Settings" size='sm' color='red' onClick={() => openDeleteModal(res.employee_id, 'ПБ')}>
                                <IconX stroke={1.5} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>                         
                        ))}
                      </Stack>
                      <Stack gap="xs">
                        <Text size="xs" fw={500} c="green">По охране труда:</Text>
                        {responsibleData && responsibleData.responsibles?.length > 0 && 
                          responsibleData.responsibles.filter(res => res.responsibility_type === 'ОТ').map(res => (
                          <Group key={res.employee_id}>
                            <Text size="xs" c="dimmed">{res.employee_name}</Text>
                            <Tooltip label="Удалить ответственного">
                              <ActionIcon variant="light" aria-label="Settings" size='sm' color='red' onClick={() => openDeleteModal(res.employee_id, 'ОТ')}>
                                <IconX stroke={1.5} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        ))}
                      </Stack>
                    </Stack>
                  </Popover.Dropdown>
                </Popover>
                <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }} truncate="end">
                {branch.branch_address}
              </Text>
              </Group>
            </Stack>
          </Group>
          <Stack>
            <Button
              size="sm"
              leftSection={isExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
              onClick={() => {
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
              }}
              variant="outline"
            >
              {isExpanded ? 'Свернуть' : 'Развернуть'}
            </Button>
          </Stack>
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
              <Button variant='light' onClick={() => {addResponsive(), closeAddResonsibleModal()}}>Назначить</Button>
            </Stack>
          </Modal>
          <Modal opened={deleteResId !== null} onClose={closeDeleteModal} title="Удаление ответственного" centered>
            <Group grow>
              <Button variant='light' onClick={closeDeleteModal}>Отмена</Button>
              <Button onClick={() => {deleteResponsive(), closeDeleteModal()}}>Удалить</Button>
            </Group>
          </Modal>
        </Group>
        {/* Список журналов */}
        {isExpanded && (
          <Box>
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
    </Paper>
  );
};

export default BranchCard