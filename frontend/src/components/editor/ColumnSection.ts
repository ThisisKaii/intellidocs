import { Node } from '@tiptap/core'

/**
 * A short run of blocks laid out side by side, as Word's multi-column sections with column
 * breaks are (a memo's office line on the left and its date on the right). Imports create it;
 * long multi-column sections stay single-column because the paginator cannot split a block.
 */
export const ColumnSection = Node.create({
  name: 'columnSection',
  group: 'block',
  content: 'sectionColumn+',
  isolating: true,
  defining: true,

  addAttributes() {
    return {
      // Column widths in percent, comma separated ("75.5,24.5").
      widths: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-widths') ?? '',
        renderHTML: (attributes: Record<string, unknown>) => (attributes.widths ? { 'data-widths': String(attributes.widths) } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div.intellidocs-columns' }]
  },

  renderHTML({ node }) {
    const widths = String(node.attrs.widths || '')
      .split(',')
      .filter(Boolean)
      .map((value) => `${value}fr`)
      .join(' ')
    const style = `display:grid;${widths ? `grid-template-columns:${widths};` : ''}column-gap:0`
    return ['div', { class: 'intellidocs-columns', style }, 0]
  },
})

/** One column of a column section. */
export const SectionColumn = Node.create({
  name: 'sectionColumn',
  content: 'block+',
  isolating: true,

  parseHTML() {
    return [{ tag: 'div.intellidocs-column' }]
  },

  renderHTML() {
    return ['div', { class: 'intellidocs-column', style: 'min-width:0' }, 0]
  },
})
