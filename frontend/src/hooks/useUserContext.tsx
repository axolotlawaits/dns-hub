import { UserContext } from "../contexts/UserContext";
import { useContext } from "react";

export function useUserContext() {
  const context = useContext(UserContext)
  if (!context) {
    throw Error('must be used inside UserContextProvider')
  }
  return context
}