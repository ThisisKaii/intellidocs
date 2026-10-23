import type { BlueprintSection, DocumentBlueprint } from './documentBlueprints'
import { stripIeeeNumber } from './ieeeNumbering'

/** Escapes text for safe interpolation into a generated HTML string. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Restructures an existing document into the IEEE blueprint's shape.
 *
 * Matching is deliberately conservative: a source section is carried into an
 * IEEE slot only when its heading name equals that slot's name after removing
 * numbering. Nothing is moved on a guess. Slot content that has no source is
 * left blank for the author to fill in.
 */

/** One contiguous run of the source document. */
export interface SourceSection {
  /**
   * Heading text that opened this section, or null for front matter that
   * appears before any heading (author block, abstract, and so on).
   */
  heading: string | null
  /** True when this run is the document title rather than a section. */
  isTitle: boolean
  /** Serialized HTML for the run's blocks, including its heading. */
  html: string
  /** Level of the heading that opened the run, when it has one. */
  level?: 1 | 2 | 3
}

/** One output slot in the IEEE structure. */
export interface ScaffoldSlot {
  section: BlueprintSection
  /** Source HTML carried into this slot, or null when nothing matched. */
  content: string | null
  /** True for a slot that is not rendered because another slot absorbed its content (extra author lines). */
  skip?: boolean
}

export interface ScaffoldResult {
  slots: ScaffoldSlot[]
  /**
   * Source sections that matched no slot. Returned so the caller can keep them
   * rather than silently dropping the author's writing.
   */
  leftovers: SourceSection[]
}

/**
 * Reduces a name to a comparable form: numbering removed, trailing punctuation
 * dropped, lowercased, and internal whitespace collapsed. `I. Introduction` and
 * `Introduction` both become `introduction`, and `Background:` becomes
 * `background`.
 */
export function normalizeHeadingName(name: string): string {
  return stripIeeeNumber(name)
    .replace(/[:.\s]+$/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Other names authors use for an IEEE section. A source heading with one of
 * these names fills the matching IEEE slot, so "Methodology" lands in
 * "Proposed Method" instead of being filed under Unmapped Content.
 */
const SECTION_ALIASES: Readonly<Record<string, string>> = {
  method: 'proposed method',
  methods: 'proposed method',
  methodology: 'proposed method',
  'research methodology': 'proposed method',
  'proposed methodology': 'proposed method',
  results: 'results and discussion',
  discussion: 'results and discussion',
  'results and analysis': 'results and discussion',
  conclusions: 'conclusion',
  'conclusion and future work': 'conclusion',
  keywords: 'index terms',
  'key words': 'index terms',
  'related works': 'related work',
  'literature review': 'related work',
  'review of related literature': 'related work',
  experiments: 'experimental setup',
  reference: 'references',
  bibliography: 'references',
}

/** The name a section is matched under: normalized, with common alternative names folded in. */
export function canonicalSectionName(name: string): string {
  const normalized = normalizeHeadingName(name)
  return SECTION_ALIASES[normalized] ?? normalized
}

/**
 * The name an IEEE slot matches against.
 *
 * Headings use their placeholder text. Paragraph slots may carry a run-in
 * label separated by an em dash, as in `Abstract—A concise summary`; the label
 * before the dash is the name. Returns null for slots that should never pull
 * content in, such as the author and affiliation lines.
 */
export function slotMatchName(section: BlueprintSection): string | null {
  if (section.block === 'heading') {
    return normalizeHeadingName(section.placeholder)
  }

  if (section.block === 'paragraph') {
    const label = /^([^—:]+)[—:]/.exec(section.placeholder)
    return label ? normalizeHeadingName(label[1]) : null
  }

  return null
}

/**
 * Assigns source sections to IEEE slots, then reports which source sections
 * were left over.
 *
 * The title slot matches a section marked as the title. Every other slot
 * matches a source section whose heading has the same name. Each source
 * section can fill at most one slot.
 */
export function buildScaffold(
  sections: readonly SourceSection[],
  blueprint: DocumentBlueprint
): ScaffoldResult {
  const claimed = new Set<number>()

  const slots: ScaffoldSlot[] = blueprint.sections.map((section) => {
    let matchIndex = -1

    if (section.block === 'title') {
      matchIndex = sections.findIndex((source, index) => !claimed.has(index) && source.isTitle)
    } else {
      const target = slotMatchName(section)
      if (target !== null) {
        matchIndex = sections.findIndex((source, index) => {
          if (claimed.has(index) || source.heading === null || source.isTitle) {
            return false
          }
          return canonicalSectionName(source.heading) === target
        })
      }
    }

    if (matchIndex === -1) {
      return { section, content: null }
    }

    claimed.add(matchIndex)
    return { section, content: sections[matchIndex].html }
  })

  // Content that came before any heading (an author block written as plain
  // paragraphs) fills the first author line; the other author lines are not
  // repeated as placeholders.
  const frontMatterIndex = sections.findIndex(
    (source, index) => !claimed.has(index) && source.heading === null && !source.isTitle
  )
  if (frontMatterIndex !== -1) {
    const firstAuthor = slots.findIndex((slot) => slot.section.group === 'author_block' && slot.content === null)
    if (firstAuthor !== -1) {
      claimed.add(frontMatterIndex)
      slots[firstAuthor] = { section: slots[firstAuthor].section, content: sections[frontMatterIndex].html }
      slots.forEach((slot, index) => {
        if (index !== firstAuthor && slot.section.group === 'author_block' && slot.content === null) {
          slots[index] = { ...slot, skip: true }
        }
      })
    }
  }

  const leftovers = sections.filter((_, index) => !claimed.has(index))

  return { slots, leftovers }
}

/**
 * Removes a leading heading element from carried HTML.
 *
 * Used when a source *section* (which includes its heading) fills a slot that
 * expects only body text, such as a source `Abstract` heading filling IEEE's
 * run-in `Abstract—` paragraph. Without this the carried heading would appear
 * as a stray level 1 heading inside the paragraph.
 */
export function stripLeadingHeading(html: string): string {
  return html.replace(/^\s*<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>\s*/i, '').trim()
}

/**
 * Rewrites carried HTML as a title-role heading, so the IEEE title slot styles
 * it as the paper title rather than as a numbered section.
 */
export function coerceToTitleHeading(html: string): string {
  const inner = /^\s*<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>\s*$/i.exec(html)
  const body = inner ? inner[1] : html
  return `<h1 data-doc-role="title">${body}</h1>`
}

/**
 * Rewrites the leading heading of carried HTML to a specific level.
 *
 * A source section's heading keeps whatever level it had in the source, but
 * the slot it fills has its own level. A source `Background` at level 1
 * filling IEEE's level 3 `1) Background:` slot must become a level 3 heading,
 * or it would be numbered and styled as a top-level section.
 */
export function coerceHeadingLevel(html: string, level: 1 | 2 | 3): string {
  const match = /^\s*<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/i.exec(html)
  if (!match) {
    return html
  }

  const rest = html.slice(match[0].length)
  return `<h${level}${match[2]}>${match[3]}</h${level}>${rest}`
}

/** Marker heading placed above source content that matched no IEEE slot. */
export const UNMAPPED_MARKER = 'Unmapped Content'

/**
 * Builds the bold-italic run-in label a filled paragraph slot must keep.
 *
 * IEEE prints the abstract and index terms as a run-in heading inside the
 * paragraph (`Abstract—A concise summary...`). Stripping the source heading
 * removes that label, so it is rebuilt here from the slot's own placeholder.
 * Returns null for paragraph slots with no run-in label, which must not gain one.
 */
export function runInLabel(section: BlueprintSection): string | null {
  if (section.block !== 'paragraph') {
    return null
  }

  const match = /^([^—]+)—/.exec(section.placeholder)
  if (!match) {
    return null
  }

  return `<strong><em>${escapeHtml(match[1].trim())}</em></strong>\u2014`
}

/**
 * Removes an existing "Abstract—" / "Index Terms—" run-in label from the first
 * paragraph of carried text, so the label rebuilt for the slot is never doubled.
 */
export function removeRunInLabel(html: string): string {
  return html.replace(
    /^(\s*<p[^>]*>)\s*(?:<(?:strong|em|b|i)>\s*)*(?:abstract|index terms|keywords?)(?:\s*<\/(?:strong|em|b|i)>)*\s*[\u2014\u2013:-]\s*/i,
    '$1'
  )
}

/**
 * Puts a run-in label at the start of the first paragraph of carried body text,
 * so "Abstract—" and the abstract text share one paragraph. Anything after the
 * first paragraph (more paragraphs, images, tables) stays outside it, and
 * nothing is ever wrapped inside another paragraph.
 */
export function mergeRunIn(label: string, bodyHtml: string, style: string = ''): string {
  const styleAttr = style ? ` style="${style}"` : ''
  const first = /^\s*<p([^>]*)>([\s\S]*?)<\/p>/i.exec(bodyHtml)
  if (!first) {
    return `<p${styleAttr}>${label}</p>${bodyHtml}`
  }
  return `<p${styleAttr}>${label} ${first[2]}</p>${bodyHtml.slice(first[0].length)}`
}

/**
 * Builds the final HTML for a scaffold: IEEE sections in order, then any
 * source sections that matched nothing.
 *
 * Blank slots are rendered through the blueprint so they carry the same dashed
 * guides as a newly created IEEE document. Leftovers are kept verbatim under
 * an unnumbered marker so the author's writing is never silently discarded.
 */
export function renderScaffoldHtml(
  result: ScaffoldResult,
  blueprint: DocumentBlueprint,
  renderBlank: (blueprint: DocumentBlueprint) => string
): string {
  const blocks = result.slots.map((slot, index) => {
    if (slot.skip) {
      return ''
    }

    if (slot.content === null) {
      // The blueprint's body placeholder after a heading is dropped when the
      // heading's own section already carried its text across.
      const previous = result.slots[index - 1]
      const isBodyPlaceholder =
        slot.section.block === 'paragraph' && !slot.section.group && slotMatchName(slot.section) === null
      if (isBodyPlaceholder && previous?.section.block === 'heading' && previous.content !== null) {
        return ''
      }
      return renderBlank({ ...blueprint, sections: [slot.section] })
    }

    if (slot.section.block === 'title') {
      return coerceToTitleHeading(slot.content)
    }

    if (slot.section.block === 'paragraph') {
      const label = runInLabel(slot.section)
      const body = removeRunInLabel(stripLeadingHeading(slot.content))
      // IEEE sets the abstract and index terms in 9pt.
      return label === null ? body : mergeRunIn(label, body, 'font-size: 9pt')
    }

    if (slot.section.block === 'heading' && slot.section.level) {
      return coerceHeadingLevel(slot.content, slot.section.level)
    }

    return slot.content
  })

  if (result.leftovers.length > 0) {
    blocks.push(`<h1>${UNMAPPED_MARKER}</h1>`)
    result.leftovers.forEach((leftover) => blocks.push(leftover.html))
  }

  return blocks.join('')
}
