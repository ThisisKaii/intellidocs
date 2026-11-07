/**
 * Where a thesis's formal front matter is: the title page it opens with and the approval sheet.
 * Their lines are names, institutions and submission clauses, so grammar, spelling and styling
 * checks treat them as furniture, not prose.
 */

/** Section labels of a thesis's front and back matter, set like chapter headings. */
export const FRONT_LABEL = /^(approval sheet|acknowledge?ments?|dedication|abstract|preface|foreword|table of contents|list of (tables|figures|abbreviations|appendices)|curriculum vitae|references|bibliography|appendices)$/i

/** A label or chapter that ends the title page. */
const TITLE_PAGE_END = /^(approval sheet|acknowledge?ments?|dedication|abstract|preface|foreword|table of contents|introduction|chapter\s+\S+)/i
const APPROVAL_SHEET = /^approval sheet$/i
/** A title page is never longer than this many lines. */
const MAX_TITLE_PAGE_LINES = 25

export type FrontMatterRegion = 'title_page' | 'approval_sheet'

/** A sentence of prose: long enough and closed by sentence punctuation. */
export function isProseLine(text: string): boolean {
  return text.length >= 80 && /[.!?]$/.test(text)
}

/** Whether a line ends the title page: the first heading, front-matter label or sentence of prose does. */
export function endsTitlePage(text: string, isHeading: boolean): boolean {
  return isHeading || isProseLine(text) || TITLE_PAGE_END.test(text)
}

/**
 * Walk a document's text blocks in order and get each one's front-matter region. The title page is
 * the run of lines the document opens with; the approval sheet runs from its label to the next
 * front-matter label or heading.
 */
export function createFrontMatterTracker(): (text: string, isHeading: boolean) => FrontMatterRegion | null {
  let titlePageOpen = true
  let titlePageLines = 0
  let inApprovalSheet = false
  return (raw: string, isHeading: boolean): FrontMatterRegion | null => {
    const text = raw.replace(/\s+/g, ' ').trim()
    const label = text.replace(/[:.]$/, '')
    if (titlePageOpen && (endsTitlePage(text, isHeading) || titlePageLines >= MAX_TITLE_PAGE_LINES)) titlePageOpen = false
    if (titlePageOpen) {
      titlePageLines += 1
      return 'title_page'
    }
    if (APPROVAL_SHEET.test(label)) {
      inApprovalSheet = true
      return 'approval_sheet'
    }
    if (inApprovalSheet && (isHeading || FRONT_LABEL.test(label) || /^chapter\s+\S+/i.test(text))) inApprovalSheet = false
    return inApprovalSheet ? 'approval_sheet' : null
  }
}
