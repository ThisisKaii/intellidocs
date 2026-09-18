import type { Editor } from '@tiptap/react'

/** A style tile shown in the styles ribbon. */
export interface StyleItem {
  format: string
  label: string
  hint: string
}

export const STYLE_ITEMS: StyleItem[] = [
  { format: 'normal', label: 'Normal', hint: 'Plain body paragraph' },
  { format: 'h1', label: 'H1', hint: 'Chapter / major heading' },
  { format: 'h2', label: 'H2', hint: 'Section heading' },
  { format: 'h3', label: 'H3', hint: 'Subsection heading' },
  { format: 'title', label: 'Title', hint: 'Centered large title' },
  { format: 'blockquote', label: 'Quote', hint: 'Indented quotation' },
  { format: 'caption', label: 'Caption', hint: 'Centered italic caption' },
]

/**
 * Apply a style tile to the block at the current selection. When `from`/`to`
 * are provided the selection is moved there first (used by drag-and-drop).
 * Applied styles are tagged with `style_source: "applied_style"` so the
 * behavioral model can distinguish deliberate style choices (plan point 20).
 */
export function applyStyleCommand(
  editor: Editor | null,
  format: string,
  from?: number,
  to?: number
): void {
  if (!editor || editor.isDestroyed) return

  const chain = editor.chain().focus()
  if (typeof from === 'number' && typeof to === 'number') {
    chain.setTextSelection({ from, to })
  }

  switch (format) {
    case 'normal':
      chain
        .setParagraph()
        .updateAttributes('', { styleSource: 'applied_style' })
        .run()
      return
    case 'h1':
      chain
        .setHeading({ level: 1 })
        .updateAttributes('', { styleSource: 'applied_style' })
        .run()
      return
    case 'h2':
      chain
        .setHeading({ level: 2 })
        .updateAttributes('', { styleSource: 'applied_style' })
        .run()
      return
    case 'h3':
      chain
        .setHeading({ level: 3 })
        .updateAttributes('', { styleSource: 'applied_style' })
        .run()
      return
    case 'title':
      chain
        .setHeading({ level: 1 })
        .setTextAlign('center')
        .setFontSize('18pt')
        .updateAttributes('', { styleSource: 'applied_style' })
        .run()
      return
    case 'blockquote':
      chain
        .toggleBlockquote()
        .updateAttributes('', { styleSource: 'applied_style' })
        .run()
      return
    case 'caption':
      chain
        .setParagraph()
        .setTextAlign('center')
        .setFontSize('11pt')
        .toggleItalic()
        .updateAttributes('', { styleSource: 'applied_style' })
        .run()
      return
    default:
      return
  }
}
