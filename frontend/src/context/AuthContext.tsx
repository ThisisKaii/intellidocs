import { createContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { api, type RoleStatusResponse } from '../services/api'
import { loadAccountPreferences } from '../lib/editorPreferences'
import { clearDocumentCache } from '../hooks/useDocumentCache'
import { clearDriveCache } from '../hooks/useDriveCache'

/**
 * How often a pending role application is re-checked with the server. Long
 * enough to stay cheap, short enough that an approval lands while the applicant
 * is still looking at the page.
 */
const PENDING_POLL_MS = 20_000

/**
 * Fetch the signed-in user's live role and verification status.
 * Returns null on any failure: a role refresh must never sign the user out or
 * block the UI, and the next focus or poll simply tries again.
 */
async function fetchRoleStatus(): Promise<RoleStatusResponse | null> {
  try {
    return await api.auth.me()
  } catch {
    return null
  }
}

export interface UserAuthData {
  id: string
  email: string
  role?: 'student' | 'professor' | 'admin'
  verificationStatus?: 'pending' | 'approved' | 'rejected'
  requestedRole?: 'student' | 'professor' | 'admin' | null
  displayName?: string | null
  /** Link to the profile photo, or null/undefined to show initials. */
  avatarUrl?: string | null
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
  /**
   * Re-reads role and verification status from the server and merges them into
   * the current user. Call after submitting an application so the UI reflects
   * the new status without waiting for the next sign-in.
   */
  refreshRole: () => Promise<void>
  /** Redirects to Google OAuth consent screen via Supabase. */
  loginWithGoogle: () => Promise<void>
  /** Store the Supabase client's current tokens (after 2FA changes the session level). */
  adoptCurrentSession: () => Promise<void>
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
   * Merge a freshly-read role status into the user, persisting it so a reload
   * does not resurrect the stale cached copy. Returns the previous object when
   * nothing changed, which keeps this from re-rendering on every poll.
   */
  const applyRoleStatus = useCallback((status: RoleStatusResponse): void => {
    setUser((prev) => {
      if (!prev) return prev
      if (
        prev.role === status.role &&
        prev.verificationStatus === status.verificationStatus &&
        (prev.requestedRole ?? null) === (status.requestedRole ?? null)
      ) {
        return prev
      }
      const next = {
        ...prev,
        role: status.role,
        verificationStatus: status.verificationStatus,
        requestedRole: status.requestedRole ?? null,
      }
      localStorage.setItem('authUser', JSON.stringify(next))
      return next
    })
  }, [])

  const refreshRole = useCallback(async (): Promise<void> => {
    const status = await fetchRoleStatus()
    if (status) applyRoleStatus(status)
  }, [applyRoleStatus])

  /**
   * Keep role and verification status current.
   *
   * An administrator's approval changes the database, not the role and status
   * cached from the login response, so without this the UI would keep showing
   * "pending" until the user signed in again. Two cheap triggers cover the
   * real cases: the user returning to the tab to check on their application,
   * and a background tab left open while an approval lands.
   */
  useEffect(() => {
    if (!token) return

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void refreshRole()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    // Poll only while an application is unresolved, so an approved or rejected
    // account makes no background requests at all.
    const awaitingDecision = user?.verificationStatus === 'pending'
    const intervalId = awaitingDecision
      ? window.setInterval(() => void refreshRole(), PENDING_POLL_MS)
      : null

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      if (intervalId !== null) window.clearInterval(intervalId)
    }
  }, [token, refreshRole, user?.role, user?.verificationStatus])

  // Once signed in, make the account's saved editor preferences the ones in use on this device.
  const signedInUserId = user?.id
  useEffect(() => {
    if (signedInUserId && token) void loadAccountPreferences()
    // Re-run only when a different user signs in, not on every token refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedInUserId])

  /**
   * Initiates Google OAuth via Supabase.
   * The user is redirected to Google, then back to /auth/callback.
   *
   * Asks for identity plus drive.file in one consent, so Google Drive import works right
   * after signing in with no second Google login. drive.file is non-sensitive (no
   * "unverified app" warning): the app only ever sees files the person picks.
   * `access_type=offline` makes Google return a refresh token the first time someone
   * grants it, which AuthCallback hands to the server to keep Drive connected. There is
   * no forced re-consent: returning users sign in without seeing a consent screen.
   */
  const loginWithGoogle = async (): Promise<void> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'openid email profile https://www.googleapis.com/auth/drive.file',
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    })
    if (error) throw new Error(error.message)
  }

  const adoptCurrentSession = useCallback(async (): Promise<void> => {
    const { data } = await supabase.auth.getSession()
    const session = data.session
    if (!session) return
    localStorage.setItem('authToken', session.access_token)
    if (session.refresh_token) localStorage.setItem('authRefreshToken', session.refresh_token)
    setToken(session.access_token)
  }, [])

  const value: AuthContextType = {
    user,
    token,
    loading,
    isAuthenticated: !!token,
    login,
    logout,
    updateUser,
    refreshRole,
    loginWithGoogle,
    adoptCurrentSession,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}