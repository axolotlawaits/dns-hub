import { useMantineColorScheme } from "@mantine/core";
import { useState, useEffect, createContext } from "react";

type ThemeContextTypes = {
  isDark: Boolean | null
  toggleTheme: () => void
}

type Props = {
  children?: React.ReactNode
}

export const ThemeContext = createContext<ThemeContextTypes | undefined>(undefined)

const isBrowserDefaultDark = () => {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const defaultTheme = () => {
  const themeValue = localStorage.getItem('isDark')
  let localStorageTheme
  if (themeValue != null) {
    localStorageTheme = JSON.parse(themeValue)
  }
  if (typeof localStorageTheme === 'boolean') {
    return localStorageTheme
  }
  return isBrowserDefaultDark()
};

export const ThemeContextProvider = ({ children }: Props) => {
  const [isDark, setIsDark] = useState(defaultTheme())
  const { setColorScheme } = useMantineColorScheme()

  const toggleTheme = () => {
    setIsDark(!isDark)
    localStorage.setItem('isDark', JSON.stringify(!isDark));
  }

  useEffect(() => {
    if (isDark) {
      document.body.classList.add('dark');
      setColorScheme('dark')
    } else {
      document.body.classList.remove('dark');
      setColorScheme('light')
    }
  }, [isDark]); 

 

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}