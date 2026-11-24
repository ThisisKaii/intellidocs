import type { Node as PMNode } from '@tiptap/pm/model'

/** The formatting model's labels (ml/models/base_model.pkl): only these can train the user's model. */
const MODEL_LABELS = new Set([
  'title', 'heading1', 'heading2', 'heading3', 'paragraph', 'ordered_list', 'unordered_list',
  'blockquote', 'code_block', 'reference_entry', 'caption',
])

export interface FeedbackBlock {
  /** The block's text: the prediction's features are computed from it. */
  blockText: string
  /** The format the block has now, as a model label; absent when it maps to none. */
  keptFormat?: string
}

/** A block's current format in the model's labels: its list, heading level, quote or code. */
function modelLabel(doc: PMNode, pos: number): string | undefined {
  const $pos = doc.resolve(Math.min(Math.max(pos, 0), doc.content.size))
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const name = $pos.node(depth).type.name
    if (name === 'orderedList') return 'ordered_list'
    if (name === 'bulletList') return 'unordered_list'
    if (name === 'blockquote') return 'blockquote'
  }
  const block = $pos.parent
  if (block.type.name === 'codeBlock') return 'code_block'
  if (block.type.name === 'heading') {
    const level = Number(block.attrs.level)
    return level >= 1 && level <= 3 ? `heading${level}` : undefined
  }
  if (block.type.name === 'paragraph') return 'paragraph'
  return undefined
}

/**
 * What feedback on a formatting suggestion records about its block, so the user's own model can
 * learn from it: the block's text and the format it has now (on a rejection, the format the user
 * kept, which is that block's label). Null when the range holds no text.
 */
export function feedbackBlock(doc: PMNode, range: { from: number; to: number } | null | undefined): FeedbackBlock | null {
  if (!range) return null
  const from = Math.max(0, Math.min(range.from, doc.content.size))
  const to = Math.max(from, Math.min(range.to, doc.content.size))
  const blockText = doc.textBetween(from, to, ' ').trim().slice(0, 2000)
  if (!blockText) return null
  const label = modelLabel(doc, from + 1)
  return label && MODEL_LABELS.has(label) ? { blockText, keptFormat: label } : { blockText }
}
