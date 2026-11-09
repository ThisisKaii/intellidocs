import type { Editor } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/** A document range (ProseMirror positions) a chat formatting request applies to. */
export interface TextRange {
  from: number
  to: number
}

/** How a chat target is meant (mirrors the server's `targetMode`). */
export type TargetMode = 'literal' | 'section' | 'title' | null

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
  const start = blocks.findIndex(({ node }) => {
    if (node.type.name !== 'heading' && node.type.name !== 'paragraph') return false
    const text = normalizeSectionKey(node.textContent).replace(/[:.]+$/, '')
    return text === key || (isChapter ? text.startsWith(`${key} `) || text.startsWith(`${key}:`) : false)
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
export type BlockCategory = 'headings' | 'sections' | 'paragraphs' | 'chapters'

/** Every text block a category names, each as its own range. */
export function findCategoryRanges(doc: ProseMirrorNode, category: BlockCategory): TextRange[] {
  const ranges: TextRange[] = []
  doc.descendants((node, pos) => {
    const matches =
      category === 'headings'
        ? node.type.name === 'heading'
        : category === 'chapters'
          ? isChapterHeading(node)
          : category === 'sections'
            ? node.type.name === 'heading' && !isChapterHeading(node) && node.attrs?.docRole !== 'title'
            : // Body paragraphs: not a "CHAPTER n" line or the title styled as a paragraph.
              node.type.name === 'paragraph' && !isChapterHeading(node) && node.attrs?.docRole !== 'title'
    if (matches) {
      const from = pos + 1
      const to = pos + node.nodeSize - 1
      if (to > from) ranges.push({ from, to })
    }
    return true
  })
  return ranges
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
  normalize: boolean
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
    if (wrapper) wrapOnce(editor, { from, to }, wrapper)
  }
}

/**
 * Apply formats to the user's selection (or, with nothing selected, the block
 * the cursor is in). Set semantics: asking for bold on text that is already
 * bold keeps it bold, and a heading request changes each selected block while
 * keeping its own attributes.
 */
export function applyFormatsToSelection(editor: Editor, formats: string[], fontSize?: number): void {
  const { selection, doc } = editor.state
  const blocks = textblocksIn(doc, selection.from, selection.to)
  const range: TextRange = selection.empty && blocks.length > 0
    ? { from: blocks[0].from, to: blocks[0].to }
    : { from: selection.from, to: selection.to }
  if (range.to <= range.from && !fontSize) return

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
  return section ? [section] : []
}
