import {
  Home,
  FileText,
  Clock3,
  Star,
  Trash,
  Plus,
  type LucideIcon,
} from 'lucide-react'

interface SidebarItem {
  id: string
  label: string
  icon: LucideIcon
}

interface DriveSidebarProps {
  activeId?: string
  onCreate: () => void
}

const items: SidebarItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'drive', label: 'My Documents', icon: FileText },
  { id: 'recent', label: 'Recent', icon: Clock3 },
  { id: 'starred', label: 'Starred', icon: Star },
  { id: 'trash', label: 'Trash', icon: Trash },
]

function DriveSidebar({
  activeId = 'home',
  onCreate,
}: DriveSidebarProps): JSX.Element {
  return (
    <aside
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '240px',
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        backgroundColor: 'var(--background)',
        paddingTop: '1.5rem',
        paddingBottom: '1.5rem',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      <div style={{ padding: '0 1rem', marginBottom: '1.5rem' }}>
        <button
          onClick={onCreate}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            width: '100%',
            height: '2.5rem',
            padding: '0 1rem',
            borderRadius: '0.5rem',
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-foreground)',
            fontSize: '0.875rem',
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'opacity 150ms',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.9' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
        >
          <Plus style={{ width: '16px', height: '16px' }} />
          <span>New</span>
        </button>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0 0.75rem' }}>
        {items.map((item) => {
          const isActive = item.id === activeId
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
                backgroundColor: isActive ? 'var(--secondary)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
                transition: 'background-color 150ms, color 150ms',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--secondary)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--foreground)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted-foreground)';
                }
              }}
            >
              <Icon style={{ width: '16px', height: '16px' }} />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div style={{ marginTop: 'auto', padding: '0 1rem', paddingTop: '1rem' }}>
        <div style={{ height: '4px', width: '100%', borderRadius: '9999px', backgroundColor: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '25%', borderRadius: '9999px', backgroundColor: 'var(--foreground)' }} />
        </div>
        <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--muted-foreground)', opacity: 0.8, margin: '0.5rem 0 0 0' }}>
          Free tier
        </p>
      </div>
    </aside>
  )
}

export default DriveSidebar