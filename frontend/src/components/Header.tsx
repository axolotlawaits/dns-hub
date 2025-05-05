import Search from "./Search"
import { Link } from "react-router";
import logoLight from '../assets/images/logo-light.png'
import logoDark from '../assets/images/logo-dark.png'
import { ActionIcon, AppShell, Avatar, Menu } from "@mantine/core";
import { IconBrightnessDown, IconLogin, IconLogout, IconMoon } from "@tabler/icons-react";
import { useNavigate } from "react-router";
import { useUserContext } from "../hooks/useUserContext";
import { useThemeContext } from "../hooks/useThemeContext";

function Header() {
  const navigate = useNavigate()
  const { user, logout } = useUserContext()
  const { isDark, toggleTheme } = useThemeContext()

  const onLogout = () => {
    localStorage.removeItem('user')
    logout()
    navigate('/login')
  }
  
  return (
    <AppShell.Header id='header'>
      <div id="header-left">
        <Link to={'/'} id="header-logo-group">
          {isDark ? (
            <img src={logoDark} id="header-logo" alt="Dark Logo" />
          ) : (
            <img src={logoLight} id="header-logo" alt="Light Logo" />
          )}
        </Link>
      </div>
      <div id="header-right">
        <Search />
        {isDark ? 
          <ActionIcon onClick={toggleTheme} size={36} variant="default" aria-label="ActionIcon with size as a number">
            <IconMoon size={22} />
          </ActionIcon>
        :
          <ActionIcon onClick={toggleTheme} size={36} variant="default" aria-label="ActionIcon with size as a number">
            <IconBrightnessDown size={22} />
          </ActionIcon>
        }
        {user ? 
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <ActionIcon size="input-sm" variant="default" aria-label="ActionIcon with size as a number" radius={"xl"}>
                <Avatar name={user.name} color="indigo" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={onLogout} color="red" leftSection={<IconLogout size={14} />}>выйти</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        :
          <ActionIcon size="input-sm" variant="default" aria-label="ActionIcon with size as a number">
            <IconLogin size={24} onClick={() => navigate('/login')} />
          </ActionIcon>
        }
      </div>
    </AppShell.Header>
  )
}

export default Header