import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/** One thing the demo assistant notices in the sample paper. */
export interface DemoIssue {
  from: number
  to: number
  word: string
  fix: string
  kind: 'spelling' | 'repeat'
}

/** A few common slips the demo knows about (the real editor uses a full checker). */
const KNOWN_TYPOS: Record<string, string> = {
  evrything: 'everything',
  recieve: 'receive',
  wich: 'which',
  teh: 'the',
  alot: 'a lot',
  becuase: 'because',
}

const WORD = /[A-Za-z']+/g

/** Find misspelled words and accidentally doubled words in a document. */
export function findDemoIssues(doc: ProseMirrorNode): DemoIssue[] {
  const issues: DemoIssue[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const text = node.textContent
    let previous: { word: string; start: number; end: number } | null = null
    for (const match of text.matchAll(WORD)) {
      const word = match[0]
      const start = pos + 1 + (match.index ?? 0)
      const end = start + word.length
      const fix = KNOWN_TYPOS[word.toLowerCase()]
      if (fix) issues.push({ from: start, to: end, word, fix, kind: 'spelling' })
      else if (previous && previous.word.toLowerCase() === word.toLowerCase() && /^\s+$/.test(text.slice(previous.end - pos - 1, start - pos - 1))) {
        issues.push({ from: previous.start, to: end, word: `${previous.word} ${word}`, fix: word, kind: 'repeat' })
      }
      previous = { word, start, end }
    }
    return false
  })
  return issues
}

const checkerKey = new PluginKey('demoChecker')

/** Wavy red underline on every issue, recomputed on each keystroke. */
export const DemoChecker = Extension.create({
  name: 'demoChecker',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: checkerKey,
        props: {
          decorations: (state) =>
            DecorationSet.create(
              state.doc,
              findDemoIssues(state.doc).map((issue) => Decoration.inline(issue.from, issue.to, { class: 'demo-issue' })),
            ),
        },
      }),
    ]
  },
})
