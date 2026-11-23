import { Extension } from '@tiptap/core'
import { forEachSelectedNode } from './selectionRanges'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indentation: {
      /** Indent current paragraph or list item */
      indent: () => ReturnType
      /** Outdent current paragraph or list item */
      outdent: () => ReturnType
    }
  }
}

export const IndentExtension = Extension.create({
  name: 'indentation',

  addOptions() {
    return {
      types: ['paragraph', 'heading', 'blockquote'],
      minIndent: 0,
      maxIndent: 8,
      indentMargin: 24,
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              const margin = element.style.marginLeft || '0px'
              return parseInt(margin, 10) / 24 || 0
            },
            renderHTML: (attributes) => {
              if (!attributes.indent) {
                return {}
              }
              return {
                style: `margin-left: ${attributes.indent * 24}px;`,
              }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      indent: () => ({ tr, state, dispatch }) => {
        if (this.editor.isActive('listItem')) {
          return this.editor.chain().focus().sinkListItem('listItem').run()
        }

        let updated = false
        // Every range of the selection: several selected table cells are one range each.
        forEachSelectedNode(state, (node, pos) => {
          if (this.options.types.includes(node.type.name)) {
            const currentIndent = (node.attrs.indent as number) || 0
            if (currentIndent < this.options.maxIndent) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                indent: currentIndent + 1,
              })
              updated = true
            }
          }
        })

        if (updated && dispatch) {
          dispatch(tr)
        }
        return updated
      },

      outdent: () => ({ tr, state, dispatch }) => {
        if (this.editor.isActive('listItem')) {
          return this.editor.chain().focus().liftListItem('listItem').run()
        }

        let updated = false
        // Every range of the selection: several selected table cells are one range each.
        forEachSelectedNode(state, (node, pos) => {
          if (this.options.types.includes(node.type.name)) {
            const currentIndent = (node.attrs.indent as number) || 0
            if (currentIndent > this.options.minIndent) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                indent: currentIndent - 1,
              })
              updated = true
            }
          }
        })

        if (updated && dispatch) {
          dispatch(tr)
        }
        return updated
      },
    }
  },

  addKeyboardShortcuts() {
    return {
      // As in Word: a list item moves a level down, a table moves between cells (the table's own
      // shortcut), and anywhere else Tab types a tab character. Indenting the paragraph instead did
      // nothing visible on imported paragraphs, whose own margin wins over the indent level.
      Tab: () => {
        if (this.editor.isActive('listItem')) return this.editor.commands.indent()
        if (this.editor.isActive('table')) return false
        if (!this.editor.schema.nodes.tab) return this.editor.commands.indent()
        return this.editor.chain().insertContent({ type: 'tab' }).run()
      },
      'Shift-Tab': () => {
        if (this.editor.isActive('listItem')) return this.editor.commands.outdent()
        if (this.editor.isActive('table')) return false
        const { selection } = this.editor.state
        if (selection.empty && selection.$from.nodeBefore?.type.name === 'tab') {
          return this.editor.commands.deleteRange({ from: selection.from - 1, to: selection.from })
        }
        // Nothing to take back still keeps the keyboard in the document.
        this.editor.commands.outdent()
        return true
      },
      // As in Word: Backspace at the start of a paragraph with a first-line indent removes the indent
      // first; only the next Backspace joins it to the line above.
      Backspace: () => {
        const { state } = this.editor
        const { selection } = state
        if (!selection.empty || selection.$from.parentOffset !== 0) return false
        const parent = selection.$from.parent
        if (parent.type.name !== 'paragraph' && parent.type.name !== 'heading') return false
        const style = typeof parent.attrs.style === 'string' ? parent.attrs.style : ''
        if (firstLineIndentPx(style) <= 0) return false
        const pos = selection.$from.before()
        return this.editor.commands.command(({ tr, dispatch }) => {
          if (dispatch) tr.setNodeMarkup(pos, undefined, { ...parent.attrs, style: withoutFirstLineIndent(style) })
          return true
        })
      },
    }
  },
})

const CSS_UNIT_PX: Record<string, number> = { px: 1, pt: 96 / 72, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, em: 16 }

/** A paragraph style's first-line indent (text-indent) in pixels; 0 when it has none. */
export function firstLineIndentPx(style: string): number {
  const match = /(?:^|;)\s*text-indent\s*:\s*(-?[\d.]+)\s*(px|pt|in|cm|mm|em)?/i.exec(style)
  if (!match) return 0
  return parseFloat(match[1]) * (CSS_UNIT_PX[(match[2] ?? 'px').toLowerCase()] ?? 1)
}

/** The style with its first-line indent set to 0 (the rest unchanged). */
export function withoutFirstLineIndent(style: string): string {
  return style.replace(/((?:^|;)\s*text-indent\s*:\s*)[^;]*/i, '$10')
}
