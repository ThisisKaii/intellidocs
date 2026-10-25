import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { api } from '@/services/api'
import { buildGrammarResult, type GrammarIssue } from '@/components/editor/GrammarPanel'
import {
  buildGrammarBlocks,
  grammarBlocksKey,
  grammarBlocksLength,
  textToGrammarBlocks,
  type GrammarBlock,
} from '@/lib/grammarBlocks'

interface UseGrammarCheckOptions {
  /** Changes whenever the document does; re-reads the editor's text. */
  text: string
  /** The editor whose text blocks are checked, one block per text block. */
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

/**
 * The blocks to check: one per text block with its kind and alignment, so separate
 * headings, title-page lines and paragraphs are never read as one run-on sentence.
 */
function readCheckBlocks(editor: Editor | null, html: string): GrammarBlock[] {
  if (editor && !editor.isDestroyed) return buildGrammarBlocks(editor.state.doc)
  return textToGrammarBlocks(html)
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
  const lastKeyRef = useRef<string>('')
  const onIssuesRef = useRef(onIssues)
  onIssuesRef.current = onIssues

  /** Check the given blocks and publish the issues. */
  const check = useCallback(async (blocks: GrammarBlock[]): Promise<void> => {
    if (grammarBlocksLength(blocks) < 5) return
    setLoading(true)
    setError(null)
    try {
      const [grammar, spelling] = await Promise.all([
        api.predictions.grammarCheck(blocks),
        api.predictions.spellCheck(blocks),
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
      const current = readCheckBlocks(editor, text)
      const key = grammarBlocksKey(current)
      if (grammarBlocksLength(current) < 5 || key === lastKeyRef.current) return
      const now = Date.now()
      if (now - lastAutoRef.current < cooldownMs) return
      lastAutoRef.current = now
      lastKeyRef.current = key
      void check(current)
    }, delayMs)
    return () => clearTimeout(timer)
  }, [enabled, loading, text, editor, delayMs, cooldownMs, check])

  const runCheck = useCallback(async (): Promise<void> => {
    const current = readCheckBlocks(editor, text)
    lastAutoRef.current = Date.now()
    lastKeyRef.current = grammarBlocksKey(current)
    await check(current)
  }, [check, editor, text])

  return { loading, error, lastCheckedAt, runCheck }
}
