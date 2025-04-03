import { Link } from "react-router"

const options = [
  {name: 'Финансы', link: 'finance'},
  {name: 'АХО', link: 'aho'},
  {name: 'Юристы', link: 'jurists'},
  {name: 'Бухгалтерия', link: 'accounting'},
  {name: 'Взаиморасчеты', link: 'settlements'},
  {name: 'Задачники', link: 'problem-books'},
  {name: 'Реклама', link: 'add'},
  {name: 'Снабжение', link: 'supply'},
  {name: 'Трансформация', link: 'transformation'},
  {name: 'Автоматизация', link: 'automation'},
  {name: 'Сервис', link: 'service'}
]

function Navigation() {
  return (
    <div id="navigation">
      <div id="nav-options">
        {options.map((option, index) => {
          return (
            <Link to={`/${option.link}`} key={index} className="nav-option">{option.name}</Link>
          )
        })}
      </div>
    </div>
  )
}

export default Navigation