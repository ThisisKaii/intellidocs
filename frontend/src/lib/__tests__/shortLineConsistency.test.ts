import { Editor } from '@tiptap/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { editorExtensions } from '@/components/editor/TiptapEditor'
import { findShortLineDeviations, type PresetLineRules } from '../shortLineConsistency'
import { presetRulesFor } from '../presetRules'
import { lengthToPt, mergeStyleDecls, readLineHeight } from '../inlineStyle'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
})

const UCLM: PresetLineRules = presetRulesFor('uclm_capstone')!.lines

/** Load HTML and run the sweep; returns "text: differences" lines. */
function sweep(html: string, preset: PresetLineRules | null = null): string[] {
  const editor = new Editor({ extensions: editorExtensions, content: html })
  const result = findShortLineDeviations(editor.state.doc, preset)
  editor.destroy()
  return result.map((d) => `${d.text}: ${d.differences.join(', ')}`)
}

const centered = (text: string): string => `<p style="text-align:center">${text}</p>`
const left = (text: string): string => `<p>${text}</p>`

describe('findShortLineDeviations', () => {
  it('centers a thesis title page from the preset when most of its lines were moved', () => {
    const titlePage = [centered('A Proposal Project'), left('presented to the Faculty'), left('By:'), left('Ana Reyes'), centered('Ben Cruz')].join('')
    expect(sweep(titlePage + '<h1>CHAPTER I</h1>', UCLM)).toEqual([
      'presented to the Faculty: left-aligned instead of center',
      'By:: left-aligned instead of center',
      'Ana Reyes: left-aligned instead of center',
    ])
  })

  it('leaves a title page alone without a preset that defines one (its layout is a design choice)', () => {
    const titlePage = [centered('A Proposal Project'), left('presented to the Faculty'), left('By:'), left('Ana Reyes')].join('')
    expect(sweep(titlePage + '<h1>CHAPTER I</h1>')).toEqual([])
  })

  it('finds no title page in a document that opens with a heading or with prose', () => {
    const body = Array.from({ length: 4 }, (_, i) => `<p style="text-align:justify">Body paragraph ${i} that is long enough to read as running prose in the body of the thesis document.</p>`).join('')
    expect(sweep('<h1>INTRODUCTION</h1>' + body, UCLM)).toEqual([])
    expect(sweep(body + left('A short line after the prose'), UCLM)).toEqual([])
  })

  it('sets front-matter labels like chapter headings', () => {
    const labels = [left('<strong>APPROVAL SHEET</strong>'), centered('<strong>ACKNOWLEDGEMENT</strong>'), left('<strong>DEDICATION</strong>'), centered('<strong>TABLE OF CONTENTS</strong>')].join('')
    expect(sweep('<h1>CHAPTER I</h1>' + labels, UCLM)).toEqual([
      'APPROVAL SHEET: left-aligned instead of center',
      'DEDICATION: left-aligned instead of center',
    ])
  })

  it('flags a heading that differs from the other headings of its level', () => {
    const headings = ['<h1 style="text-align:center">CHAPTER I</h1>', '<h1 style="text-align:center">CHAPTER II</h1>', '<h1>CHAPTER III</h1>', '<h1 style="text-align:center">CHAPTER IV</h1>'].join('')
    expect(sweep(headings)).toEqual(['CHAPTER III: left-aligned instead of center'])
  })

  it('does not judge two headings of a level against the preset (too few to tell)', () => {
    expect(sweep('<h3 style="text-align:justify">General Objective</h3><h3 style="text-align:center">Talk</h3>', UCLM)).toEqual([])
  })

  it('flags a caption styled unlike the others', () => {
    const captions = [centered('Figure 1: A'), centered('<em>Figure 2: B</em>'), centered('Figure 3: C'), centered('Table 1')].join('')
    expect(sweep('<h1>CHAPTER I</h1>' + captions)).toEqual(['Figure 2: B: italic'])
  })

  it("judges a chapter's bold one-line headings with its level-2 headings, by alignment", () => {
    const sub = (text: string, align: string): string => `<h2 style="text-align:${align}">${text}</h2>`
    const bold = (text: string, align: string): string => `<p style="text-align:${align}"><strong>${text}</strong></p>`
    const chapter = `<h1>CHAPTER II</h1>${sub('Behavioral Tracking', 'left')}${bold('Machine Learning Engine', 'left')}${sub('Natural Language Interface', 'center')}${bold('User Outcomes', 'center')}`
    // Two left, two centred: no usual alignment, so the preset's left-aligned sections decide.
    expect(sweep(chapter, UCLM)).toEqual([
      'Natural Language Interface: center-aligned instead of left',
      'User Outcomes: center-aligned instead of left',
    ])
    // ALL-CAPS labels and sentences are not sub-headings.
    expect(sweep(`<h1>CHAPTER II</h1>${bold('RELATED STUDIES', 'center')}${bold('This is a sentence.', 'center')}`, UCLM)).toEqual([])
  })

  it('sets a figure title like the other figure titles (the line above each figure caption)', () => {
    const figure = (title: string, n: number): string => `${centered(title)}${centered(`Figure ${n}: ${title}`)}`
    const html = `<h1>CHAPTER II</h1>${figure('<strong>Comet</strong>', 1)}${figure('<strong>CoEdIT</strong>', 2)}${figure('<strong>Talk</strong>', 3)}${figure('DocEdit', 4)}${figure('ReWriteLM', 5)}`
    expect(sweep(html)).toEqual(['DocEdit: not bold', 'ReWriteLM: not bold'])
  })

  it('sets a table title (the line under its caption) like the captions usually are', () => {
    const captions = [centered('Figure 1: A'), centered('Figure 2: B'), centered('Figure 3: C')].join('')
    expect(sweep(`<h1>CHAPTER II</h1>${captions}${left('Table 1')}${left('COMPARATIVE MATRIX')}`)).toEqual([
      'Table 1: left-aligned instead of center',
      'COMPARATIVE MATRIX: left-aligned instead of center like the captions',
    ])
  })
})

describe('inline style helpers', () => {
  it('reads lengths and line heights', () => {
    expect(lengthToPt('0.5in')).toBe(36)
    expect(lengthToPt('16px')).toBe(12)
    expect(lengthToPt('0')).toBe(0)
    expect(lengthToPt('auto')).toBeNull()
    expect(readLineHeight('text-align: justify; line-height: 2')).toBe(2)
    expect(readLineHeight('line-height: 24pt')).toBeNull()
  })

  it('merges declarations, replacing ones it sets and keeping the rest', () => {
    expect(mergeStyleDecls('text-align: justify; line-height: 1; text-indent: 0', { 'line-height': '2', 'text-indent': '36pt' }))
      .toBe('text-align: justify; line-height: 2; text-indent: 36pt')
    expect(mergeStyleDecls('line-height: 1', { 'line-height': '' })).toBeNull()
  })
})
