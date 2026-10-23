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
    { block: 'paragraph', placeholder: 'Author Name', hint: 'Author names and affiliations', group: 'author_block' },
    { block: 'paragraph', placeholder: 'University and Course', group: 'author_block' },
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
    { block: 'paragraph', placeholder: 'Summarise the prior work you build on.' },
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
    { block: 'paragraph', placeholder: 'Author Name', group: 'author_block' },
    { block: 'paragraph', placeholder: 'Affiliation, City, Country', group: 'author_block' },
    { block: 'paragraph', placeholder: 'email@affiliation.edu', group: 'author_block' },
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

/** University capstone / thesis: full front matter and chapter structure. */
const UCLM_CAPSTONE: DocumentBlueprint = {
  key: 'uclm_capstone',
  name: 'University Capstone / Thesis',
  description: 'UCLM spec: 1.5" left margin, double-spaced, uppercase chapter headings, roman front matter.',
  presetKey: 'uclm_capstone',
  sections: [
    { block: 'title', placeholder: 'Thesis Title', hint: 'Title: 24pt Bold, Centered' },
    { block: 'paragraph', placeholder: 'Your Name', group: 'author_block' },
    { block: 'paragraph', placeholder: 'Supervisor: Dr. Supervisor Name', group: 'author_block' },
    { block: 'paragraph', placeholder: 'Department and University', group: 'author_block' },
    { block: 'paragraph', placeholder: 'Month Year', group: 'author_block' },
    { block: 'heading', level: 1, placeholder: 'Acknowledgments' },
    { block: 'paragraph', placeholder: 'Thank your adviser, panel, and supporters.' },
    { block: 'heading', level: 1, placeholder: 'Abstract' },
    { block: 'paragraph', placeholder: 'One paragraph summarising the whole thesis.' },
    { block: 'heading', level: 1, placeholder: 'Table of Contents' },
    { block: 'paragraph', placeholder: 'Update this page after your chapters are written.' },
    { block: 'heading', level: 1, placeholder: 'Chapter 1: Introduction' },
    { block: 'paragraph', placeholder: 'Background and motivation for the study.' },
    { block: 'heading', level: 2, placeholder: '1.1 Problem Statement' },
    { block: 'paragraph', placeholder: 'What is not yet solved.' },
    { block: 'heading', level: 2, placeholder: '1.2 Objectives' },
    { block: 'paragraph', placeholder: 'Aim and objectives of the capstone.' },
    { block: 'heading', level: 2, placeholder: '1.3 Scope and Limitations' },
    { block: 'paragraph', placeholder: 'Boundaries of the project and what is out of scope.' },
    { block: 'heading', level: 1, placeholder: 'Chapter 2: Literature Review' },
    { block: 'paragraph', placeholder: 'Review the theory and prior studies you build on.' },
    { block: 'heading', level: 2, placeholder: '2.1 Theoretical Framework' },
    { block: 'paragraph', placeholder: 'Key theories and models.' },
    { block: 'heading', level: 2, placeholder: '2.2 Related Studies' },
    { block: 'paragraph', placeholder: 'Prior theses and publications.' },
    { block: 'heading', level: 1, placeholder: 'Chapter 3: Methodology' },
    { block: 'paragraph', placeholder: 'Research design, data collection, and analysis plan.' },
    { block: 'heading', level: 2, placeholder: '3.1 Research Design' },
    { block: 'paragraph', placeholder: 'Quantitative, qualitative, or mixed method.' },
    { block: 'heading', level: 2, placeholder: '3.2 Data Collection' },
    { block: 'paragraph', placeholder: 'Instruments, sources, and sampling.' },
    { block: 'heading', level: 1, placeholder: 'Chapter 4: Results' },
    { block: 'paragraph', placeholder: 'Present findings per research question.' },
    { block: 'heading', level: 1, placeholder: 'Chapter 5: Discussion and Conclusion' },
    { block: 'paragraph', placeholder: 'Interpret the results against the literature.' },
    { block: 'heading', level: 2, placeholder: '5.1 Recommendations' },
    { block: 'paragraph', placeholder: 'Practical implications of the findings.' },
    { block: 'heading', level: 2, placeholder: '5.2 Future Work' },
    { block: 'paragraph', placeholder: 'What this project makes possible next.' },
    { block: 'heading', level: 1, placeholder: 'References' },
    { block: 'blockquote', placeholder: 'Full reference list, alphabetical.' },
  ],
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
export function buildBlueprintHtml(blueprint: DocumentBlueprint): string {
  if (blueprint.sections.length === 0) {
    return '<p></p>'
  }

  const blocks = blueprint.sections.map((section) => {
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
    return `<p${guide}>${text}</p>`
  })

  return blocks.join('')
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
