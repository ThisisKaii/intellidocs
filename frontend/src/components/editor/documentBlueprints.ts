import { basePresetKey, type AcademicPreset } from './academicPresets'

/**
 * Document blueprints offered by the "New Document" modal. A blueprint is a
 * standard preset plus the structural sections that standard expects, so a new
 * document starts as a correctly shaped skeleton rather than an empty page.
 *
 * Each section renders as a real, editable paragraph or heading wrapped in a
 * dashed guide box (see BlueprintGuideExtension). The guides instruct the
 * student where each element belongs and disappear once the student writes
 * over them.
 */

/** Block type used for one structural section of a blueprint. */
export type BlueprintBlock = 'title' | 'heading' | 'paragraph' | 'blockquote'

export interface BlueprintSection {
  block: BlueprintBlock
  /** Heading level, only meaningful when `block` is 'heading'. */
  level?: 1 | 2 | 3
  /** Placeholder text the student replaces with their own writing. */
  placeholder: string
  /** Short standard-reference hint, e.g. '24pt Bold Center'. */
  hint?: string
  /**
   * Optional group id binding related sections (e.g. the author block:
   * name, supervisor, department, date) so formatting one element can offer
   * to format the rest of the group to match.
   */
  group?: string
  /** A title-page line: centered with no first-line indent, whatever the body paragraphs do. */
  centered?: boolean
  /** Written in bold (an adviser's name on a title page). */
  bold?: boolean
  /** Starts on a new page (a thesis's front-matter parts and chapters). */
  newPage?: boolean
}

export interface DocumentBlueprint {
  key: string
  name: string
  description: string
  /** Academic preset applied on creation; null leaves the document unstyled. */
  presetKey: string | null
  sections: BlueprintSection[]
}

/** A blank page with no preset and no structural guides. */
const BLANK: DocumentBlueprint = {
  key: 'blank',
  name: 'Blank Document',
  description: 'Start from an empty page with no preset applied.',
  presetKey: null,
  sections: [],
}

/** APA 7th edition student/professional research paper. */
const APA_7TH: DocumentBlueprint = {
  key: 'apa_7th',
  name: 'APA 7th Edition',
  description: '1" margins, Times New Roman 12pt, double-spaced, five heading levels.',
  presetKey: 'apa_7th',
  sections: [
    { block: 'title', placeholder: 'Your Paper Title', hint: 'Title: 12pt Bold, Centered' },
    { block: 'paragraph', placeholder: 'Author Name', hint: 'Author names and affiliations', group: 'author_block', centered: true },
    { block: 'paragraph', placeholder: 'University and Course', group: 'author_block', centered: true },
    {
      block: 'heading',
      level: 1,
      placeholder: 'Abstract',
      hint: 'Level 1: Bold, Centered',
    },
    { block: 'paragraph', placeholder: 'A concise summary of your paper, no citations.' },
    { block: 'paragraph', placeholder: 'Keywords: keyword one, keyword two, keyword three' },
    { block: 'heading', level: 1, placeholder: 'Introduction' },
    { block: 'paragraph', placeholder: 'Open with the broad context of your topic.' },
    { block: 'heading', level: 2, placeholder: 'Problem Statement' },
    { block: 'paragraph', placeholder: 'State the gap your research addresses.' },
    { block: 'heading', level: 2, placeholder: 'Objectives' },
    { block: 'paragraph', placeholder: 'List what this study sets out to do.' },
    { block: 'heading', level: 1, placeholder: 'Literature Review' },
    { block: 'paragraph', placeholder: 'Summarize the prior work you build on.' },
    { block: 'heading', level: 1, placeholder: 'Methodology' },
    { block: 'paragraph', placeholder: 'Describe participants, data, and procedure.' },
    { block: 'heading', level: 1, placeholder: 'Results' },
    { block: 'paragraph', placeholder: 'Present your findings.' },
    { block: 'heading', level: 1, placeholder: 'Discussion' },
    { block: 'paragraph', placeholder: 'Interpret the results and note limitations.' },
    { block: 'heading', level: 1, placeholder: 'Conclusion' },
    { block: 'paragraph', placeholder: 'Close with the contribution of the work.' },
    { block: 'heading', level: 1, placeholder: 'References' },
    { block: 'paragraph', placeholder: 'Alphabetical list, hanging indent of 0.5"' },
  ],
}

/** IEEE conference paper: compact, Roman-numeral sections, author block. */
const IEEE: DocumentBlueprint = {
  key: 'ieee',
  name: 'IEEE Conference Template',
  description: 'IEEE margins, Times New Roman 10pt, I./II./III. sections, italic A. subsections, numbered citations.',
  presetKey: 'ieee',
  sections: [
    { block: 'title', placeholder: 'Paper Title', hint: 'Title: 24pt Roman, Centered' },
    { block: 'paragraph', placeholder: 'Author Name', group: 'author_block', centered: true },
    { block: 'paragraph', placeholder: 'Affiliation, City, Country', group: 'author_block', centered: true },
    { block: 'paragraph', placeholder: 'email@affiliation.edu', group: 'author_block', centered: true },
    { block: 'paragraph', placeholder: 'Abstract—A concise summary of the paper, no citations here.', hint: 'Bold italic run-in: Abstract—' },
    { block: 'paragraph', placeholder: 'Index Terms—keyword one, keyword two, keyword three.', hint: 'Bold italic run-in: Index Terms—' },
    { block: 'heading', level: 1, placeholder: 'I. Introduction', hint: 'Level 1: Roman numeral, centered, uppercase' },
    { block: 'paragraph', placeholder: 'Explain the problem and your contribution.' },
    { block: 'heading', level: 2, placeholder: 'A. Problem Statement', hint: 'Level 2: italic letter' },
    { block: 'paragraph', placeholder: 'State the gap your research addresses.' },
    { block: 'heading', level: 2, placeholder: 'B. Objectives', hint: 'Level 2: italic letter' },
    { block: 'paragraph', placeholder: 'List what this study sets out to do.' },
    { block: 'heading', level: 3, placeholder: '1) Background:', hint: 'Level 3: italic, run-in' },
    { block: 'paragraph', placeholder: 'Prior art and the specific problem being solved.' },
    { block: 'heading', level: 1, placeholder: 'II. Related Work' },
    { block: 'paragraph', placeholder: 'Cite prior work as [1], [2] in order of appearance.' },
    { block: 'heading', level: 1, placeholder: 'III. Proposed Method' },
    { block: 'paragraph', placeholder: 'Describe your approach in reproducible steps.' },
    { block: 'heading', level: 1, placeholder: 'IV. Experimental Setup' },
    { block: 'paragraph', placeholder: 'Datasets, hardware, and evaluation metrics.' },
    { block: 'heading', level: 1, placeholder: 'V. Results and Discussion' },
    { block: 'paragraph', placeholder: 'Report findings with tables and figures.' },
    { block: 'heading', level: 1, placeholder: 'VI. Conclusion' },
    { block: 'paragraph', placeholder: 'State the finding and any future work.' },
    { block: 'heading', level: 1, placeholder: 'References' },
    { block: 'paragraph', placeholder: 'IEEE numbered style, in order of citation.' },
  ],
}

/**
 * University capstone / thesis, laid out as a UCLM College of Computer Studies capstone manuscript:
 * the title page, the front matter in its usual order, Chapters I to IV with their standard sections, the conclusion, recommendations and translational research,
 * then the references, curriculum vitae and appendices.
 */
const TITLE_LINE = { block: 'paragraph', centered: true, group: 'title_page' } as const

const UCLM_SECTIONS: BlueprintSection[] = [
  { block: 'title', placeholder: 'TITLE OF THE CAPSTONE PROJECT', hint: 'Title: 12pt bold, all caps, centered' },
  { ...TITLE_LINE, placeholder: 'A Capstone Project', hint: 'Title page lines: 11pt, centered' },
  { ...TITLE_LINE, placeholder: 'Presented to the Faculty of the College of Computer Studies' },
  { ...TITLE_LINE, placeholder: 'University of Cebu - Lapu-Lapu and Mandaue' },
  { ...TITLE_LINE, placeholder: 'Mandaue City, Cebu' },
  { ...TITLE_LINE, placeholder: 'In Partial Fulfillment of the Requirements' },
  { ...TITLE_LINE, placeholder: 'for the Degree of Bachelor of Science in Information Technology' },
  { ...TITLE_LINE, placeholder: 'By:' },
  { ...TITLE_LINE, placeholder: 'Surname, Given Name M.', hint: 'One line per researcher' },
  { ...TITLE_LINE, placeholder: 'Adviser Name', hint: 'Adviser: bold', bold: true },
  { ...TITLE_LINE, placeholder: 'Adviser' },
  { ...TITLE_LINE, placeholder: 'Month Year' },
  { block: 'heading', level: 1, placeholder: 'APPROVAL SHEET', hint: 'Front matter label: bold, centered' },
  { block: 'paragraph', placeholder: 'This Capstone Project study titled ... prepared and submitted by ... has been examined and is recommended for approval and acceptance.' },
  { block: 'heading', level: 1, placeholder: 'ABSTRACT' },
  { block: 'paragraph', placeholder: 'Summarize the purpose, method, findings and conclusion of the study.' },
  { block: 'heading', level: 1, placeholder: 'ACKNOWLEDGEMENT' },
  { block: 'paragraph', placeholder: 'Thank your adviser, panel, and supporters.' },
  { block: 'heading', level: 1, placeholder: 'DEDICATION' },
  { block: 'paragraph', placeholder: 'Dedicate the study.' },
  { block: 'heading', level: 1, placeholder: 'TABLE OF CONTENTS' },
  { block: 'paragraph', placeholder: 'Generate this from Tools, Document parts, once the chapters are written.' },
  { block: 'heading', level: 1, placeholder: 'LIST OF TABLES' },
  { block: 'paragraph', placeholder: 'Generate this from Tools, Document parts, after captioning your tables.' },
  { block: 'heading', level: 1, placeholder: 'LIST OF FIGURES' },
  { block: 'paragraph', placeholder: 'Generate this from Tools, Document parts, after captioning your figures.' },
  { block: 'heading', level: 1, placeholder: 'CHAPTER I: INTRODUCTION', hint: 'Chapter: 12pt bold, all caps, centered' },
  { block: 'heading', level: 2, placeholder: 'Rationale of the Study', hint: 'Section: 11pt bold, left' },
  { block: 'paragraph', placeholder: 'Background of the problem and why the study is needed.' },
  { block: 'heading', level: 2, placeholder: 'Objectives of the Study' },
  { block: 'paragraph', placeholder: 'The general objective, then the specific objectives.' },
  { block: 'heading', level: 2, placeholder: 'Scope and Limitations' },
  { block: 'paragraph', placeholder: 'What the study covers and what it does not.' },
  { block: 'heading', level: 2, placeholder: 'Significance of the Study' },
  { block: 'paragraph', placeholder: 'Who benefits from the study and how.' },
  { block: 'heading', level: 2, placeholder: 'Definition of Terms' },
  { block: 'paragraph', placeholder: 'Terms used in the study, defined as they are used here.' },
  { block: 'heading', level: 1, placeholder: 'CHAPTER II: REVIEW OF RELATED LITERATURE AND STUDIES' },
  { block: 'heading', level: 2, placeholder: 'Related Literature' },
  { block: 'paragraph', placeholder: 'Theories and published works the study builds on.' },
  { block: 'heading', level: 2, placeholder: 'Conceptual Framework' },
  { block: 'paragraph', placeholder: 'The framework of the study and how its parts relate.' },
  { block: 'heading', level: 2, placeholder: 'Related Studies' },
  { block: 'paragraph', placeholder: 'Prior studies and systems similar to this one.' },
  { block: 'heading', level: 2, placeholder: 'Comparative Matrix' },
  { block: 'paragraph', placeholder: 'Compare the related studies with this study.' },
  { block: 'heading', level: 1, placeholder: 'CHAPTER III: RESEARCH METHODOLOGY' },
  { block: 'heading', level: 2, placeholder: 'Research Design' },
  { block: 'paragraph', placeholder: 'The research design and method used.' },
  { block: 'heading', level: 2, placeholder: 'Research Environment' },
  { block: 'paragraph', placeholder: 'Where the study is conducted.' },
  { block: 'heading', level: 2, placeholder: 'Respondents' },
  { block: 'paragraph', placeholder: 'Who the respondents are and how they are chosen.' },
  { block: 'heading', level: 2, placeholder: 'Research Instrument' },
  { block: 'paragraph', placeholder: 'The questionnaire or tool used to gather data.' },
  { block: 'heading', level: 2, placeholder: 'Research Procedure' },
  { block: 'heading', level: 3, placeholder: 'Data Gathering', hint: 'Subsection: 11pt bold, left' },
  { block: 'paragraph', placeholder: 'How the data is gathered.' },
  { block: 'heading', level: 3, placeholder: 'Statistical Treatment of Data' },
  { block: 'paragraph', placeholder: 'The statistical tools used to analyze the data.' },
  { block: 'heading', level: 2, placeholder: 'Ethical Considerations' },
  { block: 'paragraph', placeholder: 'Consent, privacy and data protection.' },
  { block: 'heading', level: 2, placeholder: 'Software Engineering Methodology' },
  { block: 'paragraph', placeholder: 'The development methodology and its phases.' },
  { block: 'heading', level: 1, placeholder: 'CHAPTER IV: PRESENTATION, ANALYSIS AND INTERPRETATION OF DATA' },
  { block: 'heading', level: 2, placeholder: 'Profile of the Respondents' },
  { block: 'paragraph', placeholder: 'Who answered the survey, presented in tables or charts.' },
  { block: 'heading', level: 2, placeholder: 'Results of the Survey' },
  { block: 'paragraph', placeholder: 'Each result, its table or chart, and what it means.' },
  { block: 'heading', level: 2, placeholder: 'Software Testing Results' },
  { block: 'paragraph', placeholder: 'How the system performed in its tests.' },
  // UCLM manuscripts have no Chapter V: these close the study as parts of their own, like the references.
  { block: 'heading', level: 1, placeholder: 'CONCLUSION' },
  { block: 'paragraph', placeholder: 'What the study found, answering its objectives.' },
  { block: 'heading', level: 1, placeholder: 'RECOMMENDATIONS' },
  { block: 'paragraph', placeholder: 'What should be done next, based on the findings.' },
  { block: 'heading', level: 1, placeholder: 'TRANSLATIONAL RESEARCH' },
  { block: 'paragraph', placeholder: 'How the study is put into practice.' },
  { block: 'heading', level: 1, placeholder: 'REFERENCES' },
  { block: 'paragraph', placeholder: 'Build this from Tools, Citations, Bibliography.' },
  { block: 'heading', level: 1, placeholder: 'CURRICULUM VITAE' },
  { block: 'paragraph', placeholder: 'One for each researcher.' },
  { block: 'heading', level: 1, placeholder: 'APPENDICES' },
  { block: 'paragraph', placeholder: 'Transmittal letter, questionnaire, and other supporting documents.' },
]

const UCLM_CAPSTONE: DocumentBlueprint = {
  key: 'uclm_capstone',
  name: 'University Capstone / Thesis',
  description: 'UCLM spec: 1.5" left margin, 11pt justified at 1.5 spacing, CHAPTER I to IV with conclusion and recommendations, roman front matter.',
  presetKey: 'uclm_capstone',
  // Each front-matter part and chapter starts on a new page, as in the printed manuscript.
  sections: UCLM_SECTIONS.map((section) => (section.block === 'heading' && section.level === 1 ? { ...section, newPage: true } : section)),
}

/** Every blueprint offered by the new-document modal, blank first. */
export const DOCUMENT_BLUEPRINTS: DocumentBlueprint[] = [
  BLANK,
  APA_7TH,
  IEEE,
  UCLM_CAPSTONE,
]

/** Look up a blueprint by key; unknown keys fall back to the blank blueprint. */
export function getBlueprint(key: string): DocumentBlueprint {
  const base = basePresetKey(key)
  return DOCUMENT_BLUEPRINTS.find((blueprint) => blueprint.key === key || blueprint.key === base) ?? BLANK
}

/** Escape text for safe interpolation into the blueprint's HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Build the opening HTML for a blueprint. Every section carries
 * `data-guide`, which is what marks it as an unwritten placeholder so the
 * editor can draw its dashed guide box.
 */
/**
 * The skeleton of a preset made from a document: its section headings in order, each followed by
 * a paragraph to write in, so a new document starts with the same outline as the one uploaded.
 */
export function documentBlueprintFromSections(
  key: string,
  name: string,
  sections: Array<{ level: number; text: string }>,
): DocumentBlueprint {
  const outline: BlueprintSection[] = []
  for (const section of sections) {
    const level = section.level === 1 || section.level === 2 || section.level === 3 ? section.level : 2
    outline.push({ block: 'heading', level, placeholder: section.text, hint: `Heading ${level}` })
    outline.push({ block: 'paragraph', placeholder: 'Write this section here.', hint: 'Body text' })
  }
  return { key, name, description: `Outline of ${name}`, presetKey: key, sections: outline }
}

export function buildBlueprintHtml(blueprint: DocumentBlueprint): string {
  if (blueprint.sections.length === 0) {
    return '<p></p>'
  }

  const blocks = blueprint.sections.map((section) => {
    const pageBreak = section.newPage ? '<div class="intellidocs-page-break"></div>' : ''
    return pageBreak + sectionHtml(section)
  })

  return blocks.join('')
}

/** One blueprint section as its placeholder block. */
function sectionHtml(section: BlueprintSection): string {
  const text = escapeHtml(section.placeholder)
  const group = section.group ? ` data-guide-group="${escapeHtml(section.group)}"` : ''
  const guide = ` data-guide="${escapeHtml(section.hint ?? section.placeholder)}" data-guide-text="${text}"${group}`

  if (section.block === 'title') {
    // `data-doc-role` keeps the blueprint title matching the real Title command,
    // so IEEE numbering leaves it unnumbered and it renders at title typography.
    return `<h1 data-doc-role="title"${guide}>${text}</h1>`
  }
  if (section.block === 'heading') {
    return `<h${section.level ?? 2}${guide}>${text}</h${section.level ?? 2}>`
  }
  if (section.block === 'blockquote') {
    return `<blockquote${guide}><p>${text}</p></blockquote>`
  }
  const body = section.bold ? `<strong>${text}</strong>` : text
  const line = section.centered ? ' style="text-align: center; text-indent: 0"' : ''
  return `<p${line}${guide}>${body}</p>`
}

/**
 * Detect whether a document's page geometry has drifted from the standard
 * blueprint it was created with. That divergence is what triggers the
 * "save this as your own version" prompt.
 */
export function hasDriftedFromPreset(
  preset: AcademicPreset | undefined,
  current: { pageSize: string; margins: { top: number; bottom: number; left: number; right: number } }
): boolean {
  if (!preset) return false

  const now = current.margins
  const matches = (target: { top: number; bottom: number; left: number; right: number }): boolean =>
    Math.abs(target.top - now.top) <= 0.01 &&
    Math.abs(target.bottom - now.bottom) <= 0.01 &&
    Math.abs(target.left - now.left) <= 0.01 &&
    Math.abs(target.right - now.right) <= 0.01
  // Margins an earlier version of the preset used still count as the standard.
  const marginDrift = ![preset.margins, ...(preset.legacyMargins ?? [])].some(matches)

  return marginDrift || preset.pageSize !== current.pageSize
}
