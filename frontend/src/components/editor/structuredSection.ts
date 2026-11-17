import type { JSONContent } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { AcademicPreset } from './academicPresets'

/** The heading the server's placeholder title stands for: no heading is inserted for it. */
const UNNAMED_SECTION = 'New section'

/**
 * The level a new section heading should take at a position: one below the
 * nearest heading before it (an Introduction under "CHAPTER I" becomes level 2),
 * capped at 3. Level 2 when nothing precedes it.
 */
export function headingLevelAt(doc: ProseMirrorNode, pos: number): number {
  let level = 1
  doc.nodesBetween(0, Math.min(pos, doc.content.size), (node) => {
    if (node.type.name === 'heading' && typeof node.attrs.level === 'number') level = node.attrs.level
    return !node.isTextblock
  })
  return Math.min(level + 1, 3)
}

/**
 * The preset stylist: the user's organised section as TipTap blocks in the
 * active preset's conventions. The heading takes the preset's heading styles
 * through its level; body paragraphs carry the preset's first-line indent and
 * line spacing (IEEE 0.25in, APA 0.5in), as the preset's own reformat does.
 */
export function buildStructuredSectionContent(
  section: { sectionTitle: string; paragraphs: string[] },
  preset: AcademicPreset | null | undefined,
  headingLevel: number
): JSONContent[] {
  const blocks: JSONContent[] = []
  const title = section.sectionTitle.trim()
  if (title && title !== UNNAMED_SECTION) {
    blocks.push({ type: 'heading', attrs: { level: Math.min(Math.max(headingLevel, 1), 6) }, content: [{ type: 'text', text: title }] })
  }
  const style = preset ? `text-indent: ${preset.firstLineIndent}; line-height: ${preset.lineHeight}` : null
  for (const paragraph of section.paragraphs) {
    const text = paragraph.trim()
    if (!text) continue
    blocks.push({ type: 'paragraph', ...(style ? { attrs: { style } } : {}), content: [{ type: 'text', text }] })
  }
  return blocks
}
