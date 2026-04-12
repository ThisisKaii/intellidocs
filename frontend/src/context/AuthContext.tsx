import { createContext, useState, useEffect, ReactNode } from 'react'

interface AuthContextType {
  user: { id: string; email: string } | null
  token: string | null
  loading: boolean
  isAuthenticated: boolean
  login: (user: { id: string; email: string }, token: string) => void
  logout: () => void
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedToken = localStorage.getItem('authToken')
    if (savedToken) {
      setToken(savedToken)
    }
    setLoading(false)
  }, [])

  const login = (userData: { id: string; email: string }, authToken: string) => {
    setUser(userData)
    setToken(authToken)
    localStorage.setItem('authToken', authToken)
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('authToken')
  }

  const value: AuthContextType = {
    user,
    token,
    loading,
    isAuthenticated: !!token,
    login,
    logout,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}