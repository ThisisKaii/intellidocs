import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function Login(): JSX.Element {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await api.auth.login(email, password)
      login(
        { id: response.user.id, email: response.user.email },
        response.session.access_token
      )
      navigate('/')
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
    <div className="min-h-screen bg-[color:var(--surface)] text-foreground flex items-center justify-center px-4 py-10 font-sans">
      <div className="w-full max-w-[28rem] mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-primary font-serif">
            IntelliDocs
          </h1>
        </div>

        <Card className="w-full border-0 ring-0 bg-[color:var(--surface-container-low)] shadow-[0_20px_40px_rgba(0,0,0,0.4)] rounded-xl">
          <CardHeader className="space-y-2 pb-4">
            <CardTitle className="text-2xl font-semibold tracking-tight text-foreground font-serif">
              Welcome back
            </CardTitle>
            <p className="text-[0.875rem] text-muted-foreground leading-[1.6]">
              Sign in to continue to IntelliDocs.
            </p>
          </CardHeader>

          <CardContent className="space-y-6 pt-6">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label
                  htmlFor="login-email"
                  className="text-[0.6875rem] uppercase tracking-[0.05em] text-[color:var(--on-surface-variant)]"
                >
                  Email Address
                </Label>
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={handleEmailChange}
                  placeholder="name@company.com"
                  autoComplete="email"
                  required
                  className="bg-[color:var(--surface-container-lowest)] border border-[color:var(--outline-variant)]/20 focus-visible:ring-2 focus-visible:ring-primary/15 focus-visible:border-primary/50 transition-all duration-300"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="login-password"
                    className="text-[0.6875rem] uppercase tracking-[0.05em] text-[color:var(--on-surface-variant)]"
                  >
                    Password
                  </Label>
                  <button
                    type="button"
                    className="text-[0.6875rem] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={handlePasswordChange}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  className="bg-[color:var(--surface-container-lowest)] border border-[color:var(--outline-variant)]/20 focus-visible:ring-2 focus-visible:ring-primary/15 focus-visible:border-primary/50 transition-all duration-300"
                />
              </div>

              <Button
                type="submit"
                className="w-full rounded-lg bg-gradient-to-br from-primary to-[color:var(--primary-container)] text-primary-foreground shadow-[0_4px_14px_rgba(173,198,255,0.2)] hover:brightness-110"
                disabled={loading}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              Don’t have an account?{' '}
              <Link
                to="/register"
                className="font-semibold text-primary hover:text-primary/80 transition-colors underline-offset-4 hover:underline"
              >
                Create an account
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Login