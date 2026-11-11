import { describe, expect, it } from 'vitest'
import { frontMatterEndIndex, type FrontMatterBlock } from '../ieeeFrontMatter'

const title = (text: string): FrontMatterBlock => ({ isHeading: true, isTitle: true, text })
const heading = (text: string): FrontMatterBlock => ({ isHeading: true, isTitle: false, text })
const para = (text: string): FrontMatterBlock => ({ isHeading: false, isTitle: false, text })

describe('frontMatterEndIndex', () => {
  it('runs through the Index Terms block when there is one', () => {
    const blocks = [title('Paper'), para('A. Author'), heading('Abstract'), para('We study…'), para('Index Terms—editors'), heading('I. Introduction'), para('Body')]
    expect(frontMatterEndIndex(blocks)).toBe(5)
  })

  it('keeps the Abstract heading and its paragraphs in the front matter when there are no index terms', () => {
    const blocks = [title('Paper'), para('A. Author'), heading('Abstract'), para('We study…'), para('More abstract.'), heading('I. Introduction'), para('Body')]
    expect(frontMatterEndIndex(blocks)).toBe(5)
  })

  it('accepts an "Abstract—" lead-in paragraph', () => {
    const blocks = [title('Paper'), para('Abstract—We study…'), heading('I. Introduction')]
    expect(frontMatterEndIndex(blocks)).toBe(2)
  })

  it('ends before the first non-title heading when there is no abstract', () => {
    const blocks = [title('Paper'), para('A. Author'), heading('I. Introduction'), para('Body')]
    expect(frontMatterEndIndex(blocks)).toBe(2)
  })

  it('has no front matter when the document has no headings beyond the title', () => {
    expect(frontMatterEndIndex([title('Paper'), para('Body')])).toBe(0)
    expect(frontMatterEndIndex([])).toBe(0)
  })
})
