import {  Button,  Text,  Group,  Stack,  Box,  Card,  Badge,  ThemeIcon, ActionIcon, TextInput, Modal } from "@mantine/core"
import {  IconSearch,  IconBuilding,  IconUsers,  IconTool,  IconMapPin,  IconShield, IconChevronRight, IconSparkles, IconUser, IconX } from "@tabler/icons-react"
import { useState, useCallback } from "react"
import { API } from "../config/constants"
import { useDisclosure } from "@mantine/hooks"
import { useNavigate } from "react-router"
import { BranchType } from "../app/handbook/Branch"
import { EmployeeType } from "../app/handbook/Employee"
import { Tool } from "./Tools"

interface SearchProps {
  opened?: boolean;
  onClose?: () => void;
  showButton?: boolean;
}

function Search({ opened: externalOpened, onClose: externalOnClose, showButton = true }: SearchProps = {}) {
  const [internalOpened, { open, close }] = useDisclosure(false)
  
  // Используем внешнее управление, если передано, иначе внутреннее
  const opened = externalOpened !== undefined ? externalOpened : internalOpened
  const handleClose = externalOnClose || close
  const [branchResult, setBranchResult] = useState<BranchType[]>([])
  const [branchByAddressResult, setBranchByAddressResult] = useState<BranchType[]>([])
  const [branchType, setBranchType] = useState('name')
  const [employeeResult, setEmployeeResult] = useState<EmployeeType[]>([])
  const [toolResult, setToolResult] = useState<Tool[]>([])
  const navigate = useNavigate()
  const [text, setText] = useState("")

  let curBranchTypeData = branchType === 'name' ? branchResult : branchByAddressResult

  const onSearch = useCallback(async (text: string) => {
    if (!text.trim()) {
      clearData()
      return
    }
    
    try {
      const response = await fetch(`${API}/search?text=${text}`)
      const json = await response.json()
      if (response.ok) {
        if (json.branches.length === 0 && json.branchesByAddress.length > 0) {
          setBranchType('address')
        } else {
          setBranchType('name')
        }
        setBranchResult(json.branches || [])
        setBranchByAddressResult(json.branchesByAddress || [])
        setEmployeeResult(json.users || [])
        setToolResult(json.tools || [])
      }
    } catch (error) {
      console.error("Search error:", error)
    }
  }, [])

  const onResultClick = useCallback((link: string) => {
    handleClose()
    clearData()
    navigate(link)
  }, [handleClose, navigate])


  const clearData = useCallback(() => {
    setBranchResult([])
    setBranchByAddressResult([])
    setEmployeeResult([])
    setToolResult([])
  }, [])


  const renderSearchResults = () => {
    const hasResults = branchResult.length > 0 || branchByAddressResult.length > 0 || employeeResult.length > 0 || toolResult.length > 0
    
    if (!hasResults && text) {
      return (
        <Box p="xl" style={{ textAlign: 'center' }}>
          <Stack gap="md" align="center">
            <ThemeIcon
              size="xl"
              color="gray"
              variant="light"
              style={{
                background: 'linear-gradient(135deg, var(--color-gray-100) 0%, var(--color-gray-200) 100%)',
                boxShadow: 'var(--theme-shadow-md)'
              }}
            >
              <IconSearch size={32} />
            </ThemeIcon>
            <Text size="lg" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
              Ничего не найдено
            </Text>
            <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
              Попробуйте изменить запрос или поискать в другом разделе
            </Text>
          </Stack>
        </Box>
      )
    }

    if (!text) {
      return (
        <Box p="xl" style={{ textAlign: 'center' }}>
          <Stack gap="md" align="center">
            <ThemeIcon
              size="xl"
              color="blue"
              variant="light"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary-100) 0%, var(--color-primary-200) 100%)',
                boxShadow: 'var(--theme-shadow-md)'
              }}
            >
              <IconSparkles size={32} />
            </ThemeIcon>
            <Text size="lg" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
              Предложенные ответы
            </Text>
            <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
              Начните вводить запрос, чтобы увидеть результаты поиска
            </Text>
          </Stack>
        </Box>
      )
    }

    return (
      <Stack gap="lg">
        {(branchResult.length > 0 || branchByAddressResult.length  > 0) && (
          <Box>
            <Box
              style={{
                background: 'var(--theme-bg-elevated)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                marginBottom: 'var(--space-4)',
                border: '1px solid var(--theme-border-primary)'
              }}
            >
              <Group gap="md" align="center" justify="space-between">
                <Group>
                  <ThemeIcon 
                    size="lg" 
                    color="blue" 
                    variant="light"
                  >
                    <IconBuilding size={20} />
                  </ThemeIcon>
                  <Text size="lg" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
                    Филиалы
                  </Text>
                  <Badge 
                    size="lg" 
                    variant="light" 
                    color="blue"
                  >
                    {curBranchTypeData.length}
                  </Badge>
                </Group>
                <Group>
                  <Button 
                    size="xs" 
                    variant={branchType === 'name' ? 'filled' : 'light'} 
                    onClick={() => setBranchType('name')}
                    rightSection={<Badge variant="default" size="sm">{branchResult.length}</Badge>}
                  >
                    По наименованию
                  </Button>
                  <Button
                    size="xs" 
                    variant={branchType === 'address' ? 'filled' : 'light'} 
                    onClick={() => setBranchType('address')}
                    rightSection={<Badge variant="default" size="sm">{branchByAddressResult.length}</Badge>}
                  >
                    По адресу
                  </Button>
                </Group>
              </Group>
            </Box>
            <Stack gap="sm">
              {curBranchTypeData.slice(0, 3).map(branch => (
                <Card
                  key={branch.uuid}
                  radius="lg"
                  p="lg"
                  style={{
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    background: 'var(--theme-bg-elevated)',
                    border: '1px solid var(--theme-border-primary)',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                    position: 'relative'
                  }}
                  onClick={() => onResultClick(`/branch/${branch.uuid}`)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-primary-300)'                   
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--theme-border-primary)'
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <Group justify="space-between" align="center">
                    <Box>
                      <Text size="md" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
                        {branch.name}
                      </Text>
                      <Group gap="xs" mt="xs">
                        <Badge size="sm" variant="light" color="green" leftSection={<IconMapPin size={12} />}>
                          {branch.city}
                        </Badge>
                        <Badge size="sm" variant="light" color="orange">
                          РРС: {branch.rrs}
                        </Badge>
                      </Group>
                    </Box>
                    <ActionIcon variant="subtle" color="blue">
                      <IconChevronRight size={16} />
                    </ActionIcon>
                  </Group>
                </Card>
              ))}
              {branchResult.length > 3 && (
                <Text size="sm" style={{ color: 'var(--theme-text-secondary)', textAlign: 'center', fontStyle: 'italic' }}>
                  и еще {branchResult.length - 3} филиалов...
                </Text>
              )}
            </Stack>
          </Box>
        )}

        {employeeResult.length > 0 && (
          <Box>
            <Box
              style={{
                background: 'var(--theme-bg-elevated)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                marginBottom: 'var(--space-4)',
                border: '1px solid var(--theme-border-primary)'
              }}
            >
              <Group gap="md" align="center">
                <ThemeIcon 
                  size="lg" 
                  color="green" 
                  variant="light"
                >
                  <IconUsers size={20} />
                </ThemeIcon>
                <Text size="lg" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
                  Сотрудники
                </Text>
                <Badge 
                  size="lg" 
                  variant="light" 
                  color="green"
                >
                  {employeeResult.length}
                </Badge>
              </Group>
            </Box>
            <Stack gap="sm">
              {employeeResult.slice(0, 3).map(employee => (
                <Card
                  key={employee.uuid}
                  radius="lg"
                  p="lg"
                  style={{
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    background: 'var(--theme-bg-elevated)',
                    border: '1px solid var(--theme-border-primary)',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                    position: 'relative'
                  }}
                  onClick={() => onResultClick(`/employee/${employee.uuid}`)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-green-300)'
                    e.currentTarget.style.background = 'var(--color-green-50)'
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--theme-border-primary)'
                    e.currentTarget.style.background = 'var(--theme-bg-elevated)'
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <Group justify="space-between" align="center">
                    <Box>
                      <Text size="md" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
                        {employee.fio}
                      </Text>
                      <Group gap="xs" mt="xs">
                        <Badge size="sm" variant="light" color="blue" leftSection={<IconShield size={12} />}>
                          {employee.position?.name || 'Не указана'}
                        </Badge>
                        <Badge size="sm" variant="light" color="orange" leftSection={<IconBuilding size={12} />}>
                          {employee.branch?.name || 'Не указан'}
                        </Badge>
                        <Badge 
                          size="sm" 
                          variant="light" 
                          color={employee.status === 'active' || employee.status === 'Работает' ? 'green' : 'red'}
                          leftSection={<IconUser size={12} />}
                        >
                          {employee.status}
                        </Badge>
                      </Group>
                    </Box>
                    <ActionIcon variant="subtle" color="green">
                      <IconChevronRight size={16} />
                    </ActionIcon>
                  </Group>
                </Card>
              ))}
              {employeeResult.length > 3 && (
                <Text size="sm" style={{ color: 'var(--theme-text-secondary)', textAlign: 'center', fontStyle: 'italic' }}>
                  и еще {employeeResult.length - 3} сотрудников...
                </Text>
              )}
            </Stack>
          </Box>
        )}

        {toolResult.length > 0 && (
          <Box>
            <Box
              style={{
                background: 'var(--theme-bg-elevated)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                marginBottom: 'var(--space-4)',
                border: '1px solid var(--theme-border-primary)'
              }}
            >
              <Group gap="md" align="center">
                <ThemeIcon 
                  size="lg" 
                  color="orange" 
                  variant="light"
                >
                  <IconTool size={20} />
                </ThemeIcon>
                <Text size="lg" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
                  Инструменты
                </Text>
                <Badge 
                  size="lg" 
                  variant="light" 
                  color="orange"
                >
                  {toolResult.length}
                </Badge>
              </Group>
            </Box>
            <Stack gap="sm">
              {toolResult.slice(0, 3).map(tool => (
                <Card
                  key={tool.id}
                  radius="lg"
                  p="lg"
                  style={{
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    background: 'var(--theme-bg-elevated)',
                    border: '1px solid var(--theme-border-primary)',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                    position: 'relative'
                  }}
                  onClick={() => onResultClick(`/${tool.link}`)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-orange-300)'
                    e.currentTarget.style.background = 'var(--color-orange-50)'
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--theme-border-primary)'
                    e.currentTarget.style.background = 'var(--theme-bg-elevated)'
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <Group justify="space-between" align="center">
                    <Box>
                      <Text size="md" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
                        {tool.name}
                      </Text>
                      <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }} mt="xs">
                        Инструмент системы
                      </Text>
                    </Box>
                    <ActionIcon variant="subtle" color="orange">
                      <IconChevronRight size={16} />
                    </ActionIcon>
                  </Group>
                </Card>
              ))}
              {toolResult.length > 3 && (
                <Text size="sm" style={{ color: 'var(--theme-text-secondary)', textAlign: 'center', fontStyle: 'italic' }}>
                  и еще {toolResult.length - 3} инструментов...
                </Text>
              )}
            </Stack>
          </Box>
        )}
      </Stack>
    )
  }

  return (
    <>
      <Modal
        opened={opened}
        onClose={() => { handleClose(); clearData(); setText(''); }}
        title=""
        size="lg"
        radius="lg"
        centered
        withCloseButton={false}
        withOverlay={false}
        zIndex={2000}
        closeOnClickOutside
        closeOnEscape      
        styles={{
          content: {
            width: '100%',
            maxWidth: '90vw',
          },
          body: {
            width: '100%',
            padding: 0
          },
        }}
      >
        <Box style={{ width: '100%' }}>
            {/* Заголовок с полем ввода */}
            <Box
              style={{
                background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-600) 100%)',
                borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
                padding: 'var(--space-4)',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              <Group gap="md" align="center" style={{ width: '100%' }}>
                <Box style={{ flex: 1 }}>
                  <Group justify="space-between" align="center" mb="sm">
                    {(branchResult.length > 0 || branchByAddressResult.length > 0 || employeeResult.length > 0 || toolResult.length > 0) && (
                      <Button
                        variant="outline"
                        color="white"
                        size="sm"
                        onClick={() => {
                          if (text.trim()) {
                            navigate(`/search?text=${encodeURIComponent(text)}&branchSearchType=${branchType}`);
                            handleClose();
                            clearData();
                            setText('');
                          }
                        }}
                        disabled={!text.trim()}
                      >
                        На страницу расширенного поиска
                      </Button>
                    )}
                    <ActionIcon
                      size={36}
                      variant="outline"
                      color="white"
                      onClick={() => { handleClose(); clearData(); setText(''); }}

                    >
                      <IconX size={20} />
                    </ActionIcon>
                  </Group>
                  <TextInput
                    placeholder="Введите запрос для поиска..."
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value)
                      onSearch(e.target.value)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && text.trim()) {
                        navigate(`/search?text=${encodeURIComponent(text)}`);
                        handleClose();
                        clearData();
                        setText('');
                      }
                    }}
                    leftSection={<IconSearch size={18} />}
                    size="md"
                    styles={{
                      input: {
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--theme-text-primary)',
                      }
                    }}
                  />
                </Box>
              </Group>
              
              {/* Декоративные элементы - убраны чтобы не перекрывать */}
            </Box>

            {/* Контейнер с результатами */}
            <Box
              style={{ 
                minHeight: '300px',
                maxHeight: '500px',
                overflowY: 'auto',
                background: 'var(--theme-bg-elevated)',
                borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
                border: '1px solid var(--theme-border-primary)',
                padding: 'var(--space-4)',
                boxShadow: 'var(--theme-shadow-lg)'
              }}
            >
              {renderSearchResults()}
            </Box>
        </Box>
      </Modal>
      
      {showButton && (
        <Button
          style={{
            background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-600) 100%)',
            border: 'none',
            borderRadius: 'var(--radius-xl)',
            color: 'white',
            fontWeight: 'var(--font-weight-medium)',
            boxShadow: 'var(--theme-shadow-md)',
            transition: 'var(--transition-all)',
            padding: 'var(--space-3) var(--space-6)',
            width: '200px'
          }}
          size="md"
          leftSection={<IconSearch size={18} />}
          onClick={open}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = 'var(--theme-shadow-lg)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'var(--theme-shadow-md)'
          }}
        >
          Поиск
        </Button>
      )}
    </>
  )
}

export default Search



