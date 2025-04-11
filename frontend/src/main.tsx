import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App.tsx'
import { MantineProvider } from '@mantine/core'
import { UserContextProvider } from './contexts/UserContext.jsx'
import { DatesProvider } from '@mantine/dates'
import dayjs from 'dayjs';

dayjs.locale('ru')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UserContextProvider>
      <MantineProvider>
        <DatesProvider settings={{ locale: 'ru' }}>
          <App />
        </DatesProvider>
      </MantineProvider>
    </UserContextProvider>
  </StrictMode>,
)
