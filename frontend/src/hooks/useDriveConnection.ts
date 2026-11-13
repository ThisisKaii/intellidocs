import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/services/api'
import { getLinkedGoogleIdentity } from '@/lib/googleIdentity'

export interface DriveConnection {
  connected: boolean
  loading: boolean
  error: string | null
  setError: (message: string | null) => void
  refresh: () => Promise<void>
  /** Open Google's consent popup, pre-selecting the Google account linked to this user. */
  connect: () => Promise<void>
  disconnect: () => Promise<void>
}

/**
 * Google Drive connection state shared by the import dialog and Settings: status, the consent
 * popup (answered by /drive-callback with a postMessage) and disconnect.
 */
export function useDriveConnection(active = true): DriveConnection {
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // The listener for an open consent popup, removed on answer or unmount.
  const listenerRef = useRef<((event: MessageEvent) => void) | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.drive.status()
      setConnected(res.connected)
    } catch (err) {
      console.error('Drive status check failed', err)
      setError(err instanceof Error ? err.message : 'Failed to check Google Drive connection.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (active) void refresh()
  }, [active, refresh])

  useEffect(
    () => () => {
      if (listenerRef.current) window.removeEventListener('message', listenerRef.current)
    },
    []
  )

  const connect = useCallback(async () => {
    setError(null)
    try {
      // The linked Google account's address can differ from the IntelliDocs email.
      const linked = await getLinkedGoogleIdentity().catch(() => null)
      const res = await api.drive.getAuthUrl(linked?.email ?? undefined)
      window.open(res.url, '_blank', 'width=600,height=700')

      if (listenerRef.current) window.removeEventListener('message', listenerRef.current)
      const onMessage = (event: MessageEvent): void => {
        if (event.origin !== window.location.origin) return
        const data = event.data as { type?: string; error?: string }
        if (data.type !== 'drive:connected' && data.type !== 'drive:error') return
        window.removeEventListener('message', onMessage)
        listenerRef.current = null
        if (data.type === 'drive:connected') void refresh()
        else setError(data.error || 'Google Drive was not connected. Please try again.')
      }
      listenerRef.current = onMessage
      window.addEventListener('message', onMessage)
    } catch (err) {
      console.error('Failed to get auth URL', err)
      setError(err instanceof Error ? err.message : 'Failed to start Google Drive connection.')
    }
  }, [refresh])

  const disconnect = useCallback(async () => {
    setError(null)
    try {
      await api.drive.disconnect()
      setConnected(false)
    } catch (err) {
      console.error('Failed to disconnect', err)
      setError(err instanceof Error ? err.message : 'Failed to disconnect Google Drive.')
    }
  }, [])

  return { connected, loading, error, setError, refresh, connect, disconnect }
}
