import { Extension, InputRule, type Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics'
import katex from 'katex'
import 'katex/dist/katex.min.css'

/** What the edit popover needs to change one equation. */
export interface MathEditRequest {
  /** Document position of the math node. */
  pos: number
  kind: 'inline' | 'block'
  latex: string
  /** The equation number shown at the right of a display equation, or null. */
  number: string | null
  /** Where the equation is on screen, for placing the popover. */
  rect: DOMRect
}

declare module '@tiptap/core' {
  interface EditorEvents {
    /** Fired when an equation is clicked or newly inserted and should be edited. */
    'math-edit': MathEditRequest
  }
}

/** LaTeX used for a freshly inserted equation. */
export const PLACEHOLDER_LATEX = 'x^{2}'

/**
 * `$x^2$` typed in a line of text. Pandoc's rule: the opening `$` is followed by a non-space and the
 * closing `$` is preceded by one, so "costs $5 and $10" stays text. A `$` that is part of `$$` or
 * escaped never opens an equation.
 */
const INLINE_DOLLARS = /(?<![\\$])\$([^\s$](?:[^$\n]*[^\s$])?)\$$/

/** A whole paragraph typed as `$$x^2$$` becomes a display equation. */
const DISPLAY_DOLLARS = /^\$\$([^$\n]+)\$\$$/

/** Fonts KaTeX needs; text with them missing is measured too small and shifts once they load. */
const MATH_FONTS = ['1em KaTeX_Main', 'italic 1em KaTeX_Math', '1em KaTeX_Size1', '1em KaTeX_Size2', '1em KaTeX_AMS']

let mathFontsLoaded = false
const remeasured = new WeakSet<Editor>()

/**
 * Loads KaTeX's fonts once, then makes the editor measure its pages again: the paginator only measures
 * on a transaction, and an equation changes height when its font arrives.
 */
function remeasureWhenFontsLoad(editor: Editor): void {
  if (mathFontsLoaded || remeasured.has(editor) || typeof document === 'undefined' || !document.fonts) return
  remeasured.add(editor)
  void Promise.all(MATH_FONTS.map((font) => document.fonts.load(font)))
    .catch(() => undefined)
    .then(() => {
      mathFontsLoaded = true
      if (editor.isDestroyed) return
      editor.view.dispatch(editor.state.tr.setMeta('mathFontsReady', true).setMeta('addToHistory', false))
    })
}

/** Asks the host to open the edit popover for the equation node at `pos`. */
function requestEdit(editor: Editor, node: ProseMirrorNode, pos: number, kind: 'inline' | 'block', dom: HTMLElement): void {
  if (!editor.isEditable) return
  editor.emit('math-edit', {
    pos,
    kind,
    latex: String(node.attrs.latex ?? ''),
    number: typeof node.attrs.number === 'string' && node.attrs.number !== '' ? node.attrs.number : null,
    rect: dom.getBoundingClientRect(),
  })
}

/** Attribute reader used by the legacy `data-academic-equation` rules: the element's LaTeX, or nothing for a bad input. */
function legacyAttrs(element: HTMLElement | string): { latex: string; number: string | null } | false {
  if (typeof element === 'string') return false
  return { latex: element.getAttribute('data-latex') ?? '', number: element.getAttribute('data-number') || null }
}

/**
 * An equation inside a line of text, drawn by KaTeX. Same markup as the official extension
 * (`span[data-type="inline-math"][data-latex]`), with `$x$` typing and click-to-edit.
 */
export const MathInline = InlineMath.extend({
  parseHTML() {
    return [
      ...(this.parent?.() ?? []),
      // The equation node earlier versions saved (no LaTeX rendering, so the text is the source).
      { tag: 'span[data-academic-equation]', getAttrs: legacyAttrs },
    ]
  },

  addInputRules() {
    return [
      new InputRule({
        find: INLINE_DOLLARS,
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(range.from, range.to, this.type.create({ latex: match[1] }))
        },
      }),
    ]
  },

  addNodeView() {
    const parent = this.parent?.()
    const editor = this.editor
    return (props) => {
      const view = parent ? parent(props) : null
      if (!view) return { dom: document.createElement('span') }
      const dom = view.dom as HTMLElement
      remeasureWhenFontsLoad(editor)
      const onClick = (event: MouseEvent): void => {
        event.preventDefault()
        event.stopPropagation()
        const pos = props.getPos()
        if (pos != null) requestEdit(editor, props.node, pos, 'inline', dom)
      }
      dom.addEventListener('click', onClick)
      return {
        ...view,
        destroy: () => {
          dom.removeEventListener('click', onClick)
          view.destroy?.()
        },
      }
    }
  },
})

/**
 * A display equation on its own line, drawn by KaTeX in display mode, with an optional number at the
 * right edge. Same markup as the official extension (`div[data-type="block-math"][data-latex]`) plus
 * `data-number`.
 */
export const MathBlock = BlockMath.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      number: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-number') || null,
        renderHTML: (attributes: Record<string, unknown>) => (attributes.number ? { 'data-number': String(attributes.number) } : {}),
      },
    }
  },

  parseHTML() {
    return [...(this.parent?.() ?? []), { tag: 'div[data-academic-equation]', getAttrs: legacyAttrs }]
  },

  addInputRules() {
    return [
      ...(this.parent?.() ?? []),
      new InputRule({
        find: DISPLAY_DOLLARS,
        handler: ({ state, range, match }) => {
          const $from = state.doc.resolve(range.from)
          const node = this.type.create({ latex: match[1] })
          const fillsParagraph = $from.depth > 0 && $from.parent.isTextblock && range.from === $from.start() && range.to === $from.end()
          const canReplaceParagraph = fillsParagraph && $from.node(-1).canReplaceWith($from.index(-1), $from.indexAfter(-1), this.type)
          const target = canReplaceParagraph ? { from: $from.before(), to: $from.after() } : range
          state.tr.replaceWith(target.from, target.to, node)
        },
      }),
    ]
  },

  addNodeView() {
    const editor = this.editor
    return ({ node, getPos }) => {
      const wrapper = document.createElement('div')
      wrapper.className = 'tiptap-mathematics-render'
      if (editor.isEditable) wrapper.classList.add('tiptap-mathematics-render--editable')
      wrapper.dataset.type = 'block-math'
      wrapper.setAttribute('data-latex', node.attrs.latex)
      if (node.attrs.number) wrapper.setAttribute('data-number', node.attrs.number)

      const inner = document.createElement('div')
      inner.className = 'block-math-inner'
      wrapper.appendChild(inner)
      try {
        katex.render(node.attrs.latex, inner, { displayMode: true })
      } catch {
        wrapper.textContent = node.attrs.latex
        wrapper.classList.add('block-math-error')
      }
      remeasureWhenFontsLoad(editor)

      const onClick = (event: MouseEvent): void => {
        event.preventDefault()
        event.stopPropagation()
        const pos = getPos()
        if (pos != null) requestEdit(editor, node, pos, 'block', wrapper)
      }
      wrapper.addEventListener('click', onClick)
      return { dom: wrapper, destroy: () => wrapper.removeEventListener('click', onClick) }
    }
  },
})

/** The next free equation number: one above the largest plain number already used. */
export function nextEquationNumber(editor: Editor): string {
  let highest = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'blockMath' && /^\d+$/.test(String(node.attrs.number ?? ''))) {
      highest = Math.max(highest, Number(node.attrs.number))
    }
    return true
  })
  return String(highest + 1)
}

/**
 * Inserts a new equation at the cursor and opens the edit popover on it.
 * The node starts with placeholder LaTeX so there is something to see and replace.
 */
export function insertMath(editor: Editor, kind: 'inline' | 'block'): void {
  const type = kind === 'inline' ? 'inlineMath' : 'blockMath'
  const before = editor.state.selection.from
  editor.chain().focus().insertContent({ type, attrs: { latex: PLACEHOLDER_LATEX } }).run()

  // Find the node that was just inserted: the placeholder equation closest to where the cursor was.
  let found: { pos: number; node: ProseMirrorNode } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === type && node.attrs.latex === PLACEHOLDER_LATEX && (!found || Math.abs(pos - before) < Math.abs(found.pos - before))) {
      found = { pos, node }
    }
    return true
  })
  const target = found as { pos: number; node: ProseMirrorNode } | null
  if (!target) return
  const dom = editor.view.nodeDOM(target.pos)
  if (dom instanceof HTMLElement) requestEdit(editor, target.node, target.pos, kind, dom)
}

/** Both math node types, ready for `editorExtensions`. */
export const MathExtension = Extension.create({
  name: 'mathNodes',
  addExtensions() {
    return [MathBlock, MathInline]
  },
})
