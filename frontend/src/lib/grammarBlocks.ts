/** The grammar API rejects payloads over 50k characters, so only the head is checked. */
export const MAX_GRAMMAR_CHARS = 50000

export interface GrammarBlock {
  text: string
  kind: 'paragraph' | 'heading' | 'listItem'
  align: string
  centered: boolean
  /** True for text inside a table cell, where lines are values and labels, not sentences. */
  inCell?: boolean
}

/** The slice of a ProseMirror node the block builder reads. */
export interface GrammarNodeLike {
  isTextblock: boolean
  textContent: string
  type: { name: string }
  attrs: Record<string, unknown>
  /** Size of the node in the document; used to know where a table cell ends. */
  nodeSize?: number
}

/** True for a table cell or header cell node (tableCell, tableHeader, apaTableCell, ...). */
function isCellNode(node: GrammarNodeLike): boolean {
  return /(Cell|Header)$/.test(node.type.name)
}

/** The slice of a ProseMirror document the block builder walks. */
export interface GrammarDocLike {
  descendants: (
    callback: (node: GrammarNodeLike, pos: number, parent: GrammarNodeLike | null) => boolean | void
  ) => void
}

/** How much of a long document the automatic check reads (about 100 pages); it is sent in chunks. */
export const MAX_DOCUMENT_GRAMMAR_CHARS = 200000

/** Target size of one request, small enough for a slow service to answer well inside its timeout. */
export const GRAMMAR_CHUNK_CHARS = 6000

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
export function buildGrammarBlocks(doc: GrammarDocLike, maxChars: number = MAX_GRAMMAR_CHARS): GrammarBlock[] {
  const blocks: GrammarBlock[] = []
  let total = 0
  // Document position where the table cell being walked ends; blocks before it are inside the cell.
  let cellEnd = -1
  doc.descendants((node, pos, parent) => {
    if (total >= maxChars) return false
    if (isCellNode(node)) {
      cellEnd = pos + (node.nodeSize ?? 0)
      return true
    }
    if (!node.isTextblock) return true
    const text = node.textContent.replace(/\s+/g, ' ').trim()
    if (text) {
      const align = typeof node.attrs.textAlign === 'string' ? node.attrs.textAlign : 'left'
      const block: GrammarBlock = { text, kind: blockKind(node, parent), align, centered: align === 'center' }
      if (pos < cellEnd) block.inCell = true
      blocks.push(block)
      total += text.length
    }
    return false
  })
  return blocks
}

/** Split plain text or HTML into one paragraph block per line (no layout hints available), up to the payload cap. */
export function textToGrammarBlocks(source: string, maxChars: number = MAX_GRAMMAR_CHARS): GrammarBlock[] {
  let total = 0
  return source
    .replace(/<\/(p|h[1-6]|li|div|tr)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .filter((line) => {
      total += line.length
      return total - line.length < maxChars
    })
    .map((text) => ({ text, kind: 'paragraph' as const, align: 'left', centered: false }))
}

/**
 * Split blocks into consecutive groups of about `maxChars` characters, keeping the document
 * order, so the first screenful is checked first and one slow answer never holds up the rest.
 * A single block longer than the target travels alone.
 */
export function chunkGrammarBlocks(blocks: GrammarBlock[], maxChars: number = GRAMMAR_CHUNK_CHARS): GrammarBlock[][] {
  const chunks: GrammarBlock[][] = []
  let current: GrammarBlock[] = []
  let size = 0
  for (const block of blocks) {
    if (current.length > 0 && size + block.text.length > maxChars) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(block)
    size += block.text.length
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

/** Total character count of the blocks' text. */
export function grammarBlocksLength(blocks: GrammarBlock[]): number {
  return blocks.reduce((sum, block) => sum + block.text.length, 0)
}

/** Stable key of the blocks (kind, centring, text), used to skip re-checking an unchanged document. */
export function grammarBlocksKey(blocks: GrammarBlock[]): string {
  return blocks.map((b) => `${b.kind}|${b.centered ? 'c' : ''}|${b.text}`).join('\n')
}
