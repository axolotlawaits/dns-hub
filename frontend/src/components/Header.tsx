import Search from "./Search";
import { Link } from "react-router";
import logoLight from '../assets/images/logo-light.png';
import logoDark from '../assets/images/logo-dark.png';
import { ActionIcon, AppShell, Avatar, Menu, Divider } from "@mantine/core";
import { IconBrightnessDown, IconLogin, IconLogout, IconMoon, IconUser } from "@tabler/icons-react";
import { useNavigate } from "react-router";
import { useUserContext } from "../hooks/useUserContext";
import { useThemeContext } from "../hooks/useThemeContext";

function Header() {
  const navigate = useNavigate();
  const { user, logout } = useUserContext();
  const { isDark, toggleTheme } = useThemeContext();

  const onLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    logout();
    navigate('/login');
  };

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
          <ActionIcon onClick={toggleTheme} size={36} variant="default" aria-label="Toggle theme">
            <IconMoon size={22} />
          </ActionIcon>
        :
          <ActionIcon onClick={toggleTheme} size={36} variant="default" aria-label="Toggle theme">
            <IconBrightnessDown size={22} />
          </ActionIcon>
        }
        {user ? 
          <Menu shadow="md" width={200}>
            <Menu.Target>
              {user.image ?
                <ActionIcon size="input-sm" variant="default" aria-label="User menu" radius={"xl"}>
                  <Avatar src={`data:image/jpeg;base64,${user.image}`} />
                </ActionIcon>
              :
                <ActionIcon size="input-sm" variant="default" aria-label="User menu" radius={"xl"}>
                  <Avatar name={user.name} color="indigo" />
                </ActionIcon>
              }
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item 
                leftSection={<IconUser size={14} />}
                onClick={() => navigate('/profile')}
              >
                Личный кабинет
              </Menu.Item>
              <Divider />
              <Menu.Item 
                color="red" 
                leftSection={<IconLogout size={14} />}
                onClick={onLogout}
              >
                Выход
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        :
          <ActionIcon 
            size="input-sm" 
            variant="default" 
            aria-label="Login"
            onClick={() => navigate('/login')}
          >
            <IconLogin size={24} />
          </ActionIcon>
        }
      </div>
    </AppShell.Header>
  );
}

export default Header;