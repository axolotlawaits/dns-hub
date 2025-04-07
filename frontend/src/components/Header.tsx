import Search from "./Search"
import { Link } from "react-router";
import logoImg from '../assets/images/logo.png'
import { ActionIcon, Avatar } from "@mantine/core";
import { IconLogin } from "@tabler/icons-react";
import { useNavigate } from "react-router";
import { useUserContext } from "../hooks/useUserContext";

function Header() {
  const navigate = useNavigate()
  const { user, logout } = useUserContext()

  const onLogout = () => {
    localStorage.removeItem('user')
    logout()
    navigate('/login')
  }
  
  return (
    <div id="header">
      <Link to={'/'} id="header-logo-group">
        <img src={logoImg} id="header-logo"></img>
      </Link>
      <div id="header-right">
        <Search />
        {user ? 
          <Avatar name={user.name} onClick={onLogout} color="initials" />
        :
          <ActionIcon size="input-sm" variant="default" aria-label="ActionIcon with size as a number">
            <IconLogin size={24} onClick={() => navigate('/login')} />
          </ActionIcon>
        }
      </div>
    </div>
  )
}

export default Header