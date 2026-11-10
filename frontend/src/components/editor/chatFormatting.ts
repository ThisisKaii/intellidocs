import type { Editor } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { mergeStyleDecls } from '@/lib/inlineStyle'

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
}

/** True when a style change asks for anything. */
export function hasStyle(style: StyleChange | null | undefined): style is StyleChange {
  return Boolean(style && (style.lineSpacing !== null || style.firstLineIndentIn !== null || style.fontFamily !== null || style.textCase !== null))
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
export type BlockCategory = 'headings' | 'sections' | 'paragraphs' | 'chapters' | 'questions'

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

/** Every text block a category names, each as its own range (questions: one range per run). */
export function findCategoryRanges(doc: ProseMirrorNode, category: BlockCategory): TextRange[] {
  if (category === 'sections') return sectionHeadingRanges(doc)
  if (category === 'questions') return questionRanges(doc)
  // Body text starts at the first chapter: a thesis's title page and front matter are not body paragraphs.
  const firstChapter = category === 'paragraphs' ? topBlocks(doc).find(({ node }) => isChapterHeading(node)) : undefined
  const bodyStart = firstChapter ? firstChapter.pos : 0
  const ranges: TextRange[] = []
  doc.descendants((node, pos) => {
    if (pos < bodyStart) return true
    const matches =
      category === 'headings'
        ? node.type.name === 'heading'
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
 * The paragraphs and headings a learned habit applies to: the block's text equals the text the
 * habit was learned on, or starts with it when that is a phrase of 6+ characters (the same rule
 * the server uses to suggest a learned format).
 */
export function findLearnedBlockRanges(doc: ProseMirrorNode, key: string): TextRange[] {
  const ranges: TextRange[] = []
  if (key.length < 3) return ranges
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return false
    const text = learnedKey(node.textContent)
    if (text.length > 0 && (text === key || (key.length >= 6 && text.startsWith(key)))) {
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
