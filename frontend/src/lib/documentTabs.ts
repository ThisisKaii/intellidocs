import type { EditorJson } from '@/services/api'
import { backMatterOpening, chapterOpening, nodeText, titleCase, type JsonNode } from './chapters'

/**
 * Document tabs on the client (the server keeps the same marker format, see
 * server/src/utils/documentTabs.ts and migration 048).
 *
 * A document split into tabs carries an empty `tabBreak` block before each tab in its whole body.
 * Splitting a thesis means placing those markers: before the front matter, before each chapter and
 * before the back matter (References, Appendices, …).
 */

export const TAB_BREAK_TYPE = 'tabBreak'

/** One tab a split would make: its title and the top-level block it starts at. */
export interface ProposedTab {
  title: string
  /** Index in the document's top-level blocks where the tab starts. */
  start: number
  /** What the tab is, for the dialog. */
  kind: 'front' | 'chapter' | 'back'
}

/** Blocks between the end of one tab and the next tab's own first line that belong to the next tab. */
const BREAK_TYPES = new Set(['pageBreak', 'sectionMark'])

function blocks(doc: EditorJson): JsonNode[] {
  return Array.isArray(doc.content) ? (doc.content as JsonNode[]) : []
}

function isBlank(node: JsonNode): boolean {
  return (node.type === 'paragraph' || node.type === 'heading') && nodeText(node).trim() === ''
}

/**
 * Where a tab starting at `index` really starts: the page break (and its Word section) that puts
 * the chapter on a new page belongs to the chapter, so it is moved into the new tab with it. Blank
 * lines just before the break stay with the tab they end.
 */
function startBefore(nodes: JsonNode[], index: number, floor: number): number {
  let start = index
  while (start - 1 > floor && BREAK_TYPES.has(nodes[start - 1].type ?? '')) start -= 1
  return start
}

/** The chapter's title from the line after "CHAPTER I", when it is a short heading-like line. */
function followingTitle(nodes: JsonNode[], index: number): string {
  for (let next = index + 1; next < Math.min(nodes.length, index + 3); next += 1) {
    const node = nodes[next]
    if (isBlank(node)) continue
    const text = nodeText(node).replace(/\s+/g, ' ').trim()
    // "CHAPTER I" / "INTRODUCTION": the title is a heading or an all-capitals line, not the
    // chapter's first sentence.
    const titleLike = node.type === 'heading' || (/[A-Z]/.test(text) && text === text.toUpperCase())
    if (titleLike && text.length <= 80 && !/[.!?]$/.test(text) && chapterOpening(node) === null) return text
    return ''
  }
  return ''
}

/**
 * The tabs a thesis would split into, or null when it does not have at least two chapters.
 * Front matter (everything before Chapter 1, when it has text) → one tab per chapter → each
 * back-matter section after the last chapter.
 */
export function proposeChapterSplit(doc: EditorJson): ProposedTab[] | null {
  const nodes = blocks(doc)
  if (nodes.some((node) => node.type === TAB_BREAK_TYPE)) return null
  const chapters: Array<{ index: number; number: number; title: string }> = []
  nodes.forEach((node, index) => {
    const opening = chapterOpening(node)
    if (!opening) return
    // The same chapter number twice (a running header, a repeated label) opens only once.
    if (chapters.some((chapter) => chapter.number === opening.number)) return
    chapters.push({ index, number: opening.number, title: opening.title || followingTitle(nodes, index) })
  })
  if (chapters.length < 2) return null

  const tabs: ProposedTab[] = []
  const firstStart = startBefore(nodes, chapters[0].index, 0)
  if (nodes.slice(0, firstStart).some((node) => !isBlank(node) && !BREAK_TYPES.has(node.type ?? ''))) {
    tabs.push({ title: 'Front matter', start: 0, kind: 'front' })
  }
  chapters.forEach((chapter, order) => {
    const floor = order === 0 ? 0 : tabs[tabs.length - 1].start
    const title = chapter.title ? `Chapter ${chapter.number}: ${titleCase(chapter.title)}` : `Chapter ${chapter.number}`
    tabs.push({ title, start: order === 0 ? firstStart : startBefore(nodes, chapter.index, floor), kind: 'chapter' })
  })
  // Back matter: the first back-matter label after the last chapter starts its own tab, and so
  // does each later one (References, then Appendices).
  for (let index = chapters[chapters.length - 1].index + 1; index < nodes.length; index += 1) {
    const label = backMatterOpening(nodes[index])
    if (!label) continue
    tabs.push({ title: titleCase(label), start: startBefore(nodes, index, tabs[tabs.length - 1].start), kind: 'back' })
  }
  // A tab that starts where the previous one does would be empty.
  return tabs.filter((tab, index) => index === 0 || tab.start > tabs[index - 1].start)
}

/** The document's JSON with a tab marker before each proposed tab (what a split sends). */
export function insertTabBreaks(doc: EditorJson, tabs: ProposedTab[]): EditorJson {
  const nodes = blocks(doc)
  // The first tab owns everything above it, so its marker always goes at the very top.
  const starts = new Map(tabs.map((tab, index) => [index === 0 ? 0 : tab.start, tab.title]))
  const content: JsonNode[] = []
  nodes.forEach((node, index) => {
    const title = starts.get(index)
    if (title !== undefined) content.push({ type: TAB_BREAK_TYPE, attrs: { tabId: null, title } })
    content.push(node)
  })
  return { ...doc, content }
}

/** Words in each proposed tab (from its start to the next tab's), for the split dialog. */
export function proposalWordCounts(doc: EditorJson, tabs: ProposedTab[]): number[] {
  const nodes = blocks(doc)
  return tabs.map((tab, index) => {
    const start = index === 0 ? 0 : tab.start
    const end = index + 1 < tabs.length ? tabs[index + 1].start : nodes.length
    const text = nodes.slice(start, end).map(nodeText).join(' ').trim()
    return text ? text.split(/\s+/).length : 0
  })
}

/** Remembers "Not now" on the split dialog for a document, so it does not open by itself again. */
const SPLIT_PROMPT_KEY = (documentId: string): string => `intellidocs.splitPrompt.${documentId}`

export function splitPromptDismissed(documentId: string): boolean {
  try {
    return localStorage.getItem(SPLIT_PROMPT_KEY(documentId)) === 'dismissed'
  } catch {
    return false
  }
}

export function dismissSplitPrompt(documentId: string): void {
  try {
    localStorage.setItem(SPLIT_PROMPT_KEY(documentId), 'dismissed')
  } catch {
    /* the dialog may ask again next time */
  }
}
