import type { Editor } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { mergeStyleDecls } from '@/lib/inlineStyle'
import type { AIChatBlockCategory, AIChatTargetCategory } from '@/services/api'
import { findCaptions } from './captionNumbering'
import { learnedTextMatch } from '@/lib/learnedTextMatch'

/** A document range (ProseMirror positions) a chat formatting request applies to. */
export interface TextRange {
  from: number
  to: number
}

/** How a chat target is meant (mirrors the server's `targetMode`): a section's title line is 'heading'. */
export type TargetMode = 'literal' | 'heading' | 'section' | 'title' | null

/** Styling beyond marks and headings (mirrors the server's `StyleChange`). */
export interface StyleChange {
  lineSpacing: number | null
  firstLineIndentIn: number | null
  fontFamily: string | null
  textCase: 'upper' | 'title' | null
  /** Relative font size change in points (+2 "bigger", -2 "smaller"). */
  fontSizeStep?: number | null
}

/** True when a style change asks for anything. */
export function hasStyle(style: StyleChange | null | undefined): style is StyleChange {
  return Boolean(
    style &&
      (style.lineSpacing !== null ||
        style.firstLineIndentIn !== null ||
        style.fontFamily !== null ||
        style.textCase !== null ||
        (style.fontSizeStep !== null && style.fontSizeStep !== undefined))
  )
}

/** A CSS font size ("12pt", "16px", "11") in points. */
function cssSizeInPoints(value: unknown): number | null {
  const match = typeof value === 'string' ? /^([\d.]+)\s*(pt|px)?$/.exec(value.trim()) : null
  if (!match) return null
  const size = Number.parseFloat(match[1])
  if (!Number.isFinite(size) || size <= 0) return null
  return match[2] === 'px' ? size * 0.75 : size
}

/** The size a run of text shows at: its own font-size mark, else what the page renders, else 12pt. */
function renderedPoints(editor: Editor, pos: number, markSize: unknown): number {
  const own = cssSizeInPoints(markSize)
  if (own !== null) return own
  try {
    const { node } = editor.view.domAtPos(pos)
    const element = node instanceof Element ? node : node.parentElement
    const shown = element ? cssSizeInPoints(window.getComputedStyle(element).fontSize) : null
    if (shown !== null) return shown
  } catch {
    // No rendered view (tests, a destroyed editor): fall back to body size.
  }
  return 12
}

/**
 * "Make the headings bigger": every run of text in the range gets `step` points
 * larger (or smaller) than it is now, so a 16pt heading and a 12pt one both
 * grow by the same amount. Font families and other text styles are kept.
 */
function stepFontSize(editor: Editor, range: TextRange, step: number): void {
  const textStyle = editor.schema.marks.textStyle
  if (!textStyle) return
  const { tr } = editor.state
  editor.state.doc.nodesBetween(range.from, range.to, (node, pos) => {
    if (!node.isText) return true
    const from = Math.max(pos, range.from)
    const to = Math.min(pos + node.nodeSize, range.to)
    if (to <= from) return false
    const existing = node.marks.find((mark) => mark.type === textStyle)
    const next = Math.min(Math.max(Math.round((renderedPoints(editor, from, existing?.attrs.fontSize) + step) * 2) / 2, 6), 96)
    tr.addMark(from, to, textStyle.create({ ...(existing?.attrs ?? {}), fontSize: `${next}pt` }))
    return false
  })
  if (tr.docChanged) editor.view.dispatch(tr)
}

/**
 * A paragraph that works as a heading: short, entirely bold, and not a figure
 * or table caption. Imported theses often style section titles this way
 * ("Statement of the Problem" as a bold paragraph) instead of using headings.
 */
export function isHeadingLikeParagraph(node: ProseMirrorNode): boolean {
  if (node.type.name !== 'paragraph' || node.childCount === 0) return false
  const text = node.textContent.trim()
  const words = text.split(/\s+/).filter(Boolean).length
  if (words === 0 || words > 12 || /^(?:figure|table)\s+\d/i.test(text)) return false
  if (/[.!?]$/.test(text) && (words > 6 || /[!?]$/.test(text))) return false
  let allBold = true
  node.forEach((child) => {
    if (child.isText && child.text?.trim() && !child.marks.some((mark) => mark.type.name === 'bold')) allBold = false
  })
  return allBold
}

/** Standard section titles that start a new section even when styled as plain paragraphs. */
const SECTION_NAMES = new Set([
  'abstract', 'approval sheet', 'acknowledgement', 'acknowledgements', 'acknowledgment', 'acknowledgments',
  'dedication', 'certification', 'glossary', 'table of contents', 'list of tables', 'list of figures',
  'introduction', 'references', 'bibliography', 'appendix', 'appendices', 'recommendation', 'recommendations',
])

const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }

/** Convert a roman numeral to a number, or null when the text is not one. */
function romanToNumber(roman: string): number | null {
  if (!/^[ivxlcdm]+$/.test(roman)) return null
  let total = 0
  for (let i = 0; i < roman.length; i += 1) {
    const value = ROMAN_VALUES[roman[i]]
    const next = ROMAN_VALUES[roman[i + 1]] ?? 0
    total += value < next ? -value : value
  }
  return total
}

/** Lowercase, collapse spaces, and turn roman numerals after chapter/section into digits ("CHAPTER III" -> "chapter 3"). */
export function normalizeSectionKey(text: string): string {
  const flat = text.toLowerCase().replace(/\s+/g, ' ').trim()
  return flat.replace(/\b(chapter|section)\s+([ivxlcdm]+)\b/g, (match: string, word: string, roman: string): string => {
    const value = romanToNumber(roman)
    return value === null ? match : `${word} ${value}`
  })
}

/** True when a block opens a section: a heading, a "CHAPTER n" line, or a standard section title. */
function startsSection(node: ProseMirrorNode): boolean {
  if (node.type.name === 'heading') return true
  if (node.type.name !== 'paragraph') return false
  if (isHeadingLikeParagraph(node)) return true
  const key = normalizeSectionKey(node.textContent).replace(/[:.]+$/, '')
  if (key.length < 3 || key.length > 80) return false
  return /^chapter \d+\b/.test(key) || SECTION_NAMES.has(key)
}

interface TopBlock {
  node: ProseMirrorNode
  pos: number
}

/** Every top-level block with its position. */
function topBlocks(doc: ProseMirrorNode): TopBlock[] {
  const blocks: TopBlock[] = []
  doc.forEach((node, offset) => blocks.push({ node, pos: offset }))
  return blocks
}

/** The whole section a name refers to: its title block and everything up to the next section title. */
export function findSectionRange(doc: ProseMirrorNode, target: string): TextRange | null {
  const key = normalizeSectionKey(target)
  const blocks = topBlocks(doc)
  const isChapter = /^(chapter|section) \d+$/.test(key)
  const keyOf = (node: ProseMirrorNode): string | null =>
    node.type.name === 'heading' || node.type.name === 'paragraph' ? normalizeSectionKey(node.textContent).replace(/[:.]+$/, '') : null
  // An exact title line wins; "chapter 2" may also open a line such as "CHAPTER II: METHODS",
  // but never a table-of-contents line, which ends in its page number ("... STUDIES 11").
  const exact = blocks.findIndex(({ node }) => keyOf(node) === key)
  const start = exact !== -1 || !isChapter
    ? exact
    : blocks.findIndex(({ node }) => {
        const text = keyOf(node)
        if (text === null || !(text.startsWith(`${key} `) || text.startsWith(`${key}:`))) return false
        return !/\d\s*$/.test(text.slice(key.length))
      })
  const fallback =
    start !== -1
      ? start
      : blocks.findIndex(({ node }) => node.type.name === 'heading' && normalizeSectionKey(node.textContent).includes(key))
  if (fallback === -1) return null

  let end = blocks.length
  for (let i = fallback + 1; i < blocks.length; i += 1) {
    if (startsSection(blocks[i].node)) {
      end = i
      break
    }
  }
  const first = blocks[fallback]
  const last = blocks[end - 1]
  return { from: first.pos + 1, to: last.pos + last.node.nodeSize - 1 }
}

/** The document title: a block marked as the title, else the first text block (title pages open with it). */
export function findTitleRange(doc: ProseMirrorNode): TextRange | null {
  const blocks = topBlocks(doc).filter(({ node }) => node.textContent.trim().length > 0)
  const marked = blocks.find(({ node }) => node.attrs?.docRole === 'title')
  const chosen = marked ?? blocks[0]
  return chosen ? { from: chosen.pos + 1, to: chosen.pos + chosen.node.nodeSize - 1 } : null
}

/** Every occurrence of an exact phrase (case-insensitive) inside the document's text. */
export function findLiteralRanges(doc: ProseMirrorNode, phrase: string): TextRange[] {
  const needle = phrase.toLowerCase()
  const ranges: TextRange[] = []
  if (needle.trim().length === 0) return ranges
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true
    const haystack = node.text.toLowerCase()
    for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + needle.length)) {
      ranges.push({ from: pos + index, to: pos + index + needle.length })
    }
    return true
  })
  return ranges
}

/** True for a block that is a chapter heading ("CHAPTER I", "Chapter 2: Methods"). */
export function isChapterHeading(node: ProseMirrorNode): boolean {
  if (node.type.name !== 'heading' && node.type.name !== 'paragraph') return false
  const key = normalizeSectionKey(node.textContent)
  if (!/^chapter \d+\b/.test(key)) return false
  // A table-of-contents line ("CHAPTER I: INTRODUCTION 1") ends in a page number.
  const rest = key.replace(/^chapter \d+/, '')
  return !/\S.*\d$/.test(rest.trim())
}

/** Text-align values for the align_* formats. */
const ALIGNMENTS: Record<string, 'left' | 'center' | 'right' | 'justify'> = {
  align_left: 'left',
  align_center: 'center',
  align_right: 'right',
  align_justify: 'justify',
}

/** Heading levels for the heading formats. */
const HEADING_LEVELS: Record<string, 1 | 2 | 3> = { heading1: 1, h1: 1, heading2: 2, h2: 2, heading3: 3, h3: 3 }

/** Wrapper blocks a format puts text into, by node type name. */
const WRAPPERS: Record<string, 'bulletList' | 'orderedList' | 'blockquote'> = {
  unordered_list: 'bulletList',
  ul: 'bulletList',
  ordered_list: 'orderedList',
  ol: 'orderedList',
  blockquote: 'blockquote',
}

/** Block categories a bulk chat request can target (mirrors the server's `targetCategory`). */
export type BlockCategory = Exclude<AIChatTargetCategory, 'all'>

/** Categories that are whole container blocks, by node type: the block is changed as one range. */
const CONTAINER_TYPES: Partial<Record<AIChatBlockCategory, readonly string[]>> = {
  lists: ['bulletList', 'orderedList'],
  bulletLists: ['bulletList'],
  numberedLists: ['orderedList'],
  tables: ['table'],
  quotes: ['blockquote'],
}

/** Every outermost block of the given types (a list nested in a list goes with its parent). */
function containerRanges(doc: ProseMirrorNode, types: readonly string[]): TextRange[] {
  const ranges: TextRange[] = []
  doc.descendants((node, pos) => {
    if (!types.includes(node.type.name)) return true
    if (node.nodeSize > 2) ranges.push({ from: pos + 1, to: pos + node.nodeSize - 1 })
    return false
  })
  return ranges
}

/** Figure and table captions: tagged by the editor or recognised from their "Figure 3"/"Table 2" label. */
function captionRanges(doc: ProseMirrorNode): TextRange[] {
  return findCaptions(doc)
    .filter(({ node }) => node.content.size > 0)
    .map(({ pos, node }) => ({ from: pos + 1, to: pos + node.nodeSize - 1 }))
}

/** The inside of a block as a range. */
function inside(block: TopBlock): TextRange {
  return { from: block.pos + 1, to: block.pos + block.node.nodeSize - 1 }
}

/**
 * Section headings: the headings inside the chapters, whether real H2/H3
 * headings or bold heading-like paragraphs. Front matter (before the first
 * chapter), chapter lines, the chapter title right under one ("INTRODUCTION")
 * and table cells are not section headings.
 */
function sectionHeadingRanges(doc: ProseMirrorNode): TextRange[] {
  const blocks = topBlocks(doc)
  const firstChapter = blocks.findIndex(({ node }) => isChapterHeading(node))
  const ranges: TextRange[] = []
  blocks.forEach((block, index) => {
    if (firstChapter !== -1 && index <= firstChapter) return
    const { node } = block
    if (isChapterHeading(node) || node.attrs?.docRole === 'title') return
    // The chapter's own title under "CHAPTER 2" ("REVIEW OF RELATED LITERATURE"): an H1 or an all-caps line.
    const previous = blocks.slice(0, index).reverse().find(({ node: prior }) => prior.textContent.trim().length > 0)
    const text = node.textContent.trim()
    const isChapterTitle = node.attrs?.level === 1 || (text === text.toUpperCase() && /[A-Z]/.test(text))
    if (previous && isChapterHeading(previous.node) && isChapterTitle) return
    const isSection = node.type.name === 'heading' ? node.attrs?.level !== 1 : isHeadingLikeParagraph(node)
    if (isSection && node.textContent.trim().length > 0) ranges.push(inside(block))
  })
  return ranges
}

/**
 * Research questions: paragraphs ending in a question mark. Each run of
 * consecutive questions is one range, so it becomes one numbered list.
 */
function questionRanges(doc: ProseMirrorNode): TextRange[] {
  const ranges: TextRange[] = []
  let run: TextRange | null = null
  for (const block of topBlocks(doc)) {
    const isQuestion = block.node.type.name === 'paragraph' && /\?\s*$/.test(block.node.textContent)
    if (isQuestion) {
      const range = inside(block)
      run = run ? { from: run.from, to: range.to } : range
    } else if (block.node.textContent.trim().length > 0 && run) {
      ranges.push(run)
      run = null
    }
  }
  if (run) ranges.push(run)
  return ranges
}

type ExceptCategory = `except:${AIChatBlockCategory}`

function isExcept(category: BlockCategory): category is ExceptCategory {
  return category.startsWith('except:')
}

/** "Everything except X": every text block that is not inside one of X's ranges. */
function exceptRanges(doc: ProseMirrorNode, category: ExceptCategory): TextRange[] {
  const excluded = findCategoryRanges(doc, category.slice('except:'.length) as AIChatBlockCategory)
  const ranges: TextRange[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const range = { from: pos + 1, to: pos + node.nodeSize - 1 }
    const inExcluded = excluded.some((other) => range.from >= other.from && range.to <= other.to)
    if (range.to > range.from && !inExcluded) ranges.push(range)
    return false
  })
  return ranges
}

const HEADING_LEVEL_CATEGORIES: Partial<Record<AIChatBlockCategory, number>> = { h1Headings: 1, h2Headings: 2, h3Headings: 3 }

/** Where a positional change points: a kind of block, which one, on which page, in which section. */
export interface BlockPlace {
  /** The kind of block; 'all' is every text block ("make page 3 double-spaced"). */
  category: AIChatTargetCategory
  /** 1-based; -1 is the last one; null is every one there. */
  index: number | null
  /** A page of the document, or the page the cursor is on. */
  page: number | 'current' | null
  /** The section or chapter it is in ("introduction", "chapter 2"). */
  within: string | null
}

/** Every non-empty text block as a range. */
function textblockRanges(doc: ProseMirrorNode): TextRange[] {
  const ranges: TextRange[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    if (node.content.size > 0 && node.textContent.trim()) ranges.push({ from: pos + 1, to: pos + node.nodeSize - 1 })
    return false
  })
  return ranges
}

/**
 * The blocks a positional change points at: "the 2nd paragraph of the Introduction", "the last
 * table on page 4", "the headings on this page". The section's own heading is not one of its
 * blocks. `pageOf` maps a position to its page (the editor's layout); without it a page cannot be
 * resolved and nothing matches. Empty when the place does not exist.
 */
export function findPlacedRanges(
  doc: ProseMirrorNode,
  place: BlockPlace,
  pageOf: ((pos: number) => number) | null,
  currentPage: number | null
): TextRange[] {
  let ranges = place.category === 'all' ? textblockRanges(doc) : findCategoryRanges(doc, place.category)
  if (place.within) {
    const section = resolveTargetRanges(doc, place.within, 'section')
    if (section.length === 0) return []
    const from = Math.min(...section.map((range) => range.from))
    const to = Math.max(...section.map((range) => range.to))
    ranges = ranges.filter((range) => range.from > from && range.to <= to)
  }
  if (place.page !== null) {
    const page = place.page === 'current' ? currentPage : place.page
    if (!pageOf || page === null) return []
    ranges = ranges.filter((range) => pageOf(range.from) === page)
  }
  if (place.index !== null) {
    const picked = place.index === -1 ? ranges[ranges.length - 1] : ranges[place.index - 1]
    return picked ? [picked] : []
  }
  return ranges
}

/** Every text block a category names, each as its own range (questions: one range per run). */
export function findCategoryRanges(doc: ProseMirrorNode, category: BlockCategory): TextRange[] {
  if (isExcept(category)) return exceptRanges(doc, category)
  const level = HEADING_LEVEL_CATEGORIES[category]
  if (level) {
    const ranges: TextRange[] = []
    doc.descendants((node, pos) => {
      if (node.type.name === 'heading' && node.attrs?.level === level && node.content.size > 0) ranges.push({ from: pos + 1, to: pos + node.nodeSize - 1 })
      return !node.isTextblock
    })
    return ranges
  }
  if (category === 'sections') return sectionHeadingRanges(doc)
  if (category === 'questions') return questionRanges(doc)
  if (category === 'captions') return captionRanges(doc)
  const containers = CONTAINER_TYPES[category]
  if (containers) return containerRanges(doc, containers)
  // Body text starts at the first chapter: a thesis's title page and front matter are not body paragraphs.
  const firstChapter = category === 'paragraphs' ? topBlocks(doc).find(({ node }) => isChapterHeading(node)) : undefined
  const bodyStart = firstChapter ? firstChapter.pos : 0
  const ranges: TextRange[] = []
  doc.descendants((node, pos) => {
    if (pos < bodyStart) return true
    const matches =
      category === 'headings'
        ? // Real headings, plus the bold heading lines and "CHAPTER n" lines imported documents use
          // instead (top level only, so a bold table cell is not a heading).
          node.type.name === 'heading' ||
          (doc.resolve(pos).depth === 0 && (isChapterHeading(node) || isHeadingLikeParagraph(node)))
        : category === 'chapters'
          ? isChapterHeading(node)
          : // Body paragraphs: not a "CHAPTER n" line, a heading-like bold line, or the title.
            node.type.name === 'paragraph' && !isChapterHeading(node) && !isHeadingLikeParagraph(node) && node.attrs?.docRole !== 'title'
    if (matches) {
      const from = pos + 1
      const to = pos + node.nodeSize - 1
      if (to > from) ranges.push({ from, to })
    }
    return true
  })
  return ranges
}

/** Typed list numbering or bullets at the start of a line ("1. ", "a) ", "- "). */
const MANUAL_MARKER = /^\s*(?:\d{1,2}[.)]|[a-z][.)]|[-•*])\s+/i

/**
 * Remove typed numbering from the lines of a range before it becomes a real
 * list, so "1. How long ...?" does not read "1. 1. How long ...?".
 */
function stripManualMarkers(editor: Editor, range: TextRange): void {
  const { tr } = editor.state
  const cuts: TextRange[] = []
  editor.state.doc.nodesBetween(range.from, range.to, (node, pos) => {
    if (!node.isTextblock) return true
    const marker = MANUAL_MARKER.exec(node.textContent)
    if (marker && node.firstChild?.isText && (node.firstChild.text ?? '').length >= marker[0].length) {
      cuts.push({ from: pos + 1, to: pos + 1 + marker[0].length })
    }
    return false
  })
  for (const cut of cuts.reverse()) tr.delete(cut.from, cut.to)
  if (tr.docChanged) editor.view.dispatch(tr)
}

/** Capitalize a word's first letter, keeping minor words small inside a title. */
const MINOR_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to'])

function toTitleCase(text: string, startsBlock: boolean): string {
  const allCaps = text === text.toUpperCase()
  let first = startsBlock
  return text.replace(/[A-Za-z][A-Za-z'’]*/g, (word) => {
    const base = allCaps ? word.toLowerCase() : word
    const keepSmall = !first && MINOR_WORDS.has(base.toLowerCase())
    first = false
    return keepSmall ? base.toLowerCase() : base.charAt(0).toUpperCase() + base.slice(1)
  })
}

/**
 * Apply line spacing, first-line indent, font family and letter case to a
 * range, keeping everything else. Spacing and indent are written into each
 * block's own inline style (other declarations kept); the indent goes on body
 * paragraphs only, never on headings or heading-like lines. Font family is a
 * text-style mark merged per text run, and a case change replaces only the
 * letters, keeping every mark.
 */
export function applyStyle(editor: Editor, range: TextRange, style: StyleChange): void {
  if (style.fontSizeStep) stepFontSize(editor, range, style.fontSizeStep)

  if (style.fontFamily) {
    editor.chain().setTextSelection(range).setMark('textStyle', { fontFamily: style.fontFamily }).run()
  }

  if (style.textCase) {
    const { tr, schema } = editor.state
    const pieces: Array<{ from: number; to: number; text: string; startsBlock: boolean; node: ProseMirrorNode }> = []
    editor.state.doc.nodesBetween(range.from, range.to, (node, pos, _parent, index) => {
      if (!node.isText || !node.text) return true
      const from = Math.max(pos, range.from)
      const to = Math.min(pos + node.nodeSize, range.to)
      if (to <= from) return false
      pieces.push({ from, to, text: node.text.slice(from - pos, to - pos), startsBlock: index === 0 && from === pos, node })
      return false
    })
    for (const piece of pieces.reverse()) {
      const next = style.textCase === 'upper' ? piece.text.toUpperCase() : toTitleCase(piece.text, piece.startsBlock)
      if (next !== piece.text) tr.replaceWith(piece.from, piece.to, schema.text(next, piece.node.marks))
    }
    if (tr.docChanged) editor.view.dispatch(tr)
  }

  if (style.lineSpacing !== null || style.firstLineIndentIn !== null) {
    const { tr } = editor.state
    editor.state.doc.nodesBetween(range.from, range.to, (node, pos) => {
      if (!node.isTextblock) return true
      if (!node.type.spec.attrs || !('style' in node.type.spec.attrs)) return false
      const decls: Record<string, string> = {}
      if (style.lineSpacing !== null) decls['line-height'] = String(style.lineSpacing)
      const centered = node.attrs?.textAlign === 'center' || node.attrs?.textAlign === 'right'
      const isBody = node.type.name === 'paragraph' && !centered && !isChapterHeading(node) && !isHeadingLikeParagraph(node) && node.attrs?.docRole !== 'title'
      if (style.firstLineIndentIn !== null && isBody) decls['text-indent'] = `${style.firstLineIndentIn}in`
      if (Object.keys(decls).length > 0) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, style: mergeStyleDecls(node.attrs.style as string | null, decls) })
      }
      return false
    })
    if (tr.docChanged) editor.view.dispatch(tr)
  }
}

/** A preset's body text: what "Apply to existing paragraphs" writes onto each body paragraph. */
export interface PresetBodyLook {
  /** A single family name, e.g. "Times New Roman". */
  fontFamily: string
  /** CSS size, e.g. "12pt". */
  fontSize: string
  /** Line height as a multiple, e.g. 2 for double spacing. */
  lineHeight: number
  /** CSS length, e.g. "0.5in". */
  firstLineIndent: string
  /** The preset's page margins in px: this part's section breaks take them (see applyPresetToBody). */
  margins?: { top: number; right: number; bottom: number; left: number }
}

/**
 * Reformat the existing body paragraphs into a preset's body style: font,
 * size, line spacing and first-line indent. Only top-level body paragraphs
 * inside the chapters change (never the title page, headings, heading-like
 * bold lines, centered lines, captions or table cells). Every other inline
 * style and mark is kept, and the whole change is ONE transaction, so a
 * single undo takes it back. Returns how many paragraphs changed.
 */
/** Imported side indents up to this size are the old file's layout, not a deliberate block indent. */
const MAX_LAYOUT_INDENT_PX = 72

function px(value: string): number | null {
  const match = /^(-?[\d.]+)(px|pt|in)?$/.exec(value.trim())
  if (!match) return value.trim() === '0' ? 0 : null
  const n = Number(match[1])
  return match[2] === 'pt' ? (n * 4) / 3 : match[2] === 'in' ? n * 96 : n
}

/**
 * A block's inline style without the left/right indents (and, for headings, the first-line indent)
 * a Word file gave it: under a preset the page margins and the preset's own heading and body rules
 * place the text. Larger indents (a quotation, a hanging list) are kept; a `margin` shorthand keeps
 * its top and bottom.
 */
export function withoutLayoutIndents(style: string | null | undefined, heading: boolean): string | null {
  const kept: string[] = []
  for (const decl of (style ?? '').split(';')) {
    const colon = decl.indexOf(':')
    if (colon < 1) continue
    const prop = decl.slice(0, colon).trim().toLowerCase()
    const value = decl.slice(colon + 1).trim()
    if (prop === 'margin') {
      const parts = value.split(/\s+/)
      const [top, right = top, bottom = top, left = right] = parts
      kept.push(`margin-top: ${top}`, `margin-bottom: ${bottom}`)
      for (const [side, v] of [['right', right], ['left', left]] as const) {
        const n = px(v)
        if (n === null || Math.abs(n) > MAX_LAYOUT_INDENT_PX) kept.push(`margin-${side}: ${v}`)
      }
      continue
    }
    if (prop === 'margin-left' || prop === 'margin-right') {
      const n = px(value)
      if (n !== null && Math.abs(n) <= MAX_LAYOUT_INDENT_PX) continue
    }
    if (heading && prop === 'text-indent') {
      const n = px(value)
      if (n !== null && Math.abs(n) <= MAX_LAYOUT_INDENT_PX) continue
    }
    kept.push(`${prop}: ${value}`)
  }
  return kept.length > 0 ? kept.join('; ') : null
}

export function applyPresetToBody(editor: Editor, look: PresetBodyLook): number {
  const { state } = editor
  const blocks = topBlocks(state.doc)
  const firstChapter = blocks.findIndex(({ node }) => isChapterHeading(node))
  const textStyle = state.schema.marks.textStyle
  const { tr } = state
  let changed = 0
  for (const { node, pos } of blocks.slice(firstChapter === -1 ? 0 : firstChapter)) {
    if (node.textContent.trim().length === 0) continue
    // Headings and heading-like lines keep their look; only the old file's indents go, so they sit at
    // the preset's margin (they were 0.25-0.5" in from it, out of line with the body).
    const headingLike = node.type.name === 'heading' || (node.type.name === 'paragraph' && (isChapterHeading(node) || isHeadingLikeParagraph(node)))
    // The import keeps a small left margin as an indent level (IndentExtension, 24px a level): that
    // level is the same old layout, so it goes too.
    const indent = Number(node.attrs?.indent) || 0
    const level = indent > 0 && indent * 24 <= MAX_LAYOUT_INDENT_PX ? 0 : indent
    if (headingLike && node.type.spec.attrs && 'style' in node.type.spec.attrs) {
      const style = withoutLayoutIndents(node.attrs.style as string | null, true)
      if (style !== (node.attrs.style ?? null) || level !== indent) tr.setNodeMarkup(pos, undefined, { ...node.attrs, style, ...(level !== indent ? { indent: level } : {}) })
      continue
    }
    if (node.type.name !== 'paragraph' || node.attrs?.docRole === 'title') continue
    if (node.attrs?.textAlign === 'center' || node.attrs?.textAlign === 'right') continue
    if (node.type.spec.attrs && 'style' in node.type.spec.attrs) {
      const style = mergeStyleDecls(withoutLayoutIndents(node.attrs.style as string | null, false), { 'line-height': String(look.lineHeight), 'text-indent': look.firstLineIndent })
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, style, ...(level !== indent ? { indent: level } : {}) })
    }
    if (textStyle) {
      node.forEach((child, offset) => {
        if (!child.isText) return
        const from = pos + 1 + offset
        const existing = child.marks.find((mark) => mark.type === textStyle)
        tr.addMark(from, from + child.nodeSize, textStyle.create({ ...(existing?.attrs ?? {}), fontFamily: look.fontFamily, fontSize: look.fontSize }))
      })
    }
    changed += 1
  }
  // An imported file's sections carry its own margins, and the editor keeps each section's text there
  // (SectionLayout). Under the preset this part's sections take the preset's margins instead, so its
  // text, headings and pictures all sit at the preset's margins; parts not reformatted keep theirs.
  if (look.margins) {
    const margins = look.margins
    state.doc.forEach((node, pos) => {
      if (node.type.name !== 'pageBreak' && node.type.name !== 'sectionMark') return
      const props = node.attrs.sectionProps as { margins?: Record<string, number> } | null | undefined
      if (!props || typeof props !== 'object' || !props.margins) return
      const current = props.margins
      if (['top', 'right', 'bottom', 'left'].every((side) => current[side] === margins[side as keyof typeof margins])) return
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, sectionProps: { ...props, margins: { ...current, ...margins } } })
    })
  }
  if (tr.docChanged) editor.view.dispatch(tr)
  return changed
}

/**
 * For a heading request on a literal phrase, the blocks that ARE that phrase
 * (a title line), not every sentence that mentions it. Falls back to all
 * matches when no block consists of the phrase alone.
 */
export function preferWholeBlocks(doc: ProseMirrorNode, ranges: TextRange[]): TextRange[] {
  const whole = ranges.filter((range) => {
    const $from = doc.resolve(range.from)
    const block = $from.parent
    return block.isTextblock && block.textContent.trim().toLowerCase() === doc.textBetween(range.from, range.to).trim().toLowerCase()
  })
  return whole.length > 0 ? whole : ranges
}

/** The inside of every text block that overlaps a range, top to bottom. */
function textblocksIn(doc: ProseMirrorNode, from: number, to: number): TextRange[] {
  const blocks: TextRange[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true
    blocks.push({ from: pos + 1, to: pos + node.nodeSize - 1 })
    return false
  })
  return blocks
}

/**
 * Turn one text block into a heading. The selection stays inside that block so
 * TipTap's setNode copies the block's own attributes (alignment, spacing,
 * section role) instead of resetting them.
 */
function setHeadingKeepingAttrs(editor: Editor, block: TextRange, level: 1 | 2 | 3): void {
  const node = editor.state.doc.nodeAt(block.from - 1)
  if (node?.type.name === 'heading' && node.attrs.level === level) return
  editor.chain().setTextSelection(block).setHeading({ level }).run()
}

/** Put a range into a list or quote block, unless it already is one; never toggles it back out. */
function wrapOnce(editor: Editor, range: TextRange, wrapper: 'bulletList' | 'orderedList' | 'blockquote'): void {
  editor.chain().setTextSelection(range).run()
  if (editor.isActive(wrapper)) return
  if (wrapper !== 'blockquote') {
    const before = editor.state.doc.content.size
    stripManualMarkers(editor, range)
    range = { from: range.from, to: range.to - (before - editor.state.doc.content.size) }
    editor.chain().setTextSelection(range).run()
  }
  const chain = editor.chain()
  if (wrapper === 'bulletList') chain.toggleBulletList().run()
  else if (wrapper === 'orderedList') chain.toggleOrderedList().run()
  else chain.setBlockquote().run()
}

/**
 * Apply (or clear) formatting over each range, bottom-up so earlier positions
 * stay valid. Everything is additive: a mark the text already has stays, other
 * marks and styles are left alone, and nothing is toggled off.
 *
 * A heading format changes only the first block of a range: for a section
 * target that is the section's title, not the paragraphs under it.
 */
export function applyFormatsToRanges(
  editor: Editor,
  ranges: TextRange[],
  formats: string[],
  fontSize: number | undefined,
  normalize: boolean,
  style?: StyleChange | null
): void {
  const ordered = [...ranges].sort((a, b) => b.from - a.from)
  const align = normalize ? null : formats.map((format) => ALIGNMENTS[format]).find(Boolean) ?? null
  const level = normalize ? undefined : formats.map((format) => HEADING_LEVELS[format]).find(Boolean)
  const wrapper = normalize ? undefined : formats.map((format) => WRAPPERS[format]).find(Boolean)
  for (const { from, to } of ordered) {
    let chain = editor.chain().focus().setTextSelection({ from, to })
    if (normalize) {
      const named = formats.filter((format) => format === 'bold' || format === 'italic' || format === 'underline')
      if (named.length > 0) for (const mark of named) chain = chain.unsetMark(mark)
      else chain = chain.unsetAllMarks()
    } else {
      for (const format of formats) {
        if (format === 'bold' || format === 'italic' || format === 'underline') chain = chain.setMark(format)
      }
    }
    if (fontSize) chain = chain.setMark('textStyle', { fontSize: `${fontSize}pt` })
    chain.run()
    if (level) {
      const first = textblocksIn(editor.state.doc, from, to)[0]
      if (first) setHeadingKeepingAttrs(editor, first, level)
    }
    // Alignment is a block attribute; set it after any heading change.
    if (align) editor.chain().setTextSelection({ from, to }).setTextAlign(align).run()
    if (!normalize && hasStyle(style)) applyStyle(editor, { from, to }, style)
    if (wrapper) wrapOnce(editor, { from, to }, wrapper)
  }
}

/**
 * Apply formats to the user's selection (or, with nothing selected, the block
 * the cursor is in). Set semantics: asking for bold on text that is already
 * bold keeps it bold, and a heading request changes each selected block while
 * keeping its own attributes.
 */
export function applyFormatsToSelection(editor: Editor, formats: string[], fontSize?: number, style?: StyleChange | null): void {
  const { selection, doc } = editor.state
  const blocks = textblocksIn(doc, selection.from, selection.to)
  const range: TextRange = selection.empty && blocks.length > 0
    ? { from: blocks[0].from, to: blocks[0].to }
    : { from: selection.from, to: selection.to }
  if (range.to <= range.from && !fontSize && !hasStyle(style)) return

  let chain = editor.chain().focus().setTextSelection(range)
  for (const format of formats) {
    if (format === 'bold' || format === 'italic' || format === 'underline') chain = chain.setMark(format)
  }
  if (fontSize) chain = chain.setMark('textStyle', { fontSize: `${fontSize}pt` })
  chain.run()

  const level = formats.map((format) => HEADING_LEVELS[format]).find(Boolean)
  if (level) {
    for (const block of textblocksIn(editor.state.doc, range.from, range.to).reverse()) setHeadingKeepingAttrs(editor, block, level)
  }
  const align = formats.map((format) => ALIGNMENTS[format]).find(Boolean)
  if (align) editor.chain().setTextSelection(range).setTextAlign(align).run()
  if (hasStyle(style)) applyStyle(editor, range, style)
  const wrapper = formats.map((format) => WRAPPERS[format]).find(Boolean)
  if (wrapper) wrapOnce(editor, range, wrapper)
  editor.chain().setTextSelection(range).run()
}

/** Block text normalized the way learned habits are keyed (behaviorModel.mergeLearnedPattern). */
export function learnedKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120)
}

/**
 * The paragraphs and headings a learned habit applies to (see learnedTextMatch): the block's text equals the text the
 * habit was learned on, or starts with it when that is a phrase of 6+ characters (the same rule
 * the server uses to suggest a learned format).
 */
export function findLearnedBlockRanges(doc: ProseMirrorNode, key: string): TextRange[] {
  const ranges: TextRange[] = []
  if (key.length < 3) return ranges
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return false
    // The same text, a learned heading phrase it starts with, or the same kind of line
    // ("Chapter 1 Introduction" after "Chapter 1. introduction"), as the server matches it.
    if (learnedTextMatch(key, node.textContent)) {
      ranges.push({ from: pos + 1, to: pos + node.nodeSize - 1 })
    }
    return false
  })
  return ranges
}

/** Resolve a chat target to the document ranges it means, or an empty list when it is not in the document. */
export function resolveTargetRanges(doc: ProseMirrorNode, target: string, mode: TargetMode): TextRange[] {
  if (mode === 'title') {
    const title = findTitleRange(doc)
    return title ? [title] : []
  }
  if (mode === 'literal') return findLiteralRanges(doc, target)
  const section = findSectionRange(doc, target)
  if (!section) return []
  if (mode === 'heading') {
    // Just the title line the name points at, not the text under it.
    const title = textblocksIn(doc, section.from, section.to)[0]
    return title ? [title] : []
  }
  return [section]
}

/** Every place a piece of text occurs inside one textblock (text split across marks still matches). */
export function findTextOccurrences(doc: ProseMirrorNode, needle: string): TextRange[] {
  const hits: TextRange[] = []
  if (!needle) return hits
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    const positions: number[] = []
    node.forEach((child, offset) => {
      if (child.isText && child.text) {
        for (let index = 0; index < child.text.length; index += 1) {
          text += child.text[index]
          positions.push(pos + 1 + offset + index)
        }
      } else {
        // An inline node (picture, hard break) is a character no text can match.
        text += '\uFFFC'
        positions.push(pos + 1 + offset)
      }
    })
    let index = text.indexOf(needle)
    while (index !== -1) {
      hits.push({ from: positions[index], to: positions[index + needle.length - 1] + 1 })
      index = text.indexOf(needle, index + 1)
    }
    return false
  })
  return hits
}

/**
 * Replace the user's words with revisions, keeping their marks, in ONE
 * transaction so a single undo takes them all back. For each revision the
 * occurrence inside `range` (where the text was when it was proposed) wins;
 * otherwise the text must occur exactly once in the document. Returns, per
 * revision, whether it was applied (false once the user has edited it away).
 */
export function replaceTextsInRange(editor: Editor, range: TextRange | null, revisions: Array<{ original: string; refined: string }>): boolean[] {
  const { tr } = editor.state
  let current = range
  const applied = revisions.map(({ original, refined }) => {
    const hits = findTextOccurrences(tr.doc, original)
    const inRange = current ? hits.filter((hit) => hit.from >= (current as TextRange).from && hit.to <= (current as TextRange).to) : []
    const target = inRange.length === 1 ? inRange[0] : hits.length === 1 ? hits[0] : null
    if (!target) return false
    const stepsBefore = tr.mapping.maps.length
    tr.insertText(refined, target.from, target.to)
    // Later revisions are searched in the range as this one reshaped it.
    if (current) {
      const mapping = tr.mapping.slice(stepsBefore)
      current = { from: mapping.map(current.from, -1), to: mapping.map(current.to, 1) }
    }
    return true
  })
  if (applied.some(Boolean)) editor.view.dispatch(tr.scrollIntoView())
  return applied
}
