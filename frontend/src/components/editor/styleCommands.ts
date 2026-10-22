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
 * The caret is restored to the styled block afterwards so applying a style
 * never kicks the cursor into the next paragraph.
 */
export function applyStyleCommand(
  editor: Editor | null,
  format: string,
  from?: number,
  to?: number
): void {
  if (!editor || editor.isDestroyed) return

  // Remember where the user was before the command runs; block conversions
  // (e.g. paragraph → heading) must never move the caret off the block.
  const selection = editor.state.selection
  const targetFrom = typeof from === 'number' ? from : selection.from
  const targetTo = typeof to === 'number' ? to : selection.to

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
      break
    case 'h1':
      chain
        .setHeading({ level: 1 })
        .updateAttributes('', { styleSource: 'applied_style', docRole: null })
        .run()
      break
    case 'h2':
      chain
        .setHeading({ level: 2 })
        .updateAttributes('', { styleSource: 'applied_style', docRole: null })
        .run()
      break
    case 'h3':
      chain
        .setHeading({ level: 3 })
        .updateAttributes('', { styleSource: 'applied_style', docRole: null })
        .run()
      break
    case 'title':
      // Sets the role only. Size, weight and alignment come from CSS so an
      // active preset can restyle the title, which it cannot do against the
      // inline font-size and text-align marks this used to apply.
      chain
        .setHeading({ level: 1 })
        .updateAttributes('', { styleSource: 'applied_style', docRole: 'title' })
        .run()
      break
    case 'blockquote':
      chain
        .toggleBlockquote()
        .updateAttributes('', { styleSource: 'applied_style' })
        .run()
      break
    case 'caption':
      chain
        .setParagraph()
        .setTextAlign('center')
        .setFontSize('11pt')
        .toggleItalic()
        .updateAttributes('', { styleSource: 'applied_style' })
        .run()
      break
    default:
      return
  }

  // Restore the caret inside the block the user just styled.
  const docSize = editor.state.doc.content.size
  editor
    .chain()
    .setTextSelection({ from: Math.min(targetFrom, docSize), to: Math.min(targetTo, docSize) })
    .focus()
    .run()
}
