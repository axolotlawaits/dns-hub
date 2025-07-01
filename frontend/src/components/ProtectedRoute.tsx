import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAccessContext } from "../hooks/useAccessContext"

const ProtectedRoute = () => {
  const { access } = useAccessContext()
  const location = useLocation()
  
  const path = location.pathname.replace(/^\//, '')
  const parts = path.split('/')
  const toolDir = parts.slice(0, 2).join('/')

  const hasAccess = access.some((tool) => tool.link === toolDir)

  return !hasAccess ? <Navigate to="/no-access" replace /> : <Outlet />
}

export default ProtectedRoute