import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, Mail, FileText } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ThemeToggle from '@/components/ThemeToggle'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

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
      setTimeout(() => navigate('/'), 1200)
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

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background text-foreground bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <main className="w-full max-w-[440px]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        >
          <div className="mb-6 flex flex-col items-center justify-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary">
              <FileText className="size-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">IntelliDocs</h1>
          </div>

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm shadow-xl">
            <CardHeader className="space-y-1.5 pb-5 text-center">
              <CardTitle className="text-lg font-semibold">Create an account</CardTitle>
              <CardDescription className="text-xs">
                Get started with IntelliDocs in seconds
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-5">
              {error ? (
                <div className="mb-4 text-center">
                  <p className="text-[11px] font-medium text-destructive/80">{error}</p>
                </div>
              ) : null}

              {success ? (
                <div className="mb-4 text-center">
                  <p className="text-[11px] font-medium text-emerald-500/80">{success}</p>
                </div>
              ) : null}

              <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                <div className="space-y-1.5 relative">
                  <Label htmlFor="email" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Email
                  </Label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground transition-colors duration-300 group-focus-within:text-primary" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@company.com"
                      className="pl-8 bg-background h-9 text-sm transition-all duration-300 hover:bg-muted/30 focus:bg-card"
                      value={email}
                      onChange={handleEmailChange}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Password
                  </Label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground transition-colors duration-300 group-focus-within:text-primary" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      className="pl-8 bg-background h-9 text-sm tracking-widest transition-all duration-300 hover:bg-muted/30 focus:bg-card"
                      value={password}
                      onChange={handlePasswordChange}
                      required
                    />
                  </div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                    Must be at least 6 characters
                  </p>
                </div>
                <div className="pt-2">
                  <Button className="w-full h-9 text-sm transition-all duration-300 active:scale-[0.98]" type="submit" disabled={loading}>
                    {loading ? 'Creating account...' : 'Create account'}
                  </Button>
                </div>
              </form>
            </CardContent>
            <CardFooter className="flex justify-center border-t border-border/50 p-4">
              <p className="text-xs text-muted-foreground">
                Already have an account?{' '}
                <Link
                  to="/login"
                  className="font-semibold text-primary transition-all duration-300 hover:text-primary/70 hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </Card>

          <p className="mt-6 flex items-center justify-center text-[10px] text-muted-foreground tracking-widest uppercase">
            <span className="inline-block mr-1.5 h-1 w-1 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]"></span>
            Session Secure
          </p>
        </motion.div>
      </main>
    </div>
  )
}

export default Register