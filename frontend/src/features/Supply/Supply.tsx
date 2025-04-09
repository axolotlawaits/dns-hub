import { IconTruckDelivery } from "@tabler/icons-react"
import Tools from "../../components/Tools"

const tools = [
  {name: 'DNS-LOAD', description: 'учет грузчиков', link: 'https://dns-zs.partner.ru/load', svg: <IconTruckDelivery color={'#ADB2D4'} size={100} />}
]

function Supply() {
  return (
    <div>
      <h1>Cнабжение</h1>
      <Tools tools={tools} />
    </div>
  )
}

export default Supply