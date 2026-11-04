import { Node } from '@tiptap/core'
import { parseSectionPropsAttribute, sectionPropsAttribute, type SectionProps } from '@/lib/sectionProps'

/**
 * Where a continuous Word section starts: the text runs on, on the same page, with the new section's
 * properties (typically a change of columns or side margins). A section that starts on a new page is
 * carried by its `pageBreak` instead.
 *
 * It takes no room: an empty block with no height, border or padding, so the margins of the blocks
 * around it collapse through it exactly as if it were not there. It is never a page break.
 */
export const SectionMark = Node.create({
  name: 'sectionMark',
  group: 'block',
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      section: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute('data-section')
          return value === null || value === '' ? null : Number(value)
        },
        renderHTML: () => ({}),
      },
      sectionProps: {
        default: null,
        parseHTML: (element: HTMLElement) => parseSectionPropsAttribute(element),
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div.intellidocs-section-mark' }]
  },

  renderHTML({ node }) {
    const section = typeof node.attrs.section === 'number' ? { 'data-section': String(node.attrs.section) } : {}
    return [
      'div',
      {
        class: 'intellidocs-section-mark',
        contenteditable: 'false',
        // No overflow/display that starts a formatting context: the margins of the blocks around it
        // must collapse through it, or it adds space (3.3px measured on the IEEE paper).
        style: 'height:0;margin:0;padding:0;border:0',
        ...section,
        ...sectionPropsAttribute(node.attrs.sectionProps as SectionProps | null),
      },
    ]
  },
})
