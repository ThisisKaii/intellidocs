import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'

function Login(): JSX.Element {
  const navigate = useNavigate()
  const { login, loginWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleGoogleSignIn() {
    setError('')
    setLoading(true)
    try {
      await loginWithGoogle()
      // loginWithGoogle redirects to Google — no further action needed here
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed')
      setLoading(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    if (!password) {
      setError('Please enter your password.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    setLoading(true)

    try {
      const response = await api.auth.login(email, password)
      login(
        { id: response.user.id, email: response.user.email },
        response.session.access_token
      )
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value)
  }

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>) {
    setPassword(event.target.value)
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--background)',
        padding: '1.5rem',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
        style={{ width: '100%', maxWidth: '360px' }}
      >
        {/* Logo + heading */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: 'var(--primary)',
              marginBottom: '1.25rem',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--primary-foreground)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: '18px', height: '18px' }}
            >
              <path d="M12 2L2 22h20L12 2z" />
            </svg>
          </div>
          <h1
            style={{
              fontSize: '1.375rem',
              fontWeight: 600,
              letterSpacing: '-0.025em',
              color: 'var(--foreground)',
              margin: '0 0 0.375rem',
            }}
          >
            IntelliDocs
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', margin: 0 }}>
            Sign in to your account
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            backgroundColor: 'var(--card)',
            borderRadius: '0.75rem',
            padding: '1.75rem',
            boxShadow:
              'rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 4px',
          }}
        >
          {/* Google Sign-In Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.625rem',
              width: '100%',
              height: '38px',
              borderRadius: '0.5rem',
              border: 'none',
              boxShadow: '0px 0px 0px 1px var(--border-shadow)',
              backgroundColor: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.65 : 1,
              transition: 'opacity 150ms',
              fontFamily: 'inherit',
            }}
          >
            {/* Google logo SVG */}
            <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              <path fill="none" d="M0 0h48v48H0z"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.5rem 0' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>or continue with email</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
          </div>

          {error && (
            <div
              style={{
                backgroundColor: 'rgba(255,91,79,0.08)',
                border: '1px solid rgba(255,91,79,0.25)',
                borderRadius: '0.5rem',
                padding: '0.625rem 0.875rem',
                marginBottom: '1.25rem',
              }}
            >
              <p style={{ fontSize: '0.8125rem', color: 'var(--destructive)', margin: 0 }}>
                {error}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="email"
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'var(--foreground)',
                  marginBottom: '0.4rem',
                }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={handleEmailChange}
                required
                style={{
                  display: 'block',
                  width: '100%',
                  boxSizing: 'border-box',
                  height: '38px',
                  borderRadius: '0.5rem',
                  border: 'none',
                  boxShadow: '0px 0px 0px 1px var(--border-shadow)',
                  backgroundColor: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: '0.875rem',
                  padding: '0 0.75rem',
                  outline: 'none',
                  transition: 'box-shadow 150ms',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.boxShadow =
                    '0px 0px 0px 1px var(--border-shadow), 0 0 0 3px rgba(59,130,246,0.15)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.boxShadow = '0px 0px 0px 1px var(--border-shadow)'
                }}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.4rem',
                }}
              >
                <label
                  htmlFor="password"
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    color: 'var(--foreground)',
                  }}
                >
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--muted-foreground)',
                    textDecoration: 'none',
                  }}
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={handlePasswordChange}
                required
                style={{
                  display: 'block',
                  width: '100%',
                  boxSizing: 'border-box',
                  height: '38px',
                  borderRadius: '0.5rem',
                  border: 'none',
                  boxShadow: '0px 0px 0px 1px var(--border-shadow)',
                  backgroundColor: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: '0.875rem',
                  padding: '0 0.75rem',
                  outline: 'none',
                  transition: 'box-shadow 150ms',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.boxShadow =
                    '0px 0px 0px 1px var(--border-shadow), 0 0 0 3px rgba(59,130,246,0.15)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.boxShadow = '0px 0px 0px 1px var(--border-shadow)'
                }}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                display: 'block',
                width: '100%',
                height: '38px',
                borderRadius: '0.5rem',
                border: 'none',
                backgroundColor: 'var(--primary)',
                color: 'var(--primary-foreground)',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.65 : 1,
                transition: 'opacity 150ms',
                fontFamily: 'inherit',
              }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p
          style={{
            textAlign: 'center',
            marginTop: '1.25rem',
            fontSize: '0.8125rem',
            color: 'var(--muted-foreground)',
          }}
        >
          Don't have an account?{' '}
          <Link
            to="/register"
            style={{ color: 'var(--foreground)', fontWeight: 500, textDecoration: 'none' }}
          >
            Create one
          </Link>
        </p>
      </motion.div>
    </div>
  )
}

export default Login