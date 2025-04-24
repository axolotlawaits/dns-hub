import { AppShell } from "@mantine/core"
import { 
  IconAbacus, IconAddressBook, IconAutomation, IconBadgeAd, IconBasketPlus, IconFileExcel, 
  IconGavel, IconHammer, IconReportMoney, IconShieldCheck, IconTransform 
} from "@tabler/icons-react"
import { Link } from "react-router"

const options = [
  {name: 'Финансы', link: 'finance', icon: <IconReportMoney size={24}/>},
  {name: 'АХО', link: 'aho', icon: <IconShieldCheck size={24}/>},
  {name: 'Юристы', link: 'jurists', icon: <IconGavel size={24}/>},
  {name: 'Бухгалтерия', link: 'accounting', icon: <IconAbacus size={24}/>},
  {name: 'Взаиморасчеты', link: 'settlements', icon: <IconFileExcel size={24}/>},
  {name: 'Задачники', link: 'problem-books', icon: <IconAddressBook size={24}/>},
  {name: 'Реклама', link: 'add', icon: <IconBadgeAd size={24}/>},
  {name: 'Снабжение', link: 'supply', icon: <IconBasketPlus size={24}/>},
  {name: 'Трансформация', link: 'transformation', icon: <IconTransform size={24}/>},
  {name: 'Автоматизация', link: 'automation', icon: <IconAutomation size={24}/>},
  {name: 'Сервис', link: 'service', icon: <IconHammer size={24}/>}
]

function Navigation() {
  return (
    <AppShell.Navbar id="navigation">
      <div id="nav-options">
        {options.map((option, index) => {
          return (
            <Link to={`/${option.link}`} key={index} className="nav-option">
              {option.icon}
              <span>{option.name}</span>
            </Link>
          )
        })}
      </div>
    </AppShell.Navbar>
  )
}

export default Navigation