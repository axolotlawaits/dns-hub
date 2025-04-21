import { useParams } from "react-router"
import { API } from "../../config/constants"
import { Fragment, useEffect, useState } from "react"
import { Map, Marker } from "pigeon-maps"
import { Carousel } from "@mantine/carousel"
import { Image } from "@mantine/core"

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
  userData: UserDataType[]
}

export type UserDataType = {
  uuid: string
  fio: string
  position: string
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
    <div id="branch-page">
      <div className="branch-main">
        <div className="branch-card-solo">
          <div>
            <h1 className="branch-title-solo">{branch.name}</h1>
          </div>
          <div className="branch-card-main">
            <div className="branch-card-left">
              <div className="branch-card-block">
                <span className="branch-card-text">Тип: {branch.type}</span>
                {branch.tradingArea !== 0 &&
                <span className="branch-card-text">Площадь магазина: {branch.tradingArea}</span>
                }
                <span className="branch-card-text">Город: {branch.city}</span>
                <span className="branch-card-text">РРС: {branch.rrs}</span>
                <span className="branch-card-text">Адрес: {branch.address}</span>
              </div>
              <div className="branch-card-block">
                {branch.userData.map(user => {
                  return user.position.includes('Управляющий') &&
                    <Fragment key={user.uuid}>
                      <span className="branch-card-text">{user.position}</span>
                      <span className="branch-card-text">{user.fio}</span>
                    </Fragment>
                  
                })}
              </div>
            </div>
          </div>
        </div>
        <Map height={300} width={500} center={[branch.latitude, branch.longitude]} zoom={13}>
          <Marker width={50} anchor={[branch.latitude, branch.longitude]} />
        </Map>
      </div>
      <div className="branch-img-wrapper">
        <Carousel slideSize="50%" height={500} slideGap="md">
          {branch.images.map((img: any) => {
            return (
              <Carousel.Slide key={img.id}>
                <Image src={img.link} radius={'sm'} h={500} width='auto' fit="contain"/>
              </Carousel.Slide>
            )
          })}
        </Carousel>
      </div>
    </div>
  )
}

export default Branch