import { Editor } from '@tiptap/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { editorExtensions } from '@/components/editor/TiptapEditor'
import { blockStyleFor, describePresetGap, findBodyDeviations, type PresetBodyRules } from '../bodyConsistency'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
})

const SENTENCE = 'This sentence is long enough to count as running body text in the thesis document.'
const BODY_STYLE = 'text-align:justify; line-height:2; text-indent:0.5in'
const UCLM: PresetBodyRules = { name: 'UCLM Capstone (Thesis)', fontSizePt: 12, lineHeight: 2, firstIndentPt: 36 }

/** A document with a cover line, a chapter heading and `count` justified body paragraphs, with `extra` appended. */
function documentHtml(count: number, extra = '', style = 'text-align:justify'): string {
  const body = Array.from({ length: count }, (_, i) => `<p style="${style}">${SENTENCE} ${i}</p>`).join('')
  return `<p style="text-align:center">A cover line that is long enough to pass for prose but belongs to the front matter page</p><h1>INTRODUCTION</h1>${body}${extra}`
}

/** Load HTML and run the sweep over it. */
function sweep(html: string, preset: PresetBodyRules | null = null): ReturnType<typeof findBodyDeviations> {
  const editor = new Editor({ extensions: editorExtensions, content: html })
  const result = findBodyDeviations(editor.state.doc, preset)
  editor.destroy()
  return result
}

describe('findBodyDeviations', () => {
  it('flags a bold and a left-aligned paragraph among justified body text', () => {
    const odd = `<p style="text-align:justify"><strong>${SENTENCE} bold</strong></p><p>${SENTENCE} left</p>`
    const { deviations } = sweep(documentHtml(12, odd))
    expect(deviations.map((d) => d.differences[0])).toEqual(['bold', expect.stringContaining('aligned')])
  })

  it('leaves a document alone when its body text is uniform', () => {
    expect(sweep(documentHtml(12)).deviations).toEqual([])
  })

  it('ignores the front matter before the first chapter', () => {
    const { deviations } = sweep(documentHtml(12))
    expect(deviations.some((d) => d.text.startsWith('A cover line'))).toBe(false)
  })

  it('gives no verdict on a property the body is mixed on throughout', () => {
    const mixed = Array.from({ length: 10 }, (_, i) => (i % 2 ? `<p style="text-align:justify">${SENTENCE} ${i}</p>` : `<p>${SENTENCE} ${i}</p>`)).join('')
    expect(sweep(`<h1>INTRODUCTION</h1>${mixed}`).deviations).toEqual([])
  })

  it('does not look at list items', () => {
    const list = `<ul><li><p><strong>${SENTENCE} item</strong></p></li></ul>`
    expect(sweep(documentHtml(12, list)).deviations).toEqual([])
  })

  it('judges each property on its own when the body is messy in several ways at once', () => {
    // 10 clean paragraphs, then 3 bold, 2 italic and 2 right-aligned ones: no single look covers
    // 80% of the body any more, but each property still has a clear usual value.
    const odd = [
      ...[0, 1, 2].map((i) => `<p style="text-align:justify"><strong>${SENTENCE} bold ${i}</strong></p>`),
      ...[0, 1].map((i) => `<p style="text-align:justify"><em>${SENTENCE} italic ${i}</em></p>`),
      ...[0, 1].map((i) => `<p style="text-align:right">${SENTENCE} right ${i}</p>`),
    ].join('')
    const { deviations } = sweep(documentHtml(10, odd))
    expect(deviations.map((d) => d.differences)).toEqual([
      ['bold'], ['bold'], ['bold'], ['italic'], ['italic'],
      ['right-aligned instead of justify'], ['right-aligned instead of justify'],
    ])
    expect(deviations[0].fix).toEqual({ bold: false })
  })

  it('counts a paragraph that is mostly bold as bold, but not one with a few bold terms', () => {
    const mostly = `<p style="text-align:justify"><strong>${SENTENCE} mostly bold text</strong> end.</p>`
    const terms = `<p style="text-align:justify"><strong>Term.</strong> ${SENTENCE} with a run-in term</p>`
    const { deviations } = sweep(documentHtml(10, mostly + terms))
    expect(deviations.map((d) => d.text.includes('mostly bold'))).toEqual([true])
  })

  it('leaves manually numbered items alone (their hanging indent is on purpose)', () => {
    const items = `<p style="${BODY_STYLE.replace('0.5in', '-0.25in')}">1.2. ${SENTENCE}</p><p style="text-indent:0">2. ${SENTENCE}</p>`
    expect(sweep(documentHtml(10, items, BODY_STYLE)).deviations).toEqual([])
  })

  it('flags line spacing and a missing first-line indent, and builds the CSS that fixes them', () => {
    const odd = `<p style="text-align:justify; line-height:1; text-indent:0">${SENTENCE} single</p>`
    const { deviations } = sweep(documentHtml(10, odd, BODY_STYLE))
    expect(deviations).toHaveLength(1)
    expect(deviations[0].differences).toEqual(['line spacing 1 instead of 2', 'no first-line indent'])
    expect(blockStyleFor(deviations[0].fix)).toEqual({ 'line-height': '2', 'text-indent': '36pt' })
  })

  it('holds acknowledgement prose to the body look without letting it define that look', () => {
    const front = `<p>ACKNOWLEDGEMENT</p><p style="text-align:justify"><strong><em>${SENTENCE} thanks</em></strong></p>`
    const body = Array.from({ length: 10 }, (_, i) => `<p style="text-align:justify">${SENTENCE} ${i}</p>`).join('')
    const { deviations } = sweep(`${front}<h1>INTRODUCTION</h1>${body}`)
    expect(deviations.map((d) => d.differences)).toEqual([['bold', 'italic']])
  })

  it('reports where the whole body departs from the preset, once', () => {
    const body = Array.from({ length: 10 }, (_, i) => `<p style="text-align:justify; font-size:11pt; line-height:1.5; text-indent:0.5in">${SENTENCE} ${i}</p>`).join('')
    const { deviations, presetGaps, members } = sweep(`<h1>INTRODUCTION</h1>${body}`, UCLM)
    expect(deviations).toEqual([])
    expect(presetGaps.map(describePresetGap)).toEqual(['11pt text (preset: 12pt)', 'line spacing 1.5 (preset: double)'])
    expect(members).toHaveLength(10)
  })

  it('uses the preset where the document has no usual value', () => {
    // Line spacing is set on too few paragraphs to settle; the preset's double spacing decides.
    const odd = `<p style="text-align:justify; line-height:1">${SENTENCE} single</p>`
    const { deviations, source } = sweep(documentHtml(10, odd), UCLM)
    expect(source.lineHeight).toBe('preset')
    expect(deviations.map((d) => d.differences)).toEqual([['line spacing 1 instead of 2']])
  })

  it('flags extra space above a paragraph between two prose paragraphs', () => {
    const spaced = `<p style="text-align:justify; margin-top:12pt">${SENTENCE} spaced</p>`
    const { deviations } = sweep(documentHtml(10, spaced))
    expect(deviations.map((d) => d.differences)).toEqual([['12pt space above instead of 0pt']])
    expect(blockStyleFor(deviations[0].fix)).toEqual({ 'margin-top': '0pt' })
  })

  it('does not judge space above after a heading, caption, table or blank line', () => {
    const afterHeading = `<h2>Scope</h2><p style="text-align:justify; margin-top:12pt">${SENTENCE} after heading</p>`
    const afterBlank = `<p></p><p style="text-align:justify; margin-top:12pt">${SENTENCE} after blank</p>`
    expect(sweep(documentHtml(10, afterHeading + afterBlank)).deviations).toEqual([])
  })
})
