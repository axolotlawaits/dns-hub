import { IconMeterCube} from "@tabler/icons-react"
import Tools from "../../components/Tools"

const tools = [
  {name: 'Показания счётчиков', description: 'Учёт показаний', link: '/aho/meter-reading', svg: <IconMeterCube color={'#ADB2D4'} size={100} />}
]

function Aho() {
  return (
    <div>
      <h1>АХО</h1>
      <Tools tools={tools} />
    </div>
  )
}

export default Aho