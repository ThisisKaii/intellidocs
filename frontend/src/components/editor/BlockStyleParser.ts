import { Extension } from '@tiptap/core'
import { DOMParser as ProseMirrorDOMParser, type ParseRule, type Schema } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'

/**
 * A DOM parser for the live editor in which a block's own inline style never
 * becomes marks on its text.
 *
 * An applied style writes its look (font-weight, font-style, font-size) onto the
 * heading or paragraph itself. ProseMirror re-reads part of the DOM after a browser
 * mutation, and the stock parser turns that block-level `font-weight:700` into a
 * bold mark on the text, so a heading set through the ribbon came back bold and
 * switching it to Normal kept the bold. Here every style→mark rule is limited to
 * elements *inside* a textblock (spans), where inline styles really are marks.
 *
 * Only the view's parser is replaced (DOM re-reads and paste). Loading a document
 * still uses the schema parser, so an imported paragraph styled bold stays bold.
 */
export function blockAwareDomParser(schema: Schema): ProseMirrorDOMParser {
  const textblockContext = Object.values(schema.nodes)
    .filter((type) => type.isTextblock)
    .map((type) => `${type.name}/`)
    .join('|')
  const rules: ParseRule[] = ProseMirrorDOMParser.fromSchema(schema).rules.map((rule): ParseRule =>
    'style' in rule && rule.style && 'mark' in rule && rule.mark && !rule.context
      ? { ...rule, context: textblockContext }
      : rule,
  )
  return new ProseMirrorDOMParser(schema, rules)
}

/** Installs `blockAwareDomParser` as the editor view's `domParser` prop. */
export const BlockStyleParser = Extension.create({
  name: 'blockStyleParser',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          domParser: blockAwareDomParser(this.editor.schema),
        },
      }),
    ]
  },
})
