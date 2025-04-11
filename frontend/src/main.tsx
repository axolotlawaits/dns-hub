import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App.tsx'
import { MantineProvider } from '@mantine/core'
import { UserContextProvider } from './contexts/UserContext.jsx'
import { DatesProvider } from '@mantine/dates'
import dayjs from 'dayjs';
import { ThemeContextProvider } from './contexts/ThemeContext.tsx'

dayjs.locale('ru')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UserContextProvider>
      <MantineProvider>
        <ThemeContextProvider>
          <DatesProvider settings={{ locale: 'ru' }}>
            <App />
          </DatesProvider>
        </ThemeContextProvider>
      </MantineProvider>
    </UserContextProvider>
  </StrictMode>,
)
