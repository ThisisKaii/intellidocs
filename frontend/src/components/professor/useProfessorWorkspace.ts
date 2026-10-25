import { useCallback, useEffect, useState } from 'react'
import {
  api,
  type ClassEnrollmentRecord,
  type DocumentRecord,
  type FolderRecord,
  type PlagiarismScanRecord,
} from '@/services/api'

/** One class folder with everything the dashboard shows about it. */
export interface ClassData {
  folder: FolderRecord
  submissions: DocumentRecord[]
  roster: ClassEnrollmentRecord[]
  scans: PlagiarismScanRecord[]
}

/** The professor's classes, loaded together so every panel reads the same data. */
export interface ProfessorWorkspace {
  classes: ClassData[]
  loading: boolean
  error: string
  reload: () => Promise<void>
}

/** Newest scan per document, so a rescan replaces the old score instead of adding to it. */
export function latestScanByDocument(scans: PlagiarismScanRecord[]): Map<string, PlagiarismScanRecord> {
  const latest = new Map<string, PlagiarismScanRecord>()
  for (const scan of scans) {
    const current = latest.get(scan.document_id)
    if (!current || scan.created_at > current.created_at) latest.set(scan.document_id, scan)
  }
  return latest
}

/** Load the professor's class folders with their submissions, rosters and scans. */
export function useProfessorWorkspace(userId: string | undefined): ProfessorWorkspace {
  const [classes, setClasses] = useState<ClassData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const folders = await api.folders.list()
      const owned = folders.filter((folder) => folder.folder_type === 'class' && folder.user_id === userId)
      const loaded = await Promise.all(
        owned.map(async (folder): Promise<ClassData> => {
          const [submissions, roster, scans] = await Promise.all([
            api.folders.documents(folder.folder_id).catch(() => []),
            api.folders.roster(folder.folder_id).catch(() => []),
            api.plagiarism.listFolderScans(folder.folder_id).catch(() => []),
          ])
          return { folder, submissions, roster, scans }
        }),
      )
      setClasses(loaded)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your classes')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { classes, loading, error, reload }
}
