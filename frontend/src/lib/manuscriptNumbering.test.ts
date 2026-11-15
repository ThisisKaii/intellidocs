import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

import { manuscriptNumberingCss } from './pageLayout'
import { firstChapterPos } from '@/components/editor/PagedEditor'

describe('manuscript page numbers', () => {
  it('hides the title page number, uses Roman numerals to Chapter 1, then restarts at 1', () => {
    const css = manuscriptNumberingCss(6, 20)
    // Page 1: no number in header or footer.
    expect(css).toContain('.rm-first-page-header .rm-page-number-plus::before { content: ""; }')
    expect(css).toContain('.rm-page-break:nth-child(n+1):nth-child(-n+1) .rm-page-number::before { content: ""; }')
    // Pages 2-5: lower-case Roman, counted on from the title page (page 2 reads ii).
    expect(css).toContain('.rm-page-break:nth-child(n+2):nth-child(-n+5) .rm-page-number::before { content: counter(page-number, lower-roman); }')
    // Chapter 1 on page 6 restarts at 1.
    expect(css).toContain('.rm-page-break:nth-child(6) { counter-set: page-number 1; }')
    expect(css).toContain('.rm-page-break:nth-child(5) { counter-set: page-number-plus 1; }')
  })

  it('numbers in Arabic after the title page when there is no Chapter 1', () => {
    const css = manuscriptNumberingCss(null, 4)
    expect(css).not.toContain('roman')
    expect(css).toContain('content: ""')
  })

  it('finds Chapter 1 past the contents entries that name it', () => {
    const editor = new Editor({
      extensions: [StarterKit],
      content:
        '<p>TABLE OF CONTENTS</p><p>CHAPTER I: INTRODUCTION 1</p><p>CHAPTER II: REVIEW 11</p>' +
        '<p>Some front matter text.</p><p>CHAPTER I</p><p>INTRODUCTION</p><p>CHAPTER II</p>',
    })
    const pos = firstChapterPos(editor.state.doc)
    expect(pos).not.toBeNull()
    expect(editor.state.doc.nodeAt(pos!)?.textContent).toBe('CHAPTER I')
    editor.destroy()
  })
})
