import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { readSectionProps, type SectionProps } from '@/lib/sectionProps'
import { insetStyle } from './TableInset'

/** The document's page setup margins the paginator lays every page out with, in px. */
export interface PageMarginsPx {
  top: number
  right: number
  bottom: number
  left: number
}

/** How far a section's text column sits from the page setup's, per side (px). */
interface Shift {
  left: number
  right: number
  top: number
}

/** Smaller differences are layout noise; the converter ignored them too. */
const MIN_SHIFT_PX = 4

const sectionLayoutKey = new PluginKey<DecorationSet>('sectionLayout')
const REFRESH = 'sectionLayout:refresh'

function shiftOf(props: SectionProps | null, page: PageMarginsPx, startsPage: boolean): Shift | null {
  if (!props) return null
  const side = (value: number): number => (Math.abs(value) >= MIN_SHIFT_PX ? value : 0)
  const shift = {
    left: side(props.margins.left - page.left),
    right: side(props.margins.right - page.right),
    top: startsPage ? side(props.margins.top - page.top) : 0,
  }
  return shift.left || shift.right || shift.top ? shift : null
}

/** A px length from an inline style (`margin-left:12.5px`), or 0 when the style does not set it. */
function stylePx(style: unknown, property: string): number {
  if (typeof style !== 'string') return 0
  const found = new RegExp(`(?:^|[;\\s])${property}:\\s*(-?[\\d.]+)px`).exec(style)
  return found ? Number(found[1]) : 0
}

const round = (value: number): number => Math.round(value * 10) / 10

/** One decoration to apply: the node at `pos`, and the inline style that moves it. */
export interface SectionDecoration {
  pos: number
  end: number
  style: string
}

/**
 * Where each Word section's own margins put its blocks, as decorations: the paginator has one page
 * setup, so a section whose margins differ has its blocks moved by the difference. These are the
 * rules the converter used to bake into every block's style (`_shift_sections`):
 * - paragraphs and headings (top level, in list items, in wrap blocks) move left/right; the section's
 *   first block (blank or not: Word's top margin is above its first line) also moves by the top
 *   difference when the section starts a page;
 * - a list item drawn with Word's marker moves its marker (`--mx`) with its text;
 * - a top-level table is moved and narrowed by its inset;
 * - columns, quotes and table contents are left where they are.
 * Nothing is written to the document: a block added or pasted into a section is moved like the rest.
 */
export function sectionDecorations(doc: ProseMirrorNode, page: PageMarginsPx | null): SectionDecoration[] {
  if (!page) return []
  const out: SectionDecoration[] = []
  let shift: Shift | null = null
  let firstBlock = true

  const startSection = (props: unknown, startsPage: boolean): void => {
    shift = shiftOf(readSectionProps(props), page, startsPage)
    firstBlock = true
  }

  const paragraph = (node: ProseMirrorNode, pos: number): void => {
    if (!shift) return
    const parts: string[] = []
    if (shift.left) parts.push(`margin-left:${round(stylePx(node.attrs.style, 'margin-left') + shift.left)}px`)
    if (shift.right) parts.push(`margin-right:${round(stylePx(node.attrs.style, 'margin-right') + shift.right)}px`)
    if (firstBlock && shift.top) parts.push(`margin-top:${round(stylePx(node.attrs.style, 'margin-top') + shift.top)}px`)
    firstBlock = false
    if (parts.length) out.push({ pos, end: pos + node.nodeSize, style: parts.join(';') })
  }

  const list = (node: ProseMirrorNode, pos: number): void => {
    node.forEach((child, offset) => {
      const at = pos + 1 + offset
      if (child.type.name === 'listItem') {
        const markerX = child.attrs.markerX === null ? NaN : Number(child.attrs.markerX)
        if (shift && shift.left && Number.isFinite(markerX)) {
          out.push({ pos: at, end: at + child.nodeSize, style: `--mx:${round(markerX + shift.left)}px` })
        }
        list(child, at)
      } else if (child.type.name === 'paragraph' || child.type.name === 'heading') {
        paragraph(child, at)
      } else if (child.type.name === 'orderedList' || child.type.name === 'bulletList') {
        list(child, at)
      }
    })
  }

  doc.forEach((node, pos, index) => {
    const name = node.type.name
    if (index === 0 && name === 'sectionMark' && node.attrs.section === 0) {
      startSection(node.attrs.sectionProps, true)
    } else if (name === 'sectionMark') {
      startSection(node.attrs.sectionProps, false)
    } else if (name === 'pageBreak' && node.attrs.section !== null) {
      startSection(node.attrs.sectionProps, true)
    } else if (name === 'paragraph' || name === 'heading') {
      paragraph(node, pos)
    } else if (name === 'orderedList' || name === 'bulletList') {
      list(node, pos)
    } else if (name === 'wrapBlock') {
      node.forEach((child, offset) => {
        if (child.type.name === 'paragraph' || child.type.name === 'heading') paragraph(child, pos + 1 + offset)
      })
    } else if (name === 'table' && shift) {
      const current: Shift = shift
      const inset = { left: current.left, right: current.right, top: firstBlock ? current.top : 0 }
      firstBlock = false
      if (inset.left || inset.right || inset.top) out.push({ pos, end: pos + node.nodeSize, style: insetStyle(inset) })
    }
  })
  return out
}

function decorationSet(doc: ProseMirrorNode, page: PageMarginsPx | null): DecorationSet {
  const items = sectionDecorations(doc, page)
  return DecorationSet.create(doc, items.map((item) => Decoration.node(item.pos, item.end, { style: item.style })))
}

interface SectionLayoutStorage {
  pageMargins: PageMarginsPx | null
}

/**
 * Draws each Word section's margins (carried by its section break, see lib/sectionProps) as node
 * decorations. The host sets the page setup it paginates with through `setSectionPageMargins`.
 */
export const SectionLayout = Extension.create<Record<string, never>, SectionLayoutStorage>({
  name: 'sectionLayout',

  addStorage() {
    return { pageMargins: null }
  },

  addCommands() {
    return {
      setSectionPageMargins:
        (margins: PageMarginsPx | null) =>
        ({ tr, dispatch }) => {
          this.storage.pageMargins = margins
          if (dispatch) dispatch(tr.setMeta(REFRESH, true).setMeta('addToHistory', false))
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage
    return [
      new Plugin<DecorationSet>({
        key: sectionLayoutKey,
        state: {
          init: (_config, state) => decorationSet(state.doc, storage.pageMargins),
          apply: (tr, previous) =>
            tr.docChanged || tr.getMeta(REFRESH) ? decorationSet(tr.doc, storage.pageMargins) : previous,
        },
        props: { decorations: (state) => sectionLayoutKey.getState(state) },
      }),
    ]
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sectionLayout: {
      /** The page setup margins (px) the document is paginated with; null turns section shifts off. */
      setSectionPageMargins: (margins: PageMarginsPx | null) => ReturnType
    }
  }
}
