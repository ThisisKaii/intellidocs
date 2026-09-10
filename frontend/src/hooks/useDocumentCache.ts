import type { DocumentRecord } from '@/services/api'

const DB_NAME = 'intellidocs-cache'
const STORE = 'document-reads'
const VERSION = 1
/** Cache lifetime for a single document read (60s — long enough to feel instant on reload). */
const CACHE_TTL_MS = 60_000

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Store a freshly-fetched document read in IndexedDB with a timestamp so the
 * editor page can paint instantly before the network round-trip completes.
 */
export async function cacheDocumentRead(doc: DocumentRecord): Promise<void> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ ...doc, _cachedAt: Date.now() })
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    db.close()
  } catch {
    /* Cache is best-effort — never block the document load. */
  }
}

/** Return a cached document read if it exists and is still fresh. */
export async function getCachedDocumentRead(id: string): Promise<DocumentRecord | null> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readonly')
    const result = await new Promise<DocumentRecord | null>((resolve) => {
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => resolve((req.result as (DocumentRecord & { _cachedAt?: number }) | undefined) ?? null)
      req.onerror = () => resolve(null)
    })
    db.close()

    if (!result) return null
    const cachedAt = (result as DocumentRecord & { _cachedAt?: number })._cachedAt ?? 0
    if (Date.now() - cachedAt > CACHE_TTL_MS) return null
    return result
  } catch {
    return null
  }
}

/** Drop the cached read for a document after it is updated or trashed. */
export async function evictCachedDocument(id: string): Promise<void> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    db.close()
  } catch {
    /* best-effort */
  }
}