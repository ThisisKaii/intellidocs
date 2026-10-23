import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Dialect, WorkerLinter } from 'harper.js'
import { binary } from 'harper.js/binary'

const harperKey = new PluginKey<HarperPluginState>('harperLinter')

/** Debounce window before linting after a keystroke, keeping the UI snappy. */
const LINT_DEBOUNCE_MS = 1_200

/** Skip linting a single block larger than this (protects frame rate). */
const MAX_BLOCK_LINT_CHARS = 50_000

/** Abort linter startup if the worker does not become ready in this window. */
const SETUP_TIMEOUT_MS = 10_000

interface HarperLintEntry {
  /** Absolute ProseMirror doc position of the span start. */
  from: number
  /** Absolute ProseMirror doc position of the span end. */
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

/** The text block (paragraph/heading) containing the caret, or null. */
function activeTextBlock(
  state: EditorState
): { node: ProseMirrorNode; from: number; to: number } | null {
  const { $from } = state.selection
  if (!$from.parent.isTextblock) return null
  if ($from.parent.type.name === 'codeBlock') return null
  const depth = $from.depth
  return { node: $from.parent, from: $from.before(depth), to: $from.after(depth) }
}

/** Stable identity of the block under the caret, for relint detection. */
function blockKey(state: EditorState): string | null {
  const block = activeTextBlock(state)
  return block ? `${block.node.type.name}@${block.from}` : null
}

/**
 * Check that the WASM asset is really served before booting Harper. When Vite
 * cannot resolve the binary it falls back to index.html, and instantiating
 * that as WASM throws an unhandled error that crashes the page. A cached
 * pre-flight request turns that failure into a silent no-op instead.
 */
let binaryAvailable: Promise<boolean> | null = null
function isBinaryAvailable(): Promise<boolean> {
  if (!binaryAvailable) {
    binaryAvailable = (async () => {
      try {
        const response = await fetch(binary.url, { method: 'HEAD' })
        const contentType = response.headers.get('content-type') ?? ''
        return response.ok && !contentType.includes('text/html')
      } catch {
        return false
      }
    })()
  }
  return binaryAvailable
}

/**
 * Concatenate a node's text with '\n' separators, tracking where each segment
 * maps in absolute doc positions (`basePos` is the node's own start).
 */
function buildTextLayout(node: ProseMirrorNode, basePos = 0): TextLayout {
  const segments: TextLayoutSegment[] = []
  let plain = ''
  let offset = 0
  node.descendants((child, pos) => {
    if (child.isText) {
      const text = child.text ?? ''
      segments.push({ docPos: basePos + pos, text, textStart: offset })
      plain += text
      offset += text.length
      plain += '\n'
      offset += 1
    }
    return true
  })
  return { text: plain, segments }
}

/** Map a Harper character span onto absolute doc ranges, clipped to text nodes. */
function mapSpanToDoc(
  layout: TextLayout,
  spanFrom: number,
  spanTo: number
): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = []
  for (const segment of layout.segments) {
    const segmentEnd = segment.textStart + segment.text.length
    if (segment.textStart >= spanTo || segmentEnd <= spanFrom) continue
    const from = segment.docPos + Math.max(segment.textStart, spanFrom) - segment.textStart
    const to = segment.docPos + Math.min(segmentEnd, spanTo) - segment.textStart
    if (to > from) ranges.push({ from, to })
  }
  return ranges
}

/** Build inline underline decorations from absolute-position lint entries. */
function buildDecorations(doc: ProseMirrorNode, entries: HarperLintEntry[]): DecorationSet {
  const docSize = doc.content.size
  const decorations: Decoration[] = []
  for (const entry of entries) {
    if (entry.from >= entry.to || entry.to > docSize) continue
    const kindToken = entry.kind.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    decorations.push(
      Decoration.inline(entry.from, entry.to, {
        class: `harper-underline harper-kind-${kindToken}`,
      })
    )
  }
  return DecorationSet.create(doc, decorations)
}

/** Client-side Harper WASM linting via a worker thread: instant, private, zero network cost. */
export const HarperLinterExtension = Extension.create({
  name: 'harperLinter',

  addProseMirrorPlugins() {
    let linter: WorkerLinter | null = null
    let setupPromise: Promise<WorkerLinter | null> | null = null
    let lintTimer: ReturnType<typeof setTimeout> | null = null
    let requestVersion = 0
    let disposed = false

    /**
     * Lazily boot the shared worker linter. A missing or unreachable WASM
     * binary, a failed worker handshake, or a startup timeout all degrade to
     * `null`, which leaves the editor running without Harper underlines.
     */
    const ensureLinter = async (): Promise<WorkerLinter | null> => {
      if (linter) return linter
      if (!setupPromise) {
        setupPromise = (async () => {
          if (!(await isBinaryAvailable())) {
            console.warn('[HarperLinter] WASM binary is not being served; linter disabled')
            return null
          }
          try {
            // Pre-warm the binary so a fetch failure surfaces here (catchable)
            // instead of as an unhandled rejection inside the constructor.
            await binary.setup()
            const instance = new WorkerLinter({ binary, dialect: Dialect.American })
            await Promise.race([
              instance.setup(),
              new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Harper linter setup timed out')), SETUP_TIMEOUT_MS)
              }),
            ])
            if (disposed) {
              void instance.dispose().catch(() => {})
              return null
            }
            linter = instance
            return instance
          } catch (error) {
            console.warn('[HarperLinter] Failed to initialize linter; running without underlines:', error)
            return null
          }
        })()
      }
      return setupPromise
    }

    /**
     * Lint only the text block under the caret. Whole-document linting made
     * typing lag on long imports; per-block results are merged so previously
     * linted blocks keep their underlines.
     */
    const runLint = async (view: EditorView): Promise<void> => {
      const instance = await ensureLinter()
      if (!instance || disposed) return

      const block = activeTextBlock(view.state)
      if (!block) return

      const version = ++requestVersion
      const layout = buildTextLayout(block.node, block.from)
      if (layout.text.length === 0) {
        view.dispatch(
          view.state.tr.setMeta(harperKey, { entries: [], blockFrom: block.from, blockTo: block.to })
        )
        return
      }
      if (layout.text.length > MAX_BLOCK_LINT_CHARS) return

      let lints
      try {
        lints = await instance.lint(layout.text, { language: 'plaintext' })
      } catch {
        return
      }
      if (version !== requestVersion || disposed) return

      const entries: HarperLintEntry[] = []
      for (const lint of lints) {
        const span = lint.span()
        const firstSuggestion = lint.suggestions()[0]
        const replacement = firstSuggestion ? firstSuggestion.get_replacement_text() : ''
        for (const range of mapSpanToDoc(layout, span.start, span.end)) {
          entries.push({
            from: range.from,
            to: range.to,
            kind: lint.lint_kind_pretty(),
            message: lint.message(),
            suggestion: replacement || null,
          })
        }
      }

      view.dispatch(
        view.state.tr.setMeta(harperKey, { entries, blockFrom: block.from, blockTo: block.to })
      )
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
            if (tr.docChanged) {
              // Shift existing underlines with the edit so stale positions
              // never underline the wrong characters.
              const mapped = value.entries.map((entry) => ({
                ...entry,
                from: tr.mapping.map(entry.from),
                to: tr.mapping.map(entry.to),
              }))
              return { entries: mapped, decorations: buildDecorations(newState.doc, mapped) }
            }

            const meta = tr.getMeta(harperKey) as
              | { entries?: HarperLintEntry[]; blockFrom?: number; blockTo?: number }
              | undefined
            if (
              meta?.entries &&
              typeof meta.blockFrom === 'number' &&
              typeof meta.blockTo === 'number'
            ) {
              // Replace previous results for this block only; other blocks
              // keep their underlines so per-block linting never flickers.
              const blockFrom = meta.blockFrom
              const blockTo = meta.blockTo
              const kept = value.entries.filter(
                (entry) => entry.to <= blockFrom || entry.from >= blockTo
              )
              const merged = [...kept, ...meta.entries]
              return { entries: merged, decorations: buildDecorations(newState.doc, merged) }
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
          let lastBlock = blockKey(view.state)
          return {
            update(currentView, prevState) {
              const currentBlock = blockKey(currentView.state)
              if (currentView.state.doc === prevState.doc && currentBlock === lastBlock) return
              lastBlock = currentBlock
              scheduleLint(currentView)
            },
            destroy() {
              disposed = true
              if (lintTimer) clearTimeout(lintTimer)
              void linter?.dispose().catch(() => {})
            },
          }
        },
      }),
    ]
  },
})
