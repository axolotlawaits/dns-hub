import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAccessContext } from "../hooks/useAccessContext"
import { LoadingOverlay } from "@mantine/core"
import { useUserContext } from "../hooks/useUserContext"
import { useState, useEffect } from "react"
import { API } from "../config/constants"

const ProtectedRoute = () => {
  const { user } = useUserContext()
  const { access, loading } = useAccessContext()
  const location = useLocation()
  const [protectedToolLinks, setProtectedToolLinks] = useState<string[]>([])
  const [loadingProtected, setLoadingProtected] = useState(true)

  // Загружаем список защищенных инструментов
  useEffect(() => {
    const loadProtectedTools = async () => {
      try {
        const response = await fetch(`${API}/access/protected-tools`);
        if (response.ok) {
          const links = await response.json();
          setProtectedToolLinks(links);
        }
      } catch (error) {
        console.error('Error loading protected tools:', error);
      } finally {
        setLoadingProtected(false);
      }
    };
    loadProtectedTools();
  }, []);

  if (loading || loadingProtected) return <LoadingOverlay visible/>
 
  const path = location.pathname.replace(/^\//, '')
  const parts = path.split('/')
  const toolDir = parts.slice(0, 2).join('/')

  // Проверяем, является ли инструмент защищенным
  const isProtected = protectedToolLinks.includes(toolDir) || 
                      protectedToolLinks.includes(path) ||
                      protectedToolLinks.some(link => toolDir.startsWith(link + '/')) ||
                      protectedToolLinks.some(link => path.startsWith(link + '/'))

  // Проверяем доступ к инструменту
  const hasAccess = access.some((tool) => tool.link === toolDir || tool.link === path)
  const admin = user ? ['ADMIN', 'DEVELOPER'].includes(user.role) : false

  // Если пользователь админ/разработчик - разрешаем доступ
  if (admin) {
    return <Outlet />
  }

  // Если инструмент не защищен - разрешаем доступ всем
  if (!isProtected) {
    return <Outlet />
  }

  // Если инструмент защищен - требуем доступ
  if (hasAccess) {
    return <Outlet />
  }

  // Если инструмент защищен и нет доступа - перенаправляем
  return <Navigate to="/no-access" replace />
}

export default ProtectedRoute