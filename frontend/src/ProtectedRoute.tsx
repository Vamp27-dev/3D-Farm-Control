import { Navigate } from "react-router-dom"
import type { ReactElement } from "react"

function ProtectedRoute({ children }: { children: ReactElement }) {
  const token = localStorage.getItem("token")
  if (!token) return <Navigate to="/login" replace />
  return children
}

export default ProtectedRoute