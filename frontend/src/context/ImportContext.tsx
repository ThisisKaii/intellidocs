import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { refreshDriveCache } from '@/hooks/useDriveCache'
import { ImportToast } from '@/components/ImportToast'
import { ImportQueue, type TrackedImport } from '@/lib/importQueue'
import { api } from '@/services/api'

interface ImportContextValue {
  /** Upload files and import them in the background. */
  importFiles: (files: File[]) => void
  /** Follow a server job started elsewhere (for example a large Drive file). */
  trackJob: (jobId: string, fileName: string) => void
}

const ImportContext = createContext<ImportContextValue | null>(null)

/** Access the app-level import queue. */
export function useImports(): ImportContextValue {
  const value = useContext(ImportContext)
  if (!value) throw new Error('useImports must be used within an ImportProvider')
  return value
}

/**
 * Owns the import queue above the routes, so uploads and progress survive
 * navigation. Renders the global progress toast and re-attaches to unfinished
 * jobs after a reload.
 */
export function ImportProvider({ children }: { children: ReactNode }): JSX.Element {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<TrackedImport[]>([])
  const queueRef = useRef<ImportQueue | null>(null)

  useEffect(() => {
    const queue = new ImportQueue(
      {
        queueImport: (file) => api.documents.queueImport(file),
        getJob: (jobId) => api.documents.getImportJob(jobId),
        listJobs: () => api.documents.listImportJobs(),
      },
      window.localStorage,
      setItems,
      () => { void refreshDriveCache() }
    )
    queueRef.current = queue
    return () => {
      queue.dispose()
      queueRef.current = null
    }
  }, [])

  // Re-attach on sign-in or reload; drop everything on sign-out.
  const userId = user?.id ?? null
  useEffect(() => {
    const queue = queueRef.current
    if (!queue) return
    if (userId) void queue.reattach()
    else queue.reset()
  }, [userId])

  const importFiles = useCallback((files: File[]): void => {
    void queueRef.current?.enqueueFiles(files)
  }, [])
  const trackJob = useCallback((jobId: string, fileName: string): void => {
    queueRef.current?.trackJob(jobId, fileName)
  }, [])
  const value = useMemo<ImportContextValue>(() => ({ importFiles, trackJob }), [importFiles, trackJob])

  return (
    <ImportContext.Provider value={value}>
      {children}
      {userId && items.length > 0 && (
        <ImportToast
          items={items}
          onDismiss={(id) => queueRef.current?.dismiss(id)}
          onDismissAll={() => queueRef.current?.dismissFinished()}
          onOpen={(documentId) => navigate(`/document/${documentId}`)}
        />
      )}
    </ImportContext.Provider>
  )
}
