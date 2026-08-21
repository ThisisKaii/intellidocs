import { Node } from '@tiptap/core'

/**
 * Invisible spacer block node, kept so documents saved by the old custom
 * pagination renderer still parse cleanly. The current pagination is handled
 * entirely by the tiptap-pagination-plus extension.
 */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: false,
  defining: true,

  addAttributes() {
    return {
      height: {
        default: 0,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div.intellidocs-page-break' }]
  },

  renderHTML({ node }) {
    return ['div', { class: 'intellidocs-page-break', style: `height:${node.attrs.height}px` }]
  },
})
