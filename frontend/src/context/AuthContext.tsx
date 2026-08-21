import { createContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '../lib/supabase'

export interface UserAuthData {
  id: string
  email: string
  role?: 'student' | 'professor' | 'admin'
  verificationStatus?: 'pending' | 'approved' | 'rejected'
  displayName?: string | null
}

interface AuthContextType {
  user: UserAuthData | null
  token: string | null
  loading: boolean
  isAuthenticated: boolean
  login: (user: UserAuthData, token: string) => void
  logout: () => void
  /** Merges partial profile updates (e.g. display name) into the current user. */
  updateUser: (patch: Partial<UserAuthData>) => void
  /** Redirects to Google OAuth consent screen via Supabase. */
  loginWithGoogle: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserAuthData | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedToken = localStorage.getItem('authToken')
    const savedUser = localStorage.getItem('authUser')
    if (savedToken) {
      setToken(savedToken)
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser))
        } catch (e) {
          console.error('Failed to parse saved user', e)
        }
      }
    }
    setLoading(false)
  }, [])

  // Listen for global auth events dispatched by api.ts
  useEffect(() => {
    const handleUnauthorized = () => {
      logout()
    }
    window.addEventListener('auth:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized)
  }, [])

  const login = (userData: UserAuthData, authToken: string) => {
    setUser(userData)
    setToken(authToken)
    localStorage.setItem('authToken', authToken)
    localStorage.setItem('authUser', JSON.stringify(userData))
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('authToken')
    localStorage.removeItem('authUser')
  }

  const updateUser = (patch: Partial<UserAuthData>) => {
    setUser((prev) => {
      const next = prev ? { ...prev, ...patch } : prev
      if (next) localStorage.setItem('authUser', JSON.stringify(next))
      return next
    })
  }

  /**
   * Initiates Google OAuth via Supabase.
   * The user is redirected to Google, then back to /auth/callback.
   */
  const loginWithGoogle = async (): Promise<void> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw new Error(error.message)
  }

  const value: AuthContextType = {
    user,
    token,
    loading,
    isAuthenticated: !!token,
    login,
    logout,
    updateUser,
    loginWithGoogle,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}