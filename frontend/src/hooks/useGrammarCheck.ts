import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { api } from '@/services/api'
import { buildGrammarResult, type GrammarIssue } from '@/components/editor/GrammarPanel'

interface UseGrammarCheckOptions {
  /** Changes whenever the document does; re-reads the editor's text. */
  text: string
  /** The editor whose text blocks are checked, one line per block. */
  editor: Editor | null
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
 * The text to check: one line per text block, so separate headings, table cells and
 * paragraphs are never read as one run-on sentence by the checker.
 */
function readCheckText(editor: Editor | null, html: string): string {
  if (editor && !editor.isDestroyed) {
    const lines: string[] = []
    editor.state.doc.descendants((node) => {
      if (!node.isTextblock) return true
      const line = node.textContent.replace(/\s+/g, ' ').trim()
      if (line) lines.push(line)
      return false
    })
    return lines.join('\n')
  }
  return html.replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ').trim()
}

/**
 * Grammar + spelling auto-check that runs whenever the document changes,
 * independent of which side-panel tab is open (so underlines never disappear).
 */
export function useGrammarCheck({
  text,
  editor,
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

  // The text is read when the timer fires, not at render time: `text` can change a
  // render before the editor's document does, so reading earlier would see stale blocks.
  useEffect(() => {
    if (!enabled || loading) return
    const timer = setTimeout(() => {
      const current = readCheckText(editor, text)
      if (current.length < 5 || current === lastTextRef.current) return
      const now = Date.now()
      if (now - lastAutoRef.current < cooldownMs) return
      lastAutoRef.current = now
      lastTextRef.current = current
      void check(current)
    }, delayMs)
    return () => clearTimeout(timer)
  }, [enabled, loading, text, editor, delayMs, cooldownMs, check])

  const runCheck = useCallback(async (): Promise<void> => {
    const current = readCheckText(editor, text)
    lastAutoRef.current = Date.now()
    lastTextRef.current = current
    await check(current)
  }, [check, editor, text])

  return { loading, error, lastCheckedAt, runCheck }
}
