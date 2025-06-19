import { AccessContext } from "../contexts/AccessContext";
import { useContext } from "react";

export function useAccessContext() {
  const context = useContext(AccessContext)
  if (!context) {
    throw Error('must be used inside AccessContextProvider')
  }
  return context
}