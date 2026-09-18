import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

const guidePluginKey = new PluginKey('styleGuides')

/** Map a block node to its colored-guide class (plan point 20). */
function guideClassFor(node: ProseMirrorNode): string | null {
  if (node.type.name === 'heading') {
    const level = node.attrs.level as number
    if (level <= 1) return 'style-guide--h1'
    if (level === 2) return 'style-guide--h2'
    return 'style-guide--h3'
  }
  if (node.type.name === 'blockquote') return 'style-guide--quote'
  if (node.type.name === 'title') return 'style-guide--title'
  return null
}

/** Build a decoration set tagging every recognized block with its guide class. */
function buildGuides(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    const cls = guideClassFor(node)
    if (cls) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: cls }))
    }
    return true
  })
  return DecorationSet.create(doc, decorations)
}

/**
 * TipTap extension that decorates formatted blocks (headings, quotes, titles)
 * with colored dashed left-boundary guides. The guides are drawn purely via
 * CSS on a single class per block, so they never alter the document content.
 */
export const StyleGuideExtension = Extension.create({
  name: 'styleGuide',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: guidePluginKey,
        state: {
          init: (_config, { doc }) => buildGuides(doc),
          apply: (tr, value) => (tr.docChanged ? buildGuides(tr.doc) : value),
        },
        props: {
          decorations(state) {
            return guidePluginKey.getState(state)
          },
        },
      }),
    ]
  },
})