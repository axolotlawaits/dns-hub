import { API } from "../config/constants"
import { useUserContext } from "./useUserContext"
import { useNavigate } from "react-router"

const useAuthFetch = () => {
  const { token, logout } = useUserContext()
  const navigate = useNavigate()

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers)
    headers.set('Content-Type', 'application/json')
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    options.headers = headers

    let response = await fetch(url, options)

    if (response.status === 401) {
      const refreshResponse = await fetch(`${API}/refresh-token`, {
        method: 'POST',
        credentials: 'include'
      })

      if (refreshResponse.ok) {
        const newToken = await refreshResponse.json()
        localStorage.setItem('token', newToken)

        headers.set('Authorization', `Bearer ${newToken}`)
        options.headers = headers

        response = await fetch(url, options)
      } else if (refreshResponse.status === 403) {
        localStorage.removeItem('user')
        localStorage.removeItem('token')
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