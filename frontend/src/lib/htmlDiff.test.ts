import { describe, expect, it } from 'vitest'
import { diffToHtml } from './htmlDiff'

const words = (count: number): string => Array.from({ length: count }, (_, i) => `word${i}`).join(' ')

describe('diffToHtml', () => {
  it('shows everything as added when the snapshot is a blank page', () => {
    const html = diffToHtml('<p></p>', `<p>${words(40)}</p>`)
    expect(html).toContain('diff-add')
    expect(html).not.toContain('diff-del')
  })

  it('shows nothing as changed when the snapshot equals the current document', () => {
    const doc = `<p>${words(300)}</p>`
    const html = diffToHtml(doc, doc)
    expect(html).not.toContain('diff-add')
    expect(html).not.toContain('diff-del')
  })

  it('marks only the real edits in a long document', () => {
    const before = `<p>${words(500)}</p>`
    const after = `<p>${words(500)} extra</p>`
    const html = diffToHtml(before, after)
    expect(html.match(/diff-add/g)).toHaveLength(1)
    expect(html).not.toContain('diff-del')
  })

  it('never turns the tail of a long document into deletions when given the full text', () => {
    // The shortened AI summary used to be passed here: only the opening words plus a note, so every
    // later word of the snapshot showed as deleted and the "/mcp" note as added.
    const full = `<p>${words(1000)}</p>`
    const html = diffToHtml(full, full)
    expect(html).not.toContain('diff-del')
    expect(html).not.toContain('/mcp')
  })

  it('escapes markup in the words it shows', () => {
    const html = diffToHtml('<p>a</p>', '<p>a &lt;script&gt;alert(1)&lt;/script&gt;</p>')
    expect(html).not.toContain('<script>')
  })
})
