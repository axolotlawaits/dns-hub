import Search from "./Search"
import { Link } from "react-router";
import logoLight from '../assets/images/logo-light.png'
import logoDark from '../assets/images/logo-dark.png'
import { ActionIcon, AppShell, Avatar, Burger, Group } from "@mantine/core";
import { IconBrightnessDown, IconLogin, IconMoon } from "@tabler/icons-react";
import { useNavigate } from "react-router";
import { useUserContext } from "../hooks/useUserContext";
import { useThemeContext } from "../hooks/useThemeContext";

type HeaderProps = {
  desktopOpened: boolean
  mobileOpened: boolean
  toggleDesktop: () => void
  toggleMobile: () => void
}

function Header({desktopOpened, toggleDesktop, mobileOpened, toggleMobile}: HeaderProps) {
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
        <Group h="100%" px="md">
          <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="md" />
          <Burger opened={desktopOpened} onClick={toggleDesktop} visibleFrom="sm" size="md" />
        </Group>
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
          <ActionIcon size="input-sm" variant="default" aria-label="ActionIcon with size as a number" radius={"xl"}>
            <Avatar name={user.name} onClick={onLogout} color="initials" />
          </ActionIcon>
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