import {
  hasStyleChange,
  isBodyChange,
  namedTitles,
  parseFormattingIntent,
  type FormattingIntent,
  type FormattingIntentResult,
  type ParseOptions,
  type StyleChange,
  type TargetCategory,
  type TargetMode,
} from './parseFormattingIntent'

/** One independent formatting change inside a chat request. */
export interface FormattingOperation {
  formats: FormattingIntent[]
  fontSize: number | null
  normalize: boolean
  scope: 'selection' | 'all'
  target: string | null
  targetMode: TargetMode | null
  targetCategory: TargetCategory
  /** Line spacing, first-line indent, font family and letter case. */
  style: StyleChange
  /** The words of the request this operation came from. */
  text: string
}

export interface SplitFormattingResult {
  /** Every change that names both what to do and where to do it. */
  operations: FormattingOperation[]
  /** Instructions that could not be turned into a change (no format, or no place to apply it). */
  unresolved: string[]
}

/** Placeholder wrapping a protected phrase (a quote or a section title) while the message is split. */
const PROTECT_MARK = '\u0000'

/** Words that make a piece of a request an instruction rather than filler ("please", "thanks"). */
const INSTRUCTION_VERB = /\b(?:format|apply|make|set|change|turn|align|style|use|put|convert|bold|italici[sz]e|underline|center|centre|justify|indent|space|spacing|number|capitali[sz]e)\w*\b/

/** Clause separators; a section title containing one ("Scope and Delimitation") must not be split on it. */
const SEPARATOR = /,|\s(?:and|then|also|plus)\s/i

const EMPTY_STYLE: StyleChange = { lineSpacing: null, firstLineIndentIn: null, fontFamily: null, textCase: null }

/**
 * Replace quoted phrases, and section titles that contain a separator word, with
 * placeholders so the split never cuts through them.
 */
function protect(message: string, knownTitles: readonly string[]): { text: string; kept: string[] } {
  const kept: string[] = []
  const hold = (phrase: string): string => {
    kept.push(phrase)
    return `${PROTECT_MARK}${kept.length - 1}${PROTECT_MARK}`
  }
  let text = message.replace(/"[^"]*"|“[^”]*”/g, (quoted) => hold(quoted.replace(/[“”]/g, '"')))
  for (const title of namedTitles(knownTitles)) {
    if (!SEPARATOR.test(` ${title} `)) continue
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    text = text.replace(new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'gi'), (match) => hold(match))
  }
  return { text, kept }
}

function restore(text: string, kept: string[]): string {
  return text.replace(new RegExp(`${PROTECT_MARK}(\\d+)${PROTECT_MARK}`, 'g'), (_match, index: string) => kept[Number(index)] ?? '')
}

/**
 * Sentences and list items: each one is an instruction of its own. A pending
 * format never carries across these boundaries.
 */
function hardSegments(text: string): string[] {
  return text
    .split(/\r?\n|;|(?<=[.!?])\s+/)
    .map((segment) => segment.replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s+/, '').replace(/[.!?]+\s*$/, '').trim())
    .filter((segment) => segment.length > 0)
}

/** Clauses inside one sentence: "center the chapter heading, and bold the section headings". */
function softPieces(segment: string): string[] {
  return segment
    .split(/\s*,\s*(?:and\s+|then\s+)?|\s+(?:and\s+then|and|then|also|plus)\s+/i)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0)
}

function hasChange(intent: FormattingIntentResult): boolean {
  return intent.formats.length > 0 || intent.fontSize !== null || intent.normalize || hasStyleChange(intent.style)
}

/** True when the piece says where to apply a change (a target, a block category, or "everything"). */
function hasPlace(intent: FormattingIntentResult): boolean {
  return intent.target !== null || intent.targetCategory !== 'all' || intent.scope === 'all'
}

/** Later style values win; unset ones keep the earlier value. */
function mergeStyle(base: StyleChange, next: StyleChange): StyleChange {
  return {
    lineSpacing: next.lineSpacing ?? base.lineSpacing,
    firstLineIndentIn: next.firstLineIndentIn ?? base.firstLineIndentIn,
    fontFamily: next.fontFamily ?? base.fontFamily,
    textCase: next.textCase ?? base.textCase,
  }
}

/** Formats, size and style waiting for a place later in the sentence. */
interface Pending {
  formats: FormattingIntent[]
  fontSize: number | null
  style: StyleChange
  text: string[]
}

const emptyPending = (): Pending => ({ formats: [], fontSize: null, style: EMPTY_STYLE, text: [] })

function pendingIsEmpty(pending: Pending): boolean {
  return pending.formats.length === 0 && pending.fontSize === null && !hasStyleChange(pending.style)
}

function toOperation(intent: FormattingIntentResult, pending: Pending, piece: string): FormattingOperation {
  const formats = [...pending.formats]
  for (const format of intent.formats) if (!formats.includes(format)) formats.push(format)
  return {
    formats,
    fontSize: intent.fontSize ?? pending.fontSize,
    normalize: intent.normalize,
    scope: 'all',
    target: intent.target,
    targetMode: intent.targetMode,
    targetCategory: intent.targetCategory,
    style: mergeStyle(pending.style, intent.style),
    text: [...pending.text, piece].join(' and '),
  }
}

/** Two operations that would make the same change in the same place. */
function sameOperation(a: FormattingOperation, b: FormattingOperation): boolean {
  return (
    a.target === b.target &&
    a.targetMode === b.targetMode &&
    a.targetCategory === b.targetCategory &&
    a.normalize === b.normalize &&
    a.fontSize === b.fontSize &&
    JSON.stringify(a.style) === JSON.stringify(b.style) &&
    a.formats.length === b.formats.length &&
    a.formats.every((format) => b.formats.includes(format))
  )
}

function carriesChange(operation: FormattingOperation): boolean {
  return operation.formats.length > 0 || operation.fontSize !== null || operation.normalize || hasStyleChange(operation.style)
}

/**
 * Break a chat request into independent formatting operations, so "center and
 * bold the chapter heading, left-align the paragraphs and make the section
 * headings Heading 2" becomes three changes instead of one.
 *
 * Within a sentence, formats with no place of their own attach to the next
 * place named ("center and bold the chapter heading"), or to the previous one
 * when nothing follows ("bold the chapter heading and center it"). A place with
 * no format of its own reuses the previous change ("bold chapter 1 and chapter 2").
 * Anything that still lacks a format or a place is reported, never dropped silently.
 *
 * `knownTitles` (the open document's outline) lets unquoted section names be
 * found, and keeps titles such as "Scope and Delimitation" in one piece.
 */
export function splitFormattingOperations(message: string, options: ParseOptions = {}): SplitFormattingResult {
  const { text, kept } = protect(message, options.knownTitles ?? [])
  const operations: FormattingOperation[] = []
  const unresolved: string[] = []

  for (const segment of hardSegments(text)) {
    let pending = emptyPending()
    let lastInSegment: FormattingOperation | null = null

    for (const rawPiece of softPieces(segment)) {
      const piece = restore(rawPiece, kept)
      const intent = parseFormattingIntent(piece, options)
      const change = hasChange(intent)
      const place = hasPlace(intent)

      if (place) {
        let operation = toOperation(intent, pending, piece)
        // A place with no format of its own reuses the previous change ("bold chapter 1 and
        // chapter 2"), or waits for formats later in the sentence ("format all headings
        // and make them bold"); if none come, it is reported at the end of the sentence.
        if (!change && pendingIsEmpty(pending) && lastInSegment && carriesChange(lastInSegment)) {
          operation = {
            ...operation,
            formats: [...lastInSegment.formats],
            fontSize: lastInSegment.fontSize,
            normalize: lastInSegment.normalize,
            style: lastInSegment.style,
          }
        }
        operations.push(operation)
        lastInSegment = operation
        pending = emptyPending()
      } else if (change) {
        for (const format of intent.formats) if (!pending.formats.includes(format)) pending.formats.push(format)
        pending.fontSize = intent.fontSize ?? pending.fontSize
        pending.style = mergeStyle(pending.style, intent.style)
        pending.text.push(piece)
      } else if (INSTRUCTION_VERB.test(piece.toLowerCase())) {
        unresolved.push(piece)
      }
    }

    // Formats left over at the end of a sentence belong to its last change.
    if (!pendingIsEmpty(pending)) {
      if (lastInSegment) {
        for (const format of pending.formats) if (!lastInSegment.formats.includes(format)) lastInSegment.formats.push(format)
        lastInSegment.fontSize = pending.fontSize ?? lastInSegment.fontSize
        lastInSegment.style = mergeStyle(lastInSegment.style, pending.style)
        lastInSegment.text = [lastInSegment.text, ...pending.text].join(' and ')
      } else {
        unresolved.push(pending.text.join(' and '))
      }
    }
  }

  // A section's title line was meant unless a body change ("and justify it")
  // joined later in the sentence; then the change covers the whole section.
  for (const operation of operations) {
    if (operation.targetMode === 'heading' && isBodyChange(operation.formats, operation.style)) operation.targetMode = 'section'
  }

  // Places that never received a format are reported, not applied as empty changes.
  const complete = operations.filter((operation) => {
    if (carriesChange(operation)) return true
    unresolved.push(operation.text)
    return false
  })
  const unique = complete.filter((operation, index) => complete.findIndex((other) => sameOperation(other, operation)) === index)
  return { operations: unique, unresolved }
}
