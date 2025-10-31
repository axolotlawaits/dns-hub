import { useParams } from "react-router"
import { API } from "../../config/constants"
import { useEffect, useState } from "react"
import { Map, Marker, ZoomControl } from "pigeon-maps"
import { Carousel } from "@mantine/carousel"
import { 
  Image, 
  Card, 
  Title, 
  Text, 
  Group, 
  Stack, 
  Box, 
  Badge, 
  ThemeIcon,
  Paper
} from "@mantine/core"
import { IconMapPin, IconBuilding, IconUsers, IconRuler, IconHomeLink } from "@tabler/icons-react"
import { EmployeeType } from "./Employee"

export type BranchType = {
  uuid: string
  name: string
  rrs: string
  city: string
  address: string
  latitude: number
  longitude: number
  type: string
  tradingArea: number
  images: BranchImage[]
  userData: EmployeeType[]
}

type BranchImage = {
  id: string
  link: string
}

function Branch() {
  const params = useParams()
  const [branch, setBranch] = useState<BranchType>()

  const getBranch = async () => {
    const response = await fetch(`${API}/search/branch/${params.id}`)
    const json = await response.json()
    if (response.ok) {
      setBranch(json)
    }
  }

  useEffect(() => {
    getBranch()
  }, [params.id])

  return (
    branch &&
    <Box p="xl">
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
            <ThemeIcon size="xl" color="blue" variant="light">
              <IconBuilding size={28} />
            </ThemeIcon>
            <Title order={1} style={{ color: 'var(--theme-text-primary)' }}>
              {branch.name}
            </Title>
          </Group>
          <Group align="start" justify="space-between">
            <Stack gap="md">
              <Group gap="md" mb={20}>
                <Badge
                  size="lg"
                  variant="light"
                  color="blue"
                  leftSection={<IconBuilding size={16} />}
                >
                  {branch.type}
                </Badge>
                <Badge
                  size="lg"
                  variant="light"
                  color="green"
                  leftSection={<IconMapPin size={16} />}
                >
                  {branch.city}
                </Badge>
                <Badge
                  size="lg"
                  variant="light"
                  color="orange"
                >
                  РРС: {branch.rrs}
                </Badge>
              </Group>
              <Group>
                <ThemeIcon size="lg" color="orange" variant="light">
                  <IconHomeLink size={20} />
                </ThemeIcon>
                <Text size="md" style={{ color: 'var(--theme-text-secondary)' }}>
                  {branch.address}
                </Text>
              </Group>
              
              {branch.tradingArea !== 0 && (
                <Box>
                  <Text size="lg" fw={600} mb="xs" style={{ color: 'var(--theme-text-primary)' }}>
                    Площадь магазина
                  </Text>
                  <Group gap="xs" align="center">
                    <IconRuler size={20} style={{ color: 'var(--color-primary-500)' }} />
                    <Text size="md" style={{ color: 'var(--theme-text-secondary)' }}>
                      {branch.tradingArea} м²
                    </Text>
                  </Group>
                </Box>
              )}
              {branch.userData.some(user => user.position.name.includes('Управляющий')) && (
                <Stack gap="md">
                  {branch.userData.map(user => {
                    return user.position.name.includes('Управляющий') && (
                      <Group gap="md">
                        <ThemeIcon size="lg" color="green" variant="light">
                          <IconUsers size={20} />
                        </ThemeIcon>
                        <Box>
                          <Text size="lg" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
                            {user.fio}
                          </Text>
                          <Text size="md" style={{ color: 'var(--theme-text-secondary)' }}>
                            {user.position.name}
                          </Text>
                        </Box>
                      </Group>
                    )
                  })}
                </Stack>
              )}
            </Stack>
            <Card
              radius="md"
              p={0}
              style={{
                background: 'var(--theme-bg-elevated)',
                border: '1px solid var(--theme-border-primary)',
                height: '400px',
                width: '600px',
                overflow: 'hidden'
              }}
            >
              <Map 
                center={[branch.latitude, branch.longitude]} 
                zoom={13}
              >
                <ZoomControl/>
                <Marker width={50} anchor={[branch.latitude, branch.longitude]} />
              </Map>
            </Card>           
          </Group>
        </Paper>
        {/* Галерея */}
        {branch.images.length > 0 && (
          <Paper
            radius="lg"
            p={20}
            style={{
              background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, rgba(255, 255, 255, 0.05) 100%)',
              border: '1px solid var(--theme-border-primary)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
            }}
          >
            <Group mb={20} align="center">
              <Title order={2} style={{ color: 'var(--theme-text-primary)' }}>
                Галерея
              </Title>
              <Badge size="lg" variant="light">{branch.images.length}</Badge>
            </Group>
            
            <Carousel 
              slideSize="50%" 
              height={500} 
              slideGap="md" 
              styles={{
                control: {
                  background: 'var(--theme-bg-elevated)',
                  border: '1px solid var(--theme-border-primary)',
                  color: 'var(--theme-text-primary)'
                },
                indicator: {
                  background: 'var(--color-primary-500)'
                }
              }}
            >
              {branch.images.map((img: any) => {
                return (
                  <Carousel.Slide key={img.id}>
                    <Card
                      radius="md"
                      style={{
                        height: '500px',
                        overflow: 'hidden',
                        background: 'var(--theme-bg-primary)',
                        border: '1px solid var(--theme-border-primary)'
                      }}
                    >
                      <Image 
                        src={img.link} 
                        radius="md" 
                        h={500} 
                        width="100%" 
                        fit="cover"
                        style={{ objectFit: 'cover' }}
                      />
                    </Card>
                  </Carousel.Slide>
                )
              })}
            </Carousel>
          </Paper>
        )}
      </Stack>
    </Box>
  )
}

export default Branch