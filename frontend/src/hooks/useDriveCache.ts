import useSWR from 'swr'
import { api, type DocumentRecord, type FolderRecord } from '@/services/api'

const KEY = 'drive-cache'

interface DriveCache {
  documents: DocumentRecord[]
  folders: FolderRecord[]
  trash: DocumentRecord[]
}

/**
 * Load all three document lists together.
 * Kept outside the hook so shared fetches can be triggered imperatively.
 */
async function loadAll(): Promise<DriveCache> {
  const [documents, folders, trash] = await Promise.all([
    api.documents.list(),
    api.folders.list(),
    api.documents.trash(),
  ])
  return { documents, folders, trash }
}

/**
 * SWR-backed cache for the document listing. Returns instantly when the same
 * lists were loaded earlier this session, revalidating in the background
 * (plan point 11 — "SWR instant cache"). Exposes a shared `refresh` so any
 * action can trigger a re-fetch of the same cache entry.
 */
export function useDriveCache(): {
  data: DriveCache | undefined
  isLoading: boolean
  error: string
  refresh: () => Promise<void>
} {
  const { data, isLoading, error, mutate } = useSWR<DriveCache, Error>(KEY, loadAll, {
    revalidateOnFocus: false,
    dedupingInterval: 15000,
  })

  let message = ''
  if (error) message = error.message

  return {
    data,
    isLoading,
    error: message,
    refresh: async () => {
      await mutate(loadAll(), { optimisticData: data, rollbackOnError: true })
    },
  }
}