import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { DOMSerializer } from '@tiptap/pm/model'

import { buildBlueprintHtml, getBlueprint } from './documentBlueprints'
import {
  buildScaffold,
  canonicalSectionName,
  renderScaffoldHtml,
  slotMatchName,
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

/** Section names the IEEE blueprint has a slot for, after alias folding. */
function knownIeeeSectionNames(): Set<string> {
  const names = new Set<string>()
  for (const slot of getBlueprint('ieee').sections) {
    const name = slotMatchName(slot)
    if (name) names.add(name)
  }
  return names
}

/**
 * Groups a document into sections.
 *
 * A new section starts at every level 1 heading and at any lower-level heading
 * whose name is one the IEEE blueprint has a slot for. Other lower-level
 * headings stay inside their parent section, so a subsection such as "Prior
 * Approaches" travels with the section it belongs to.
 *
 * Content before the first heading becomes a section with no heading, which is
 * how the author block is carried across. A heading marked as the document
 * title becomes a section of its own. A first heading is taken as the title
 * only when nothing precedes it and its name is not an IEEE section name, so a
 * document that opens with "Introduction" keeps that as a section.
 */
export function splitIntoSections(
  doc: ProseMirrorNode,
  schema: Editor['schema']
): SourceSection[] {
  const serializer = DOMSerializer.fromSchema(schema)
  const known = knownIeeeSectionNames()
  const sections: SourceSection[] = []

  let heading: string | null = null
  let level: 1 | 2 | 3 | undefined
  let parts: string[] = []

  const flush = (): void => {
    if (parts.length > 0) {
      sections.push({ heading, isTitle: false, html: parts.join(''), level })
    }
    heading = null
    level = undefined
    parts = []
  }

  doc.forEach((node) => {
    if (node.type.name !== 'heading') {
      // An "Abstract—…" or "Index Terms—…" paragraph starts its own section, so it
      // fills its IEEE slot instead of being filed with the author block.
      const runIn = /^(abstract|index terms|keywords?)\s*[\u2014\u2013:-]/i.exec(node.textContent.trim())
      if (runIn) {
        flush()
        heading = runIn[1]
        level = undefined
      }
      parts.push(serializeBlock(serializer, node))
      return
    }

    const headingLevel = Math.min(Math.max(Number(node.attrs['level']) || 1, 1), 3) as 1 | 2 | 3
    const block = serializeBlock(serializer, node)
    const name = canonicalSectionName(node.textContent)
    const isFirstBlock = sections.length === 0 && parts.length === 0

    const titleRole = node.attrs['docRole'] === 'title' || (isFirstBlock && heading === null && !known.has(name))
    if (titleRole) {
      flush()
      sections.push({ heading: node.textContent, isTitle: true, html: block })
      return
    }

    const startsSection = headingLevel === 1 || known.has(name) || heading === null
    if (startsSection) {
      flush()
      heading = node.textContent
      level = headingLevel
      parts = [block]
      return
    }

    parts.push(block)
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
