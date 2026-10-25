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

/** Approved Professor route guard. Only approved professors and administrators get in; everyone else sees why. */
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

  if (user?.role === 'admin' || (user?.role === 'professor' && user?.verificationStatus === 'approved')) {
    return <>{children}</>
  }

  const applied = user?.requestedRole === 'professor' || user?.role === 'professor'
  if (applied && user?.verificationStatus === 'pending') {
    return (
      <ErrorPage
        statusCode={403}
        title="403 Forbidden: Verification Pending"
        message="Your professor application is under review by an Administrator. Professor features unlock once it is approved."
        redirectTo="/dashboard"
        redirectLabel="Return to Dashboard"
      />
    )
  }

  return (
    <ErrorPage
      statusCode={403}
      title="403 Forbidden: Professor Access Required"
      message={
        applied && user?.verificationStatus === 'rejected'
          ? 'Your professor application was not approved. You can apply again from Settings.'
          : 'This page is for approved professors. You can apply for faculty access from Settings.'
      }
      redirectTo="/settings"
      redirectLabel="Open Settings"
    />
  )
}
