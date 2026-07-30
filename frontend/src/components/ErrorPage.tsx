import { Link } from 'react-router-dom'
import { ShieldAlert, LogIn, Home, ArrowLeft } from 'lucide-react'

interface ErrorPageProps {
  statusCode: number
  title: string
  message: string
  redirectTo?: string
  redirectLabel?: string
}

/** Clean HTTP Status Code Error Page component (401, 403, 404, 500). */
export function ErrorPage({
  statusCode,
  title,
  message,
  redirectTo,
  redirectLabel,
}: ErrorPageProps): JSX.Element {
  const isAuthError = statusCode === 401
  const defaultPath = isAuthError ? '/login' : '/dashboard'
  const defaultLabel = isAuthError ? 'Return to Login' : 'Back to Dashboard'

  const targetPath = redirectTo || defaultPath
  const targetLabel = redirectLabel || defaultLabel

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '80vh',
        padding: '2rem',
        textAlign: 'center',
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.375rem 0.875rem',
          borderRadius: '9999px',
          backgroundColor: statusCode === 401 || statusCode === 403 ? 'hsl(0, 80%, 96%)' : 'var(--secondary)',
          color: statusCode === 401 || statusCode === 403 ? 'hsl(0, 75%, 45%)' : 'var(--muted-foreground)',
          fontSize: '0.8125rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          marginBottom: '1.5rem',
        }}
      >
        <ShieldAlert style={{ width: '16px', height: '16px' }} />
        HTTP STATUS {statusCode}
      </div>

      <h1
        style={{
          fontSize: '2.25rem',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          margin: '0 0 0.75rem',
          color: 'var(--foreground)',
        }}
      >
        {title}
      </h1>

      <p
        style={{
          fontSize: '1rem',
          color: 'var(--muted-foreground)',
          maxWidth: '480px',
          lineHeight: 1.6,
          margin: '0 0 2rem',
        }}
      >
        {message}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link
          to={targetPath}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.625rem 1.25rem',
            borderRadius: '0.5rem',
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-foreground)',
            fontSize: '0.875rem',
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'opacity 150ms',
          }}
        >
          {isAuthError ? <LogIn style={{ width: '16px', height: '16px' }} /> : <ArrowLeft style={{ width: '16px', height: '16px' }} />}
          {targetLabel}
        </Link>

        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.625rem 1.25rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--border)',
            backgroundColor: 'transparent',
            color: 'var(--foreground)',
            fontSize: '0.875rem',
            fontWeight: 500,
            textDecoration: 'none',
            transition: 'background-color 150ms',
          }}
        >
          <Home style={{ width: '16px', height: '16px' }} />
          Home Page
        </Link>
      </div>
    </div>
  )
}
