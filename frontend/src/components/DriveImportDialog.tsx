import { useState, useEffect, useCallback } from 'react'
import { api, type DriveFile } from '@/services/api'
import { HardDrive, ExternalLink, Download, X, Loader2, Unplug } from 'lucide-react'

interface DriveImportDialogProps {
  open: boolean
  onClose: () => void
  onImport: (title: string, html: string) => void
}

/** Floating dialog to connect to Google Drive and import documents. */
export default function DriveImportDialog({
  open,
  onClose,
  onImport,
}: DriveImportDialogProps): JSX.Element | null {
  const [connected, setConnected] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [files, setFiles] = useState<DriveFile[]>([])
  const [importing, setImporting] = useState<string | null>(null)

  /** Check Google Drive connection status. */
  const checkStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.drive.status()
      setConnected(res.connected)
      if (res.connected) {
        const fileRes = await api.drive.listFiles()
        setFiles(fileRes.files)
      }
    } catch (error) {
      console.error('Drive status check failed', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void checkStatus()
  }, [open, checkStatus])

  /** Start the OAuth2 flow by opening the consent URL in a popup. */
  async function handleConnect(): Promise<void> {
    try {
      const res = await api.drive.getAuthUrl()
      window.open(res.url, '_blank', 'width=600,height=700')

      function handleOAuthMessage(event: MessageEvent): void {
        if (event.origin !== window.location.origin) return
        const data = event.data as { type?: string; error?: string }
        if (data.type === 'drive:connected') {
          void checkStatus()
          window.removeEventListener('message', handleOAuthMessage)
        } else if (data.type === 'drive:error') {
          console.error('Google Drive connection error:', data.error)
          window.removeEventListener('message', handleOAuthMessage)
        }
      }
      window.addEventListener('message', handleOAuthMessage)
    } catch (error) {
      console.error('Failed to get auth URL', error)
    }
  }

  /** Disconnect Google Drive. */
  async function handleDisconnect(): Promise<void> {
    try {
      await api.drive.disconnect()
      setConnected(false)
      setFiles([])
    } catch (error) {
      console.error('Failed to disconnect', error)
    }
  }

  /** Import a single file by exporting its HTML. */
  async function handleImport(file: DriveFile): Promise<void> {
    setImporting(file.id)
    try {
      const res = await api.drive.exportFile(file.id)
      onImport(res.title, res.html)
      onClose()
    } catch (error) {
      console.error('Failed to import file', error)
    } finally {
      setImporting(null)
    }
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '70vh',
          backgroundColor: 'var(--background)',
          borderRadius: '0.75rem',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <HardDrive style={{ width: '18px', height: '18px', color: 'var(--primary)' }} />
            <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--foreground)' }}>
              Import from Google Drive
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '0.375rem',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
            }}
          >
            <X style={{ width: '16px', height: '16px' }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 0' }}>
              <Loader2 style={{ width: '20px', height: '20px', color: 'var(--muted-foreground)', animation: 'spin 1s linear infinite' }} />
              <span style={{ marginLeft: '0.5rem', fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
                Checking connection…
              </span>
            </div>
          ) : !connected ? (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', marginBottom: '1rem' }}>
                Connect your Google account to import documents from Google Drive.
              </p>
              <button
                type="button"
                onClick={() => { void handleConnect() }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <ExternalLink style={{ width: '14px', height: '14px' }} />
                Connect Google Drive
              </button>
            </div>
          ) : (
            <div>
              {/* Disconnect action */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => { void handleDisconnect() }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: 'var(--muted-foreground)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <Unplug style={{ width: '12px', height: '12px' }} />
                  Disconnect
                </button>
              </div>

              {files.length === 0 ? (
                <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', textAlign: 'center', padding: '1rem 0' }}>
                  No Google Docs found in your Drive.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {files.map((file) => (
                    <li
                      key={file.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.5rem',
                        backgroundColor: 'var(--secondary)',
                        transition: 'background-color 150ms',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                        {file.iconLink ? (
                          <img src={file.iconLink} alt="" style={{ width: '16px', height: '16px' }} />
                        ) : (
                          <HardDrive style={{ width: '14px', height: '14px', color: 'var(--muted-foreground)' }} />
                        )}
                        <span
                          style={{
                            fontSize: '0.8125rem',
                            color: 'var(--foreground)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {file.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={importing === file.id}
                        onClick={() => { void handleImport(file) }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '0.375rem',
                          border: 'none',
                          backgroundColor: 'var(--primary)',
                          color: 'var(--primary-foreground)',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          cursor: importing === file.id ? 'not-allowed' : 'pointer',
                          opacity: importing === file.id ? 0.5 : 1,
                          fontFamily: 'inherit',
                          flexShrink: 0,
                        }}
                      >
                        {importing === file.id ? (
                          <Loader2 style={{ width: '12px', height: '12px', animation: 'spin 1s linear infinite' }} />
                        ) : (
                          <Download style={{ width: '12px', height: '12px' }} />
                        )}
                        Import
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
