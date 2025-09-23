import { Link } from "react-router"
import { Map, Marker } from "pigeon-maps"
import { 
  Button, 
  Modal, 
  Image, 
  Card, 
  Title, 
  Text, 
  Group, 
  Stack, 
  Box, 
  Badge,
  ThemeIcon
} from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { Carousel } from '@mantine/carousel'
import { IconMapPin, IconBuilding, IconRuler, IconPhoto } from "@tabler/icons-react"
import { BranchType } from "./Branch"

function BranchCard({branch}: {branch: BranchType}) {
  const [opened, { open, close }] = useDisclosure(false)
  
  return (
    <>
      <Modal 
        opened={opened} 
        onClose={close} 
        title={
          <Group gap="md" align="center">
            <ThemeIcon size="lg" color="blue" variant="light">
              <IconBuilding size={20} />
            </ThemeIcon>
            <Text size="xl" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
              {branch.name}
            </Text>
          </Group>
        } 
        size="xl" 
        centered
        styles={{
          header: {
            background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-600) 100%)',
            color: 'white',
            borderBottom: 'none'
          },
          content: {
            background: 'var(--theme-bg-primary)',
            border: '1px solid var(--theme-border-primary)',
            boxShadow: 'var(--theme-shadow-xl)'
          }
        }}
      >
        <Carousel 
          slideSize="70%" 
          height={500} 
          slideGap="md"
          withIndicators
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
      </Modal>
      
      <Card
        radius="lg"
        p="lg"
        style={{
          background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, rgba(255, 255, 255, 0.05) 100%)',
          border: '1px solid var(--theme-border-primary)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          transition: 'var(--transition-all)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
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
        <Stack gap="md" style={{ flex: 1 }}>
          {/* Заголовок */}
          <Link to={`/branch/${branch.uuid}`} style={{ textDecoration: 'none' }}>
            <Group gap="md" align="center" mb="md">
              <ThemeIcon size="lg" color="blue" variant="light">
                <IconBuilding size={20} />
              </ThemeIcon>
              <Title 
                order={3} 
                style={{ 
                  color: 'var(--theme-text-primary)',
                  transition: 'var(--transition-all)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--color-primary-500)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--theme-text-primary)';
                }}
              >
                {branch.name}
              </Title>
            </Group>
          </Link>

          {/* Информация */}
          <Stack gap="sm">
            <Group gap="sm">
              <Badge
                size="md"
                variant="light"
                color="blue"
                leftSection={<IconBuilding size={14} />}
              >
                {branch.type}
              </Badge>
              <Badge
                size="md"
                variant="light"
                color="green"
                leftSection={<IconMapPin size={14} />}
              >
                {branch.city}
              </Badge>
            </Group>
            
            <Badge
              size="md"
              variant="light"
              color="orange"
            >
              РРС: {branch.rrs}
            </Badge>
            
            <Box>
              <Text size="sm" fw={600} mb="xs" style={{ color: 'var(--theme-text-primary)' }}>
                Адрес
              </Text>
              <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
                {branch.address}
              </Text>
            </Box>
            
            {branch.tradingArea !== 0 && (
              <Group gap="xs" align="center">
                <IconRuler size={16} style={{ color: 'var(--color-primary-500)' }} />
                <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
                  Площадь: {branch.tradingArea} м²
                </Text>
              </Group>
            )}
          </Stack>

          {/* Кнопка галереи */}
          {branch.images.length > 0 && (
            <Button 
              onClick={open} 
              variant="light" 
              color="blue"
              leftSection={<IconPhoto size={16} />}
              style={{
                background: 'var(--color-primary-50)',
                border: '1px solid var(--color-primary-200)',
                color: 'var(--color-primary-700)',
                transition: 'var(--transition-all)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-primary-100)';
                e.currentTarget.style.borderColor = 'var(--color-primary-300)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--color-primary-50)';
                e.currentTarget.style.borderColor = 'var(--color-primary-200)';
              }}
            >
              Галерея ({branch.images.length})
            </Button>
          )}

          {/* Карта */}
          <Box
            style={{
              flex: 1,
              minHeight: '200px',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              border: '1px solid var(--theme-border-primary)'
            }}
          >
            <Map 
              height={200} 
              center={[branch.latitude, branch.longitude]} 
              zoom={14} 
              mouseEvents={false}
            >
              <Marker width={50} anchor={[branch.latitude, branch.longitude]} />
            </Map>
          </Box>
        </Stack>
      </Card>
    </>
  )
}

export default BranchCard