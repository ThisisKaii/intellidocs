import { createContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { clearDocumentCache } from '../hooks/useDocumentCache'
import { clearDriveCache } from '../hooks/useDriveCache'

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
  login: (user: UserAuthData, token: string, refreshToken?: string) => void
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
      // Refresh the persisted session in the background so the access
      // token never silently expires while the app is open.
      void refreshStoredSession()
    }
    setLoading(false)
  }, [])

  /**
   * Swap the stored access token for a fresh one using the saved refresh
   * token. Keeps the user signed in past the ~1h access-token lifetime.
   */
  async function refreshStoredSession(): Promise<void> {
    const accessToken = localStorage.getItem('authToken')
    const refreshToken = localStorage.getItem('authRefreshToken')
    if (!accessToken || !refreshToken) return
    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      const session = data.session
      if (error || !session) return
      localStorage.setItem('authToken', session.access_token)
      if (session.refresh_token) {
        localStorage.setItem('authRefreshToken', session.refresh_token)
      }
      setToken(session.access_token)
    } catch (e) {
      console.error('Failed to refresh session on start', e)
    }
  }

  // Listen for global auth events dispatched by api.ts
  useEffect(() => {
    const handleUnauthorized = () => {
      logout()
    }
    window.addEventListener('auth:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized)
  }, [])

  const login = (userData: UserAuthData, authToken: string, refreshToken?: string) => {
    setUser(userData)
    setToken(authToken)
    localStorage.setItem('authToken', authToken)
    localStorage.setItem('authUser', JSON.stringify(userData))
    if (refreshToken) {
      localStorage.setItem('authRefreshToken', refreshToken)
    }
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('authToken')
    localStorage.removeItem('authRefreshToken')
    localStorage.removeItem('authUser')
    // Flush per-user caches so the next account can never see this one's data.
    void clearDriveCache()
    void clearDocumentCache()
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