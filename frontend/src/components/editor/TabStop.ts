import { Node } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

type TabAlign = 'left' | 'right' | 'center' | 'decimal'
type TabLeader = 'none' | 'dot' | 'middleDot' | 'hyphen' | 'underscore' | 'heavy'

interface CustomTabStop {
  pos: number
  align: TabAlign
  leader: TabLeader
}

const TAB_SELECTOR = 'span[data-tab]'
const DEFAULT_TAB_PX = 48
const WIDTH_EPSILON_PX = 0.5

/** Read the paragraph's custom tab stops (`[align, px from the text margin, leader]` tuples). */
function readTabStops(paragraph: HTMLElement): CustomTabStop[] {
  const raw = paragraph.getAttribute('data-tab-stops')
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const stops: CustomTabStop[] = []
    for (const entry of parsed as unknown[]) {
      if (!Array.isArray(entry) || typeof entry[1] !== 'number') continue
      stops.push({ align: entry[0] as TabAlign, pos: entry[1], leader: (entry[2] as TabLeader | null) ?? 'none' })
    }
    return stops.sort((x, y) => x.pos - y.pos)
  } catch {
    return []
  }
}

const DOCUMENT_POSITION_FOLLOWING = 4

/** Width in px of the content that follows a tab, up to the next tab or the paragraph end. */
function followingContentWidth(tab: HTMLElement, paragraph: HTMLElement): number {
  const range = document.createRange()
  range.setStartAfter(tab)
  const next = Array.from(paragraph.querySelectorAll<HTMLElement>(TAB_SELECTOR)).find(
    (el) => el !== tab && tab.compareDocumentPosition(el) & DOCUMENT_POSITION_FOLLOWING
  )
  if (next) range.setEndBefore(next)
  else range.setEnd(paragraph, paragraph.childNodes.length)
  return range.getBoundingClientRect().width
}

/** CSS that draws a tab leader across the tab's width. */
function leaderBackground(leader: TabLeader): string {
  if (leader === 'dot' || leader === 'middleDot') return 'radial-gradient(circle at 50% 85%, currentColor 0.7px, transparent 1px) 0 0 / 5px 100% repeat-x'
  if (leader === 'hyphen') return 'linear-gradient(currentColor, currentColor) 0 85% / 4px 1px repeat-x'
  if (leader === 'underscore' || leader === 'heavy') return 'linear-gradient(currentColor, currentColor) 0 90% / 100% 1px no-repeat'
  return 'none'
}

/**
 * Width of one tab at horizontal position `left`: Word's rule — jump to the next
 * custom stop past it, else to the next default-tab multiple; right/center stops
 * pull back by the width of the text that follows them.
 */
function tabWidth(tab: HTMLElement, paragraph: HTMLElement, left: number, stops: CustomTabStop[], defaultTab: number, lineEnd: number, scale: number): { width: number; leader: TabLeader } {
  const stop = stops.find((s) => s.pos > left + 1)
  if (!stop) return { width: (Math.floor(left / defaultTab) + 1) * defaultTab - left, leader: 'none' }
  const content = stop.align === 'right' || stop.align === 'center' ? followingContentWidth(tab, paragraph) / scale : 0
  const used = stop.align === 'right' ? content : stop.align === 'center' ? content / 2 : 0
  // A stop at (or past) the line end is clamped one px inside it so the text after it cannot wrap.
  const pos = Math.min(stop.pos, lineEnd - 1)
  return { width: Math.max(0, pos - left - used), leader: stop.leader }
}

/** Lay out every tab in the editor, paragraph by paragraph and left to right. */
function layoutTabs(root: HTMLElement): void {
  // CSS `zoom` on the canvas makes getBoundingClientRect() report zoomed px while
  // style.width is unzoomed; divide by the live zoom so both are in the same unit.
  const scale = root.offsetWidth > 0 ? root.getBoundingClientRect().width / root.offsetWidth : 1
  for (const paragraph of Array.from(root.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, h5, h6'))) {
    const tabs = Array.from(paragraph.querySelectorAll<HTMLElement>(TAB_SELECTOR))
    if (tabs.length === 0) continue
    const stops = readTabStops(paragraph)
    const defaultTab = Number(paragraph.getAttribute('data-default-tab')) || DEFAULT_TAB_PX
    const style = getComputedStyle(paragraph)
    const box = paragraph.getBoundingClientRect()
    const base = box.left - (parseFloat(style.marginLeft) || 0) * scale
    const lineEnd = (box.right - (parseFloat(style.paddingRight) || 0) * scale - base) / scale
    for (const tab of tabs) {
      const left = (tab.getBoundingClientRect().left - base) / scale
      const { width, leader } = tabWidth(tab, paragraph, left, stops, defaultTab, lineEnd, scale)
      // Write only on a real change: every style write re-flows the paginator.
      if (Math.abs(width - tab.offsetWidth) > WIDTH_EPSILON_PX) tab.style.width = `${width}px`
      const background = leaderBackground(leader)
      if (tab.style.background !== background && !(background === 'none' && tab.style.background === '')) tab.style.background = background
    }
  }
}

/** Re-run the tab layout after content or layout changes (rAF-coalesced, DOM-only). */
function watchTabLayout(view: EditorView): { destroy: () => void } {
  let frame = 0
  const schedule = (): void => {
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      layoutTabs(view.dom as HTMLElement)
    })
  }
  const observer = new ResizeObserver(schedule)
  observer.observe(view.dom)
  const mutations = new MutationObserver(schedule)
  mutations.observe(view.dom, { childList: true, subtree: true, characterData: true })
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
 * Inline tab character. Imported Word tabs arrive as `<span data-tab>`; the
 * paragraph's custom stops and default tab size travel as `data-tab-stops` /
 * `data-default-tab`, and the runtime width is computed from them.
 */
export const TabStop = Node.create({
  name: 'tab',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'span[data-tab]' }]
  },

  renderHTML() {
    return ['span', { 'data-tab': '', style: 'display:inline-block;width:0px;height:1em;vertical-align:baseline;' }]
  },

  renderText() {
    return '\t'
  },

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          tabStops: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-tab-stops'),
            renderHTML: (a: Record<string, string | null>) => (a.tabStops ? { 'data-tab-stops': a.tabStops } : {}),
          },
          defaultTab: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-default-tab'),
            renderHTML: (a: Record<string, string | null>) => (a.defaultTab ? { 'data-default-tab': a.defaultTab } : {}),
          },
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    return [new Plugin({ view: (view: EditorView) => watchTabLayout(view) })]
  },
})
