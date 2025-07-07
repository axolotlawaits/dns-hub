import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAccessContext } from "../hooks/useAccessContext"
import { LoadingOverlay } from "@mantine/core"

const ProtectedRoute = () => {
  const { access, loading } = useAccessContext()
  const location = useLocation()

  if (loading) return <LoadingOverlay visible/>
 
  const path = location.pathname.replace(/^\//, '')
  const parts = path.split('/')
  const toolDir = parts.slice(0, 2).join('/')

  const hasAccess = access.some((tool) => tool.link === toolDir)

  return hasAccess ? <Outlet /> : <Navigate to="/no-access" replace /> 
}

export default ProtectedRoute