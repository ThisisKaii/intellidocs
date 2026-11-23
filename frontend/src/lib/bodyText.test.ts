import { describe, expect, it } from 'vitest'
import { hasBodyText } from './bodyText'

describe('hasBodyText', () => {
  it('is false for an empty editor body', () => {
    expect(hasBodyText('<p></p>')).toBe(false)
    expect(hasBodyText('<p> &nbsp; </p><p></p>')).toBe(false)
    expect(hasBodyText('')).toBe(false)
    expect(hasBodyText(null)).toBe(false)
  })

  it('is true for text, a picture or a table', () => {
    expect(hasBodyText('<h1>CHAPTER I</h1>')).toBe(true)
    expect(hasBodyText('<p><img src="a.png"></p>')).toBe(true)
    expect(hasBodyText('<table><tr><td></td></tr></table>')).toBe(true)
  })
})
