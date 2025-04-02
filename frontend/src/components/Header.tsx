import { Burger, Button } from "@mantine/core"
import Search from "./Search"
import { useDisclosure } from "@mantine/hooks";

function Header() {
  const [opened, { toggle }] = useDisclosure(true)
  
  return (
    <div id="header">
      <div id="header-logo-group">
        <Button onClick={toggle}>nav</Button>
        <span>DNS Hub</span>
      </div>
      <Search></Search>
    </div>
  )
}

export default Header