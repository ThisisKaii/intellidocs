import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'

function Register(): JSX.Element {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)

    try {
      await api.auth.register(email, password)
      const loginResponse = await api.auth.login(email, password)
      login(
        { id: loginResponse.user.id, email: loginResponse.user.email },
        loginResponse.session.access_token
      )
      setSuccess('Account created. Redirecting…')
      setTimeout(() => navigate('/dashboard'), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
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

  const inputStyle: React.CSSProperties = {
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
    fontFamily: 'inherit',
  }

  function onFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.boxShadow =
      '0px 0px 0px 1px var(--border-shadow), 0 0 0 3px rgba(59,130,246,0.15)'
  }
  function onBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.boxShadow = '0px 0px 0px 1px var(--border-shadow)'
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
            Create your account
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

          {success && (
            <div
              style={{
                backgroundColor: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.25)',
                borderRadius: '0.5rem',
                padding: '0.625rem 0.875rem',
                marginBottom: '1.25rem',
              }}
            >
              <p style={{ fontSize: '0.8125rem', color: '#16a34a', margin: 0 }}>{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="reg-email"
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
                id="reg-email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={handleEmailChange}
                required
                style={inputStyle}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: '0.5rem' }}>
              <label
                htmlFor="reg-password"
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'var(--foreground)',
                  marginBottom: '0.4rem',
                }}
              >
                Password
              </label>
              <input
                id="reg-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={handlePasswordChange}
                required
                style={inputStyle}
                onFocus={onFocus}
                onBlur={onBlur}
              />
              <p
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--muted-foreground)',
                  margin: '0.375rem 0 0',
                }}
              >
                Must be at least 6 characters
              </p>
            </div>

            <div style={{ marginTop: '1.25rem' }}>
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
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </div>
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
          Already have an account?{' '}
          <Link
            to="/login"
            style={{ color: 'var(--foreground)', fontWeight: 500, textDecoration: 'none' }}
          >
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  )
}

export default Register