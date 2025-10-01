import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App.tsx'
import { MantineProvider } from '@mantine/core'
import { UserContextProvider } from './contexts/UserContext.jsx'
import { DatesProvider } from '@mantine/dates'
import dayjs from 'dayjs';
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import 'dayjs/locale/ru'
import { useThemeContext } from './hooks/useThemeContext.tsx'
import { AccessContextProvider } from './contexts/AccessContext.tsx'
import { registerLocale } from 'react-datepicker'
import { ru } from 'date-fns/locale/ru'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

registerLocale('ru', ru as any);
dayjs.locale('ru');

const queryClient = new QueryClient()

function Root() {
  const { isDark } = useThemeContext()

  return (
    <MantineProvider 
      theme={{
        primaryColor: isDark ? 'indigo' : 'lighterViolet', 
        colors: {'lighterViolet': ['#faf9ff', '#ebe9ff', '#d7d3ff', '#c3beff', '#aea8ff', '#9a93ff', '#857dff', '#6f68ff', '#5a52ff', '#4540ff']}
      }} 
      forceColorScheme={isDark ? 'dark' : 'light'}
    >
      <DatesProvider settings={{ locale: 'ru' }}>
        <App />
      </DatesProvider>
    </MantineProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <UserContextProvider>
        <AccessContextProvider>
          <ThemeProvider>
            <Root />
          </ThemeProvider>
        </AccessContextProvider>
      </UserContextProvider>
    </QueryClientProvider>
  </StrictMode>,
)
