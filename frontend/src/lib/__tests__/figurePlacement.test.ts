import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/react'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'

import { editorExtensions } from '@/components/editor/TiptapEditor'
import { CENTER_FIGURE, FIX_CAPTION_NUMBER, UNWRAP_FIGURE, centerFigure, findFigureIssues, unwrapFigure } from '../figurePlacement'

// The page-break plugin watches for layout changes; jsdom has no layout to watch.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let editor: Editor | null = null
afterEach(() => editor?.destroy())

function open(html: string): Editor {
  editor = new Editor({ extensions: editorExtensions, content: html })
  return editor
}

function baseline(name: string): string {
  return gunzipSync(readFileSync(resolve(__dirname, `../../../../tests/fixtures/import_baselines/editor_json/${name}.html.gz`))).toString('utf-8')
}

/** Top-level blocks as short labels: IMG for pictures, WRAP for wrap blocks, else the text. */
function outline(ed: Editor, from: number, count: number): string[] {
  const out: string[] = []
  ed.state.doc.forEach((node, offset) => {
    if (offset < from || out.length >= count) return
    if (node.type.name === 'imageResize' || node.type.name === 'image') out.push('IMG')
    else if (node.type.name === 'wrapBlock') out.push('WRAP')
    else out.push(node.textContent.slice(0, 30))
  })
  return out
}

const PICTURE = 'data:image/png;base64,iVBORw0KGgo='

describe('figure placement in the sabotaged thesis', () => {
  it('finds the wrapped figures and the misnumbered captions', { timeout: 30000 }, () => {
    const ed = open(baseline('V2 INTELLIDOCS sabotage.docx'))
    const issues = findFigureIssues(ed.state.doc)
    expect(issues.filter((issue) => issue.kind === UNWRAP_FIGURE).map((issue) => issue.preview)).toEqual([
      'Figure 2: Comet',
      'Figure 3: Talk-To-Your-Slides',
    ])
    expect(issues.filter((issue) => issue.kind === FIX_CAPTION_NUMBER).map((issue) => issue.label)).toEqual([
      'Renumber Figure 4 as Figure 5',
      'Renumber Figure 3 as Figure 6',
    ])
  })

  it('puts a wrapped figure between its title and its caption', { timeout: 30000 }, () => {
    const ed = open(baseline('V2 INTELLIDOCS sabotage.docx'))
    for (const name of ['Figure 2: Comet', 'Figure 3: Talk-To-Your-Slides']) {
      const issue = findFigureIssues(ed.state.doc).find((candidate) => candidate.kind === UNWRAP_FIGURE && candidate.preview === name)
      expect(issue).toBeDefined()
      const tr = unwrapFigure(ed.state, issue!.from)
      expect(tr).not.toBeNull()
      ed.view.dispatch(tr!)
    }
    const blocks = outline(ed, 0, 100000)
    const comet = blocks.indexOf('Figure 2: Comet')
    expect(blocks.slice(comet - 2, comet + 1)).toEqual(['Comet', 'IMG', 'Figure 2: Comet'])
    const slides = blocks.indexOf('Figure 3: Talk-To-Your-Slides')
    expect(blocks.slice(slides - 2, slides + 1)).toEqual(['Talk-To-Your-Slides', 'IMG', 'Figure 3: Talk-To-Your-Slides'])
    expect(blocks).not.toContain('WRAP')
    expect(findFigureIssues(ed.state.doc).filter((issue) => issue.kind === UNWRAP_FIGURE)).toEqual([])
  })

  it('finds nothing to move in the clean thesis', { timeout: 30000 }, () => {
    const ed = open(baseline('V2 INTELLIDOCS (2).docx'))
    expect(findFigureIssues(ed.state.doc)).toEqual([])
  })
})

describe('figure alignment', () => {
  it('centers a captioned picture set to one side when the others are centered', () => {
    const ed = open(
      `<img src="${PICTURE}"><p>Figure 1: One</p>` +
        `<img src="${PICTURE}"><p>Figure 2: Two</p>` +
        `<img src="${PICTURE}" data-alignment="left" containerstyle="width: 200px; height: auto; cursor: pointer; margin: 0 auto 0 0;"><p>Figure 3: Three</p>`,
    )
    const issues = findFigureIssues(ed.state.doc).filter((issue) => issue.kind === CENTER_FIGURE)
    expect(issues.map((issue) => issue.preview)).toEqual(['Figure 3: Three'])
    ed.view.dispatch(centerFigure(ed.state, issues[0].from)!)
    expect(findFigureIssues(ed.state.doc)).toEqual([])
  })
})
