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

  it('keep a number the converter wrote out (1.1, a restart) through a load and save', () => {
    const written =
      '<ol><li data-mx="48" data-mt="0" data-pre="" data-post="" data-marker="1.2" style="font-size:11pt">' +
      '<p style="margin-left:72px">A sub-item</p></li></ol>'
    const editor = new Editor({ extensions: editorExtensions, content: written })
    const saved = editor.getHTML()
    editor.destroy()
    expect(saved).toContain('data-marker="1.2"')
    expect(saved).toContain('--marker: &quot;1.2&quot;')
  })

  it('keep the flag that marks an imported item, so its list gets no margins', () => {
    const editor = new Editor({ extensions: editorExtensions, content: '<ul><li data-flat="1" style="font-size:10pt"><p>Bullet</p></li></ul>' })
    const saved = editor.getHTML()
    editor.destroy()
    expect(saved).toContain('data-flat="1"')
  })

  it('leave an ordinary list alone', () => {
    const editor = new Editor({ extensions: editorExtensions, content: '<ol><li><p>Typed</p></li></ol>' })
    const saved = editor.getHTML()
    editor.destroy()
    expect(saved).not.toContain('data-mx')
    expect(saved).not.toContain('data-flat')
  })
})
