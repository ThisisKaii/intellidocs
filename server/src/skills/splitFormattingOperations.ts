import {
  parseFormattingIntent,
  type FormattingIntent,
  type FormattingIntentResult,
  type TargetCategory,
} from './parseFormattingIntent'

/** One independent formatting change inside a chat request. */
export interface FormattingOperation {
  formats: FormattingIntent[]
  fontSize: number | null
  normalize: boolean
  scope: 'selection' | 'all'
  target: string | null
  targetMode: 'literal' | 'section' | 'title' | null
  targetCategory: TargetCategory
  /** The words of the request this operation came from. */
  text: string
}

export interface SplitFormattingResult {
  /** Every change that names both what to do and where to do it. */
  operations: FormattingOperation[]
  /** Instructions that could not be turned into a change (no format, or no place to apply it). */
  unresolved: string[]
}

/** Placeholder wrapping a protected quoted phrase while the message is split. */
const QUOTE_MARK = '\u0000'

/** Words that make a piece of a request an instruction rather than filler ("please", "thanks"). */
const INSTRUCTION_VERB = /\b(?:format|apply|make|set|change|turn|align|style|use|put|convert|bold|italici[sz]e|underline|center|centre|justify|indent|space|number)\w*\b/

/** Replace quoted phrases with placeholders so separators inside them are not split on. */
function protectQuotes(message: string): { text: string; quotes: string[] } {
  const quotes: string[] = []
  const text = message.replace(/"[^"]*"|“[^”]*”/g, (quoted) => {
    quotes.push(quoted.replace(/[“”]/g, '"'))
    return `${QUOTE_MARK}${quotes.length - 1}${QUOTE_MARK}`
  })
  return { text, quotes }
}

function restoreQuotes(text: string, quotes: string[]): string {
  return text.replace(new RegExp(`${QUOTE_MARK}(\\d+)${QUOTE_MARK}`, 'g'), (_match, index: string) => quotes[Number(index)] ?? '')
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
  return intent.formats.length > 0 || intent.fontSize !== null || intent.normalize
}

/** True when the piece says where to apply a change (a target, a block category, or "everything"). */
function hasPlace(intent: FormattingIntentResult): boolean {
  return intent.target !== null || intent.targetCategory !== 'all' || intent.scope === 'all'
}

function toOperation(intent: FormattingIntentResult, text: string, carried: FormattingIntent[], carriedSize: number | null): FormattingOperation {
  const formats = [...carried]
  for (const format of intent.formats) if (!formats.includes(format)) formats.push(format)
  return {
    formats,
    fontSize: intent.fontSize ?? carriedSize,
    normalize: intent.normalize,
    scope: 'all',
    target: intent.target,
    targetMode: intent.targetMode,
    targetCategory: intent.targetCategory,
    text,
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
    a.formats.length === b.formats.length &&
    a.formats.every((format) => b.formats.includes(format))
  )
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
 */
export function splitFormattingOperations(message: string): SplitFormattingResult {
  const { text, quotes } = protectQuotes(message)
  const operations: FormattingOperation[] = []
  const unresolved: string[] = []

  for (const segment of hardSegments(text)) {
    let pendingFormats: FormattingIntent[] = []
    let pendingSize: number | null = null
    let pendingText: string[] = []
    let lastInSegment: FormattingOperation | null = null

    for (const rawPiece of softPieces(segment)) {
      const piece = restoreQuotes(rawPiece, quotes)
      const intent = parseFormattingIntent(piece)
      const change = hasChange(intent)
      const place = hasPlace(intent)

      if (place) {
        let operation = toOperation(intent, [...pendingText, piece].join(' and '), pendingFormats, pendingSize)
        // A place with no format of its own reuses the previous change ("bold chapter 1 and
        // chapter 2"), or waits for formats later in the sentence ("format all headings
        // and make them bold"); if none come, it is reported at the end of the sentence.
        if (!change && pendingFormats.length === 0 && pendingSize === null && lastInSegment && carriesChange(lastInSegment)) {
          operation = { ...operation, formats: [...lastInSegment.formats], fontSize: lastInSegment.fontSize, normalize: lastInSegment.normalize }
        }
        operations.push(operation)
        lastInSegment = operation
        pendingFormats = []
        pendingSize = null
        pendingText = []
      } else if (change) {
        for (const format of intent.formats) if (!pendingFormats.includes(format)) pendingFormats.push(format)
        pendingSize = intent.fontSize ?? pendingSize
        pendingText.push(piece)
      } else if (INSTRUCTION_VERB.test(piece.toLowerCase())) {
        unresolved.push(piece)
      }
    }

    // Formats left over at the end of a sentence belong to its last change.
    if (pendingFormats.length > 0 || pendingSize !== null) {
      if (lastInSegment) {
        for (const format of pendingFormats) if (!lastInSegment.formats.includes(format)) lastInSegment.formats.push(format)
        lastInSegment.fontSize = pendingSize ?? lastInSegment.fontSize
        lastInSegment.text = [lastInSegment.text, ...pendingText].join(' and ')
      } else {
        unresolved.push(pendingText.join(' and '))
      }
    }
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

function carriesChange(operation: FormattingOperation): boolean {
  return operation.formats.length > 0 || operation.fontSize !== null || operation.normalize
}
