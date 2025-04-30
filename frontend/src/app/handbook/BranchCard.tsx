import { Link } from "react-router"
import { Map, Marker } from "pigeon-maps"
import { Button, Modal, Image } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { Carousel } from '@mantine/carousel'
import { BranchType } from "./Branch"

function BranchCard({branch}: {branch: BranchType}) {
  const [opened, { open, close }] = useDisclosure(false)
  
  return (
    <>
      <Modal opened={opened} onClose={close} title={branch.name} size="xl" centered >
        <Carousel slideSize="70%" height={500} slideGap="md">
          {branch.images.map((img: any) => {
            return (
              <Carousel.Slide key={img.id}>
                <Image src={img.link} radius={'sm'} h={500} width='auto' fit="contain"/>
              </Carousel.Slide>
            )
          })}
        </Carousel>
      </Modal>
      <div className="branch-card">
        <Link to={`/branch/${branch.uuid}`}>
          <h1 className="branch-title">{branch.name}</h1>
        </Link>
        <div className="branch-card-main">
          <div className="branch-card-left">
            <span className="branch-card-text">Тип: {branch.type}</span>
            {branch.tradingArea !== 0 &&
            <span className="branch-card-text">Площадь магазина: {branch.tradingArea}</span>
            }
            <span className="branch-card-text">Город: {branch.city}</span>
            <span className="branch-card-text">РРС: {branch.rrs}</span>
            <span className="branch-card-text">Адрес: {branch.address}</span>
          </div>
        </div>
        <Button onClick={open} variant="light">галерея</Button>
        <Map height={300} center={[branch.latitude, branch.longitude]} zoom={14} mouseEvents={false} >
          <Marker width={50} anchor={[branch.latitude, branch.longitude]} />
        </Map>
      </div>
    </>
  )
}

export default BranchCard