import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff } from 'lucide-react'
import { LogoMark } from '../components/Logo'
import { AuthShell } from '../components/AuthShell'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'

/**
 * Shared styles for a password input with a reveal button on the right.
 * The right padding keeps typed text clear of the button.
 */
const passwordFieldStyle: React.CSSProperties = {
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
  padding: '0 2.5rem 0 0.75rem',
  outline: 'none',
  transition: 'box-shadow 150ms',
}

/** Styles for the show/hide password toggle, centred over the input. */
const revealButtonStyle: React.CSSProperties = {
  position: 'absolute',
  right: '0.375rem',
  top: '50%',
  transform: 'translateY(-50%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  padding: 0,
  border: 'none',
  borderRadius: '0.375rem',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
}

function Register(): JSX.Element {
  const navigate = useNavigate()
  const { login, loginWithGoogle } = useAuth()
  const [googleLoading, setGoogleLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  // Shared reveal toggle for both password fields.
  const [showPassword, setShowPassword] = useState(false)
  // Independent of showPassword: each field reveals on its own.
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
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
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      await api.auth.register(email, password)
      const loginResponse = await api.auth.login(email, password)
      login(
        {
          id: loginResponse.user.id,
          email: loginResponse.user.email,
          role: 'student',
          verificationStatus: 'approved',
        },
        loginResponse.session.access_token,
        loginResponse.session.refresh_token
      )
      setSuccess('Account created. Redirecting…')
      setTimeout(() => navigate('/dashboard'), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignUp() {
    setError('')
    setGoogleLoading(true)
    try {
      await loginWithGoogle()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-up failed')
      setGoogleLoading(false)
    }
  }

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value)
  }

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>) {
    setPassword(event.target.value)
  }

  function handleConfirmPasswordChange(event: ChangeEvent<HTMLInputElement>) {
    setConfirmPassword(event.target.value)
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
      '0 0 0 1.5px var(--ring), 0 0 0 4px color-mix(in srgb, var(--ring) 12%, transparent)'
  }

  function onBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.boxShadow = '0px 0px 0px 1px var(--border-shadow)'
  }

  return (
    <AuthShell>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: '100%', maxWidth: '360px' }}
      >
        {/* Logo + heading */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          style={{ textAlign: 'center', marginBottom: '2rem' }}
        >
          <div
            className="lg:hidden"
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '1.25rem',
            }}
          >
            <LogoMark size={52} title="IntelliDocs" />
          </div>
          <span
            className="font-tech"
            style={{
              display: 'block',
              fontSize: '0.6875rem',
              fontWeight: 700,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--muted-foreground)',
              marginBottom: '0.5rem',
            }}
          >
            Academic Workspace
          </span>
          <h1
            className="font-display"
            style={{
              fontSize: '1.625rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
              margin: '0 0 0.375rem',
            }}
          >
            Create your account
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
            Free for students and professors
          </p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, delay: 0.1 }}
          style={{
            backgroundColor: 'var(--card)',
            borderRadius: '0.75rem',
            padding: '1.75rem',
            border: '1px solid var(--border)',
            boxShadow: 'rgba(58, 52, 47, 0.06) 0px 4px 16px',
          }}
        >
          {/* Google Sign-Up Button */}
          <motion.button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={googleLoading || loading}
            whileHover={!(googleLoading || loading) ? { y: -1, boxShadow: '0 4px 12px rgba(0,0,0,0.10)' } : {}}
            whileTap={!(googleLoading || loading) ? { y: 0 } : {}}
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
              cursor: googleLoading || loading ? 'not-allowed' : 'pointer',
              opacity: googleLoading || loading ? 0.65 : 1,
              transition: 'opacity 150ms',
              fontFamily: 'inherit',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              <path fill="none" d="M0 0h48v48H0z"/>
            </svg>
            {googleLoading ? 'Redirecting…' : 'Sign up with Google'}
          </motion.button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.5rem 0' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
              or register with email
            </span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
          </div>

          {error && (
            <motion.div
              key={error}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.22 }}
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
            </motion.div>
          )}

          {success && (
            <motion.div
              key={success}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.22 }}
              style={{
                backgroundColor: 'color-mix(in srgb, var(--success) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)',
                borderRadius: '0.5rem',
                padding: '0.625rem 0.875rem',
                marginBottom: '1.25rem',
              }}
            >
              <p style={{ fontSize: '0.8125rem', color: 'var(--success)', margin: 0 }}>{success}</p>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.13 }}
              style={{ marginBottom: '1rem' }}
            >
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
            </motion.div>

            {/* Password */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.18 }}
              style={{ marginBottom: '0.5rem' }}
            >
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
              <div style={{ position: 'relative' }}>
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a password"
                  value={password}
                  onChange={handlePasswordChange}
                  required
                  style={passwordFieldStyle}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  style={revealButtonStyle}
                >
                  {showPassword ? (
                    <EyeOff size={16} strokeWidth={1.75} />
                  ) : (
                    <Eye size={16} strokeWidth={1.75} />
                  )}
                </button>
              </div>
              <p
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--muted-foreground)',
                  margin: '0.375rem 0 0',
                }}
              >
                Must be at least 6 characters
              </p>
            </motion.div>

            {/* Confirm Password */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.23 }}
              style={{ marginBottom: '0.5rem' }}
            >
              <label
                htmlFor="reg-confirm-password"
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'var(--foreground)',
                  marginBottom: '0.4rem',
                }}
              >
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="reg-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={handleConfirmPasswordChange}
                  required
                  style={passwordFieldStyle}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={
                    showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'
                  }
                  aria-pressed={showConfirmPassword}
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                  style={revealButtonStyle}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={16} strokeWidth={1.75} />
                  ) : (
                    <Eye size={16} strokeWidth={1.75} />
                  )}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--destructive)',
                    margin: '0.375rem 0 0',
                  }}
                >
                  Passwords do not match
                </p>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.28 }}
              style={{ marginTop: '1.25rem' }}
            >
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={!loading ? { y: -1, boxShadow: '0 4px 14px rgba(19,81,170,0.4)' } : {}}
                whileTap={!loading ? { y: 0 } : {}}
                style={{
                  display: 'block',
                  width: '100%',
                  height: '42px',
                  borderRadius: '0.625rem',
                  border: 'none',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  fontSize: '0.9375rem',
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.01em',
                  boxShadow: '0 2px 8px rgba(19,81,170,0.3)',
                  opacity: loading ? 0.7 : 1,
                  transition: 'opacity 150ms, box-shadow 150ms',
                  fontFamily: 'inherit',
                }}
              >
                {loading ? 'Creating account…' : 'Create account'}
              </motion.button>
            </motion.div>
          </form>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.35 }}
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
            style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}
          >
            Sign in
          </Link>
        </motion.p>
      </motion.div>
    </AuthShell>
  )
}

export default Register
