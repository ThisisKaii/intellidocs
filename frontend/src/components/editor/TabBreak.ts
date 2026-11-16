import { Node } from '@tiptap/core'

/**
 * Where a tab starts in the whole body of a document split into tabs (migration 048):
 * `<div data-tab-break="" data-tab-id="…" data-title="…"></div>`. The server writes one before every
 * tab when it rebuilds the body, and splits the body at them.
 *
 * In an editor showing the whole body it takes no room and holds no text, so the document looks
 * exactly as it would without tabs; it is kept (not dropped as an unknown block) so that saving
 * the whole body keeps every tab where it was.
 */
export const TabBreak = Node.create({
  name: 'tabBreak',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      tabId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-tab-id') || null,
        renderHTML: (attributes: Record<string, unknown>) =>
          typeof attributes.tabId === 'string' && attributes.tabId ? { 'data-tab-id': attributes.tabId } : {},
      },
      title: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-title') ?? '',
        renderHTML: (attributes: Record<string, unknown>) => ({ 'data-title': String(attributes.title ?? '') }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-tab-break]', priority: 120 }]
  },

  renderHTML({ HTMLAttributes }) {
    // No height, margin or border: the blocks around it lay out as if it were not there.
    return ['div', { 'data-tab-break': '', ...HTMLAttributes, contenteditable: 'false', style: 'height:0;margin:0;padding:0;border:0' }]
  },
})
