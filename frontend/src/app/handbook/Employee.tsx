import { useParams } from "react-router"
import { API } from "../../config/constants"
import { useEffect, useState } from "react"
import {  Card,  Title,  Text,  Group,  Stack,  Box,  Badge, ThemeIcon, Paper, Grid  } from "@mantine/core"
import { IconUser, IconMail, IconBuilding, IconShield } from "@tabler/icons-react"
import { BranchType } from "./Branch"

export type PositionType = {
  uuid: string
  name: string
}

export type EmployeeType = {
  uuid: string
  fio: string
  position: PositionType
  email: string
  status: string
  branch: BranchType
}

function Employee() {
  const params = useParams()
  const [employee, setEmployee] = useState<EmployeeType>()

  const getEmployee = async () => {
    const response = await fetch(`${API}/search/employee/${params.id}`)
    const json = await response.json()
    if (response.ok) {
      setEmployee(json)
    }
  }

  useEffect(() => {
    getEmployee()
  }, [params.id])

  return (
    employee &&
    <Box p="xl" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <Paper
        radius="lg"
        p="xl"
        style={{
          background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, rgba(255, 255, 255, 0.05) 100%)',
          border: '1px solid var(--theme-border-primary)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
        }}
      >
        <Stack gap="xl">
          {/* Заголовок */}
          <Group gap="md" align="center">
            <ThemeIcon size="xl" color="blue" variant="light">
              <IconUser size={28} />
            </ThemeIcon>
            <Title order={1} style={{ color: 'var(--theme-text-primary)' }}>
              {employee.fio}
            </Title>
          </Group>

          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack gap="md">
                {/* Должность */}
                <Card
                  radius="md"
                  p="md"
                  style={{
                    background: 'var(--theme-bg-primary)',
                    border: '1px solid var(--theme-border-primary)'
                  }}
                >
                  <Group gap="md">
                    <ThemeIcon size="lg" color="green" variant="light">
                      <IconShield size={20} />
                    </ThemeIcon>
                    <Box>
                      <Text size="sm" fw={600} style={{ color: 'var(--theme-text-secondary)' }}>
                        Должность
                      </Text>
                      <Text size="lg" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
                        {employee.position.name}
                      </Text>
                    </Box>
                  </Group>
                </Card>

                {/* Email */}
                <Card
                  radius="md"
                  p="md"
                  style={{
                    background: 'var(--theme-bg-primary)',
                    border: '1px solid var(--theme-border-primary)'
                  }}
                >
                  <Group gap="md">
                    <ThemeIcon size="lg" color="blue" variant="light">
                      <IconMail size={20} />
                    </ThemeIcon>
                    <Box>
                      <Text size="sm" fw={600} style={{ color: 'var(--theme-text-secondary)' }}>
                        Email
                      </Text>
                      <Text size="md" style={{ color: 'var(--theme-text-primary)' }}>
                        {employee.email}
                      </Text>
                    </Box>
                  </Group>
                </Card>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack gap="md">
                {/* Статус */}
                <Card
                  radius="md"
                  p="md"
                  style={{
                    background: 'var(--theme-bg-primary)',
                    border: '1px solid var(--theme-border-primary)'
                  }}
                >
                  <Group gap="md">
                    <ThemeIcon 
                      size="lg" 
                      variant="light"
                    >
                      <IconShield size={20} />
                    </ThemeIcon>
                    <Box>
                      <Text size="sm" fw={600} style={{ color: 'var(--theme-text-secondary)' }}>
                        Статус
                      </Text>
                      <Badge
                        size="lg"
                        variant="light"
                        color={employee.status === 'Работает' ? 'green' : 'red'}
                      >
                        {employee.status}
                      
                      </Badge>
                    </Box>
                  </Group>
                </Card>

                {/* Филиал */}
                <Card
                  radius="md"
                  p="md"
                  style={{
                    background: 'var(--theme-bg-primary)',
                    border: '1px solid var(--theme-border-primary)'
                  }}
                >
                  <Group gap="md">
                    <ThemeIcon size="lg" color="orange" variant="light">
                      <IconBuilding size={20} />
                    </ThemeIcon>
                    <Box>
                      <Text size="sm" fw={600} style={{ color: 'var(--theme-text-secondary)' }}>
                        Филиал
                      </Text>
                      <Text size="md" fw={500} style={{ color: 'var(--theme-text-primary)' }}>
                        {employee.branch.name}
                      </Text>
                    </Box>
                  </Group>
                </Card>
              </Stack>
            </Grid.Col>
          </Grid>
        </Stack>
      </Paper>
    </Box>
  )
}

export default Employee