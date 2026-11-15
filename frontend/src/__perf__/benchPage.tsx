/**
 * Dev-only benchmark page (bench/large-document.html), driven by tests/e2e/large_document_bench.py.
 *
 * Renders the paged editor on its own, with no sign-in or server, and exposes `window.__bench`:
 *   load(html)  → loads a document and resolves once its pages stop changing, with the time taken
 *   type(n)     → types n characters in the middle and returns each keystroke's time to the next frame
 *   serialise() → times getHTML / getJSON (what autosave pays)
 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'

import '@/styles/index.css'
import { PagedEditor } from '@/components/editor/PagedEditor'
import { createDefaultHeaderFooterConfig } from '@/components/editor/HeaderFooterPlugin'

interface Bench {
  load: (html: string) => Promise<{ ms: number; pages: number }>
  type: (count: number) => Promise<number[]>
  serialise: () => { htmlMs: number; jsonMs: number }
}

declare global {
  interface Window {
    __bench?: Bench
  }
}

let current: Editor | null = null
let setDocument: ((html: string) => void) | null = null

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

function pageCount(): number {
  return document.querySelectorAll('.rm-page-break').length
}

/** Resolves when the page count has not changed for `quietMs`. */
async function settled(quietMs = 1500, timeoutMs = 600_000): Promise<number> {
  const start = performance.now()
  let last = -1
  let since = performance.now()
  while (performance.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    const pages = pageCount()
    if (pages !== last) {
      last = pages
      since = performance.now()
    } else if (performance.now() - since >= quietMs && pages > 0) {
      return pages
    }
  }
  return last
}

window.__bench = {
  async load(html) {
    const start = performance.now()
    setDocument?.(html)
    const pages = await settled()
    // The quiet period is not part of the load.
    return { ms: Math.round(performance.now() - start - 1500), pages }
  },
  async type(count) {
    const editor = current
    if (!editor) return []
    const middle = Math.floor(editor.state.doc.content.size / 2)
    let caret = middle
    editor.state.doc.nodesBetween(middle, editor.state.doc.content.size, (node, pos) => {
      if (caret !== middle) return false
      if (node.isTextblock && node.textContent.length > 20) caret = pos + 5
      return !node.isTextblock
    })
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, caret)))
    editor.view.focus()
    const times: number[] = []
    for (let i = 0; i < count; i += 1) {
      const start = performance.now()
      editor.view.dispatch(editor.state.tr.insertText('a'))
      await nextFrame()
      times.push(Math.round((performance.now() - start) * 10) / 10)
    }
    return times
  },
  serialise() {
    const editor = current
    if (!editor) return { htmlMs: 0, jsonMs: 0 }
    let start = performance.now()
    editor.getHTML()
    const htmlMs = Math.round(performance.now() - start)
    start = performance.now()
    editor.getJSON()
    return { htmlMs, jsonMs: Math.round(performance.now() - start) }
  },
}

function BenchPage(): JSX.Element {
  const [content, setContent] = useState('<p></p>')
  setDocument = setContent
  return (
    <PagedEditor
      content={content}
      onContentChange={() => undefined}
      onActiveEditorChange={(editor) => {
        current = editor
      }}
      onGrammarClick={() => undefined}
      grammarIssues={[]}
      underlineStyle="straight"
      pageSize="letter"
      margins={{ top: 1, bottom: 1, left: 1.5, right: 1 }}
      orientation="portrait"
      headerFooterConfig={createDefaultHeaderFooterConfig()}
    />
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<BenchPage />)
