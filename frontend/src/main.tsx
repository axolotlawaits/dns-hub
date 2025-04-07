import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App.tsx'
import { MantineProvider } from '@mantine/core'
import { UserContextProvider } from './contexts/UserContext.jsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UserContextProvider>
      <MantineProvider>
        <App />
      </MantineProvider>
    </UserContextProvider>
  </StrictMode>,
)
