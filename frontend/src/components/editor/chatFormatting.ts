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

/**
 * Apply (or clear) marks, font size and alignment over each range, bottom-up so
 * earlier positions stay valid. Alignment is set on the whole range after the
 * marks because it is a block attribute.
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
  for (const { from, to } of ordered) {
    let chain = editor.chain().focus().setTextSelection({ from, to })
    if (normalize) {
      const named = formats.filter((format) => format === 'bold' || format === 'italic' || format === 'underline')
      if (named.length > 0) for (const mark of named) chain = chain.unsetMark(mark)
      else chain = chain.unsetAllMarks()
    } else {
      for (const format of formats) {
        if (format === 'bold') chain = chain.setMark('bold')
        else if (format === 'italic') chain = chain.setMark('italic')
        else if (format === 'underline') chain = chain.setMark('underline')
        else if (format === 'heading1' || format === 'h1') chain = chain.setHeading({ level: 1 })
        else if (format === 'heading2' || format === 'h2') chain = chain.setHeading({ level: 2 })
        else if (format === 'heading3' || format === 'h3') chain = chain.setHeading({ level: 3 })
      }
    }
    if (fontSize) chain = chain.setMark('textStyle', { fontSize: `${fontSize}pt` })
    chain.run()
    if (align) editor.chain().focus().setTextSelection({ from, to }).setTextAlign(align).run()
  }
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
