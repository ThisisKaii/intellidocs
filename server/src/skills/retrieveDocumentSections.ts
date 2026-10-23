import { normalizeSectionKey } from './documentSections'

export interface DocumentSection {
  title: string
  text: string
}

const SECTION_LIMIT_CHARS = 2500
const DEFAULT_BUDGET_CHARS = 6000
const OPENING_TITLE = 'Opening of the document'

const STRUCTURAL_TITLE =
  /^(CHAPTER\s+[IVXLCDM0-9]+|INTRODUCTION|ABSTRACT|ACKNOWLEDGEMENTS?|APPROVAL SHEET|DEDICATION|CERTIFICATION|GLOSSARY|TABLE OF CONTENTS|LIST OF TABLES|LIST OF FIGURES|REFERENCES|BIBLIOGRAPHY|APPENDICES|RECOMMENDATIONS?)\b/i

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'what', 'which', 'who', 'whom', 'this', 'that', 'with', 'from', 'about', 'does', 'did',
  'how', 'why', 'when', 'where', 'can', 'could', 'would', 'should', 'tell', 'say', 'says', 'said', 'document', 'paper',
  'thesis', 'please', 'explain', 'summarize', 'summary', 'give', 'show', 'there', 'their', 'have', 'has', 'any', 'into',
])

/** Decode the HTML entities that appear in saved editor content. */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** Plain text of an HTML fragment on one line. */
function plain(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** Split saved document HTML into sections that start at each heading or bold section title. */
export function splitIntoSections(html: string): DocumentSection[] {
  const sections: DocumentSection[] = []
  let current: { title: string; parts: string[] } = { title: OPENING_TITLE, parts: [] }

  const flush = (): void => {
    const text = current.parts.join('\n').trim()
    if (text || current.title !== OPENING_TITLE) sections.push({ title: current.title, text })
  }

  const blockPattern = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi
  for (const match of html.matchAll(blockPattern)) {
    const tag = match[1].toLowerCase()
    const inner = match[2]
    const text = plain(inner)
    if (!text) continue
    const isHeading = /^h[1-3]$/.test(tag)
    const isBoldTitle = tag === 'p' && /<(strong|b)[\s>]/i.test(inner) && text.length <= 80 && STRUCTURAL_TITLE.test(text)
    if (isHeading || isBoldTitle) {
      flush()
      current = { title: text, parts: [] }
    } else {
      current.parts.push(text)
    }
  }
  flush()
  return sections
}

/** Lowercase meaningful words of a question. */
function questionTokens(question: string): string[] {
  const words = question.toLowerCase().match(/[a-z0-9]+/g) ?? []
  return Array.from(new Set(words.filter((word) => word.length > 2 && !STOP_WORDS.has(word))))
}

/** Number of times `token` appears in `text` (whole words). */
function countWord(text: string, token: string): number {
  return (text.match(new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) ?? []).length
}

/**
 * Pick the sections most relevant to a question, in document order, within a
 * character budget. Matching is keyword-based (title matches count triple), with
 * special handling for "chapter 3", the first page and the end of the document.
 */
export function retrieveSections(
  sections: DocumentSection[],
  question: string,
  budgetChars: number = DEFAULT_BUDGET_CHARS
): DocumentSection[] {
  if (sections.length === 0) return []
  const lower = question.toLowerCase()
  const tokens = questionTokens(question)
  const normalizedQuestion = normalizeSectionKey(question)
  const chapterRefs = normalizedQuestion.match(/\b(?:chapter|section) \d+\b/g) ?? []

  const scored = sections.map((section, index) => {
    const title = section.title.toLowerCase()
    const body = section.text.toLowerCase()
    let score = 0
    for (const token of tokens) {
      score += countWord(title, token) * 3 + Math.min(countWord(body, token), 5)
    }
    const key = normalizeSectionKey(section.title)
    if (chapterRefs.some((ref) => key === ref || key.startsWith(`${ref} `) || key.startsWith(`${ref}:`))) score += 25
    if (/\b(first page|title page|cover|beginning|start of|opening)\b/.test(lower) && index === 0) score += 20
    if (/\b(last page|end of|conclusion|ending)\b/.test(lower) && index === sections.length - 1) score += 12
    return { section, index, score: score / Math.sqrt(Math.max(body.length, 200) / 200) }
  })

  const ranked = scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score)
  const chosen = ranked.length > 0 ? ranked : scored.slice(0, 2)

  const picked: typeof scored = []
  let used = 0
  for (const item of chosen) {
    const size = Math.min(item.section.text.length, SECTION_LIMIT_CHARS) + item.section.title.length
    if (picked.length > 0 && used + size > budgetChars) continue
    picked.push(item)
    used += size
  }
  return picked
    .sort((a, b) => a.index - b.index)
    .map(({ section }) => ({ title: section.title, text: section.text.slice(0, SECTION_LIMIT_CHARS) }))
}
