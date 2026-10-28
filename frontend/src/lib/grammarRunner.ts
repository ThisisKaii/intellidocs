import type { GrammarIssue } from '@/components/editor/GrammarPanel'
import { grammarBlocksKey, type GrammarBlock } from '@/lib/grammarBlocks'

/** How many chunks are in flight at once; low so a free-tier service is not flooded. */
const CHUNK_CONCURRENCY = 2

/** After this many failed automatic attempts on the same text, wait for an edit or a manual retry. */
export const MAX_AUTO_FAILURES = 3

/** Outcome of checking a document in chunks. */
export interface ChunkedCheckResult {
  /** Issues from every chunk that answered, in document order. */
  issues: GrammarIssue[]
  /** How many chunks could not be checked. */
  failedChunks: number
}

interface ChunkedCheckOptions {
  chunks: GrammarBlock[][]
  /** Answers already known, keyed by chunk text; reused so only changed chunks are re-sent. */
  cache: Map<string, GrammarIssue[]>
  /** Check one chunk with the grammar and spelling services. */
  check: (chunk: GrammarBlock[]) => Promise<GrammarIssue[]>
  /** Called each time another chunk answers, with everything known so far in document order. */
  onProgress: (issues: GrammarIssue[]) => void
}

/**
 * Check a long document one chunk at a time, first chunk first. A chunk that fails is counted
 * but never discards what the other chunks found, and answered chunks are cached so a retry or
 * a small edit only re-sends what is missing.
 */
export async function runChunkedCheck({ chunks, cache, check, onProgress }: ChunkedCheckOptions): Promise<ChunkedCheckResult> {
  const keys = chunks.map(grammarBlocksKey)
  const results: (GrammarIssue[] | null)[] = keys.map((key) => cache.get(key) ?? null)
  const known = new Set(keys)
  for (const key of [...cache.keys()]) if (!known.has(key)) cache.delete(key)

  const publish = (): void => onProgress(results.flatMap((issues) => issues ?? []))
  if (results.some((issues) => issues !== null)) publish()

  let failedChunks = 0
  let next = 0
  /** Take the next chunk that still needs an answer until none are left. */
  async function worker(): Promise<void> {
    while (next < chunks.length) {
      const index = next++
      if (results[index] !== null) continue
      try {
        const issues = await check(chunks[index])
        results[index] = issues
        cache.set(keys[index], issues)
        publish()
      } catch {
        failedChunks += 1
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, worker))

  return { issues: results.flatMap((issues) => issues ?? []), failedChunks }
}

interface DelayInput {
  /** Normal wait after the last edit. */
  delayMs: number
  /** Minimum gap between automatic checks. */
  cooldownMs: number
  /** When the last automatic check started (epoch ms, 0 if none). */
  lastAutoAt: number
  now: number
  /** Automatic attempts on the current text that failed so far. */
  failures: number
}

/**
 * How long to wait before the next automatic check, or null to stop trying until the text
 * changes. A check that falls inside the cooldown is postponed, never dropped, and failed
 * attempts back off (cooldown, 2x, 4x).
 */
export function nextCheckDelay({ delayMs, cooldownMs, lastAutoAt, now, failures }: DelayInput): number | null {
  if (failures >= MAX_AUTO_FAILURES) return null
  const backoff = failures > 0 ? cooldownMs * 2 ** (failures - 1) : 0
  const untilCooldownEnds = lastAutoAt + Math.max(cooldownMs, backoff) - now
  return Math.max(delayMs, untilCooldownEnds)
}
