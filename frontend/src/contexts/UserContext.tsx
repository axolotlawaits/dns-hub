import { createContext, useState } from "react";
import { API } from "../config/constants";

export type User = {
  id: string
  name: string
  branch: string
  position: string
  email: string
  image: string
  role: UserRole
}

type UserRole = 'DEVELOPER' | 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE'

type Props = {
  children?: React.ReactNode
}

type UserContextTypes = {
  user: User | null
  token: string | null
  login: (user: User, token: string) => void
  logout: () => void
  refreshAccessToken: () => void
}

export const UserContext = createContext<UserContextTypes | undefined>(undefined)
 
export const UserContextProvider = ({ children }: Props) => {
  const [user, setUser] = useState<User | null>(() => {
    const value = localStorage.getItem('user')
    if (value != null) return JSON.parse(value)
  })
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))

  const login = (user: User, token: string) => {
    setUser(user)
    setToken(token)
  }

  const logout = () => {
    setUser(null)
    setToken(null)
  }

  const refreshAccessToken = async () => {
    const response = await fetch(`${API}/refresh-token`, {
      method: 'POST',
      credentials: 'include'
    });

    if (response.ok) {
      const json = await response.json();
      console.log(json)
      setToken(json)
      localStorage.setItem('token', JSON.stringify(json))
    }
  }

  return (
    <UserContext.Provider value={{user, token, login, logout, refreshAccessToken}}>
      {children}
    </UserContext.Provider>
  )
}