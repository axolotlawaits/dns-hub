import { useUserContext } from "./useUserContext"
import { useNavigate } from "react-router"

// Глобальный флаг для предотвращения множественных попыток logout
let isLoggingOut = false;
// Глобальный флаг для отслеживания, что refresh token истек
let refreshTokenExpired = false;

const useAuthFetch = () => {
  const { token, logout, refreshAccessToken, user } = useUserContext()
  const navigate = useNavigate()

  const authFetch = async (url: string, options: RequestInit = {}) => {
    // Если уже идет процесс logout или refresh token истек, не делаем новые запросы
    if (isLoggingOut || refreshTokenExpired) {
      return null;
    }

    const headers = new Headers(options.headers)
    // Не устанавливаем Content-Type для FormData - браузер сделает это автоматически с правильным boundary
    if (!(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json')
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    options.headers = headers

    let response = await fetch(url, options)

    if (response.status === 401) {
      // Пытаемся обновить токен через контекст
      const newToken = await refreshAccessToken()
      
      if (newToken) {
        headers.set('Authorization', `Bearer ${newToken}`)
        options.headers = headers
        
        // Повторяем запрос с новым токеном
        response = await fetch(url, options)
      } else {
        // Если токен не обновился (refresh token истек или невалиден)
        // Помечаем, что refresh token истек, чтобы не пытаться обновлять снова
        refreshTokenExpired = true;
        
        // Проверяем, не был ли уже выполнен logout (чтобы не делать его многократно)
        if (user && !isLoggingOut) {
          isLoggingOut = true;
          console.warn('[useAuthFetch] Token refresh failed, logging out user')
          logout()
          navigate('/login')
        }
        return null
      }
    }

    return response
  }

  return authFetch
}

export default useAuthFetch