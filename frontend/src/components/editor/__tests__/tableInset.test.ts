import { Editor } from '@tiptap/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { editorExtensions } from '../TiptapEditor'
import { insetStyle, parseInset } from '../TableInset'

beforeAll(() => {
  // The page layout code watches element sizes; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
})

const cell = '<td><p>A</p></td>'
const table = (attrs: string): string => `<table${attrs}><tr>${cell}</tr></table>`

describe('table inset', () => {
  it('keeps the converter value when a document loads and is saved', () => {
    const editor = new Editor({ extensions: editorExtensions, content: table(' data-inset="66,-12.5,0"') })
    const saved = editor.getHTML()
    editor.destroy()
    expect(saved).toContain('data-inset="66,-12.5,0"')
  })

  it('leaves an ordinary table without the attribute', () => {
    const editor = new Editor({ extensions: editorExtensions, content: table('') })
    const saved = editor.getHTML()
    editor.destroy()
    expect(saved).not.toContain('data-inset')
  })

  it('reads three numbers and rejects anything else', () => {
    expect(parseInset('66,-12.5,0')).toEqual({ left: 66, right: -12.5, top: 0 })
    expect(parseInset('0,0,0')).toBeNull()
    expect(parseInset('66,12')).toBeNull()
    expect(parseInset('a,b,c')).toBeNull()
    expect(parseInset(null)).toBeNull()
  })

  it('moves and narrows the table by its inset', () => {
    expect(insetStyle({ left: 66, right: 0, top: 0 })).toBe('margin-left:66px;width:calc(100% - 66px)')
    expect(insetStyle({ left: -48, right: 10, top: 20 })).toBe('margin-left:-48px;width:calc(100% - -38px);margin-top:20px')
  })
})
