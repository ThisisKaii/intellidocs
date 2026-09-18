import { Extension, InputRule } from '@tiptap/core'
import type { ChainedCommands } from '@tiptap/core'

/**
 * Academic markdown triggers (plan point 21).
 *
 * Standard triggers (`# ` H1, `## ` H2, `### ` H3, `> ` blockquote, `- `/`* `
 * bullet list, `1. ` numbered list) are already provided by StarterKit's
 * built-in input rules. This extension adds the custom academic triggers:
 *   `#!# ` -> UCLM Chapter Title (Heading 1, centered, bold)
 *   `##! ` -> Section heading (Heading 2, indented)
 *   `$$ `  -> Equation / formula block (centered mono paragraph)
 *
 * Triggers transform the moment the space key completes the marker and remain
 * fully undoable (input rules run through the transaction pipeline).
 */

/** Build a rule that replaces the marker with an arbitrary command chain. */
function academicTriggerRule(
  find: RegExp,
  apply: (chain: ChainedCommands) => ChainedCommands,
): InputRule {
  return new InputRule({
    find,
    handler({ chain, range }) {
      apply(
        chain()
          .deleteRange({ from: range.from, to: range.to })
          .focus(),
      ).run()
    },
  })
}

export const MarkdownTriggers = Extension.create({
  name: 'academicMarkdownTriggers',

  addInputRules() {
    return [
      // #!#  -> UCLM Chapter Title (H1, centered, bold)
      academicTriggerRule(/^#!#(\s+)$/, (chain) =>
        chain
          .setHeading({ level: 1 })
          .setTextAlign('center')
          .toggleBold()
      ),

      // ##!  -> Section heading (H2, indented)
      academicTriggerRule(/^##!(\s+)$/, (chain) =>
        chain.setHeading({ level: 2 }).indent()
      ),

      // $$   -> Equation block (centered, monospaced)
      academicTriggerRule(/^\$\$(\s+)$/, (chain) =>
        chain
          .setParagraph()
          .setTextAlign('center')
          .setFontFamily('monospace')
          .setFontSize('12pt')
      ),
    ]
  },
})