import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { api } from '@/services/api'
import { buildGrammarResult, type GrammarIssue } from '@/components/editor/GrammarPanel'
import {
  MAX_DOCUMENT_GRAMMAR_CHARS,
  buildGrammarBlocks,
  chunkGrammarBlocks,
  grammarBlocksKey,
  grammarBlocksLength,
  textToGrammarBlocks,
  type GrammarBlock,
} from '@/lib/grammarBlocks'
import { nextCheckDelay, runChunkedCheck } from '@/lib/grammarRunner'

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
  if (editor && !editor.isDestroyed) return buildGrammarBlocks(editor.state.doc, MAX_DOCUMENT_GRAMMAR_CHARS)
  return textToGrammarBlocks(html, MAX_DOCUMENT_GRAMMAR_CHARS)
}

/** Check one chunk with both services and return its issues. */
async function checkChunk(chunk: GrammarBlock[]): Promise<GrammarIssue[]> {
  const [grammar, spelling] = await Promise.all([
    api.predictions.grammarCheck(chunk),
    api.predictions.spellCheck(chunk),
  ])
  return buildGrammarResult(grammar, spelling).issues
}

/**
 * Grammar + spelling auto-check that runs whenever the document changes,
 * independent of which side-panel tab is open (so underlines never disappear).
 *
 * The document is checked in chunks, first page first, so suggestions start appearing
 * quickly and one slow or failed chunk never wipes what the others found. A failed check is
 * retried with a growing delay, and a check that lands inside the cooldown is postponed.
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
  /** Answers per chunk of text, so a retry or a small edit only re-sends what is missing. */
  const cacheRef = useRef<Map<string, GrammarIssue[]>>(new Map())
  /** Failed automatic attempts on the text the document had when they failed. */
  const failuresRef = useRef<number>(0)
  const failedTextRef = useRef<string>('')
  const textRef = useRef(text)
  textRef.current = text
  const onIssuesRef = useRef(onIssues)
  onIssuesRef.current = onIssues

  /** Check the given blocks chunk by chunk and publish the issues as they arrive. */
  const check = useCallback(async (blocks: GrammarBlock[]): Promise<void> => {
    if (grammarBlocksLength(blocks) < 5) return
    setLoading(true)
    setError(null)
    try {
      const result = await runChunkedCheck({
        chunks: chunkGrammarBlocks(blocks),
        cache: cacheRef.current,
        check: checkChunk,
        onProgress: (issues) => onIssuesRef.current(issues),
      })
      onIssuesRef.current(result.issues)
      if (result.failedChunks > 0) {
        // Allow the same text to be tried again; what was found is kept.
        lastKeyRef.current = ''
        failuresRef.current += 1
        failedTextRef.current = textRef.current
        setError(
          result.issues.length > 0
            ? 'Part of the document could not be checked yet. Showing what was found.'
            : 'Grammar check could not reach the checker. Trying again shortly.'
        )
      } else {
        failuresRef.current = 0
        setLastCheckedAt(Date.now())
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // The text is read when the timer fires, not at render time: `text` can change a
  // render before the editor's document does, so reading earlier would see stale blocks.
  useEffect(() => {
    if (!enabled || loading) return
    if (text !== failedTextRef.current) failuresRef.current = 0
    const wait = nextCheckDelay({
      delayMs,
      cooldownMs,
      lastAutoAt: lastAutoRef.current,
      now: Date.now(),
      failures: failuresRef.current,
    })
    if (wait === null) return
    const timer = setTimeout(() => {
      const current = readCheckBlocks(editor, text)
      const key = grammarBlocksKey(current)
      if (grammarBlocksLength(current) < 5 || key === lastKeyRef.current) return
      lastAutoRef.current = Date.now()
      lastKeyRef.current = key
      void check(current)
    }, wait)
    return () => clearTimeout(timer)
  }, [enabled, loading, text, editor, delayMs, cooldownMs, check])

  const runCheck = useCallback(async (): Promise<void> => {
    const current = readCheckBlocks(editor, text)
    lastAutoRef.current = Date.now()
    lastKeyRef.current = grammarBlocksKey(current)
    failuresRef.current = 0
    await check(current)
  }, [check, editor, text])

  return { loading, error, lastCheckedAt, runCheck }
}
