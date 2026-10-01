import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { DOMSerializer } from '@tiptap/pm/model'

import { buildBlueprintHtml, getBlueprint } from './documentBlueprints'
import {
  buildScaffold,
  renderScaffoldHtml,
  type SourceSection,
} from './ieeeScaffold'
import { applyIeeeNumbering } from './ieeeNumberingCommand'

/** HTML for a single top-level node, using the editor's own schema. */
function serializeBlock(
  serializer: DOMSerializer,
  node: ProseMirrorNode
): string {
  const holder = document.createElement('div')
  holder.appendChild(serializer.serializeNode(node))
  return holder.innerHTML
}

/**
 * Groups a document into sections at each heading.
 *
 * Content before the first heading becomes a section with no heading, which
 * is how the author block and abstract are carried across. A heading marked
 * as the document title becomes a section of its own, so the paragraphs after
 * it are not mistaken for part of the title.
 */
export function splitIntoSections(
  doc: ProseMirrorNode,
  schema: Editor['schema']
): SourceSection[] {
  const serializer = DOMSerializer.fromSchema(schema)
  const sections: SourceSection[] = []

  let heading: string | null = null
  let isTitle = false
  let parts: string[] = []

  const flush = (): void => {
    if (parts.length > 0) {
      sections.push({ heading, isTitle, html: parts.join('') })
    }
    heading = null
    isTitle = false
    parts = []
  }

  doc.forEach((node) => {
    if (node.type.name === 'heading') {
      flush()
      const titleRole = node.attrs['docRole'] === 'title'
      const block = serializeBlock(serializer, node)

      if (titleRole) {
        sections.push({ heading: node.textContent, isTitle: true, html: block })
        return
      }

      heading = node.textContent
      parts = [block]
      return
    }

    parts.push(serializeBlock(serializer, node))
  })

  flush()
  return sections
}

/**
 * Restructures the open document into the IEEE blueprint.
 *
 * Replaces the document's content with the IEEE structure, carrying across any
 * section whose heading matches an IEEE slot by name and leaving the rest
 * blank. Source content that matches nothing is kept at the end under an
 * "Unmapped Content" heading rather than discarded. Headings are then
 * renumbered to IEEE convention.
 *
 * This is destructive to the document's layout, so callers should confirm
 * before invoking it. Returns false when the document is empty.
 */
export function convertToIeee(editor: Editor): boolean {
  const sections = splitIntoSections(editor.state.doc, editor.schema)
  if (sections.length === 0) {
    return false
  }

  const ieee = getBlueprint('ieee')
  const result = buildScaffold(sections, ieee)
  const html = renderScaffoldHtml(result, ieee, buildBlueprintHtml)

  editor.commands.setContent(html)
  applyIeeeNumbering(editor)
  return true
}
