import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { editorExtensions } from '../TiptapEditor'

// The page-break plugin watches for layout changes; jsdom has no layout to watch.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let editor: Editor | null = null
afterEach(() => editor?.destroy())

const PROPS = JSON.stringify({ kind: 'continuous', columns: { count: 1, gap: 48, widths: null } }).replace(/"/g, '&quot;')
const MARK = `<div class="intellidocs-section-mark" data-section="12" data-section-props="${PROPS}"></div>`
const BREAK = `<hr class="page-break" data-page-break="true" data-section="11" data-section-props="${PROPS}" />`

function open(html: string): Editor {
  editor = new Editor({ extensions: editorExtensions, content: html })
  return editor
}

/** The document's top-level blocks as "type:text". */
function blocks(target: Editor): string[] {
  const out: string[] = []
  target.state.doc.forEach((node) => out.push(`${node.type.name}:${node.textContent}`))
  return out
}

/** Put the cursor at the start of the first text block whose text begins with `text`. */
function caretAtStartOf(target: Editor, text: string): void {
  let at = -1
  target.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isTextblock && node.textContent.startsWith(text)) at = pos + 1
    return at < 0
  })
  target.commands.setTextSelection(at)
}

/** Press Backspace as the keyboard does: the editor's key handlers in their order, with their selection. */
function backspace(target: Editor): void {
  const event = new KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true })
  target.view.someProp('handleKeyDown', (handle) => handle(target.view, event))
}

describe('Backspace at the start of a block with something invisible above it', () => {
  it('joins across a section marker in one press and keeps the marker', () => {
    const ed = open(`<h1>CHAPTER I INTRODUCTION</h1>${MARK}<p>Document creation</p><p>Next</p>`)
    caretAtStartOf(ed, 'Document creation')
    backspace(ed)
    expect(blocks(ed)).toEqual(['heading:CHAPTER I INTRODUCTIONDocument creation', 'sectionMark:', 'paragraph:Next'])
    expect(ed.state.selection.from).toBe('CHAPTER I INTRODUCTION'.length + 1)
  })

  it('leaves the page break and marker at the top of a tab alone', () => {
    const ed = open(`${BREAK}<h1>CHAPTER I INTRODUCTION</h1>${MARK}<p>Text</p>`)
    caretAtStartOf(ed, 'CHAPTER')
    backspace(ed)
    backspace(ed)
    expect(blocks(ed)).toEqual(['pageBreak:', 'heading:CHAPTER I INTRODUCTION', 'sectionMark:', 'paragraph:Text'])
  })

  it('joins a centred heading with an indent at once instead of only taking the indent off', () => {
    const ed = open('<p>Above</p><h1 style="text-align:center; text-indent:19.7px">CHAPTER I</h1>')
    caretAtStartOf(ed, 'CHAPTER')
    backspace(ed)
    // (The editor keeps an empty paragraph after a closing heading; it stays at the end.)
    expect(blocks(ed).filter((block) => block !== 'paragraph:')).toEqual(['paragraph:AboveCHAPTER I'])
  })

  it('still takes a left-aligned first-line indent off first, as Word does', () => {
    const ed = open('<p>Above</p><p style="text-indent:48px">Indented</p>')
    caretAtStartOf(ed, 'Indented')
    backspace(ed)
    expect(blocks(ed)).toEqual(['paragraph:Above', 'paragraph:Indented'])
  })

  it('moves from the start of a column to the end of the column before it', () => {
    const ed = open(
      '<p>Above</p><div class="intellidocs-columns" data-widths="50,50">' +
        '<div class="intellidocs-column"><p>Rationale of the Study</p></div>' +
        '<div class="intellidocs-column"><p>CHAPTER I</p></div></div>',
    )
    const unchanged = blocks(ed)
    caretAtStartOf(ed, 'CHAPTER')
    backspace(ed)
    const { $from } = ed.state.selection
    expect($from.parent.textContent).toBe('Rationale of the Study')
    expect($from.parentOffset).toBe('Rationale of the Study'.length)
    // From the first column, to the text above the column block.
    caretAtStartOf(ed, 'Rationale')
    backspace(ed)
    expect(ed.state.selection.$from.parent.textContent).toBe('Above')
    // Nothing was deleted (the editor adds its closing empty paragraph after the first change).
    expect(blocks(ed).filter((block) => block !== 'paragraph:')).toEqual(unchanged)
  })

  it('does not change an ordinary join', () => {
    const ed = open('<p>One</p><p>Two</p>')
    caretAtStartOf(ed, 'Two')
    backspace(ed)
    expect(blocks(ed)).toEqual(['paragraph:OneTwo'])
  })
})
