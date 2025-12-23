import { useUserContext } from "./useUserContext"
import { useNavigate } from "react-router"

const useAuthFetch = () => {
  const { token, logout, refreshAccessToken } = useUserContext()
  const navigate = useNavigate()

  const authFetch = async (url: string, options: RequestInit = {}) => {
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
      try {
        const newToken = await refreshAccessToken()
        
        if (newToken) {
          headers.set('Authorization', `Bearer ${newToken}`)
          options.headers = headers
          
          // Повторяем запрос с новым токеном
          response = await fetch(url, options)
        } else {
          // Если токен не обновился, делаем logout
          logout()
          navigate('/login')
          return null
        }
      } catch (error) {
        // Если refresh не удался, делаем logout
        console.error('Failed to refresh token:', error)
        logout()
        navigate('/login')
        return null
      }
    }

    return response
  }

  return authFetch
}

export default useAuthFetch