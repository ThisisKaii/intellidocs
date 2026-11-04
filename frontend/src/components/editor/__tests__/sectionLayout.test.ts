import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { editorExtensions } from '../TiptapEditor'
import { sectionDecorations, type PageMarginsPx } from '../SectionLayout'
import { SAMPLE_SECTION } from '@/lib/sectionProps.fixture'
import type { SectionProps } from '@/lib/sectionProps'

// The page-break plugin watches for layout changes; jsdom has no layout to watch.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** The page setup the paginator uses: 0.3in sides, 0.43in top (DM-OUHRODI's). */
const PAGE: PageMarginsPx = { top: 41.3, right: 28.8, bottom: 18.2, left: 28.8 }

function section(kind: SectionProps['kind'], margins: Partial<SectionProps['margins']>): string {
  const props: SectionProps = { ...SAMPLE_SECTION, kind, margins: { ...SAMPLE_SECTION.margins, ...margins } }
  return JSON.stringify(props).replace(/"/g, '&quot;')
}

let editor: Editor | null = null
afterEach(() => editor?.destroy())

/** Decorations for some HTML, each with the text (or type) of the node it moves. */
function decorated(html: string, page: PageMarginsPx | null = PAGE): Array<{ node: string; style: string }> {
  editor = new Editor({ extensions: editorExtensions, content: html })
  const doc = editor.state.doc
  return sectionDecorations(doc, page).map((item) => {
    const node = doc.nodeAt(item.pos)
    return { node: node?.textContent || node?.type.name || '?', style: item.style }
  })
}

const WIDE = section('nextPage', { left: 94.1, right: 75.8, top: 89.3 })

describe('sectionDecorations', () => {
  it('moves a section by its margins, adding to each block its own, and the top only on its first block', () => {
    const result = decorated(
      `<p>Before</p><div class="intellidocs-page-break" data-section="1" data-section-props="${WIDE}"></div>` +
        '<p style="margin-left:10px; margin-top:6px">First</p><p>Second</p>',
    )
    expect(result).toEqual([
      { node: 'First', style: 'margin-left:75.3px;margin-right:47px;margin-top:54px' },
      { node: 'Second', style: 'margin-left:65.3px;margin-right:47px' },
    ])
  })

  it('does not move a continuous section down: it continues the page', () => {
    const mark = section('continuous', { left: 94.1, top: 200 })
    const result = decorated(`<div class="intellidocs-section-mark" data-section="2" data-section-props="${mark}"></div><p>Runs on</p>`)
    expect(result).toEqual([{ node: 'Runs on', style: 'margin-left:65.3px;margin-right:47px' }])
  })

  it('takes section 0 from a mark at the very start, which does start a page', () => {
    const first = section('continuous', { left: 28.8, right: 28.8, top: 129.6 })
    const result = decorated(`<div class="intellidocs-section-mark" data-section="0" data-section-props="${first}"></div><p>Cover</p>`)
    expect(result).toEqual([{ node: 'Cover', style: 'margin-top:88.3px' }])
  })

  it('moves blocks added after import like the imported ones', () => {
    const html = `<div class="intellidocs-page-break" data-section="1" data-section-props="${WIDE}"></div><p>Imported</p>`
    editor = new Editor({ extensions: editorExtensions, content: html })
    editor.chain().setTextSelection(editor.state.doc.content.size - 1).splitBlock().insertContent('Typed').run()
    const moved = sectionDecorations(editor.state.doc, PAGE).map((item) => editor?.state.doc.nodeAt(item.pos)?.textContent)
    expect(moved).toEqual(['Imported', 'Typed'])
  })

  it('moves a numbered item marker with its text and insets a table', () => {
    const result = decorated(
      `<div class="intellidocs-page-break" data-section="1" data-section-props="${WIDE}"></div>` +
        '<table><tbody><tr><td><p>Cell</p></td></tr></tbody></table>' +
        '<ol><li data-mx="12"><p>Item</p></li></ol>',
    )
    expect(result).toEqual([
      { node: 'Cell', style: 'margin-left:65.3px;width:calc(100% - 112.3px);margin-top:48px' },
      { node: 'Item', style: '--mx:77.3px' },
      { node: 'Item', style: 'margin-left:65.3px;margin-right:47px' },
    ])
  })

  it('leaves column sections and table contents where they are', () => {
    const result = decorated(
      `<div class="intellidocs-page-break" data-section="1" data-section-props="${WIDE}"></div>` +
        '<div class="intellidocs-columns" data-widths="300,300"><div class="intellidocs-column"><p>In a column</p></div></div>',
    )
    expect(result).toEqual([])
  })

  it('ignores differences under 4px, unreadable properties, and documents without a page setup', () => {
    const near = section('nextPage', { left: 31, right: 30, top: 44 })
    expect(decorated(`<div class="intellidocs-page-break" data-section="1" data-section-props="${near}"></div><p>Close</p>`)).toEqual([])
    expect(decorated('<div class="intellidocs-page-break" data-section="1" data-section-props="{}"></div><p>Bad</p>')).toEqual([])
    expect(decorated(`<div class="intellidocs-page-break" data-section="1" data-section-props="${WIDE}"></div><p>x</p>`, null)).toEqual([])
  })
})
