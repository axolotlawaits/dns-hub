import { Link, useSearchParams } from "react-router"
import { API } from "../../config/constants"
import { useEffect, useState } from "react"
import { Map, Marker } from "pigeon-maps"
import { Button, Modal, Image } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { Carousel } from '@mantine/carousel'
import { BranchType } from "./Branch"

function BranchSearch() {
  const [searchParams] = useSearchParams()
  const [branches, setBranches] = useState<BranchType[]>([])
  const query = searchParams.get('text')

  const getBranches = async () => {
    const response = await fetch(`${API}/search/branch?text=${query}`)
    const json = await response.json()
    if (response.ok) {
      setBranches(json)
    }
  }

  useEffect(() => {
    getBranches()
  }, [searchParams])

  return (
    <div className="branch-cards-wrapper">
      {branches.length > 0 && branches.map(branch => {
        return (
          <BranchCard key={branch.uuid} branch={branch} />
        )
      })}
    </div>
  )
}

function BranchCard({branch}: {branch: BranchType}) {
  const [opened, { open, close }] = useDisclosure(false)
  
  return (
    <>
      <Modal opened={opened} onClose={close} title="Галерея" size="xl" centered >
        <Carousel slideSize="70%" height={500} slideGap="md">
          {branch.images.map((img: any) => {
            return (
              <Carousel.Slide>
                <Image src={img.link} radius={'sm'} h={500} width='auto' fit="contain"/>
              </Carousel.Slide>
            )
          })}
        </Carousel>
      </Modal>
      <div className="branch-card">
        <Link to={`${branch.uuid}`}>
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
        <Map height={300} center={[branch.latitude, branch.longitude]} zoom={13}>
          <Marker width={50} anchor={[branch.latitude, branch.longitude]} />
        </Map>
      </div>
    </>
  )
}

export default BranchSearch