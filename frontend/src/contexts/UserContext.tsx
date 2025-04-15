import { createContext, useState } from "react";

export type User = {
  id: string
  name: string
  branch: string
  position: string
}

type Props = {
  children?: React.ReactNode
}

type UserContextTypes = {
  user: User | null
  login: (data: User) => void
  logout: () => void
}

export const UserContext = createContext<UserContextTypes | undefined>(undefined)
 
export const UserContextProvider = ({ children }: Props) => {
  const [user, setUser] = useState<User | null>(() => {
    const value = localStorage.getItem('user')
    if (value != null) return JSON.parse(value)
  })

  const login = (data: User) => {
    setUser(data)
  }

  const logout = () => {
    setUser(null)
  }

  return (
    <UserContext.Provider value={{user, login, logout}}>
      {children}
    </UserContext.Provider>
  )
}