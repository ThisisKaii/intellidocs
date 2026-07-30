import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'

/**
 * Handles the redirect back from Google OAuth via Supabase.
 * Supabase parses the hash fragment, gets the session, then we sync
 * with the Express backend to get role and verification status.
 */
export default function AuthCallback(): JSX.Element {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function handleCallback(): Promise<void> {
      try {
        // Supabase auto-parses the URL hash and sets the session
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw new Error(sessionError.message)

        const session = data.session
        if (!session) throw new Error('No session returned from OAuth provider.')

        // Sync with Express backend to create/fetch user profile and get role
        const result = await api.auth.googleSync(session.access_token)

        login(
          {
            id: result.user.id,
            email: result.user.email,
            role: result.role,
            verificationStatus: result.verificationStatus,
          },
          session.access_token
        )

        navigate('/dashboard', { replace: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed')
      }
    }

    handleCallback()
  }, [])

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--background)',
          flexDirection: 'column',
          gap: '1rem',
          padding: '1.5rem',
        }}
      >
        <div
          style={{
            backgroundColor: 'rgba(255,91,79,0.08)',
            border: '1px solid rgba(255,91,79,0.25)',
            borderRadius: '0.75rem',
            padding: '1.25rem 1.5rem',
            maxWidth: '400px',
            width: '100%',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--destructive)', margin: '0 0 0.5rem' }}>
            Sign-in Failed
          </p>
          <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0 }}>
            {error}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/login', { replace: true })}
          style={{
            height: '36px',
            padding: '0 1.25rem',
            borderRadius: '0.5rem',
            border: 'none',
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-foreground)',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Back to Login
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--background)',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      {/* Spinner */}
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          border: '3px solid var(--border)',
          borderTopColor: 'var(--primary)',
          animation: 'spin 0.7s linear infinite',
        }}
      />
      <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
        Completing sign-in…
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
