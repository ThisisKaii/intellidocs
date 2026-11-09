/** The facts of a formatting preview that the chat reply describes. */
export interface FormattingReplyInput {
  formats: string[]
  fontSize: number | null
  normalize: boolean
  scope: 'selection' | 'all'
  target: string | null
  targetMode: 'literal' | 'section' | 'title' | null
  targetCategory: 'headings' | 'sections' | 'paragraphs' | 'chapters' | 'all' | null
}

/** Words for each format when it ends a sentence ("... bold and centered"). */
const FORMAT_PREDICATES: Record<string, string> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underlined',
  heading1: 'a Heading 1',
  heading2: 'a Heading 2',
  heading3: 'a Heading 3',
  h1: 'a Heading 1',
  h2: 'a Heading 2',
  h3: 'a Heading 3',
  blockquote: 'a quote block',
  unordered_list: 'a bullet list',
  ordered_list: 'a numbered list',
  align_left: 'left-aligned',
  align_center: 'centered',
  align_right: 'right-aligned',
  align_justify: 'justified',
}

/** Join items as "a", "a and b", "a, b and c". */
function joinNatural(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** Title-case a section or chapter reference for display ("approval sheet" -> "Approval Sheet"). */
function displayTarget(target: string): string {
  return target.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

/** Describe what part of the document the change touches. */
function describeSubject(input: FormattingReplyInput): string {
  if (input.target && input.targetMode === 'literal') return `the words “${input.target}”`
  if (input.target && input.targetMode === 'title') return 'the document title'
  if (input.target && input.targetMode === 'section') {
    const isChapter = input.target.startsWith('chapter ') || input.target.startsWith('section ')
    return isChapter
      ? `${displayTarget(input.target)} and everything in it`
      : `the whole ${displayTarget(input.target)} section`
  }
  if (input.targetCategory === 'headings') return 'every heading'
  if (input.targetCategory === 'paragraphs') return 'every body paragraph'
  if (input.targetCategory === 'chapters') return 'every chapter heading'
  if (input.targetCategory === 'sections') return 'every section heading'
  if (input.scope === 'all') return 'the whole document'
  return 'the text you have selected (or the paragraph your cursor is in)'
}

/** One change as a short instruction: "Make every chapter heading bold and centered". */
export function summarizeFormattingChange(input: FormattingReplyInput): string {
  const subject = describeSubject(input)
  const marks = input.formats
    .filter((format) => !input.normalize || format === 'bold' || format === 'italic' || format === 'underline')
    .map((format) => FORMAT_PREDICATES[format])
    .filter((phrase): phrase is string => Boolean(phrase))
  if (input.fontSize) marks.push(`${input.fontSize}pt`)
  if (input.normalize) {
    const what = marks.length > 0 ? `the ${joinNatural(marks.map((m) => m.replace(/ed$/, '')))} formatting` : 'the formatting'
    return `Clear ${what} from ${subject}`
  }
  return `Make ${subject} ${marks.length > 0 ? joinNatural(marks) : 'formatted'}`
}

/**
 * Reply for a request that holds several changes. Lists every change that will
 * be made, then says plainly what was left out and why, so the user never reads
 * a confirmation that covers less than they asked for.
 */
export function buildMultiFormattingReply(
  changes: FormattingReplyInput[],
  missingTargets: string[],
  unresolved: string[],
  requestText: string
): string {
  const parts: string[] = []
  if (changes.length > 0) {
    const listed = changes.map((change, index) => `(${index + 1}) ${summarizeFormattingChange(change).replace(/^M/, 'm').replace(/^C/, 'c')}`)
    parts.push(`I can make ${changes.length === 1 ? 'this change' : `these ${changes.length} changes`} in one go: ${listed.join('; ')}.`)
  }
  if (missingTargets.length > 0) {
    parts.push(`I couldn’t find ${joinNatural(missingTargets.map((target) => `“${target}”`))} in this document, so I left ${missingTargets.length === 1 ? 'that' : 'those'} out.`)
  }
  if (unresolved.length > 0) {
    parts.push(
      `I couldn’t tell what to change for ${joinNatural(unresolved.map((text) => `“${text}”`))}. Highlight the text and ask again, or name it in quotes.`
    )
  }
  if (changes.length > 0) {
    parts.push(
      changes.length === 1
        ? 'Apply it below if that looks right, or Reject to leave it as it is.'
        : pick(['Apply them all below, or Reject to keep the document as it is.', 'Press Apply to make every change at once, or Reject to leave things as they are.'], requestText)
    )
  }
  return parts.join(' ')
}

/** Pick one of several phrasings, stable for the same request so a repeated ask reads the same. */
function pick(options: string[], seed: string): string {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return options[hash % options.length]
}

/**
 * Natural-language reply for a formatting preview. The editor shows the
 * Apply / Reject buttons itself, so this only says what is about to change and
 * never claims it is already done.
 */
export function buildFormattingReply(input: FormattingReplyInput, requestText: string): string {
  const subject = describeSubject(input)
  const marks = input.formats
    .filter((format) => !input.normalize || format === 'bold' || format === 'italic' || format === 'underline')
    .map((format) => FORMAT_PREDICATES[format])
    .filter((phrase): phrase is string => Boolean(phrase))
  if (input.fontSize) marks.push(`${input.fontSize}pt`)

  const confirm = pick(
    ['Press Apply when you want it, or Reject to leave it as it is.', 'Say the word and I will apply it, or reject it to keep things as they are.', 'Apply it below if that looks right.'],
    requestText
  )

  if (input.normalize) {
    const what = marks.length > 0 ? `the ${joinNatural(marks.map((m) => m.replace(/ed$/, '')))} formatting` : 'the formatting'
    return `I can clear ${what} from ${subject}. ${confirm}`
  }

  const result = marks.length > 0 ? joinNatural(marks) : 'formatted'
  const opening = pick([`I can make ${subject} ${result}.`, `Here is what I would do: make ${subject} ${result}.`, `Got it, ${subject} would become ${result}.`], requestText)
  return `${opening} ${confirm}`
}
