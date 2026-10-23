import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/services/api'
import { buildGrammarResult, type GrammarIssue } from '@/components/editor/GrammarPanel'

interface UseGrammarCheckOptions {
  /** Document text or HTML; tags are stripped before checking. */
  text: string
  enabled: boolean
  delayMs?: number
  cooldownMs?: number
  /** Called with every fresh issue list so the editor can draw underlines. */
  onIssues: (issues: GrammarIssue[]) => void
}

interface UseGrammarCheckResult {
  loading: boolean
  error: string | null
  lastCheckedAt: number | null
  /** Run a check now, ignoring the cooldown. */
  runCheck: () => Promise<void>
}

/** The grammar API rejects payloads over 50k characters, so only the head is checked. */
const MAX_CHECK_CHARS = 50000

/**
 * Grammar + spelling auto-check that runs whenever the document changes,
 * independent of which side-panel tab is open (so underlines never disappear).
 */
export function useGrammarCheck({
  text,
  enabled,
  delayMs = 2500,
  cooldownMs = 12000,
  onIssues,
}: UseGrammarCheckOptions): UseGrammarCheckResult {
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)
  const lastAutoRef = useRef<number>(0)
  const lastTextRef = useRef<string>('')
  const onIssuesRef = useRef(onIssues)
  onIssuesRef.current = onIssues

  const plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  /** Check the given text and publish the issues. */
  const check = useCallback(async (value: string): Promise<void> => {
    if (value.length < 5) return
    setLoading(true)
    setError(null)
    try {
      const body = value.slice(0, MAX_CHECK_CHARS)
      const [grammar, spelling] = await Promise.all([
        api.predictions.grammarCheck(body),
        api.predictions.spellCheck(body),
      ])
      onIssuesRef.current(buildGrammarResult(grammar, spelling).issues)
      setLastCheckedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Grammar check failed.')
      onIssuesRef.current([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled || loading || plainText.length < 5 || plainText === lastTextRef.current) return
    const timer = setTimeout(() => {
      const now = Date.now()
      if (now - lastAutoRef.current < cooldownMs) return
      lastAutoRef.current = now
      lastTextRef.current = plainText
      void check(plainText)
    }, delayMs)
    return () => clearTimeout(timer)
  }, [enabled, loading, plainText, delayMs, cooldownMs, check])

  const runCheck = useCallback(async (): Promise<void> => {
    lastAutoRef.current = Date.now()
    lastTextRef.current = plainText
    await check(plainText)
  }, [check, plainText])

  return { loading, error, lastCheckedAt, runCheck }
}
