import { Burger, Button } from "@mantine/core"
import Search from "./Search"
import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";

function Header() {
  
  return (
    <div id="header">
      <div id="header-logo-group">
        <Link to={'/'}>DNS Hub</Link>
      </div>
      <Search></Search>
    </div>
  )
}

export default Header