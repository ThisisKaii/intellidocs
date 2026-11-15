import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/react'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'

import { editorExtensions } from '@/components/editor/TiptapEditor'
import { findBodyDeviations } from '../bodyConsistency'
import { findShortLineDeviations } from '../shortLineConsistency'
import { presetRulesFor } from '../presetRules'

// The page-break plugin watches for layout changes; jsdom has no layout to watch.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let editor: Editor | null = null
afterEach(() => editor?.destroy())

function open(name: string): Editor {
  const html = gunzipSync(readFileSync(resolve(__dirname, `../../../../tests/fixtures/import_baselines/editor_json/${name}.html.gz`))).toString('utf-8')
  editor = new Editor({ extensions: editorExtensions, content: html })
  return editor
}

describe('UCLM text sizes: 11pt body and section headings, 12pt chapter headings', () => {
  it('flags 12pt paragraphs in an 11pt thesis body', { timeout: 30000 }, () => {
    const ed = open('V2 INTELLIDOCS (2).docx')
    const sized = findBodyDeviations(ed.state.doc, presetRulesFor('uclm_capstone')?.body ?? null).deviations.filter((deviation) =>
      deviation.differences.includes('12pt instead of 11pt'),
    )
    expect(sized.map((deviation) => deviation.text.slice(0, 20))).toEqual([
      'Talk-to-Your-Slides ',
      'In contrast, Intelli',
      'CoEdIT is an instruc',
      'In contrast, Intelli',
    ])
    expect(sized.every((deviation) => deviation.fix.fontSize === 11)).toBe(true)
  })

  it('sets 12pt section headings to 11pt and leaves the 12pt chapter headings alone', { timeout: 30000 }, () => {
    const ed = open('V2 INTELLIDOCS (2).docx')
    const lines = findShortLineDeviations(ed.state.doc, presetRulesFor('uclm_capstone')?.lines ?? null, { titlePageAlign: 'center', frontLabelAlign: 'center' })
    const sizes = lines.filter((line) => line.fix.sizePt !== undefined).map((line) => [line.text, line.fix.sizePt])
    expect(sizes).toEqual([
      ['Rationale of the Study', 11],
      ['Scope and Limitations of the Study', 11],
    ])
  })

  it('has the preset ask for 11pt section headings and 12pt chapter headings', () => {
    const rules = presetRulesFor('uclm_capstone')
    expect(rules?.body.fontSizePt).toBe(11)
    expect(rules?.lines.headings[1].fontSizePt).toBe(12)
    expect(rules?.lines.headings[2].fontSizePt).toBe(11)
    expect(rules?.lines.headings[3].fontSizePt).toBe(11)
  })
})
