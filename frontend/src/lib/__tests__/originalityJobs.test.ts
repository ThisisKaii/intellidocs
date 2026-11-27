import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type WebCheckJobRecord } from '@/services/api'
import {
  clearOriginalityJobStore,
  startWebOriginalityJob,
  useWebOriginalityJob,
} from '../originalityJobs'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Probe({ documentId }: { documentId: string }): JSX.Element {
  const { job } = useWebOriginalityJob(documentId)
  return createElement(
    'div',
    null,
    job ? `${job.status}:${job.result?.overlap_percent ?? ''}` : 'idle',
  )
}

let root: Root | null = null
let host: HTMLDivElement | null = null

function mountProbe(documentId: string): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root?.render(createElement(Probe, { documentId }))
  })
  return host
}

function unmountProbe(): void {
  act(() => {
    root?.unmount()
  })
  host?.remove()
  root = null
  host = null
}

describe('originalityJobs background poller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.sessionStorage.clear()
    clearOriginalityJobStore()
  })

  afterEach(() => {
    unmountProbe()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps polling after Originality unmounts and delivers the finished report to the editor', async () => {
    const runningJob: WebCheckJobRecord = {
      jobId: 'job-123',
      documentId: 'doc-9',
      status: 'running',
      scopeLabel: 'Entire document',
      startedAt: '2026-11-28T05:00:00.000Z',
      updatedAt: '2026-11-28T05:00:00.000Z',
    }
    const completedJob: WebCheckJobRecord = {
      ...runningJob,
      status: 'completed',
      updatedAt: '2026-11-28T05:00:02.000Z',
      result: {
        overlap_percent: 18,
        passages: [],
        providers: [],
        sources: [],
        queries: 4,
        truncated: false,
      },
    }

    vi.spyOn(api.plagiarism, 'getLatestWebCheck').mockResolvedValue(null)
    vi.spyOn(api.plagiarism, 'startWebCheck').mockResolvedValue(runningJob)
    const getJobSpy = vi.spyOn(api.plagiarism, 'getWebCheckJob').mockResolvedValue(completedJob)

    // User triggers check on Originality page, then navigates away before it finishes.
    const origContainer = mountProbe('doc-9')
    await act(async () => {
      await startWebOriginalityJob('doc-9', { scope: 'all' })
    })
    expect(origContainer.textContent).toBe('running:')
    unmountProbe()

    // User is now back on Document.tsx; polling completes in the background.
    const docContainer = mountProbe('doc-9')
    expect(docContainer.textContent).toBe('running:')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })

    expect(getJobSpy).toHaveBeenCalledWith('job-123')
    expect(docContainer.textContent).toBe('completed:18')
  })
})
