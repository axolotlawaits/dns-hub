import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAccessContext } from "../hooks/useAccessContext"

const ProtectedRoute = () => {
  const { access } = useAccessContext()
  const location = useLocation()
  
  const path = location.pathname.replace(/^\//, '')
  const hasAccess = access.some((tool) => tool.link === path)

  return !hasAccess ? <Navigate to="/no-access" replace /> : <Outlet />
}

export default ProtectedRoute