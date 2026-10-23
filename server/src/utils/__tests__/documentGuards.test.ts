import { isBlankHtml, isDestructiveBlankOverwrite } from '../documentGuards'

describe('isBlankHtml', () => {
  it('treats empty and whitespace-only editor HTML as blank', () => {
    expect(isBlankHtml('')).toBe(true)
    expect(isBlankHtml(undefined)).toBe(true)
    expect(isBlankHtml('<p></p>')).toBe(true)
    expect(isBlankHtml('<p>&nbsp; </p><p><br/></p>')).toBe(true)
  })

  it('keeps text, images and tables as content', () => {
    expect(isBlankHtml('<p>Hello</p>')).toBe(false)
    expect(isBlankHtml('<p><img src="x"/></p>')).toBe(false)
    expect(isBlankHtml('<table><tr><td></td></tr></table>')).toBe(false)
  })
})

describe('isDestructiveBlankOverwrite', () => {
  const stored = { title: 'My Thesis', content: '<p>Chapter 1</p>' }

  it('blocks a blank, default-titled save over a renamed non-empty document', () => {
    expect(isDestructiveBlankOverwrite(stored, { title: 'Untitled Document', content: '<p></p>' })).toBe(true)
  })

  it('allows a user clearing the document while keeping its title', () => {
    expect(isDestructiveBlankOverwrite(stored, { title: 'My Thesis', content: '<p></p>' })).toBe(false)
    expect(isDestructiveBlankOverwrite(stored, { content: '<p></p>' })).toBe(false)
  })

  it('allows renaming to the default title when the content is kept', () => {
    expect(isDestructiveBlankOverwrite(stored, { title: 'Untitled Document', content: '<p>Chapter 1</p>' })).toBe(false)
  })

  it('allows blank saves over documents that were already blank', () => {
    expect(isDestructiveBlankOverwrite({ title: 'Draft', content: '<p></p>' }, { title: 'Untitled Document', content: '' })).toBe(false)
  })

  it('ignores updates that do not touch content', () => {
    expect(isDestructiveBlankOverwrite(stored, { title: 'Untitled Document' })).toBe(false)
  })
})
