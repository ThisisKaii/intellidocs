import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { recoverAuthSession } from '@/services/api'

/**
 * `connecting`: waiting for the first sync (the editor is not created yet).
 * `collab`: the editor edits the shared document; everyone's changes appear live.
 * `solo`: the server can't host this document live (no connection, an older document without
 * saved JSON, no access); the editor works as before, with autosave and the save broadcast.
 */
export type CollabMode = 'connecting' | 'collab' | 'solo'

export interface CollaborationSession {
  mode: CollabMode
  ydoc: Y.Doc | null
  provider: WebsocketProvider | null
}

/** How long to wait for the first sync before opening the document solo. */
const SYNC_TIMEOUT_MS = 5000

/** Server close code for an expired or invalid session (see server collaboration/yjsServer.ts). */
const CLOSE_UNAUTHORIZED = 4401

/**
 * The API base turned into a WebSocket URL: `https://api.host` → `wss://api.host/ws/collab`, and in
 * development `/api` → `ws://localhost:5173/api/ws/collab`, which Vite's /api proxy forwards.
 */
function collabUrl(): string {
  const api = new URL((import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3000', window.location.href)
  const protocol = api.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${api.host}${api.pathname.replace(/\/$/, '')}/ws/collab`
}

function currentToken(): string {
  try {
    return localStorage.getItem('authToken') ?? ''
  } catch {
    return ''
  }
}

/**
 * One shared Yjs document per open document, synced through the server's collaboration socket.
 * Decides once per document whether the editor runs collaboratively or solo; a session that
 * started collaborative stays so (y-websocket reconnects by itself after network drops).
 */
export function useCollaboration(documentId: string | undefined, shareToken: string | undefined, enabled: boolean): CollaborationSession {
  const [session, setSession] = useState<CollaborationSession>({ mode: enabled ? 'connecting' : 'solo', ydoc: null, provider: null })
  const shareRef = useRef(shareToken)
  shareRef.current = shareToken

  useEffect(() => {
    if (!enabled || !documentId || !currentToken()) {
      setSession({ mode: 'solo', ydoc: null, provider: null })
      return
    }

    const ydoc = new Y.Doc()
    const params: Record<string, string> = { token: currentToken() }
    if (shareRef.current) params.share = shareRef.current
    const provider = new WebsocketProvider(collabUrl(), documentId, ydoc, { params, maxBackoffTime: 10_000 })
    let settled = false
    let destroyed = false
    let retriedAuth = false

    const teardown = (): void => {
      if (destroyed) return
      destroyed = true
      provider.destroy()
      ydoc.destroy()
    }

    const goSolo = (): void => {
      if (settled) return
      settled = true
      teardown()
      setSession({ mode: 'solo', ydoc: null, provider: null })
    }

    const timeout = window.setTimeout(goSolo, SYNC_TIMEOUT_MS)

    provider.on('sync', (synced: boolean) => {
      if (!synced || settled) return
      settled = true
      window.clearTimeout(timeout)
      setSession({ mode: 'collab', ydoc, provider })
    })

    // Before every (re)connect, carry the freshest session token; the URL is rebuilt from params.
    provider.on('status', ({ status }: { status: string }) => {
      if (status === 'connecting') provider.params.token = currentToken()
    })

    provider.on('closed', ({ code }: { code: number }) => {
      if (!settled) {
        // Refused before the first sync: no access, no saved JSON yet, or signed out.
        window.clearTimeout(timeout)
        goSolo()
        return
      }
      // Already collaborating: an expired session gets one refresh and a reconnect.
      if (code === CLOSE_UNAUTHORIZED && !retriedAuth) {
        retriedAuth = true
        void recoverAuthSession().then((ok) => {
          if (!ok) return
          provider.params.token = currentToken()
          provider.connect()
        })
      }
    })

    return () => {
      window.clearTimeout(timeout)
      teardown()
      setSession({ mode: enabled ? 'connecting' : 'solo', ydoc: null, provider: null })
    }
  }, [documentId, enabled])

  return session
}
