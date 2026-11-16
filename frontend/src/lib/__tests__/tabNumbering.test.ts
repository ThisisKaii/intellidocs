import { describe, expect, it } from 'vitest'

import { resolveTabNumbering, splitNumbering, tabNumberingCss } from '../tabNumbering'

const tab = (tab_id: string, page_count: number, numbering: ReturnType<typeof splitNumbering> = null) => ({ tab_id, page_count, numbering })

describe('page numbers across tabs', () => {
  const manuscript = [
    tab('front', 8, splitNumbering('manuscript', 'front', false)),
    tab('ch1', 10, splitNumbering('manuscript', 'chapter', true)),
    tab('ch2', 12, splitNumbering('manuscript', 'chapter', false)),
    tab('refs', 3, splitNumbering('manuscript', 'back', false)),
  ]

  it('numbers the front matter in Roman numerals with the title page unnumbered', () => {
    expect(resolveTabNumbering(manuscript, 'front', 'arabic')).toEqual({ start: 1, format: 'roman', hideFirst: true, firstPage: 1 })
  })

  it('starts Chapter 1 at 1 and continues later chapters after it', () => {
    expect(resolveTabNumbering(manuscript, 'ch1', 'arabic')).toEqual({ start: 1, format: 'arabic', hideFirst: false, firstPage: 9 })
    expect(resolveTabNumbering(manuscript, 'ch2', 'arabic')).toEqual({ start: 11, format: 'arabic', hideFirst: false, firstPage: 19 })
    expect(resolveTabNumbering(manuscript, 'refs', 'arabic')).toMatchObject({ start: 23, format: 'arabic' })
  })

  it('continues one run through every tab when no tab restarts', () => {
    const plain = [tab('a', 5), tab('b', 7), tab('c', 2)]
    expect(resolveTabNumbering(plain, 'c', 'arabic')).toMatchObject({ start: 13, format: 'arabic', firstPage: 13 })
  })

  it('sets no numbering on a split unless the document uses manuscript numbers', () => {
    expect(splitNumbering('number', 'front', false)).toBeNull()
    expect(splitNumbering('none', 'chapter', true)).toBeNull()
  })

  it('writes CSS that starts the counter at the tab\'s first number', () => {
    const css = tabNumberingCss({ start: 11, format: 'arabic', hideFirst: false, firstPage: 19 }, 12)
    expect(css).toContain('counter-reset: page-number page-number-plus 11')
    const front = tabNumberingCss({ start: 1, format: 'roman', hideFirst: true, firstPage: 1 }, 8)
    expect(front).toContain('content: ""')
    expect(front).toContain('lower-roman')
  })
})
