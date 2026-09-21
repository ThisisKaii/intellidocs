import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { binary } from 'harper.js/binary'
import { Dialect, WorkerLinter } from 'harper.js'

const harperKey = new PluginKey<HarperPluginState>('harperLinter')

/** Debounce window before linting after a keystroke, keeping the UI snappy. */
const LINT_DEBOUNCE_MS = 450

/** Skip linting very large documents to protect frame rate. */
const MAX_LINT_CHARS = 120_000

interface HarperLintEntry {
  from: number
  to: number
  kind: string
  message: string
  suggestion: string | null
}

interface HarperPluginState {
  entries: HarperLintEntry[]
  decorations: DecorationSet
}

interface TextLayoutSegment {
  docPos: number
  text: string
  textStart: number
}

interface TextLayout {
  text: string
  segments: TextLayoutSegment[]
}

/** Concatenate the document's text with '\n' separators, tracking where each segment maps in doc positions. */
function buildTextLayout(doc: ProseMirrorNode): TextLayout {
  const segments: TextLayoutSegment[] = []
  let plain = ''
  let offset = 0
  doc.descendants((node, pos) => {
    if (node.isText) {
      const text = node.text ?? ''
      segments.push({ docPos: pos, text, textStart: offset })
      plain += text
      offset += text.length
      plain += '\n'
      offset += 1
    }
    return true
  })
  return { text: plain, segments }
}

/** Convert Harper char spans into ProseMirror inline decorations, clipping to text nodes. */
function buildHarperDecorations(
  doc: ProseMirrorNode,
  layout: TextLayout,
  entries: HarperLintEntry[]
): DecorationSet {
  const decorations: Decoration[] = []
  for (const entry of entries) {
    for (const segment of layout.segments) {
      const segmentEnd = segment.textStart + segment.text.length
      if (segment.textStart >= entry.to || segmentEnd <= entry.from) continue
      const start = segment.docPos + Math.max(segment.textStart, entry.from) - segment.textStart
      const end = segment.docPos + Math.min(segmentEnd, entry.to) - segment.textStart
      if (end <= start) continue
      const kindToken = entry.kind.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
      decorations.push(
        Decoration.inline(start, end, {
          class: `harper-underline harper-kind-${kindToken}`,
        })
      )
    }
  }
  return DecorationSet.create(doc, decorations)
}

/** Client-side Harper WASM linting via a worker thread: instant, private, zero network cost. */
export const HarperLinterExtension = Extension.create({
  name: 'harperLinter',

  addProseMirrorPlugins() {
    let linter: WorkerLinter | null = null
    let setupPromise: Promise<void> | null = null
    let lintTimer: ReturnType<typeof setTimeout> | null = null
    let requestVersion = 0
    let disposed = false

    /** Lazily boot the shared worker linter; a failure degrades to no underlines. */
    const ensureLinter = async (): Promise<WorkerLinter | null> => {
      if (linter) return linter
      if (!setupPromise) {
        setupPromise = (async () => {
          const instance = new WorkerLinter({ binary, dialect: Dialect.American })
          await instance.setup()
          if (disposed) {
            await instance.dispose()
            return
          }
          linter = instance
        })()
      }
      try {
        await setupPromise
        return linter
      } catch {
        return null
      }
    }

    const runLint = async (view: EditorView): Promise<void> => {
      const instance = await ensureLinter()
      if (!instance || disposed) return

      const version = ++requestVersion
      const layout = buildTextLayout(view.state.doc)
      if (layout.text.length === 0) {
        view.dispatch(view.state.tr.setMeta(harperKey, { entries: [] }))
        return
      }
      if (layout.text.length > MAX_LINT_CHARS) return

      let lints
      try {
        lints = await instance.lint(layout.text, { language: 'plaintext' })
      } catch {
        return
      }
      if (version !== requestVersion || disposed) return

      const entries: HarperLintEntry[] = lints.map((lint) => {
        const span = lint.span()
        const firstSuggestion = lint.suggestions()[0]
        const replacement = firstSuggestion ? firstSuggestion.get_replacement_text() : ''
        return {
          from: span.start,
          to: span.end,
          kind: lint.lint_kind_pretty(),
          message: lint.message(),
          suggestion: replacement || null,
        }
      })

      view.dispatch(view.state.tr.setMeta(harperKey, { entries }))
    }

    const scheduleLint = (view: EditorView): void => {
      if (lintTimer) clearTimeout(lintTimer)
      lintTimer = setTimeout(() => void runLint(view), LINT_DEBOUNCE_MS)
    }

    return [
      new Plugin<HarperPluginState>({
        key: harperKey,
        state: {
          init() {
            return { entries: [], decorations: DecorationSet.empty }
          },
          apply(tr, value, _oldState, newState) {
            const meta = tr.getMeta(harperKey) as { entries?: HarperLintEntry[] } | undefined
            if (meta?.entries) {
              const layout = buildTextLayout(newState.doc)
              return {
                entries: meta.entries,
                decorations: buildHarperDecorations(newState.doc, layout, meta.entries),
              }
            }
            if (tr.docChanged) {
              return { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) }
            }
            return value
          },
        },
        props: {
          decorations(state) {
            return harperKey.getState(state)?.decorations ?? DecorationSet.empty
          },
        },
        view(view) {
          scheduleLint(view)
          return {
            update(currentView, prevState) {
              if (currentView.state.doc === prevState.doc) return
              scheduleLint(currentView)
            },
            destroy() {
              disposed = true
              if (lintTimer) clearTimeout(lintTimer)
              void linter?.dispose()
            },
          }
        },
      }),
    ]
  },
})