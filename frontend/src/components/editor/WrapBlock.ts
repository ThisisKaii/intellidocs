import { Node } from '@tiptap/core'

/**
 * A picture Word wraps text beside, with the paragraphs that wrap round it. Imports create it.
 *
 * The paged editor cannot float a picture in the document itself: a float may not sit above an earlier
 * float, and the paginator's page breaks are floats that open the document, so the picture would land
 * below the last page. `flow-root` gives this block its own layout context, where the picture floats
 * normally and text runs beside it and on underneath. The paginator cannot split the block, so it
 * moves to the next page whole.
 */
export const WrapBlock = Node.create({
  name: 'wrapBlock',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      // How far below the block's top the picture starts, in px: lines above it run full width.
      top: {
        default: 0,
        parseHTML: (element: HTMLElement) => Number(element.getAttribute('data-top')) || 0,
        renderHTML: (attributes: Record<string, unknown>) => ({ 'data-top': String(attributes.top) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div.intellidocs-wrap' }]
  },

  renderHTML({ node }) {
    // The set width matters. Beside a page break, which is a full-width float, a flow-root without one is
    // squeezed to no width at all and its text runs to many pages; with one it moves below the break.
    return ['div', { class: 'intellidocs-wrap', 'data-top': String(node.attrs.top), style: `display:flow-root;width:100%;--wrap-top:${Number(node.attrs.top)}px` }, 0]
  },
})
