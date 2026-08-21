import { Extension } from '@tiptap/core'

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

        const { from, to } = state.selection
        let updated = false
        state.doc.nodesBetween(from, to, (node, pos) => {
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

        const { from, to } = state.selection
        let updated = false
        state.doc.nodesBetween(from, to, (node, pos) => {
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
      Tab: () => this.editor.commands.indent(),
      'Shift-Tab': () => this.editor.commands.outdent(),
    }
  },
})
