/**
 * Where an IEEE paper's front matter ends: the title, authors, abstract and index
 * terms run across both columns; everything after flows in two columns.
 * Shared by the two-column draft view (ProseMirror doc) and the print preview (HTML).
 */
export interface FrontMatterBlock {
  isHeading: boolean
  /** A heading carrying the document-title role. */
  isTitle: boolean
  text: string
}

const INDEX_TERMS = /^\s*index terms/i
const ABSTRACT = /^\s*abstract\b/i

/**
 * Exclusive end index of the front matter. Rules, in order:
 *  1. through the "Index Terms" block when there is one;
 *  2. else through the "Abstract" block (heading or lead-in paragraph) and the
 *     paragraphs that follow it up to the next heading;
 *  3. else up to the first heading that is not the title;
 *  4. else nothing is front matter.
 */
export function frontMatterEndIndex(blocks: FrontMatterBlock[]): number {
  const indexTerms = blocks.findIndex((block) => INDEX_TERMS.test(block.text))
  if (indexTerms >= 0) return indexTerms + 1

  const abstract = blocks.findIndex((block) => ABSTRACT.test(block.text))
  if (abstract >= 0) {
    let end = abstract + 1
    while (end < blocks.length && !blocks[end].isHeading) end += 1
    return end
  }

  const firstHeading = blocks.findIndex((block, i) => i > 0 && block.isHeading && !block.isTitle)
  return firstHeading >= 0 ? firstHeading : 0
}
