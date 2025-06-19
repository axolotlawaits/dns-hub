import { createContext, useEffect, useState } from "react";
import { useUserContext } from "../hooks/useUserContext";
import { API } from "../config/constants";
import { AccessLevel } from "../app/profile/Management";

type Props = {
  children?: React.ReactNode
}

type ToolAccessType = {
  toolId: string
  accessLevel: AccessLevel
}

type AccessContextTypes = {
  access: ToolAccessType[]
}

export const AccessContext = createContext<AccessContextTypes | undefined>(undefined)
 
export const AccessContextProvider = ({ children }: Props) => {
  const { user } = useUserContext()
  const [access, setAccess] = useState<ToolAccessType[]>([])

  useEffect(() => {
    const getAccessedTools = async () => {
      const response = await fetch(`${API}/access/${user?.id}?email=${user?.email}`)
      const json = await response.json()
      if (response.ok) {
        setAccess(json)
      }
    }
    getAccessedTools()
  }, [user?.email])

  return (
    <AccessContext.Provider value={{access}}>
      {children}
    </AccessContext.Provider>
  )
}