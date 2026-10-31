/* Builds tests/fixtures/import_baselines/documents/ieee_sample_paper.docx.
 *
 * A synthetic IEEE-style paper for import fidelity work: Letter page, 0.75/1/0.625in margins,
 * 10pt Times, a single-column title block, a two-column body, inline and numbered equations
 * (OMML), a footnote, a table inside a column and a full-width table in the middle of the body.
 * The text is generated filler; nothing here comes from a real publication.
 *
 *   node tests/e2e/tools/make_ieee_sample.cjs
 */
const fs = require('fs')
const path = require('path')
const D = require(path.join(__dirname, '..', '..', '..', 'frontend', 'node_modules', 'docx'))

const OUT = path.join(__dirname, '..', '..', 'fixtures', 'import_baselines', 'documents', 'ieee_sample_paper.docx')
const COLUMN_DXA = 5040 // (7.25in text width - 0.25in gap) / 2
const FULL_DXA = 10440 // 7.25in
const FONT = 'Times New Roman'

/** A run of body text. */
const t = (text, opts = {}) => new D.TextRun({ text, font: FONT, size: 20, ...opts })
/** Math run (italic Cambria Math by default). */
const m = (text) => new D.MathRun(text)

/** A justified body paragraph with a 0.2in first-line indent. */
const body = (...children) =>
  new D.Paragraph({
    alignment: D.AlignmentType.JUSTIFIED,
    indent: { firstLine: 288 },
    spacing: { after: 120, line: 240 },
    children: children.map((c) => (typeof c === 'string' ? t(c) : c)),
  })

/** Level-1 IEEE heading, literal Roman numeral, centred small caps. */
const h1 = (text) =>
  new D.Paragraph({
    heading: D.HeadingLevel.HEADING_1,
    alignment: D.AlignmentType.CENTER,
    spacing: { before: 240, after: 80 },
    children: [t(text.toUpperCase(), { size: 20 })],
  })

/** Level-2 IEEE heading, literal letter, italic. */
const h2 = (text) =>
  new D.Paragraph({
    heading: D.HeadingLevel.HEADING_2,
    spacing: { before: 160, after: 60 },
    children: [t(text, { italics: true })],
  })

/** A display equation: centre tab, equation, right tab, number (the Word idiom IEEE templates use). */
const equation = (mathChildren, number) =>
  new D.Paragraph({
    tabStops: [
      { type: D.TabStopType.CENTER, position: COLUMN_DXA / 2 },
      { type: D.TabStopType.RIGHT, position: COLUMN_DXA },
    ],
    spacing: { before: 60, after: 60 },
    children: [t('\t'), new D.Math({ children: mathChildren }), t(`\t(${number})`)],
  })

const filler = [
  'Reliable import of word-processor files depends on resolving every layout property the author set, not only the text. Small differences in line height accumulate over a page and move later pages out of step [1].',
  'We measure agreement page by page against the original rendering and report the first paragraph at which the two layouts diverge, because a single early shift makes every later page look wrong [2], [3].',
  'The converter resolves styles down to inline properties, so the editor never has to know the style chain of the source document. This keeps the editor simple but makes the converter responsible for exact spacing.',
  'Section breaks carry their own margins, columns and page size. A faithful import has to honour each section, including continuous breaks that change the column count in the middle of a page [4].',
]

const cell = (text, width, bold = false) =>
  new D.TableCell({
    width: { size: width, type: D.WidthType.DXA },
    margins: { top: 30, bottom: 30, left: 60, right: 60 },
    children: [new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [t(text, { size: 16, bold })] })],
  })

const grid = (rows, widths) =>
  new D.Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: D.WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((r, i) => new D.TableRow({ tableHeader: i === 0, children: r.map((c, j) => cell(c, widths[j], i === 0)) })),
  })

const caption = (text) =>
  new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { before: 60, after: 120 }, children: [t(text, { size: 16 })] })

const page = { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1440, left: 900, right: 900, header: 720, footer: 720 } }

const frontMatter = {
  properties: { page },
  children: [
    new D.Paragraph({
      alignment: D.AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [t('Measuring Layout Agreement of Imported Documents Against Their Source Rendering', { size: 48 })],
    }),
    new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { after: 40 }, children: [t('Alex Rivera', { size: 22 }), t('  and  ', { size: 22 }), t('Sam Okafor', { size: 22 })] }),
    new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { after: 200 }, children: [t('Department of Computer Science, Example University', { size: 18, italics: true })] }),
    new D.Paragraph({
      alignment: D.AlignmentType.JUSTIFIED,
      spacing: { after: 80 },
      children: [
        t('Abstract', { bold: true, italics: true, size: 18 }),
        t('—We describe a method for scoring how closely an imported word-processor document matches the layout of its source. Page counts, words per page and first-divergence position are combined into a report that points at the earliest layout error.', { bold: true, size: 18 }),
      ],
    }),
    new D.Paragraph({
      alignment: D.AlignmentType.JUSTIFIED,
      spacing: { after: 120 },
      children: [t('Index Terms', { bold: true, italics: true, size: 18 }), t('—document import, pagination, layout fidelity, equations', { bold: true, size: 18 })],
    }),
  ],
}

const columns = { count: 2, space: 360 }
const cont = D.SectionType.CONTINUOUS

const part1 = {
  properties: { type: cont, page, column: columns },
  children: [
    h1('I. Introduction'),
    body(filler[0]),
    body(
      'The score of a page is a ratio ',
      new D.Math({ children: [m('s='), new D.MathFraction({ numerator: [m('n')], denominator: [m('N')] })] }),
      ', where ',
      new D.Math({ children: [m('n')] }),
      ' is the number of matching words and ',
      new D.Math({ children: [m('N')] }),
      ' the number in the reference.',
      new D.FootnoteReferenceRun(1)
    ),
    equation([m('E='), m('m'), new D.MathSuperScript({ children: [m('c')], superScript: [m('2')] })], 1),
    body(filler[1]),
    h2('A. Problem statement'),
    body(filler[2]),
    equation(
      [
        m('D='),
        new D.MathSum({ children: [new D.MathFraction({ numerator: [m('1')], denominator: [m('2')] }), m('|'), m('a'), m('-'), m('b'), m('|')], subScript: [m('i=1')], superScript: [m('N')] }),
      ],
      2
    ),
    body(filler[3]),
    body(filler[0], ' ', filler[1]),
    h2('B. Contributions'),
    body(filler[2], ' ', filler[3]),
  ],
}

const wide = {
  properties: { type: cont, page, column: { count: 1 } },
  children: [
    caption('TABLE I. Page agreement for the sample documents (full width)'),
    grid(
      [
        ['Document', 'Pages (ref)', 'Pages (got)', 'Words ok', 'Layout', 'Edges', 'First divergence'],
        ['Sample A', '14', '14', '0.99', '0.91', 'yes', 'none'],
        ['Sample B', '32', '37', '0.98', '0.40', 'no', 'page 2'],
        ['Sample C', '31', '31', '1.00', '0.88', 'yes', 'page 18'],
      ],
      [2040, 1400, 1400, 1400, 1400, 1400, 1400]
    ),
  ],
}

const part2 = {
  properties: { type: cont, page, column: columns },
  children: [
    h1('II. Method'),
    body(filler[1], ' ', filler[2]),
    equation([new D.MathRadical({ children: [m('x'), m('+'), m('y')] }), m('≤'), m('z')], 3),
    body(filler[3], ' ', filler[0]),
    caption('TABLE II. Settings used'),
    grid([['Setting', 'Value'], ['Dpi', '96'], ['Shift', '4 px']], [2400, 2400]),
    body(filler[0], ' ', filler[1], ' ', filler[2]),
    h1('III. Results'),
    body(filler[2], ' ', filler[3], ' ', filler[0]),
    body(filler[1], ' ', filler[2], ' ', filler[3], ' ', filler[0]),
    body(filler[3], ' ', filler[0], ' ', filler[1]),
    h1('IV. Conclusion'),
    body(filler[2], ' ', filler[3]),
    h1('References'),
    new D.Paragraph({ spacing: { after: 40 }, children: [t('[1] A. Author, “Layout in word processors,” J. Docs, vol. 1, no. 1, pp. 1–10, 2020.', { size: 16 })] }),
    new D.Paragraph({ spacing: { after: 40 }, children: [t('[2] B. Writer, “Pagination,” Proc. Conf., 2021, pp. 11–20.', { size: 16 })] }),
    new D.Paragraph({ spacing: { after: 40 }, children: [t('[3] C. Reader, “Importing documents,” Trans. Doc., vol. 2, 2022.', { size: 16 })] }),
    new D.Paragraph({ spacing: { after: 40 }, children: [t('[4] D. Editor, “Sections and columns,” Doc. Eng., 2023.', { size: 16 })] }),
  ],
}

const doc = new D.Document({
  creator: 'IntelliDocs fixtures',
  title: 'Measuring Layout Agreement of Imported Documents Against Their Source Rendering',
  styles: {
    default: { document: { run: { font: FONT, size: 20 } } },
  },
  footnotes: {
    1: { children: [new D.Paragraph({ children: [t('Words are compared after lower-casing and removing punctuation.', { size: 16 })] })] },
  },
  sections: [frontMatter, part1, wide, part2],
})

D.Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(OUT, buffer)
  console.log(`wrote ${OUT} (${buffer.length} bytes)`)
})
