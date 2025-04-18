import { useParams, useSearchParams } from "react-router"
import { API } from "../config/constants"
import { useEffect, useState } from "react"
import { Map, Marker } from "pigeon-maps"
import { Button, Modal, Image } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { Carousel } from '@mantine/carousel'

export type BranchType = {
  uuid: string
  name: string
  rrs: string
  city: string
  address: string
  latitude: number
  longitude: number
}

function Branch() {
  const params = useParams()
  const [searchParams] = useSearchParams()
  const [branch, setBranch] = useState<BranchType[]>([])
  const query = searchParams.get('text')
  const id = params.id

  const getBranches = async () => {
    const response = await fetch(`${API}/search/branch?text=${query}`)
    const json = await response.json()
    if (response.ok) {
      setBranch(json)
    }
  }

  const getBranch = async () => {
    const response = await fetch(`${API}/search/branch/${id}`)
    const json = await response.json()
    if (response.ok) {
      setBranch(json)
    }
  }

  useEffect(() => {
    if (query) getBranches()
    if (id) getBranch()
  }, [params.id, searchParams])

  return (
    <div className="branch-card-wrapper">
      {branch.length > 0 && branch.map(branch => {
        return (
          <BranchCard key={branch.uuid} branch={branch} />
        )
      })}
    </div>
  )
}

function BranchCard({branch}) {
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
        <div>
          <h1 className="branch-title">{branch.name}</h1>
        </div>
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
        <Map height={300} defaultCenter={[branch.latitude, branch.longitude]} defaultZoom={13}>
          <Marker width={50} anchor={[branch.latitude, branch.longitude]} />
        </Map>
      </div>
    </>
  )
}

export default Branch