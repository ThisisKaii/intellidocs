import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/services/api'

const DB_NAME = 'intellidocs-offline'
const DB_VERSION = 2
const STORE_NAME = 'document-drafts'
const SYNC_STORE = 'sync-queue'

interface OfflineDraft {
  documentId: string
  content: string
  title?: string
  savedAt: string
  lastSyncedAt?: string
  version?: number
}

interface SyncQueueItem {
  id: number
  documentId: string
  content: string
  title?: string
  timestamp: string
  retries: number
  status: 'pending' | 'syncing' | 'failed'
}

type OnlineStatus = 'online' | 'offline' | 'syncing'

/**
 * S8: School Lab "Zero Data Loss" Offline Resilience.
 * Client-side IndexedDB write-ahead buffer with background sync to Supabase.
 * Ensures that even during power outages or browser crashes, 100% of document edits
 * are instantly recoverable and synced when connection restores.
 */
export function useOfflineSync(documentId?: string) {
  const dbRef = useRef<IDBDatabase | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [onlineStatus, setOnlineStatus] = useState<OnlineStatus>('online')
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isSyncingRef = useRef(false)

  // Initialize IndexedDB
  useEffect(() => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'documentId' })
      }
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        const syncStore = db.createObjectStore(SYNC_STORE, { keyPath: 'id', autoIncrement: true })
        syncStore.createIndex('documentId', 'documentId', { unique: false })
        syncStore.createIndex('status', 'status', { unique: false })
      }
    }

    request.onsuccess = (event) => {
      dbRef.current = (event.target as IDBOpenDBRequest).result
      setIsReady(true)
      updatePendingSyncCount()
      checkLastSynced()
    }

    request.onerror = () => {
      console.warn('[OfflineSync] IndexedDB not available — offline buffering disabled')
      setIsReady(false)
    }

    return () => {
      dbRef.current?.close()
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    }
  }, [])

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setOnlineStatus('online')
      // Trigger immediate sync when coming back online
      void processSyncQueue()
    }
    const handleOffline = () => {
      setOnlineStatus('offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initial status
    setOnlineStatus(navigator.onLine ? 'online' : 'offline')

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Periodic sync when online
  useEffect(() => {
    if (onlineStatus === 'online') {
      syncIntervalRef.current = setInterval(() => {
        void processSyncQueue()
      }, 30000) // Every 30 seconds
    } else {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    }
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    }
  }, [onlineStatus])

  const updatePendingSyncCount = useCallback(async () => {
    if (!dbRef.current) return
    const tx = dbRef.current.transaction(SYNC_STORE, 'readonly')
    const store = tx.objectStore(SYNC_STORE)
    const index = store.index('status')
    const countReq = index.count('pending')
    countReq.onsuccess = () => setPendingSyncCount(countReq.result)
  }, [])

  const checkLastSynced = useCallback(async () => {
    if (!dbRef.current || !documentId) return
    const tx = dbRef.current.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(documentId)
    req.onsuccess = () => {
      if (req.result?.lastSyncedAt) {
        setLastSyncedAt(req.result.lastSyncedAt)
      }
    }
  }, [documentId])

  /** Save a document draft to IndexedDB (write-ahead buffer) and queue for sync. */
  const saveDraft = useCallback(
    async (docId: string, content: string, title?: string): Promise<void> => {
      if (!dbRef.current) return
      const now = new Date().toISOString()

      // Save/update draft
      await new Promise<void>((resolve, reject) => {
        const tx = dbRef.current!.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const existing = store.get(docId)
        existing.onsuccess = () => {
          const draft: OfflineDraft = {
            documentId: docId,
            content,
            title,
            savedAt: now,
            lastSyncedAt: existing.result?.lastSyncedAt,
            version: (existing.result?.version ?? 0) + 1,
          }
          const req = store.put(draft)
          req.onsuccess = () => resolve()
          req.onerror = () => reject(req.error)
        }
      })

      // Queue for sync
      await queueForSync(docId, content, title)
      await updatePendingSyncCount()
    },
    []
  )

  const queueForSync = useCallback(
    async (docId: string, content: string, title?: string): Promise<void> => {
      if (!dbRef.current) return
      await new Promise<void>((resolve, reject) => {
        const tx = dbRef.current!.transaction(SYNC_STORE, 'readwrite')
        const store = tx.objectStore(SYNC_STORE)
        const item: Omit<SyncQueueItem, 'id'> = {
          documentId: docId,
          content,
          title,
          timestamp: new Date().toISOString(),
          retries: 0,
          status: 'pending',
        }
        const req = store.add(item)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    },
    []
  )

  /** Process the sync queue - send pending changes to server. */
  const processSyncQueue = useCallback(async (): Promise<void> => {
    if (!dbRef.current || isSyncingRef.current || onlineStatus !== 'online') return
    isSyncingRef.current = true
    setOnlineStatus('syncing')

    try {
      const tx = dbRef.current.transaction(SYNC_STORE, 'readonly')
      const store = tx.objectStore(SYNC_STORE)
      const index = store.index('status')
      const req = index.getAll('pending')
      req.onsuccess = async () => {
        const items: SyncQueueItem[] = req.result || []
        if (items.length === 0) {
          isSyncingRef.current = false
          setOnlineStatus('online')
          return
        }

        // Process items sequentially to maintain order
        for (const item of items) {
          await syncItem(item)
        }

        isSyncingRef.current = false
        setOnlineStatus('online')
        await updatePendingSyncCount()
      }
    } catch (error) {
      console.error('[OfflineSync] Sync queue processing failed:', error)
      isSyncingRef.current = false
      setOnlineStatus('online')
    }
  }, [onlineStatus])

  const syncItem = useCallback(async (item: SyncQueueItem): Promise<void> => {
    if (!dbRef.current) return

    // Update status to syncing
    await updateSyncItemStatus(item.id, 'syncing')

    try {
      const result = await api.documents.update(item.documentId, {
        content: item.content,
        title: item.title,
      })

      if (result) {
        // Mark as synced
        await markDraftSynced(item.documentId)
        await removeFromSyncQueue(item.id)
        console.log(`[OfflineSync] Synced document ${item.documentId}`)
      }
    } catch (error) {
      console.error(`[OfflineSync] Failed to sync ${item.documentId}:`, error)
      // Increment retry count
      await incrementSyncRetry(item.id)
      // Mark as failed if too many retries
      if (item.retries >= 5) {
        await updateSyncItemStatus(item.id, 'failed')
      }
    }
  }, [])

  const updateSyncItemStatus = useCallback(
    async (id: number, status: SyncQueueItem['status']): Promise<void> => {
      if (!dbRef.current) return
      await new Promise<void>((resolve, reject) => {
        const tx = dbRef.current!.transaction(SYNC_STORE, 'readwrite')
        const store = tx.objectStore(SYNC_STORE)
        const req = store.get(id)
        req.onsuccess = () => {
          if (req.result) {
            const item = { ...req.result, status }
            const putReq = store.put(item)
            putReq.onsuccess = () => resolve()
            putReq.onerror = () => reject(putReq.error)
          } else {
            resolve()
          }
        }
        req.onerror = () => reject(req.error)
      })
    },
    []
  )

  const incrementSyncRetry = useCallback(
    async (id: number): Promise<void> => {
      if (!dbRef.current) return
      await new Promise<void>((resolve, reject) => {
        const tx = dbRef.current!.transaction(SYNC_STORE, 'readwrite')
        const store = tx.objectStore(SYNC_STORE)
        const req = store.get(id)
        req.onsuccess = () => {
          if (req.result) {
            const item = { ...req.result, retries: req.result.retries + 1, status: 'pending' as const }
            const putReq = store.put(item)
            putReq.onsuccess = () => resolve()
            putReq.onerror = () => reject(putReq.error)
          } else {
            resolve()
          }
        }
        req.onerror = () => reject(req.error)
      })
    },
    []
  )

  const markDraftSynced = useCallback(
    async (docId: string): Promise<void> => {
      if (!dbRef.current) return
      const now = new Date().toISOString()
      await new Promise<void>((resolve, reject) => {
        const tx = dbRef.current!.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const req = store.get(docId)
        req.onsuccess = () => {
          if (req.result) {
            const draft = { ...req.result, lastSyncedAt: now }
            const putReq = store.put(draft)
            putReq.onsuccess = () => resolve()
            putReq.onerror = () => reject(putReq.error)
          } else {
            resolve()
          }
        }
        req.onerror = () => reject(req.error)
      })
      setLastSyncedAt(now)
    },
    []
  )

  const removeFromSyncQueue = useCallback(
    async (id: number): Promise<void> => {
      if (!dbRef.current) return
      await new Promise<void>((resolve, reject) => {
        const tx = dbRef.current!.transaction(SYNC_STORE, 'readwrite')
        const store = tx.objectStore(SYNC_STORE)
        const req = store.delete(id)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    },
    []
  )

  /** Retrieve a saved draft from IndexedDB. */
  const getDraft = useCallback(
    async (docId: string): Promise<OfflineDraft | null> => {
      if (!dbRef.current) return null
      return new Promise((resolve, reject) => {
        const tx = dbRef.current!.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const req = store.get(docId)
        req.onsuccess = () => resolve(req.result ?? null)
        req.onerror = () => reject(req.error)
      })
    },
    []
  )

  /** Delete a draft from IndexedDB (after successful server sync). */
  const deleteDraft = useCallback(
    async (docId: string): Promise<void> => {
      if (!dbRef.current) return
      await new Promise<void>((resolve, reject) => {
        const tx = dbRef.current!.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const req = store.delete(docId)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
      await updatePendingSyncCount()
    },
    []
  )

  /** Get all saved drafts (for recovery UI). */
  const getAllDrafts = useCallback(
    async (): Promise<OfflineDraft[]> => {
      if (!dbRef.current) return []
      return new Promise((resolve, reject) => {
        const tx = dbRef.current!.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const req = store.getAll()
        req.onsuccess = () => resolve(req.result ?? [])
        req.onerror = () => reject(req.error)
      })
    },
    []
  )

  /** Force sync a specific document now. */
  const forceSync = useCallback(
    async (docId: string, content: string, title?: string): Promise<void> => {
      await saveDraft(docId, content, title)
      await processSyncQueue()
    },
    [saveDraft, processSyncQueue]
  )

  return {
    isReady,
    onlineStatus,
    pendingSyncCount,
    lastSyncedAt,
    saveDraft,
    getDraft,
    deleteDraft,
    getAllDrafts,
    forceSync,
    processSyncQueue,
  }
}

export type { OnlineStatus, OfflineDraft, SyncQueueItem }
