import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/** What a block already is, read from the document. */
export interface BlockInfo {
  typeName: string
  level: number | null
  docRole: string | null
  inOrderedList: boolean
  inBulletList: boolean
  inBlockquote: boolean
}

/** How many text blocks from the top of a document can still be its title. */
const TITLE_WINDOW_BLOCKS = 8

/** Describe the text block that contains (or starts at) `pos`. */
export function describeBlock(doc: ProseMirrorNode, pos: number): BlockInfo {
  const safe = Math.max(0, Math.min(pos, doc.content.size))
  const $pos = doc.resolve(safe)
  const info: BlockInfo = {
    typeName: $pos.parent.type.name,
    level: typeof $pos.parent.attrs.level === 'number' ? ($pos.parent.attrs.level as number) : null,
    docRole: typeof $pos.parent.attrs.docRole === 'string' ? ($pos.parent.attrs.docRole as string) : null,
    inOrderedList: false,
    inBulletList: false,
    inBlockquote: false,
  }
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const name = $pos.node(depth).type.name
    if (name === 'orderedList') info.inOrderedList = true
    else if (name === 'bulletList') info.inBulletList = true
    else if (name === 'blockquote') info.inBlockquote = true
  }
  return info
}

/**
 * True when the block already has the format a suggestion proposes, so
 * proposing it again would be noise. Only structure is compared here: a
 * suggestion that carries captured styling is judged by its own caller.
 */
export function isFormatSatisfied(block: BlockInfo, format: string): boolean {
  switch (format) {
    case 'heading1':
    case 'h1':
      return block.typeName === 'heading' && block.level === 1 && block.docRole !== 'title'
    case 'heading2':
    case 'h2':
      return block.typeName === 'heading' && block.level === 2
    case 'heading3':
    case 'h3':
      return block.typeName === 'heading' && block.level === 3
    case 'title':
      return block.docRole === 'title'
    case 'orderedList':
    case 'ordered_list':
    case 'ol':
      return block.inOrderedList
    case 'bulletList':
    case 'unordered_list':
    case 'ul':
      return block.inBulletList
    case 'blockquote':
      return block.inBlockquote || block.typeName === 'blockquote'
    case 'paragraph':
    case 'body_text':
      return block.typeName === 'paragraph' && !block.inOrderedList && !block.inBulletList
    default:
      return false
  }
}

/**
 * Whether the block at `pos` is near enough to the top of the document to be
 * its title: within the first few text blocks and before any other heading.
 * ALL-CAPS lines further down are section headings, not titles.
 */
export function isTitleCandidate(doc: ProseMirrorNode, pos: number): boolean {
  let seen = 0
  let candidate = false
  let stop = false
  doc.descendants((node, nodePos) => {
    if (stop) return false
    if (!node.isTextblock) return true
    if (node.textContent.trim().length === 0) return false
    const covers = pos >= nodePos && pos <= nodePos + node.nodeSize
    if (covers) {
      candidate = seen < TITLE_WINDOW_BLOCKS
      stop = true
      return false
    }
    if (node.type.name === 'heading' && node.attrs.docRole !== 'title') {
      candidate = false
      stop = true
      return false
    }
    seen += 1
    return false
  })
  return candidate
}
