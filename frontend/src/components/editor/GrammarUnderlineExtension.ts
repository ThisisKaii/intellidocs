import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { GrammarIssue } from './GrammarPanel'
import { getEditorPreferences } from '@/lib/editorPreferences'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    grammarUnderline: {
      /** Replace the set of grammar issues rendered as underlines. */
      setGrammarIssues: (issues: GrammarIssue[]) => ReturnType
    }
  }

  interface EditorEvents {
    /** Fired when a grammar/spelling underline is clicked; pos is the ProseMirror position. */
    'grammar-click': { issue: GrammarIssue; rect: DOMRect; pos: number }
  }
}

/** CSS class for the user's preferred underline style. */
function underlineClass(): string {
  return getEditorPreferences().underlineStyle === 'wavy' ? 'grammar-wavy' : 'grammar-straight'
}

interface GrammarPluginState {
  issues: GrammarIssue[]
  decorations: DecorationSet
}

const grammarKey = new PluginKey<GrammarPluginState>('grammarUnderline')

/** Find every occurrence of each issue's original text and wrap it in an underline decoration. */
function buildDecorations(doc: ProseMirrorNode, issues: GrammarIssue[]): DecorationSet {
  const textByPos: { from: number; text: string }[] = []
  doc.descendants((node, pos) => {
    if (node.isText) {
      textByPos.push({ from: pos, text: node.text ?? '' })
    }
    return true
  })

  const decorations: Decoration[] = []
  issues.forEach((issue, index) => {
    const needle = issue.original.toLowerCase()
    if (!needle) return

    for (const { from, text } of textByPos) {
      const haystack = text.toLowerCase()
      let start = 0
      while (start < haystack.length) {
        const matchIndex = haystack.indexOf(needle, start)
        if (matchIndex === -1) break
        decorations.push(
          Decoration.inline(from + matchIndex, from + matchIndex + issue.original.length, {
            class: `grammar-issue ${underlineClass()} grammar-kind-${issue.kind ?? 'grammar'}`,
            'data-issue-index': String(index),
          })
        )
        start = matchIndex + issue.original.length
      }
    }
  })

  return DecorationSet.create(doc, decorations)
}

/** Renders grammar/spell issues as clickable red wavy underlines inside the editor. */
export const GrammarUnderlineExtension = Extension.create({
  name: 'grammarUnderline',

  addCommands() {
    return {
      setGrammarIssues:
        (issues: GrammarIssue[]) =>
        ({ tr, dispatch }) => {
          tr.setMeta(grammarKey, issues)
          if (dispatch) dispatch(tr)
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    const key = grammarKey

    return [
      new Plugin<GrammarPluginState>({
        key: grammarKey,
        state: {
          init(_config, _state) {
            return { issues: [], decorations: DecorationSet.empty }
          },
          apply(tr, value, _oldState, newState) {
            const meta = tr.getMeta(key) as GrammarIssue[] | undefined
            if (meta) {
              return { issues: meta, decorations: buildDecorations(newState.doc, meta) }
            }
            if (tr.docChanged) {
              return { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) }
            }
            return value
          },
        },
        props: {
          decorations(state) {
            return key.getState(state)?.decorations ?? DecorationSet.empty
          },
          handleClick(view, pos, event) {
            const target = event.target as Element
            const wavy = target.closest?.('.grammar-issue') as HTMLElement | null
            if (!wavy) return false

            const index = Number(wavy.getAttribute('data-issue-index'))
            const state = key.getState(view.state)
            const issue = state?.issues[index]
            if (!issue) return false

            editor.emit('grammar-click', {
              issue,
              rect: wavy.getBoundingClientRect(),
              pos,
            })
            return true
          },
        },
      }),
    ]
  },
})
