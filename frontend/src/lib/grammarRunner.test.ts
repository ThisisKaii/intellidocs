import { describe, expect, it } from 'vitest'
import type { GrammarIssue } from '@/components/editor/GrammarPanel'
import { chunkGrammarBlocks, grammarBlocksKey, type GrammarBlock } from './grammarBlocks'
import { MAX_AUTO_FAILURES, nextCheckDelay, runChunkedCheck } from './grammarRunner'

/** A paragraph block of the given text. */
function block(text: string): GrammarBlock {
  return { text, kind: 'paragraph', align: 'left', centered: false }
}

/** A grammar issue that records which word it was found in. */
function issue(original: string): GrammarIssue {
  return { type: 'x', original, suggestion: original, explanation: '', actionable: true, kind: 'grammar' }
}

describe('chunkGrammarBlocks', () => {
  it('keeps document order and starts a new chunk when the target size is passed', () => {
    const chunks = chunkGrammarBlocks([block('aaaa'), block('bbbb'), block('cccc')], 8)
    expect(chunks.map((chunk) => chunk.map((b) => b.text))).toEqual([['aaaa', 'bbbb'], ['cccc']])
  })

  it('sends one oversized block alone instead of splitting or dropping it', () => {
    const chunks = chunkGrammarBlocks([block('a'), block('b'.repeat(20)), block('c')], 8)
    expect(chunks.map((chunk) => chunk.length)).toEqual([1, 1, 1])
  })

  it('returns no chunks for no blocks', () => {
    expect(chunkGrammarBlocks([])).toEqual([])
  })
})

describe('runChunkedCheck', () => {
  const chunks = [[block('one')], [block('two')], [block('three')]]

  it('reports issues in document order as chunks answer', async () => {
    const seen: string[][] = []
    const result = await runChunkedCheck({
      chunks,
      cache: new Map(),
      check: async (chunk) => [issue(chunk[0].text)],
      onProgress: (issues) => seen.push(issues.map((i) => i.original)),
    })
    expect(result.issues.map((i) => i.original)).toEqual(['one', 'two', 'three'])
    expect(result.failedChunks).toBe(0)
    expect(seen[seen.length - 1]).toEqual(['one', 'two', 'three'])
  })

  it('keeps the other chunks\' issues when one chunk fails', async () => {
    const result = await runChunkedCheck({
      chunks,
      cache: new Map(),
      check: async (chunk) => {
        if (chunk[0].text === 'two') throw new Error('timeout')
        return [issue(chunk[0].text)]
      },
      onProgress: () => undefined,
    })
    expect(result.failedChunks).toBe(1)
    expect(result.issues.map((i) => i.original)).toEqual(['one', 'three'])
  })

  it('re-sends only the chunks that have no cached answer', async () => {
    const cache = new Map<string, GrammarIssue[]>([[grammarBlocksKey(chunks[0]), [issue('one')]]])
    const sent: string[] = []
    const result = await runChunkedCheck({
      chunks,
      cache,
      check: async (chunk) => {
        sent.push(chunk[0].text)
        return [issue(chunk[0].text)]
      },
      onProgress: () => undefined,
    })
    expect(sent.sort()).toEqual(['three', 'two'])
    expect(result.issues.map((i) => i.original)).toEqual(['one', 'two', 'three'])
  })

  it('forgets cached chunks that are no longer in the document', async () => {
    const stale = grammarBlocksKey([block('deleted paragraph')])
    const cache = new Map<string, GrammarIssue[]>([[stale, [issue('deleted')]]])
    await runChunkedCheck({ chunks, cache, check: async () => [], onProgress: () => undefined })
    expect(cache.has(stale)).toBe(false)
    expect(cache.size).toBe(3)
  })
})

describe('nextCheckDelay', () => {
  const base = { delayMs: 2500, cooldownMs: 12000, now: 100000, failures: 0 }

  it('waits the normal delay when the last check was long ago', () => {
    expect(nextCheckDelay({ ...base, lastAutoAt: 0 })).toBe(2500)
  })

  it('postpones a check that falls inside the cooldown instead of dropping it', () => {
    expect(nextCheckDelay({ ...base, lastAutoAt: 95000 })).toBe(7000)
  })

  it('backs off after failures and stops after the limit', () => {
    expect(nextCheckDelay({ ...base, lastAutoAt: 100000, failures: 1 })).toBe(12000)
    expect(nextCheckDelay({ ...base, lastAutoAt: 100000, failures: 2 })).toBe(24000)
    expect(nextCheckDelay({ ...base, lastAutoAt: 100000, failures: MAX_AUTO_FAILURES })).toBeNull()
  })
})
