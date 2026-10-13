import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { tokenStorage } from '../utils/storage'

export const ProtectedRoute = () => {
  const location = useLocation()
  const token = tokenStorage.getAccessToken()

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
