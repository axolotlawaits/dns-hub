import { useEffect, useState } from "react"
import { useSearchParams } from "react-router"
import { BranchType } from "./Branch"
import { EmployeeType } from "./Employee"
import BranchCard from './BranchCard'
import { API } from "../../config/constants"
import { 
  Select, 
  Card, 
  Title, 
  Text, 
  Group, 
  Stack, 
  Box, 
  Badge,
  ThemeIcon,
  Paper,
  Grid,
  Button,
  Flex
} from "@mantine/core"
import { IconFilterOff, IconSearch, IconBuilding, IconUsers, IconTool, IconMail } from "@tabler/icons-react"
import Tools, { Tool } from "../../components/Tools"

function Handbook() {
  const [searchParams] = useSearchParams()
  const [branches, setBranches] = useState<BranchType[]>([])
  const [employees, setEmployees] = useState<EmployeeType[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [searchFilter, setSearchFilter] = useState<string | null>('')
  const query = searchParams.get('text')
  const branchTypeQuery = searchParams.get('branchSearchType')
  const [cities, setCities] = useState<string[]>([])
  const [cityFilter, setCityFilter] = useState<string | null>('')
  const [positions, setPositions] = useState<string[]>([])
  const [positionFilter, setPositionFilter] = useState<string | null>('')

  const getSearchResults = async () => {
    const response = await fetch(`${API}/search/all?text=${query}&branchSearchType=${branchTypeQuery}`)
    const json = await response.json()
    if (response.ok) {
      setBranches(json.branches)
      setEmployees(json.users)
      setTools(json.tools)
    }
  }

  const getBranches = async () => {
    const response = await fetch(`${API}/search/branch?text=${query}&branchSearchType=${branchTypeQuery}&city=${cityFilter || ''}`)
    const json = await response.json()
    if (response.ok) {
      setBranches(json)
    }
  }

  const getEmployees = async () => {
    const response = await fetch(`${API}/search/employee?text=${query}&position=${positionFilter || ''}`)
    const json = await response.json()
    if (response.ok) {
      console.log(json)
      setEmployees(json)
    }
  }

  const getTools = async () => {
    const response = await fetch(`${API}/search/tool?text=${query}`)
    const json = await response.json()
    if (response.ok) {
      setTools(json)
    }
  }

  const getCities = async () => {
    const response = await fetch(`${API}/search/city`)
    const json = await response.json()
    if (response.ok) {
      setCities(json)
    }
  }

  const getPositions = async () => {
    const response = await fetch(`${API}/search/position`)
    const json = await response.json()
    if (response.ok) {
      setPositions(json)
    }
  }

  useEffect(() => {
    getSearchResults()
  }, [searchParams])

  useEffect(() => {
    setTools([])
    setBranches([])
    setEmployees([])
    searchFilter === 'tool' && getTools()
    searchFilter === 'branch' && getBranches(), getCities()
    searchFilter === 'employee' && getEmployees(), getPositions()
  }, [searchFilter, cityFilter, positionFilter])

  const clearFilters = () => {
    setSearchFilter('')
    setCityFilter('')
    setPositionFilter('')
    getSearchResults()
  }
  return (
    <Box  style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <Stack gap="md">
        {/* Заголовок */}
        <Paper
          radius="lg"
          p={20}
          style={{
            background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, rgba(255, 255, 255, 0.05) 100%)',
            border: '1px solid var(--theme-border-primary)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
          }}
        >
          <Group gap="md" align="center" mb="md">
            <ThemeIcon size="lg" color="blue" variant="light">
              <IconSearch size={22} />
            </ThemeIcon>
            <Title size={26} order={1} style={{ color: 'var(--theme-text-primary)' }}>
              Поиск по системе
            </Title>
          </Group>
          
          <Text size="lg" fw={600} mb="md" style={{ color: 'var(--theme-text-primary)' }}>
            Ключевая фраза: "{query}"
          </Text>
          
          <Group gap="md">
            <Badge size="md" variant="light" color="blue" leftSection={<IconTool size={16} />}>
              Инструменты: {tools.length}
            </Badge>
            <Badge size="md" variant="light" color="green" leftSection={<IconBuilding size={16} />}>
              Филиалы: {branches.length}
            </Badge>
            <Badge size="md" variant="light" color="orange" leftSection={<IconUsers size={16} />}>
              Сотрудники: {employees.length}
            </Badge>
          </Group>
        </Paper>

        {/* Фильтры */}
        <Paper
          radius="lg"
          p={20}
          style={{
            background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, rgba(255, 255, 255, 0.05) 100%)',
            border: '1px solid var(--theme-border-primary)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
          }}
        >
          <Title order={2} mb="md" style={{ color: 'var(--theme-text-primary)' }}>
            Фильтры
          </Title>
          
          <Flex gap="md" align="end" wrap="wrap">
        <Select 
          data={[
                {value: 'branch', label: 'Филиалы'}, 
                {value: 'employee', label: 'Сотрудники'},
                {value: 'tool', label: 'Инструменты'}
          ]} 
          value={searchFilter} 
          onChange={setSearchFilter} 
          placeholder="Поиск по..." 
              style={{ minWidth: 200 }}
              leftSection={<IconSearch size={16} />}
              styles={{
                input: {
                  background: 'var(--theme-bg-primary)',
                  border: '1px solid var(--theme-border-primary)',
                  color: 'var(--theme-text-primary)'
                }
              }}
            />
            
        {searchFilter === 'branch' &&
          <Select 
            data={cities} 
            value={cityFilter} 
            onChange={setCityFilter} 
            placeholder="Выбрать город" 
                style={{ minWidth: 200 }}
            searchable
            clearable
                leftSection={<IconBuilding size={16} />}
                styles={{
                  input: {
                    background: 'var(--theme-bg-primary)',
                    border: '1px solid var(--theme-border-primary)',
                    color: 'var(--theme-text-primary)'
                  }
                }}
              />
            }
            
        {searchFilter === 'employee' &&
          <Select 
            data={positions} 
            value={positionFilter} 
            onChange={setPositionFilter} 
            placeholder="Выбрать должность" 
                style={{ minWidth: 200 }}
            searchable
            clearable
                leftSection={<IconUsers size={16} />}
                styles={{
                  input: {
                    background: 'var(--theme-bg-primary)',
                    border: '1px solid var(--theme-border-primary)',
                    color: 'var(--theme-text-primary)'
                  }
                }}
              />
            }
            
        {(searchFilter || cityFilter || positionFilter) &&
              <Button 
                onClick={clearFilters} 
                variant="light" 
                color="red"
                leftSection={<IconFilterOff size={16} />}
                style={{
                  background: 'var(--color-red-50)',
                  border: '1px solid var(--color-red-200)',
                  color: 'var(--color-red-700)'
                }}
              >
                Очистить фильтры
              </Button>
            }
          </Flex>
        </Paper>

        {/* Результаты поиска */}
        {tools.length > 0 && (
          <Paper
            radius="lg"
            p="xl"
            style={{
              background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, rgba(255, 255, 255, 0.05) 100%)',
              border: '1px solid var(--theme-border-primary)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
            }}
          >
            <Group gap="md" align="center" mb="xl">
              <ThemeIcon size="xl" color="blue" variant="light">
                <IconTool size={28} />
              </ThemeIcon>
              <Title order={2} style={{ color: 'var(--theme-text-primary)' }}>
                Инструменты
              </Title>
            </Group>
            <Tools tools={tools} />
          </Paper>
        )}

        {branches.length > 0 && (
          <Paper
            radius="lg"
            p={20}
            style={{
              background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, rgba(255, 255, 255, 0.05) 100%)',
              border: '1px solid var(--theme-border-primary)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
            }}
          >
            <Group gap="md" align="center" mb="xl">
              <ThemeIcon size="xl" color="green" variant="light">
                <IconBuilding size={28} />
              </ThemeIcon>
              <Title order={2} style={{ color: 'var(--theme-text-primary)' }}>
                Филиалы
              </Title>
            </Group>
            
            <Grid>
              {branches.map(branch => (
                <Grid.Col key={branch.uuid} span={{ base: 12, md: 6, lg: 4 }}>
                  <BranchCard branch={branch} />
                </Grid.Col>
              ))}
            </Grid>
          </Paper>
        )}

        {employees.length > 0 && (
          <Paper
            radius="lg"
            p="xl"
            style={{
              background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, rgba(255, 255, 255, 0.05) 100%)',
              border: '1px solid var(--theme-border-primary)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
            }}
          >
            <Group gap="md" align="center" mb="xl">
              <ThemeIcon size="xl" color="orange" variant="light">
                <IconUsers size={28} />
              </ThemeIcon>
              <Title order={2} style={{ color: 'var(--theme-text-primary)' }}>
                Сотрудники
              </Title>
            </Group>
            
            <Grid>
              {employees.map(employee => (
                <Grid.Col key={employee.uuid} span={{ base: 12, md: 6, lg: 4 }}>
                  <Card
                    radius="lg"
                    p="lg"
                    style={{
                      background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, rgba(255, 255, 255, 0.05) 100%)',
                      border: '1px solid var(--theme-border-primary)',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
                      transition: 'var(--transition-all)',
                      height: '100%'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-primary-300)';
                      e.currentTarget.style.background = 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, rgba(59, 130, 246, 0.08) 100%)';
                      e.currentTarget.style.boxShadow = '0 8px 25px rgba(59, 130, 246, 0.15), 0 4px 10px rgba(0, 0, 0, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--theme-border-primary)';
                      e.currentTarget.style.background = 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, rgba(255, 255, 255, 0.05) 100%)';
                      e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.08)';
                    }}
                  >
                    <Stack gap="md">
                      <Group gap="md" align="center">
                        <ThemeIcon size="lg" color="orange" variant="light">
                          <IconUsers size={20} />
                        </ThemeIcon>
                        <Box>
                          <Text size="lg" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
                            {employee.fio}
                          </Text>
                          <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
                            {employee.position.name}
                          </Text>
                        </Box>
                      </Group>
                      
                      <Stack gap="xs">
                        <Group gap="xs" align="center">
                          <IconMail size={16} style={{ color: 'var(--color-primary-500)' }} />
                          <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
                            {employee.email}
                          </Text>
                        </Group>
                        
                        <Group gap="xs" align="center">
                          <IconBuilding size={16} style={{ color: 'var(--color-primary-500)' }} />
                          <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
                            {employee.branch.name}
                          </Text>
                        </Group>
                        
                        <Badge
                          size="sm"
                          color={employee.status === 'Работает' ? 'green' : 'red'}
                          variant="light"
                        >
                          {employee.status}
                        </Badge>
                      </Stack>
                    </Stack>
                  </Card>
                </Grid.Col>
              ))}
            </Grid>
          </Paper>
        )}
      </Stack>
    </Box>
  )
}

export default Handbook