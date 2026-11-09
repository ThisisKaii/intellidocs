import type { ReactNode } from 'react'
import { Wifi, WifiOff, RefreshCw, Cloud } from 'lucide-react'
import { useOfflineSync } from '@/hooks/useOfflineBuffer'

interface OfflineIndicatorProps {
  /** Document ID to show sync status for. */
  documentId?: string
  /** Compact mode for header. */
  compact?: boolean
  /** Compact mode only: use a native title instead of no tooltip. */
  showTooltip?: boolean
}

/**
 * Passive sync status. Stays hidden while online and fully synced (the save
 * status already says "Saved to cloud"); shows a quiet note while changes are
 * syncing and an alert only when the connection is actually offline. It is
 * not a control: the sync hook flushes the queue on its own when back online.
 */
export function OfflineIndicator({
  documentId,
  compact = false,
  showTooltip = true,
}: OfflineIndicatorProps): ReactNode {
  const {
    onlineStatus,
    pendingSyncCount,
    lastSyncedAt,
    isReady,
    processSyncQueue,
  } = useOfflineSync(documentId)

  if (!isReady) return null

  const pendingLabel = `${pendingSyncCount} change${pendingSyncCount !== 1 ? 's' : ''}`

  if (compact) {
    const config = onlineStatus === 'offline'
      ? { icon: WifiOff, color: 'var(--destructive)', label: 'Offline' }
      : onlineStatus === 'syncing' || pendingSyncCount > 0
        ? { icon: onlineStatus === 'syncing' ? RefreshCw : Cloud, color: onlineStatus === 'syncing' ? 'var(--info)' : 'var(--warning)', label: 'Syncing...' }
        : { icon: Wifi, color: 'var(--success)', label: 'Online' }
    const Icon = config.icon
    return (
      <button
        type="button"
        onClick={() => processSyncQueue()}
        aria-label={config.label}
        style={{
          ...compactButtonStyle,
          backgroundColor: config.color,
          color: 'white',
        }}
        title={showTooltip ? `${config.label}${lastSyncedAt ? ` · Last synced ${formatLastSynced(lastSyncedAt)}` : ''}` : undefined}
      >
        <Icon style={{ width: '14px', height: '14px' }} />
        {pendingSyncCount > 0 && (
          <span style={badgeStyle}>{pendingSyncCount}</span>
        )}
      </button>
    )
  }

  if (onlineStatus === 'offline') {
    return (
      <span
        role="status"
        title={pendingSyncCount > 0 ? `${pendingLabel} will sync when you're back online` : 'Edits are kept on this device until you reconnect'}
        style={{ ...passiveStyle, color: 'var(--destructive)' }}
      >
        <WifiOff style={iconStyle} />
        <span>Offline — changes buffered locally</span>
      </span>
    )
  }

  if (onlineStatus === 'syncing' || pendingSyncCount > 0) {
    return (
      <span role="status" style={{ ...passiveStyle, color: 'var(--muted-foreground)' }}>
        <RefreshCw style={{ ...iconStyle, animation: 'spin 1s linear infinite' }} />
        <span>{pendingSyncCount > 0 ? `Syncing ${pendingLabel}…` : 'Syncing…'}</span>
      </span>
    )
  }

  return null
}

/** Relative "last synced" time for the compact tooltip. */
function formatLastSynced(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

const passiveStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  flexShrink: 0,
  fontSize: '0.75rem',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  cursor: 'default',
}

const iconStyle: React.CSSProperties = {
  width: '14px',
  height: '14px',
  flexShrink: 0,
}

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '18px',
  height: '18px',
  padding: '0 0.375rem',
  borderRadius: '999px',
  backgroundColor: 'var(--destructive)',
  color: 'white',
  fontSize: '0.625rem',
  fontWeight: 600,
}

const compactButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.25rem',
  padding: '0.375rem 0.5rem',
  borderRadius: '0.375rem',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.75rem',
  fontWeight: 500,
  transition: 'opacity 120ms',
  opacity: 1,
}
