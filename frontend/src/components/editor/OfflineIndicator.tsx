import { useState, type ReactNode } from 'react'
import { Wifi, WifiOff, RefreshCw, Cloud, CheckCircle, Clock } from 'lucide-react'
import { useOfflineSync } from '@/hooks/useOfflineBuffer'

interface OfflineIndicatorProps {
  /** Document ID to show sync status for. */
  documentId?: string
  /** Compact mode for header. */
  compact?: boolean
  /** Show detailed tooltip on hover. */
  showTooltip?: boolean
}

/**
 * Offline/Online status indicator with sync status.
 * Shows connection state, pending sync count, and last sync time.
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

  const [tooltipOpen, setTooltipOpen] = useState(false)

  if (!isReady) return null

  const getStatusConfig = () => {
    switch (onlineStatus) {
      case 'online':
        return {
          icon: pendingSyncCount > 0 ? Cloud : Wifi,
          color: pendingSyncCount > 0 ? 'var(--warning)' : 'var(--success)',
          label: pendingSyncCount > 0 ? 'Syncing...' : 'Online',
          description: pendingSyncCount > 0
            ? `${pendingSyncCount} change${pendingSyncCount !== 1 ? 's' : ''} pending sync`
            : 'All changes synced',
        }
      case 'syncing':
        return {
          icon: RefreshCw,
          color: 'var(--info)',
          label: 'Syncing...',
          description: 'Synchronizing with server',
        }
      case 'offline':
        return {
          icon: WifiOff,
          color: 'var(--destructive)',
          label: 'Offline',
          description: pendingSyncCount > 0
            ? `${pendingSyncCount} change${pendingSyncCount !== 1 ? 's' : ''} will sync when online`
            : 'No pending changes',
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  const formatLastSynced = (dateString: string | null) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => processSyncQueue()}
        onMouseEnter={() => showTooltip && setTooltipOpen(true)}
        onMouseLeave={() => setTooltipOpen(false)}
        aria-label={config.label}
        style={{
          ...compactButtonStyle,
          backgroundColor: config.color,
          color: 'white',
        }}
        title={showTooltip ? undefined : `${config.label}${lastSyncedAt ? ` · Last synced ${formatLastSynced(lastSyncedAt)}` : ''}`}
      >
        <Icon style={{ width: '14px', height: '14px' }} />
        {pendingSyncCount > 0 && (
          <span style={badgeStyle}>{pendingSyncCount}</span>
        )}
      </button>
    )
  }

  return (
    <div style={containerStyle}>
      <div
        style={triggerStyle}
        onMouseEnter={() => showTooltip && setTooltipOpen(true)}
        onMouseLeave={() => setTooltipOpen(false)}
        onClick={() => processSyncQueue()}
      >
        <div style={{ ...statusDotStyle, backgroundColor: config.color }} />
        <span style={labelStyle}>{config.label}</span>
        {pendingSyncCount > 0 && (
          <span style={badgeStyle}>{pendingSyncCount}</span>
        )}
        <RefreshCw style={{ width: '14px', height: '14px', color: 'var(--muted-foreground)', opacity: 0.5 }} />
      </div>

      {showTooltip && tooltipOpen && (
        <div style={tooltipStyle}>
          <div style={tooltipHeaderStyle}>
            <Icon style={{ ...tooltipIconStyle, color: config.color }} />
            <div>
              <div style={tooltipTitleStyle}>{config.label}</div>
              <div style={tooltipDescStyle}>{config.description}</div>
            </div>
          </div>
          <div style={tooltipDividerStyle} />
          <div style={tooltipRowStyle}>
            <span style={tooltipLabelStyle}>Last Synced</span>
            <span style={tooltipValueStyle}>
              {lastSyncedAt ? (
                <>
                  <CheckCircle style={{ width: '12px', height: '12px', color: 'var(--success)', marginRight: '0.375rem', verticalAlign: 'middle' }} />
                  {formatLastSynced(lastSyncedAt)}
                </>
              ) : (
                <>
                  <Clock style={{ width: '12px', height: '12px', color: 'var(--muted-foreground)', marginRight: '0.375rem', verticalAlign: 'middle' }} />
                  Never
                </>
              )}
            </span>
          </div>
          {pendingSyncCount > 0 && (
            <div style={tooltipRowStyle}>
              <span style={tooltipLabelStyle}>Pending Changes</span>
              <span style={{ ...tooltipValueStyle, fontWeight: 600, color: 'var(--warning)' }}>
                {pendingSyncCount}
              </span>
            </div>
          )}
          <div style={tooltipDividerStyle} />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); processSyncQueue() }}
            style={syncButtonStyle}
            disabled={onlineStatus === 'offline' || onlineStatus === 'syncing'}
          >
            <RefreshCw style={{ width: '12px', height: '12px', marginRight: '0.375rem', animation: onlineStatus === 'syncing' ? 'spin 1s linear infinite' : 'none' }} />
            {onlineStatus === 'syncing' ? 'Syncing...' : onlineStatus === 'offline' ? 'Go Online to Sync' : 'Sync Now'}
          </button>
        </div>
      )}
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
}

const triggerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.375rem 0.75rem',
  borderRadius: '0.375rem',
  backgroundColor: 'var(--secondary)',
  cursor: 'pointer',
  transition: 'background-color 120ms',
  border: '1px solid var(--border)',
}

const statusDotStyle: React.CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0,
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 500,
  color: 'var(--foreground)',
  whiteSpace: 'nowrap',
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

const tooltipStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '120%',
  right: 0,
  marginBottom: '0.5rem',
  width: '280px',
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
  padding: '0.75rem',
  zIndex: 100,
  animation: 'popoverIn 140ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
}

const tooltipHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.5rem',
  marginBottom: '0.75rem',
}

const tooltipIconStyle: React.CSSProperties = {
  width: '20px',
  height: '20px',
  flexShrink: 0,
  marginTop: '2px',
}

const tooltipTitleStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'var(--foreground)',
  marginBottom: '0.125rem',
}

const tooltipDescStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  color: 'var(--muted-foreground)',
}

const tooltipDividerStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  margin: '0.75rem 0',
}

const tooltipRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.375rem 0',
  fontSize: '0.75rem',
}

const tooltipLabelStyle: React.CSSProperties = {
  color: 'var(--muted-foreground)',
}

const tooltipValueStyle: React.CSSProperties = {
  color: 'var(--foreground)',
  fontWeight: 500,
}

const syncButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.375rem',
  width: '100%',
  padding: '0.5rem',
  borderRadius: '0.375rem',
  border: 'none',
  backgroundColor: 'var(--primary)',
  color: 'var(--primary-foreground)',
  fontSize: '0.75rem',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'opacity 120ms',
  opacity: 1,
}