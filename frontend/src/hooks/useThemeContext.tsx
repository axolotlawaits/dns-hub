import { ThemeContext } from "../contexts/ThemeContext";
import { useContext } from "react";

export function useThemeContext() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw Error('must be used inside ThemeContextProvider')
  }
  return context
}