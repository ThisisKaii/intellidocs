import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ImportJob } from '@/services/api'

/** Poll cadence for an in-flight import. */
const POLL_INTERVAL_MS = 1500

/** Give up after this long so a wedged job cannot poll forever. */
const MAX_POLL_MS = 15 * 60 * 1000

export interface ImportPollState {
  job: ImportJob | null
  /** 0-100, safe to render directly in a progress bar. */
  progress: number
  /** Human-readable phase for the status line. */
  phase: string
  done: boolean
  error: string
}

/** Map a job state to the label shown next to the progress bar. */
export function phaseLabel(state: ImportJob['state']): string {
  switch (state) {
    case 'queued':
      return 'Waiting to start…'
    case 'downloading':
      return 'Downloading from Drive…'
    case 'converting':
      return 'Converting to editable text…'
    case 'done':
      return 'Import complete'
    case 'failed':
      return 'Import failed'
  }
}

/** Initial state before a job exists. */
const IDLE: ImportPollState = {
  job: null,
  progress: 0,
  phase: '',
  done: false,
  error: '',
}

/**
 * Poll an async Drive import to completion.
 *
 * The timer is cleared on unmount and whenever the job reaches a terminal
 * state, so navigating away mid-import cannot leave a request loop running.
 */
export function useImportJob(jobId: string | null): ImportPollState & {
  reset: () => void
} {
  const [state, setState] = useState<ImportPollState>(IDLE)
  const startedAt = useRef<number>(0)

  const reset = useCallback((): void => {
    setState(IDLE)
    startedAt.current = 0
  }, [])

  useEffect(() => {
    if (!jobId) {
      setState(IDLE)
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    startedAt.current = Date.now()

    async function poll(): Promise<void> {
      try {
        const job = await api.drive.getImport(jobId as string)
        if (cancelled) return

        setState({
          job,
          progress: job.state === 'done' ? 100 : job.progress,
          phase: phaseLabel(job.state),
          done: job.state === 'done',
          error: job.state === 'failed' ? job.error : '',
        })

        // done and failed are terminal: stop scheduling.
        if (job.state === 'done' || job.state === 'failed') return

        if (Date.now() - startedAt.current > MAX_POLL_MS) {
          setState((prev) => ({
            ...prev,
            done: false,
            error: 'The import is taking longer than expected. It may still finish in the background.',
          }))
          return
        }

        timer = setTimeout(() => void poll(), POLL_INTERVAL_MS)
      } catch (error) {
        if (cancelled) return
        setState((prev) => ({
          ...prev,
          done: false,
          error: error instanceof Error ? error.message : 'Failed to check import status.',
        }))
      }
    }

    void poll()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [jobId])

  return { ...state, reset }
}
