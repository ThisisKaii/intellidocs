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
 * The leader a tab is drawn with. A hand-made table of contents ("Title<tab>12" on a right stop with
 * no leader) gets dots, as readers expect; documents imported before the converter set the dot
 * leader itself are shown the same way, without rewriting what is stored.
 */
export function displayedLeader(stop: { align: string; leader: TabLeader } | null, isLastTab: boolean, textAfter: string): TabLeader {
  if (!stop) return 'none'
  if (stop.leader !== 'none' || stop.align !== 'right' || !isLastTab) return stop.leader
  return /^\s*(\d+|[ivxlcdm]+)\s*$/i.test(textAfter) ? 'dot' : 'none'
}

/** The text after a tab, to the paragraph's end. */
function textAfter(tab: HTMLElement, paragraph: HTMLElement): string {
  const range = document.createRange()
  range.setStartAfter(tab)
  range.setEnd(paragraph, paragraph.childNodes.length)
  return range.toString()
}

/**
 * Width of one tab at horizontal position `left`: Word's rule — jump to the next
 * custom stop past it, else to the next default-tab multiple; right/center stops
 * pull back by the width of the text that follows them.
 */
function tabWidth(tab: HTMLElement, paragraph: HTMLElement, left: number, stops: CustomTabStop[], defaultTab: number, lineEnd: number, scale: number): { width: number; stop: CustomTabStop | null } {
  const stop = stops.find((s) => s.pos > left + 1)
  if (!stop) return { width: (Math.floor(left / defaultTab) + 1) * defaultTab - left, stop: null }
  const content = stop.align === 'right' || stop.align === 'center' ? followingContentWidth(tab, paragraph) / scale : 0
  const used = stop.align === 'right' ? content : stop.align === 'center' ? content / 2 : 0
  // A stop at (or past) the line end is clamped one px inside it so the text after it cannot wrap.
  const pos = Math.min(stop.pos, lineEnd - 1)
  return { width: Math.max(0, pos - left - used), stop }
}

const PARAGRAPH_SELECTOR = 'p, h1, h2, h3, h4, h5, h6'

/** Lay out every tab in the editor, paragraph by paragraph and left to right. */
function layoutTabs(root: HTMLElement): void {
  layoutParagraphTabs(root, Array.from(root.querySelectorAll<HTMLElement>(PARAGRAPH_SELECTOR)))
}

/**
 * Lay out the tabs of these paragraphs. A tab's width depends only on its own paragraph (the text
 * before it and the paragraph's stops), so after an edit only the paragraphs that changed need it.
 */
function layoutParagraphTabs(root: HTMLElement, paragraphs: Iterable<HTMLElement>): void {
  // CSS `zoom` on the canvas makes getBoundingClientRect() report zoomed px while
  // style.width is unzoomed; divide by the live zoom so both are in the same unit.
  const scale = root.offsetWidth > 0 ? root.getBoundingClientRect().width / root.offsetWidth : 1
  interface Job {
    paragraph: HTMLElement
    tabs: HTMLElement[]
    stops: CustomTabStop[]
    defaultTab: number
    base: number
    lineEnd: number
  }
  // Measure every paragraph first (reads only).
  const jobs: Job[] = []
  for (const paragraph of paragraphs) {
    if (!paragraph.isConnected) continue
    const tabs = Array.from(paragraph.querySelectorAll<HTMLElement>(TAB_SELECTOR))
    if (tabs.length === 0) continue
    const style = getComputedStyle(paragraph)
    const box = paragraph.getBoundingClientRect()
    const base = box.left - (parseFloat(style.marginLeft) || 0) * scale
    jobs.push({
      paragraph,
      tabs,
      stops: readTabStops(paragraph),
      defaultTab: Number(paragraph.getAttribute('data-default-tab')) || DEFAULT_TAB_PX,
      base,
      lineEnd: (box.right - (parseFloat(style.paddingRight) || 0) * scale - base) / scale,
    })
  }
  // Then tab by tab across all paragraphs: read every paragraph's n-th tab, then write them all.
  // Reading after each write made the browser lay out the whole document once per tab, which took
  // most of the time opening a long document. A tab's position depends only on the tabs before it
  // in its own paragraph, which earlier rounds have already set.
  // In a table cell a tab's width can change the column widths and so move tabs in other cells:
  // those are laid out one at a time as before (writing at once), the rest in batched rounds.
  const inCell = (job: Job): boolean => job.paragraph.closest('td, th') !== null
  const batched = jobs.filter((job) => !inCell(job))
  const rounds = Math.max(0, ...batched.map((job) => job.tabs.length))
  for (let index = 0; index < rounds; index += 1) {
    const writes: Array<() => void> = []
    for (const job of batched) {
      const tab = job.tabs[index]
      if (!tab) continue
      const left = (tab.getBoundingClientRect().left - job.base) / scale
      const { width, stop } = tabWidth(tab, job.paragraph, left, job.stops, job.defaultTab, job.lineEnd, scale)
      const isLast = index === job.tabs.length - 1
      const leader = displayedLeader(stop, isLast, isLast && stop?.align === 'right' && stop.leader === 'none' ? textAfter(tab, job.paragraph) : '')
      const background = leaderBackground(leader)
      // Write only on a real change: every style write re-flows the paginator.
      const resize = Math.abs(width - tab.offsetWidth) > WIDTH_EPSILON_PX
      const repaint = tab.style.background !== background && !(background === 'none' && tab.style.background === '')
      if (resize || repaint) {
        writes.push(() => {
          if (resize) tab.style.width = `${width}px`
          if (repaint) tab.style.background = background
        })
      }
    }
    for (const write of writes) write()
  }
  for (const job of jobs.filter(inCell)) {
    // The cell may have moved when earlier cells' tabs changed: measure it again.
    const style = getComputedStyle(job.paragraph)
    const box = job.paragraph.getBoundingClientRect()
    const base = box.left - (parseFloat(style.marginLeft) || 0) * scale
    const lineEnd = (box.right - (parseFloat(style.paddingRight) || 0) * scale - base) / scale
    job.tabs.forEach((tab, index) => {
      const left = (tab.getBoundingClientRect().left - base) / scale
      const { width, stop } = tabWidth(tab, job.paragraph, left, job.stops, job.defaultTab, lineEnd, scale)
      const isLast = index === job.tabs.length - 1
      const leader = displayedLeader(stop, isLast, isLast && stop?.align === 'right' && stop.leader === 'none' ? textAfter(tab, job.paragraph) : '')
      if (Math.abs(width - tab.offsetWidth) > WIDTH_EPSILON_PX) tab.style.width = `${width}px`
      const background = leaderBackground(leader)
      if (tab.style.background !== background && !(background === 'none' && tab.style.background === '')) tab.style.background = background
    })
  }
}

/** The paragraphs a batch of DOM changes touched: the one around each change, and any added whole. */
function touchedParagraphs(records: MutationRecord[], into: Set<HTMLElement>): void {
  for (const record of records) {
    const target = record.target instanceof HTMLElement ? record.target : record.target.parentElement
    const around = target?.closest<HTMLElement>(PARAGRAPH_SELECTOR)
    if (around) into.add(around)
    record.addedNodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) return
      if (node.matches(PARAGRAPH_SELECTOR)) into.add(node)
      node.querySelectorAll<HTMLElement>(PARAGRAPH_SELECTOR).forEach((paragraph) => into.add(paragraph))
    })
  }
}

/**
 * Re-run the tab layout after content or layout changes (rAF-coalesced, DOM-only). A size change
 * lays out every tab; typing lays out only the paragraphs it changed, so a long document does not
 * measure all its tabs on every keystroke.
 */
function watchTabLayout(view: EditorView): { destroy: () => void } {
  let frame = 0
  let everything = true
  const pending = new Set<HTMLElement>()
  const schedule = (): void => {
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      const root = view.dom as HTMLElement
      if (everything) layoutTabs(root)
      else layoutParagraphTabs(root, pending)
      everything = false
      pending.clear()
    })
  }
  // Only a change of width moves tabs (zoom, page size, margins); the editor growing taller as
  // text is typed does not.
  let width = -1
  const observer = new ResizeObserver((entries) => {
    const next = Math.round(entries[entries.length - 1]?.contentRect.width ?? -1)
    if (next === width) return
    width = next
    everything = true
    schedule()
  })
  observer.observe(view.dom)
  const mutations = new MutationObserver((records) => {
    touchedParagraphs(records, pending)
    if (pending.size > 0) schedule()
  })
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
