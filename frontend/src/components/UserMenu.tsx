import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, LogOut, Moon } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/context/ThemeContext'

/** Two-letter initials derived from the user's display name or email, or a fallback. */
function userInitials(name: string): string {
  const parts = name.split('@')[0].split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  const initials = parts[0]?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase()
  return initials || 'U'
}

/**
 * Account dropdown (top right) with Settings navigation, a dark-mode switch,
 * and logout. Closes on outside click or item selection.
 */
export function UserMenu(): JSX.Element {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState<boolean>(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleOutsideClick(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  function handleLogout(): void {
    setOpen(false)
    logout()
    navigate('/login')
  }

  const isDark = theme === 'dark'

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        title="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-transparent text-muted-foreground border-none cursor-pointer transition-colors hover:bg-foreground/5"
      >
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-semibold select-none">
          {userInitials(user?.displayName || user?.email || 'User')}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-56 rounded-xl bg-card border border-border shadow-lg overflow-hidden"
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              navigate('/settings')
            }}
            className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-foreground bg-transparent border-none cursor-pointer text-left transition-colors hover:bg-foreground/5"
            style={{ fontFamily: 'inherit' }}
          >
            <Settings className="size-4 text-muted-foreground" strokeWidth={1.75} />
            Settings
          </button>

          <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex items-center justify-between w-full px-4 py-3 border-t border-border bg-transparent cursor-pointer text-left transition-colors hover:bg-foreground/5"
            style={{ fontFamily: 'inherit' }}
          >
            <span className="flex items-center gap-2.5 text-sm text-foreground">
              <Moon className="size-4 text-muted-foreground" strokeWidth={1.75} />
              Dark
            </span>
            <span
              role="switch"
              aria-checked={isDark}
              aria-hidden="true"
              className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${isDark ? 'bg-primary' : 'bg-foreground/20'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-sm transition-transform ${isDark ? 'translate-x-4' : 'translate-x-0'}`}
              />
            </span>
          </button>

          <button
            role="menuitem"
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-destructive bg-transparent border-t border-border cursor-pointer text-left transition-colors hover:bg-destructive/5"
            style={{ fontFamily: 'inherit' }}
          >
            <LogOut className="size-4" strokeWidth={1.75} />
            Logout
          </button>
        </div>
      )}
    </div>
  )
}

export default UserMenu
