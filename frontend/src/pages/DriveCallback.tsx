import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

/**
 * Landing page for Google Drive OAuth callback.
 * When opened as a popup: notifies the parent tab via postMessage then self-closes.
 * When opened as a full page: redirects to dashboard.
 */
export default function DriveCallback(): JSX.Element {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const driveStatus = searchParams.get('drive')
    const error = searchParams.get('error')

    if (window.opener) {
      // Popup mode: notify opener and close
      if (error) {
        window.opener.postMessage(
          { type: 'drive:error', error },
          window.location.origin
        )
      } else {
        window.opener.postMessage(
          { type: 'drive:connected' },
          window.location.origin
        )
      }
      window.close()
    } else {
      // Full-tab fallback
      navigate(driveStatus === 'connected' ? '/dashboard?drive=connected' : '/dashboard', {
        replace: true,
      })
    }
  }, [navigate, searchParams])

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
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          border: '3px solid var(--border)',
          borderTopColor: 'var(--primary)',
          animation: 'spin 0.7s linear infinite',
        }}
      />
      <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
        Connecting Google Drive…
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
