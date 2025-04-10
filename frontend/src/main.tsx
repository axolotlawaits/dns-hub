import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App.tsx'
import { MantineProvider } from '@mantine/core'
import { UserContextProvider } from './contexts/UserContext.jsx'
import { ThemeContextProvider } from './contexts/ThemeContext.jsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UserContextProvider>
      <ThemeContextProvider>
        <MantineProvider>
          <App />
        </MantineProvider>
      </ThemeContextProvider>
    </UserContextProvider>
  </StrictMode>,
)
