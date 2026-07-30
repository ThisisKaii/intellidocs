import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { ErrorPage } from './ErrorPage'

interface ProtectedRouteProps {
  children: ReactNode
}

/** Basic authentication guard. Redirects to /login if unauthenticated. */
export function ProtectedRoute({ children }: ProtectedRouteProps): JSX.Element {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', color: 'var(--muted-foreground)' }}>
        Loading session...
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

/** Admin-only route guard. Renders 403 ErrorPage if user is not an administrator. */
export function AdminRoute({ children }: ProtectedRouteProps): JSX.Element {
  const { user, isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', color: 'var(--muted-foreground)' }}>
        Loading session...
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user?.role !== 'admin') {
    return (
      <ErrorPage
        statusCode={403}
        title="403 Forbidden: Administrator Access Required"
        message="This page is restricted to system administrators. You do not have permission to view administrative controls."
        redirectTo="/dashboard"
        redirectLabel="Return to Dashboard"
      />
    )
  }

  return <>{children}</>
}

/** Approved Professor route guard. Renders 403 ErrorPage if professor verification is pending or rejected. */
export function ApprovedProfessorRoute({ children }: ProtectedRouteProps): JSX.Element {
  const { user, isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', color: 'var(--muted-foreground)' }}>
        Loading session...
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user?.role === 'professor' && user?.verificationStatus === 'pending') {
    return (
      <ErrorPage
        statusCode={403}
        title="403 Forbidden: Verification Pending"
        message="Your professor registration request is currently under review by an Administrator. Professor features will unlock upon approval."
        redirectTo="/dashboard"
        redirectLabel="Return to Dashboard"
      />
    )
  }

  return <>{children}</>
}