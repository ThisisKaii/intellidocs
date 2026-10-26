import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { decidePushes, type FlowBlock, type PageGrid } from '@/lib/pageFlow'

const pageFlowKey = new PluginKey<DecorationSet>('pageFlow')

/** Passes allowed per settle: a push can expose a new violation further down, but never forever. */
const MAX_PASSES = 4
/** Quiet time after typing before the spacers are recomputed from scratch. */
const IDLE_MS = 400

/** A block pushed down by padding added above its first line (a decoration, never a document change). */
interface FlowPush {
  from: number
  to: number
  height: number
  /** A widow: a spacer inside the paragraph, at the start of its second-to-last line. */
  inline?: boolean
}

/** An inline spacer as wide as the line: it takes a line of its own and moves the text after it down. */
function inlineSpacer(height: number): HTMLElement {
  const el = document.createElement('span')
  el.className = 'intellidocs-flow-spacer'
  el.setAttribute('contenteditable', 'false')
  el.style.cssText = `display:inline-block;width:100%;height:${Math.round(height)}px;vertical-align:top;pointer-events:none`
  return el
}

/** One measured line box of a text block. */
interface Line {
  top: number
  left: number
}

/** The line boxes of an element, top to bottom, from the rectangles of its text. */
function measureLines(el: HTMLElement, originTop: number, scale: number): Line[] {
  const range = document.createRange()
  range.selectNodeContents(el)
  const rows = new Map<number, Line>()
  for (const rect of Array.from(range.getClientRects())) {
    if (rect.width < 1 || rect.height < 1) continue
    const top = Math.round((rect.top - originTop) / scale)
    const near = Array.from(rows.keys()).find((key) => Math.abs(key - top) < 4)
    if (near === undefined) rows.set(top, { top, left: rect.left })
    else if (rect.left < (rows.get(near) as Line).left) (rows.get(near) as Line).left = rect.left
  }
  return Array.from(rows.values()).sort((a, b) => a.top - b.top)
}

/** The page grid from the pagination library's CSS variables. */
function readGrid(dom: HTMLElement): PageGrid | null {
  const style = getComputedStyle(dom)
  const read = (name: string): number => parseFloat(style.getPropertyValue(name))
  const pageHeight = read('--rm-page-height')
  const marginTop = read('--rm-margin-top')
  const marginBottom = read('--rm-margin-bottom')
  if (!Number.isFinite(pageHeight) || !Number.isFinite(marginTop) || !Number.isFinite(marginBottom)) return null
  return { pitch: pageHeight + 40, pageHeight, marginTop, marginBottom }
}

/**
 * Word keeps a lone line from sitting at the bottom or top of a page and keeps a
 * heading with its text; the paginator only breaks where content overflows.
 * This plugin measures the laid-out pages and adds spacer widgets (decorations,
 * never document changes, so nothing is saved) that move such lines to the next
 * page. Spacers are cleared and recomputed whenever the document has been edited.
 */
export const PageFlowExtension = Extension.create<{ enabled: boolean }>({
  name: 'pageFlow',

  // Off by default: on documents laid out page by page (PDF imports) a pushed line spills onto an
  // extra page, so Word's rule only helps flowing documents. Enable per editor with `.configure({ enabled: true })`.
  addOptions() {
    return { enabled: false }
  },

  // The host page turns the rules on per document (not for PDF imports, which are laid out page by page).
  addStorage() {
    return { enabled: false }
  },

  addProseMirrorPlugins() {
    if (!this.options.enabled) return []
    const storage = this.storage
    return [
      new Plugin<DecorationSet>({
        key: pageFlowKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, previous) {
            const meta = tr.getMeta(pageFlowKey) as { pushes?: FlowPush[]; clear?: boolean } | undefined
            if (meta?.clear) return DecorationSet.empty
            if (meta?.pushes) {
              const added = meta.pushes.map((push) =>
                push.inline
                  ? Decoration.widget(push.from, () => inlineSpacer(push.height), { side: -1, key: `flow-${push.from}` })
                  : Decoration.node(push.from, push.to, {
                      class: 'intellidocs-flow-push',
                      style: `padding-top:${Math.round(push.height)}px`,
                    }),
              )
              return previous.add(tr.doc, added)
            }
            return previous.map(tr.mapping, tr.doc)
          },
        },
        props: { decorations: (state) => pageFlowKey.getState(state) },
        view: (view) => watchPageFlow(view, () => storage.enabled),
      }),
    ]
  },
})

/** Run the flow pass after the paginator has settled and after edits go quiet. */
function watchPageFlow(view: EditorView, isEnabled: () => boolean): { update: (view: EditorView, previous: EditorState) => void; destroy: () => void } {
  let frame = 0
  let idleTimer = 0
  let passes = 0
  let destroyed = false
  let working = false

  const hasSpacers = (): boolean => (pageFlowKey.getState(view.state)?.find().length ?? 0) > 0

  const measure = (): { grid: PageGrid; blocks: FlowBlock[]; elements: HTMLElement[]; lines: Line[][] } | null => {
    const dom = view.dom as HTMLElement
    if (!dom.classList.contains('rm-with-pagination') || dom.classList.contains('ieee-columns-draft')) return null
    const grid = readGrid(dom)
    if (!grid) return null
    const rect = dom.getBoundingClientRect()
    const scale = dom.offsetWidth > 0 ? rect.width / dom.offsetWidth : 1
    const elements = Array.from(dom.children).filter((child): child is HTMLElement => child.matches('p, h1, h2, h3, h4, h5, h6') && !!child.textContent?.trim())
    const lines = elements.map((el) => measureLines(el, rect.top, scale))
    const blocks: FlowBlock[] = elements.map((el, index) => ({
      kind: el.tagName === 'P' ? 'paragraph' : 'heading',
      lineTops: lines[index].map((line) => line.top),
      lineHeight: parseFloat(getComputedStyle(el).lineHeight) / scale || 20,
    }))
    return { grid, blocks, elements, lines }
  }

  const run = (): void => {
    frame = 0
    if (destroyed || working || view.composing || !isEnabled()) return
    const measured = measure()
    if (!measured) return
    const pushes = decidePushes(measured.grid, measured.blocks)
    if (pushes.length === 0 || passes >= MAX_PASSES) return
    passes += 1
    const added: FlowPush[] = []
    for (const push of pushes) {
      const el = measured.elements[push.block]
      if (push.line !== 0) {
        // Widow: an inline spacer where the second-to-last line starts (a block one makes the paginator loop).
        const line = measured.lines[push.block][push.line]
        const rect = (view.dom as HTMLElement).getBoundingClientRect()
        const scale = (view.dom as HTMLElement).offsetWidth > 0 ? rect.width / (view.dom as HTMLElement).offsetWidth : 1
        const found = view.posAtCoords({ left: line.left + 2, top: rect.top + line.top * scale + 2 })
        if (!found) continue
        const present = pageFlowKey.getState(view.state)?.find(found.pos, found.pos).length ?? 0
        if (present === 0) added.push({ from: found.pos, to: found.pos, height: push.height, inline: true })
        continue
      }
      const inside = view.posAtDOM(el, 0)
      const from = inside - 1
      const node = from >= 0 ? view.state.doc.nodeAt(from) : null
      if (!node) continue
      // A push already stands on this block: a second one would only move it a page further.
      const present = pageFlowKey.getState(view.state)?.find(from, from + node.nodeSize).length ?? 0
      if (present === 0) added.push({ from, to: from + node.nodeSize, height: push.height })
    }
    if (added.length === 0) return
    working = true
    view.dispatch(view.state.tr.setMeta(pageFlowKey, { pushes: added }).setMeta('addToHistory', false))
    working = false
    schedule(60)
  }

  const schedule = (delay = 0): void => {
    if (frame) return
    frame = window.setTimeout(() => window.requestAnimationFrame(run), delay)
  }

  // After edits go quiet, drop the spacers and measure the natural layout again.
  const recompute = (): void => {
    idleTimer = 0
    if (destroyed || !view.dom.isConnected) return
    passes = 0
    if (hasSpacers()) {
      view.dispatch(view.state.tr.setMeta(pageFlowKey, { clear: true }).setMeta('addToHistory', false))
      schedule(120)
    } else {
      schedule()
    }
  }

  const resize = new ResizeObserver(() => {
    if (!idleTimer && passes < MAX_PASSES) schedule(80)
  })
  resize.observe(view.dom)
  schedule(400)

  return {
    update: (updated, previous) => {
      // Only edits matter: the pass's own spacer transactions and the paginator's redraws must not restart it.
      if (updated.state.doc.eq(previous.doc)) return
      if (idleTimer) window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(recompute, IDLE_MS)
    },
    destroy: () => {
      destroyed = true
      resize.disconnect()
      if (frame) window.clearTimeout(frame)
      if (idleTimer) window.clearTimeout(idleTimer)
    },
  }
}
