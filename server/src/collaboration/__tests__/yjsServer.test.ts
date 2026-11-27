import http from 'http'
import type { AddressInfo } from 'net'
import WebSocket from 'ws'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

// Users are named by their token: "owner", "editor", "viewer"; "bad" fails sign-in.
jest.mock('../../middleware/authMiddleware', () => ({
  verifyAccessToken: jest.fn(async (token: string) =>
    token === 'bad-token-0000' ? { ok: false, error: 'invalid' } : { ok: true, user: { id: token, email: `${token}@x.test` } }
  ),
}))

const mockDocs: Record<string, { id: string; user_id: string; content_json: unknown }> = {}
jest.mock('../../models/documentModel', () => ({
  getDocumentForUser: jest.fn(async (id: string) => {
    const doc = mockDocs[id]
    if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 })
    return doc
  }),
  canEditDocument: jest.fn(async (_doc: unknown, userId: string) => userId !== 'viewer-token'),
}))

const TAB = '33333333-3333-4333-8333-333333333333'
jest.mock('../../models/documentTabModel', () => ({
  getTab: jest.fn(async (documentId: string, tabId: string) => {
    if (tabId !== '33333333-3333-4333-8333-333333333333') throw Object.assign(new Error('Tab not found'), { status: 404 })
    return { document_id: documentId, tab_id: tabId, content_json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'chapter two' }] }] } }
  }),
}))

import * as decoding from 'lib0/decoding'
import { attachCollaboration, closeAllRooms, CLOSE_NO_SAVED_JSON, CLOSE_ROOM_RESET, CLOSE_UNAUTHORIZED } from '../yjsServer'

const SEEDED = '11111111-1111-4111-8111-111111111111'
const NO_JSON = '22222222-2222-4222-8222-222222222222'

mockDocs[SEEDED] = {
  id: SEEDED,
  user_id: 'owner-token',
  content_json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] },
}
mockDocs[NO_JSON] = { id: NO_JSON, user_id: 'owner-token', content_json: null }

let server: http.Server
let base: string
const providers: WebsocketProvider[] = []

beforeAll(async () => {
  server = http.createServer()
  attachCollaboration(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws/collab`
})

afterEach(() => {
  for (const p of providers.splice(0)) {
    p.destroy()
    p.doc.destroy()
  }
})

afterAll(async () => {
  closeAllRooms()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

function connect(docId: string, token: string): { doc: Y.Doc; provider: WebsocketProvider } {
  const doc = new Y.Doc()
  const provider = new WebsocketProvider(base, docId, doc, {
    params: { token },
    // ws's WebSocket is API-compatible with the browser one the provider expects.
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
    disableBc: true,
  })
  // What the app's client does: remember the room's epoch and send it on every reconnect.
  provider.messageHandlers[100] = (_encoder, decoder) => {
    provider.params.epoch = decoding.readVarString(decoder)
  }
  providers.push(provider)
  return { doc, provider }
}

function synced(provider: WebsocketProvider): Promise<void> {
  return new Promise((resolve) => {
    if (provider.synced) resolve()
    else provider.once('sync', (isSynced: boolean) => isSynced && resolve())
  })
}

function closeCode(provider: WebsocketProvider): Promise<number> {
  return new Promise((resolve) => {
    provider.once('connection-close', (event: { code: number } | null) => {
      provider.shouldConnect = false
      resolve(event?.code ?? -1)
    })
  })
}

/** Wait until `check` passes or fail after a second. */
async function eventually(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 10))
  }
}

const text = (doc: Y.Doc): string => doc.getXmlFragment('default').toString()

function typeInto(doc: Y.Doc, words: string): void {
  const paragraph = doc.getXmlFragment('default').get(0) as Y.XmlElement
  const run = paragraph.get(0) as Y.XmlText
  run.insert(run.length, words)
}

describe('collaboration server', () => {
  it('seeds a new room from the saved document and syncs edits between editors', async () => {
    const a = connect(SEEDED, 'owner-token')
    const b = connect(SEEDED, 'editor-token')
    await Promise.all([synced(a.provider), synced(b.provider)])
    expect(text(a.doc)).toBe('<paragraph>hello</paragraph>')
    expect(text(b.doc)).toBe('<paragraph>hello</paragraph>')

    typeInto(a.doc, ' world')
    await eventually(() => text(b.doc) === '<paragraph>hello world</paragraph>')
  })

  it('keeps concurrent edits from both people', async () => {
    const a = connect(SEEDED, 'owner-token')
    const b = connect(SEEDED, 'editor-token')
    await Promise.all([synced(a.provider), synced(b.provider)])
    typeInto(a.doc, ' A')
    typeInto(b.doc, ' B')
    await eventually(() => text(a.doc) === text(b.doc) && text(a.doc).includes(' A') && text(a.doc).includes(' B'))
  })

  it('sends a read-only viewer the edits but drops what the viewer sends', async () => {
    const owner = connect(SEEDED, 'owner-token')
    const viewer = connect(SEEDED, 'viewer-token')
    await Promise.all([synced(owner.provider), synced(viewer.provider)])

    const before = text(owner.doc)
    typeInto(viewer.doc, ' sneaky')
    typeInto(owner.doc, ' ok')
    await eventually(() => text(viewer.doc).includes(' ok'))
    await new Promise((r) => setTimeout(r, 100))
    expect(text(owner.doc)).toBe(before.replace('</paragraph>', ' ok</paragraph>'))
  })

  it('tells the client to open solo when the document has no saved JSON yet', async () => {
    const { provider } = connect(NO_JSON, 'owner-token')
    expect(await closeCode(provider)).toBe(CLOSE_NO_SAVED_JSON)
  })

  it('gives each tab its own room, seeded from that tab', async () => {
    const whole = connect(SEEDED, 'owner-token')
    const tabA = connect(`${SEEDED}/${TAB}`, 'owner-token')
    const tabB = connect(`${SEEDED}/${TAB}`, 'editor-token')
    await Promise.all([synced(whole.provider), synced(tabA.provider), synced(tabB.provider)])
    expect(text(tabA.doc)).toBe('<paragraph>chapter two</paragraph>')
    typeInto(tabA.doc, ' edited')
    await eventually(() => text(tabB.doc) === '<paragraph>chapter two edited</paragraph>')
    // The tab's room is not the document's.
    expect(text(whole.doc)).not.toContain('chapter two')
  })

  it('refuses a tab that does not exist', async () => {
    const { provider } = connect(`${SEEDED}/44444444-4444-4444-8444-444444444444`, 'owner-token')
    expect(await closeCode(provider)).toBe(4404)
  })

  it('refuses a reconnect into a room re-seeded since, so the content is not added twice', async () => {
    const a = connect(SEEDED, 'owner-token')
    await synced(a.provider)
    expect(a.provider.params.epoch).toMatch(/^[0-9a-f-]{36}$/)

    const refused = closeCode(a.provider)
    // A server restart: every room is gone; the provider reconnects on its own.
    closeAllRooms()
    const first = await refused
    // The drop itself closes abnormally; the reconnect is the one refused.
    const code = first === CLOSE_ROOM_RESET ? first : await (a.provider.shouldConnect = true, a.provider.connect(), closeCode(a.provider))
    expect(code).toBe(CLOSE_ROOM_RESET)

    const fresh = connect(SEEDED, 'editor-token')
    await synced(fresh.provider)
    expect(text(fresh.doc)).toBe('<paragraph>hello</paragraph>')
  })

  it('refuses a session that does not verify', async () => {
    const { provider } = connect(SEEDED, 'bad-token-0000')
    expect(await closeCode(provider)).toBe(CLOSE_UNAUTHORIZED)
  })
})
