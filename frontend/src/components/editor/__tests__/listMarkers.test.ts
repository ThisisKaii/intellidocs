import { Editor } from '@tiptap/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { editorExtensions } from '../TiptapEditor'

beforeAll(() => {
  // The page layout code watches element sizes; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
})

const html =
  '<ol type="a"><li data-mx="48" data-mt="0.3" data-pre="(" data-post=")" style="font-size:11pt">' +
  '<p style="margin-left:48px; text-indent:17.5px;">An item</p></li></ol>'

describe('imported list markers', () => {
  it('keep where Word puts the number when a document loads and is saved', () => {
    const editor = new Editor({ extensions: editorExtensions, content: html })
    const saved = editor.getHTML()
    editor.destroy()
    expect(saved).toContain('data-mx="48"')
    expect(saved).toContain('data-mt="0.3"')
    expect(saved).toContain('data-pre="("')
    expect(saved).toContain('data-post=")"')
    expect(saved).toContain('--mx: 48px')
    expect(saved).toContain('font-size: 11pt')
  })

  it('leave an ordinary list alone', () => {
    const editor = new Editor({ extensions: editorExtensions, content: '<ol><li><p>Typed</p></li></ol>' })
    const saved = editor.getHTML()
    editor.destroy()
    expect(saved).not.toContain('data-mx')
  })
})
