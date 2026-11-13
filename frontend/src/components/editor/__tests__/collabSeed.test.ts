import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import * as Y from 'yjs'

import { buildEditorExtensions, editorExtensions } from '../TiptapEditor'
// The server seeds collaboration rooms with this converter; its Yjs is the server's own copy,
// so the two sides meet only through encoded update bytes, exactly as over the network.
import { seedYDocFromJson, type PmJsonNode } from '../../../../../server/src/collaboration/yjsJson'
import * as ServerY from '../../../../../server/node_modules/yjs'

// Pagination and page-break plugins observe layout; jsdom has no ResizeObserver.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const HTML = [
  '<h1>Effects of Sleep</h1>',
  '<p style="text-align: center">Centered <strong>bold</strong> and <em>italic</em> and <span style="color: #dc2626">red</span>.</p>',
  '<ul><li><p>first</p></li><li><p>second</p></li></ul>',
  '<ol><li><p>one</p></li></ol>',
  '<blockquote><p>quoted</p></blockquote>',
  '<table><tbody><tr><td><p>a1</p></td><td><p>b1</p></td></tr><tr><td><p>a2</p></td><td><p>b2</p></td></tr></tbody></table>',
  // A cell spanning two rows: table-plus keeps those rows together in a row group.
  '<table><tbody><tr><td rowspan="2"><p>tall</p></td><td><p>r1</p></td></tr><tr><td><p>r2</p></td></tr><tr><td><p>c3</p></td><td><p>d3</p></td></tr></tbody></table>',
  '<p>Water is H<sub>2</sub>O and E = mc<sup>2</sup>, <mark data-color="#fef08a" style="background-color: #fef08a">highlighted</mark>.</p>',
  '<p></p>',
].join('')

describe('collaboration room seeding', () => {
  it('a room seeded from saved JSON opens as the same document in the collaborative editor', () => {
    // What the autosave stores as content_json: straight after loading, before any edit.
    const solo = new Editor({ extensions: editorExtensions, content: HTML })
    const saved = solo.getJSON()
    // The same document once the editor has tidied it (table-plus regroups rows on any transaction).
    solo.view.dispatch(solo.state.tr)
    const expected = solo.getJSON()
    solo.destroy()

    // Server side: seed a room, send it as bytes.
    const serverDoc = new ServerY.Doc()
    seedYDocFromJson(serverDoc, saved as PmJsonNode)
    const bytes = ServerY.encodeStateAsUpdate(serverDoc)

    // Browser side: apply the bytes, then open the editor on that document.
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, bytes)
    const before = Y.encodeStateVector(ydoc)
    const collab = new Editor({
      extensions: [...buildEditorExtensions(true), Collaboration.configure({ document: ydoc })],
    })
    collab.view.dispatch(collab.state.tr)

    expect(collab.getJSON()).toEqual(expected)
    // Opening the shared document must not edit it: if every editor tidied it on arrival,
    // two people opening at once would both rewrite the same nodes.
    expect(Array.from(Y.encodeStateVector(ydoc))).toEqual(Array.from(before))
    collab.destroy()
  })
})
