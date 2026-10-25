import { Node } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

const PAGE_BREAK_SELECTOR = '.intellidocs-page-break'
const BREAKER_SELECTOR = '.breaker'
// A break this close under a page boundary already sits at the top of a page.
const AT_PAGE_TOP_TOLERANCE_PX = 6
// Height changes below this are layout noise; ignoring them keeps the pass convergent.
const HEIGHT_EPSILON_PX = 1

/**
 * Size every page-break spacer so the content after it starts on the next page.
 *
 * tiptap-pagination-plus only breaks pages when content overflows, so the spacer
 * must fill the rest of its page itself. Its height is derived from the page
 * grid alone (previous `.breaker` bottom = page body top, body height = gap
 * between consecutive breakers) and NOT from its own current height, so it
 * converges in one pass even when a zoom change left it stale. Heights are
 * written to the DOM only, never to the document, so this cannot trigger a
 * transaction or an autosave.
 */
function layoutPageBreaks(root: HTMLElement): void {
  // CSS `zoom` on the canvas makes getBoundingClientRect() report zoomed px while
  // style.height is unzoomed; divide by the live zoom so both are in the same unit.
  const scale = root.offsetWidth > 0 ? root.getBoundingClientRect().width / root.offsetWidth : 1
  // The paginator keeps every .breaker in one wrapper, so DOM order is not
  // layout order: sort by vertical position instead.
  const breakers = Array.from(root.querySelectorAll<HTMLElement>(BREAKER_SELECTOR))
    .map((el) => el.getBoundingClientRect())
    .sort((a, b) => a.top - b.top)
  if (breakers.length < 2) return
  // Page body height: the gap between one breaker's bottom and the next one's top.
  const bodies = breakers.slice(1).map((b, i) => b.top - breakers[i].bottom).sort((a, b) => a - b)
  const body = bodies[Math.floor(bodies.length / 2)]
  for (const spacer of Array.from(root.querySelectorAll<HTMLElement>(PAGE_BREAK_SELECTOR))) {
    const rect = spacer.getBoundingClientRect()
    const previous = breakers.filter((b) => b.bottom <= rect.top + scale).pop()
    const pageTop = previous ? previous.bottom : breakers[0].top - body
    const offset = rect.top - pageTop
    const atPageTop = offset / scale < AT_PAGE_TOP_TOLERANCE_PX
    const target = atPageTop ? 0 : Math.max(0, (body - offset) / scale)
    if (Math.abs(target - spacer.offsetHeight) > HEIGHT_EPSILON_PX) spacer.style.height = `${Math.round(target)}px`
  }
}

/** Re-run the spacer layout after every paginator pass (rAF-coalesced, DOM-only). */
function watchPageBreakLayout(view: EditorView): { destroy: () => void } {
  let frame = 0
  const schedule = (): void => {
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      layoutPageBreaks(view.dom as HTMLElement)
    })
  }
  const observer = new ResizeObserver(schedule)
  observer.observe(view.dom)
  const mutations = new MutationObserver(schedule)
  mutations.observe(view.dom, { childList: true, subtree: true })
  schedule()
  return {
    destroy: (): void => {
      if (frame) window.cancelAnimationFrame(frame)
      observer.disconnect()
      mutations.disconnect()
    },
  }
}

/**
 * Page-break block node. Imported Word/PDF documents arrive as
 * `<hr class="page-break">` and persist as `<div class="intellidocs-page-break">`;
 * at runtime each one is stretched to the end of its page (see layoutPageBreaks).
 */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: false,
  defining: true,
  // Must outrank the StarterKit horizontalRule rule (priority 100): parse
  // rules are matched in registration order, and `<hr class="page-break">`
  // matches both — first match wins, so this rule has to come first or the
  // class is stripped and the break degrades to a plain horizontal rule.
  priority: 110,

  addAttributes() {
    return {
      height: {
        default: 0,
      },
      // The Word section this page starts (imports): its header, footer and page
      // numbering are looked up from it. Null for an ordinary page break.
      section: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute('data-section')
          return value === null || value === '' ? null : Number(value)
        },
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'div.intellidocs-page-break' },
      // Imported DOCX/PDF documents carry page breaks as
      // `<hr class="page-break">`. Without this rule they parsed as plain
      // horizontal rules and lost the page-break class on the next save.
      { tag: 'hr.page-break' },
    ]
  },

  renderHTML({ node }) {
    const section = typeof node.attrs.section === 'number' ? { 'data-section': String(node.attrs.section) } : {}
    return ['div', { class: 'intellidocs-page-break', style: `height:${node.attrs.height}px`, ...section }]
  },

  // A node view keeps the same DOM element across paginator redraws, so the
  // runtime height written by layoutPageBreaks is not reset by ProseMirror.
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div')
      dom.className = 'intellidocs-page-break'
      dom.style.height = '0px'
      if (typeof node.attrs.section === 'number') dom.dataset.section = String(node.attrs.section)
      return { dom }
    }
  },

  addProseMirrorPlugins() {
    return [new Plugin({ view: (view: EditorView) => watchPageBreakLayout(view) })]
  },
})
