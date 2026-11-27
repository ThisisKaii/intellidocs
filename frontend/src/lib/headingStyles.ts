import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/**
 * Whether the document already formats its lines with heading styles (Heading 1-3). Until it does,
 * the writer formats lines by hand (14pt, bold, centred), and a guess that a line "is a Heading 2"
 * replaces their own formatting with a style they never chose: such guesses wait until the document
 * uses a heading style, and the writer's own formatting habits are suggested instead.
 */
export function documentUsesHeadingStyles(doc: ProseMirrorNode): boolean {
  let found = false
  doc.descendants((node) => {
    if (found) return false
    if (node.type.name === 'heading' && !node.attrs.generated) found = true
    return !found && !node.isTextblock
  })
  return found
}

/** A heading-style format key ("heading1", "heading2", "heading3"). */
export function isHeadingStyleFormat(format: string | null | undefined): boolean {
  return typeof format === 'string' && /^heading[1-3]$/.test(format)
}
