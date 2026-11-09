import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, LogOut, Sparkles, CreditCard, GraduationCap } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { UserAvatar } from '@/components/UserAvatar'
import { PlanBadge } from '@/components/billing/PlanBadge'
import { UpgradeModal } from '@/components/billing/UpgradeModal'

/**
 * Account dropdown (top right) with Settings navigation and logout.
 * Closes on outside click or item selection. Dropdown uses animate-popover
 * so it enters with a smooth scale + slide instead of an instant pop-in.
 */
export function UserMenu(): JSX.Element {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [open, setOpen] = useState<boolean>(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const isPro = user?.plan === 'pro'
  const menuRef = useRef<HTMLDivElement>(null)
  /** Tracks the current animation key so re-opening replays the animation. */
  const [animKey, setAnimKey] = useState(0)

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

  function handleOpen(): void {
    setOpen((prev) => {
      if (!prev) setAnimKey((k) => k + 1) // bump key so CSS animation replays
      return !prev
    })
  }

  function handleLogout(): void {
    setOpen(false)
    logout()
    navigate('/login')
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={handleOpen}
        title="Account"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-transparent text-muted-foreground border-none cursor-pointer transition-colors hover:bg-foreground/5"
      >
        <UserAvatar src={user?.avatarUrl} name={user?.displayName || user?.email || 'User'} size={28} />
        {isPro && <PlanBadge plan="pro" className="absolute -bottom-1 -right-1 scale-75" />}
      </button>

      {open && (
        <div
          key={animKey}
          role="menu"
          className="animate-popover absolute right-0 top-12 z-50 w-56 rounded-xl bg-card border border-border shadow-lg overflow-hidden"
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              if (isPro) navigate('/settings?section=billing')
              else setUpgradeOpen(true)
            }}
            className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-foreground bg-transparent border-none cursor-pointer text-left transition-colors hover:bg-foreground/5"
            style={{ fontFamily: 'inherit' }}
          >
            {isPro ? (
              <CreditCard className="size-4 text-muted-foreground" strokeWidth={1.75} />
            ) : (
              <Sparkles className="size-4 text-primary" strokeWidth={1.75} />
            )}
            <span className="flex-1">{isPro ? 'Manage subscription' : 'Upgrade to Pro'}</span>
            <PlanBadge plan={user?.plan} />
          </button>

          {user?.role === 'professor' && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false)
                navigate('/professor')
              }}
              className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-foreground bg-transparent border-none cursor-pointer text-left transition-colors hover:bg-foreground/5"
              style={{ fontFamily: 'inherit' }}
            >
              <GraduationCap className="size-4 text-muted-foreground" strokeWidth={1.75} />
              Professor dashboard
            </button>
          )}

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
      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  )
}

export default UserMenu
