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
        primaryColor: 'blue',
        // Используем синеватые цвета из нашей темы
        colors: {
          blue: [
            '#f0f9ff', // 50
            '#e0f2fe', // 100
            '#bae6fd', // 200
            '#7dd3fc', // 300
            '#38bdf8', // 400
            '#0ea5e9', // 500
            '#0284c7', // 600
            '#0369a1', // 700
            '#075985', // 800
            '#0c4a6e', // 900
          ],
        },
        // Переопределяем цвета body и text для использования наших цветов
        // Используем primary для основного фона страницы
        // Используем CSS переменные, которые будут правильно разрешены
        other: {
          bodyBg: 'var(--theme-bg-primary)',
          bodyColor: 'var(--theme-text-primary)',
        },
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
