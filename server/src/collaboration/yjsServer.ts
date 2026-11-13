import type { Server } from 'http'
import { WebSocketServer, WebSocket, type RawData } from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { z } from 'zod'
import { verifyAccessToken } from '../middleware/authMiddleware'
import * as documentModel from '../models/documentModel'
import { isPmDoc, seedYDocFromJson } from './yjsJson'

/**
 * Real-time collaboration: a Yjs sync server speaking the y-websocket wire protocol (sync +
 * awareness), so the browser uses y-websocket's stock WebsocketProvider.
 *
 * Why not the server bundled with y-websocket: this one checks the Supabase session and the
 * document's sharing rules, ignores edits from read-only connections, and seeds each room from
 * the saved `content_json`. Rooms live in memory while anyone is connected and the saved
 * document stays the source of truth (the editors' autosave writes it), so the deployment must
 * run a single server instance.
 */

/** URL prefix; the room is the document id: `/ws/collab/<documentId>?token=…[&share=…]`. */
export const COLLAB_PATH = '/ws/collab/'

/**
 * Close codes the client acts on. All are in 4400–4499, which y-websocket treats as final (no
 * reconnect loop); the client then opens the document solo, or for 4401 refreshes its session.
 */
export const CLOSE_NO_SAVED_JSON = 4409
export const CLOSE_UNAUTHORIZED = 4401
export const CLOSE_FORBIDDEN = 4403
export const CLOSE_NOT_FOUND = 4404

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1
const MESSAGE_QUERY_AWARENESS = 3

/** A room with nobody in it is kept briefly so a reload or flaky network rejoins the same state. */
const ROOM_IDLE_MS = 30_000
const PING_INTERVAL_MS = 30_000
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024

const connectionQuerySchema = z.object({
  documentId: z.string().uuid(),
  token: z.string().min(10),
  share: z.string().min(1).max(200).optional(),
})

interface Connection {
  ws: WebSocket
  readOnly: boolean
  /** Awareness client ids this socket announced, cleared when it leaves. */
  awarenessIds: Set<number>
  alive: boolean
}

interface Room {
  doc: Y.Doc
  awareness: awarenessProtocol.Awareness
  connections: Map<WebSocket, Connection>
  idleTimer: NodeJS.Timeout | null
}

const rooms = new Map<string, Room>()

function send(conn: Connection, message: Uint8Array): void {
  if (conn.ws.readyState !== WebSocket.OPEN) return
  conn.ws.send(message, (error) => {
    if (error) conn.ws.close()
  })
}

function broadcast(room: Room, message: Uint8Array, except?: Connection): void {
  for (const conn of room.connections.values()) if (conn !== except) send(conn, message)
}

function createRoom(documentId: string, json: unknown): Room {
  const doc = new Y.Doc()
  if (isPmDoc(json)) seedYDocFromJson(doc, json)
  const awareness = new awarenessProtocol.Awareness(doc)
  awareness.setLocalState(null)
  const room: Room = { doc, awareness, connections: new Map(), idleTimer: null }

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeUpdate(encoder, update)
    broadcast(room, encoding.toUint8Array(encoder), origin as Connection | undefined)
  })

  awareness.on(
    'update',
    ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const conn = origin as Connection | null
      if (conn && room.connections.has(conn.ws)) {
        for (const id of [...added, ...updated]) conn.awarenessIds.add(id)
        for (const id of removed) conn.awarenessIds.delete(id)
      }
      const changed = [...added, ...updated, ...removed]
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changed))
      // The sender already has its own cursor state; echoing it back is wasted traffic.
      broadcast(room, encoding.toUint8Array(encoder), conn ?? undefined)
    }
  )

  rooms.set(documentId, room)
  return room
}

function destroyRoom(documentId: string, room: Room): void {
  if (rooms.get(documentId) !== room) return
  rooms.delete(documentId)
  room.awareness.destroy()
  room.doc.destroy()
}

function handleMessage(room: Room, conn: Connection, data: Uint8Array): void {
  const decoder = decoding.createDecoder(data)
  const encoder = encoding.createEncoder()
  const messageType = decoding.readVarUint(decoder)

  if (messageType === MESSAGE_SYNC) {
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    const syncType = decoding.readVarUint(decoder)
    if (syncType === syncProtocol.messageYjsSyncStep1) {
      syncProtocol.readSyncStep1(decoder, encoder, room.doc)
    } else if (!conn.readOnly) {
      // Read-only connections (viewers, reviewing professors) receive edits but never send them.
      if (syncType === syncProtocol.messageYjsSyncStep2) syncProtocol.readSyncStep2(decoder, room.doc, conn)
      else if (syncType === syncProtocol.messageYjsUpdate) syncProtocol.readUpdate(decoder, room.doc, conn)
    }
    if (encoding.length(encoder) > 1) send(conn, encoding.toUint8Array(encoder))
    return
  }

  if (messageType === MESSAGE_AWARENESS) {
    awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), conn)
    return
  }

  if (messageType === MESSAGE_QUERY_AWARENESS) {
    const ids = Array.from(room.awareness.getStates().keys())
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(room.awareness, ids))
    send(conn, encoding.toUint8Array(encoder))
  }
}

function toBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data))
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

/** Check the caller, load the room, then start syncing. Messages that arrive meanwhile are queued. */
async function onConnection(ws: WebSocket, url: URL): Promise<void> {
  const pending: Uint8Array[] = []
  let ready: ((data: Uint8Array) => void) | null = null
  ws.on('message', (data: RawData) => {
    const bytes = toBytes(data)
    if (ready) ready(bytes)
    else pending.push(bytes)
  })

  const parsed = connectionQuerySchema.safeParse({
    documentId: decodeURIComponent(url.pathname.slice(COLLAB_PATH.length)),
    token: url.searchParams.get('token') ?? '',
    share: url.searchParams.get('share') ?? undefined,
  })
  if (!parsed.success) {
    ws.close(CLOSE_NOT_FOUND, 'Invalid collaboration request')
    return
  }
  const { documentId, token, share } = parsed.data

  const auth = await verifyAccessToken(token).catch(() => null)
  if (!auth?.ok) {
    ws.close(CLOSE_UNAUTHORIZED, 'Sign in again')
    return
  }

  let readOnly: boolean
  let savedJson: unknown
  try {
    const doc = await documentModel.getDocumentForUser(documentId, auth.user.id, auth.user.email, share)
    readOnly = !(await documentModel.canEditDocument(doc, auth.user.id, share))
    savedJson = doc.content_json
  } catch (error) {
    const status = (error as { status?: number }).status
    ws.close(status === 404 ? CLOSE_NOT_FOUND : CLOSE_FORBIDDEN, 'No access to this document')
    return
  }
  if (ws.readyState !== WebSocket.OPEN) return

  let room = rooms.get(documentId)
  if (!room) {
    // A document saved before content_json existed can't be seeded without the editor schema;
    // the client opens it solo, and its first save writes content_json for next time.
    if (!isPmDoc(savedJson)) {
      ws.close(CLOSE_NO_SAVED_JSON, 'Open solo until the document is saved once')
      return
    }
    // Synchronous from here on, so two first visitors can never seed the same room twice.
    room = createRoom(documentId, savedJson)
  }
  if (room.idleTimer) {
    clearTimeout(room.idleTimer)
    room.idleTimer = null
  }

  const activeRoom = room
  const conn: Connection = { ws, readOnly, awarenessIds: new Set(), alive: true }
  activeRoom.connections.set(ws, conn)

  ws.on('pong', () => {
    conn.alive = true
  })
  const ping = setInterval(() => {
    if (!conn.alive) {
      ws.terminate()
      return
    }
    conn.alive = false
    ws.ping()
  }, PING_INTERVAL_MS)
  ping.unref()

  ws.on('close', () => {
    clearInterval(ping)
    activeRoom.connections.delete(ws)
    if (conn.awarenessIds.size) {
      awarenessProtocol.removeAwarenessStates(activeRoom.awareness, Array.from(conn.awarenessIds), null)
    }
    if (activeRoom.connections.size === 0) {
      activeRoom.idleTimer = setTimeout(() => destroyRoom(documentId, activeRoom), ROOM_IDLE_MS)
      activeRoom.idleTimer.unref()
    }
  })

  ready = (bytes) => {
    try {
      handleMessage(activeRoom, conn, bytes)
    } catch (error) {
      console.error('[collab] bad message', error)
      ws.close()
    }
  }

  // Start the handshake: our state vector, then everyone's cursors.
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  syncProtocol.writeSyncStep1(encoder, activeRoom.doc)
  send(conn, encoding.toUint8Array(encoder))
  const states = activeRoom.awareness.getStates()
  if (states.size > 0) {
    const awarenessEncoder = encoding.createEncoder()
    encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(awarenessEncoder, awarenessProtocol.encodeAwarenessUpdate(activeRoom.awareness, Array.from(states.keys())))
    send(conn, encoding.toUint8Array(awarenessEncoder))
  }

  for (const bytes of pending.splice(0)) ready(bytes)
}

/** Serve collaboration WebSockets on the app's HTTP server. Other upgrade requests are refused. */
export function attachCollaboration(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith(COLLAB_PATH)) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      onConnection(ws, url).catch((error: unknown) => {
        console.error('[collab] connection failed', error)
        ws.close(1011, 'Server error')
      })
    })
  })
}

/** Close every room and its connections (server shutdown, tests). */
export function closeAllRooms(): void {
  for (const [documentId, room] of rooms) {
    if (room.idleTimer) clearTimeout(room.idleTimer)
    for (const conn of room.connections.values()) conn.ws.terminate()
    destroyRoom(documentId, room)
  }
}
