/** The grammar API rejects payloads over 50k characters, so only the head is checked. */
export const MAX_GRAMMAR_CHARS = 50000

export interface GrammarBlock {
  text: string
  kind: 'paragraph' | 'heading' | 'listItem'
  align: string
  centered: boolean
}

/** The slice of a ProseMirror node the block builder reads. */
export interface GrammarNodeLike {
  isTextblock: boolean
  textContent: string
  type: { name: string }
  attrs: Record<string, unknown>
}

/** The slice of a ProseMirror document the block builder walks. */
export interface GrammarDocLike {
  descendants: (
    callback: (node: GrammarNodeLike, pos: number, parent: GrammarNodeLike | null) => boolean | void
  ) => void
}

/** Work out whether a text block is a heading, a list item or an ordinary paragraph. */
function blockKind(node: GrammarNodeLike, parent: GrammarNodeLike | null): GrammarBlock['kind'] {
  if (node.type.name === 'heading') return 'heading'
  if (parent?.type.name === 'listItem') return 'listItem'
  return 'paragraph'
}

/**
 * One block per non-empty text block of the document, with its kind and alignment, so
 * the checker never reads separate lines as one sentence. Stops at the payload cap.
 */
export function buildGrammarBlocks(doc: GrammarDocLike): GrammarBlock[] {
  const blocks: GrammarBlock[] = []
  let total = 0
  doc.descendants((node, _pos, parent) => {
    if (total >= MAX_GRAMMAR_CHARS) return false
    if (!node.isTextblock) return true
    const text = node.textContent.replace(/\s+/g, ' ').trim()
    if (text) {
      const align = typeof node.attrs.textAlign === 'string' ? node.attrs.textAlign : 'left'
      blocks.push({ text, kind: blockKind(node, parent), align, centered: align === 'center' })
      total += text.length
    }
    return false
  })
  return blocks
}

/** Split plain text or HTML into one paragraph block per line (no layout hints available), up to the payload cap. */
export function textToGrammarBlocks(source: string): GrammarBlock[] {
  let total = 0
  return source
    .replace(/<\/(p|h[1-6]|li|div|tr)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .filter((line) => {
      total += line.length
      return total - line.length < MAX_GRAMMAR_CHARS
    })
    .map((text) => ({ text, kind: 'paragraph' as const, align: 'left', centered: false }))
}

/** Total character count of the blocks' text. */
export function grammarBlocksLength(blocks: GrammarBlock[]): number {
  return blocks.reduce((sum, block) => sum + block.text.length, 0)
}

/** Stable key of the blocks (kind, centring, text), used to skip re-checking an unchanged document. */
export function grammarBlocksKey(blocks: GrammarBlock[]): string {
  return blocks.map((b) => `${b.kind}|${b.centered ? 'c' : ''}|${b.text}`).join('\n')
}
