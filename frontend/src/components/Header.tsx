import Search from "./Search"
import { Link } from "react-router";
import logoImg from '../assets/images/logo.png'

function Header() {
  
  return (
    <div id="header">
      <Link to={'/'} id="header-logo-group">
        <img src={logoImg} id="header-logo"></img>
      </Link>
      <Search></Search>
    </div>
  )
}

export default Header