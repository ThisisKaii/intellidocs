import { describe, expect, it } from 'vitest'
import { extractTOCFromHTML } from './TableOfContents'

describe('extractTOCFromHTML', () => {
  it('reads a tab or line break inside a heading as a space', () => {
    const entries = extractTOCFromHTML('<h3>GIAN S. MAHUSAY<span data-tab></span>ALEXANDER Y. BUCOL</h3><h2>Line one<br>line two</h2>')
    expect(entries.map((entry) => entry.text)).toEqual(['GIAN S. MAHUSAY ALEXANDER Y. BUCOL', 'Line one line two'])
  })
})
