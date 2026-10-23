import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Heading from '@tiptap/extension-heading'

import { getBlueprint } from '../documentBlueprints'
import { convertToIeee } from '../ieeeConvertCommand'
import {
  applyIeeeNumberingToTexts,
  computeIeeeNumbers,
  isUnnumberedIeeeHeading,
  leadingNumberLength,
  stripIeeeNumber,
} from '../ieeeNumbering'
import { applyIeeeNumbering } from '../ieeeNumberingCommand'
import {
  buildScaffold,
  canonicalSectionName,
  mergeRunIn,
  removeRunInLabel,
  renderScaffoldHtml,
  type SourceSection,
} from '../ieeeScaffold'

/** Headings with the title role, as the real editor defines them. */
const RoleHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      docRole: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-doc-role'),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.docRole ? { 'data-doc-role': String(attributes.docRole) } : {},
      },
    }
  },
})

/** An editor with the schema the IEEE commands expect. */
function createEditor(content: string): Editor {
  return new Editor({ extensions: [StarterKit.configure({ heading: false }), RoleHeading], content })
}

/** Text of every heading in the editor, in order. */
function headingTexts(editor: Editor): string[] {
  const texts: string[] = []
  editor.state.doc.forEach((node) => {
    if (node.type.name === 'heading') texts.push(node.textContent)
  })
  return texts
}

const section = (heading: string | null, html: string, isTitle = false): SourceSection => ({ heading, html, isTitle })

describe('IEEE heading numbering text rules', () => {
  it('numbers levels with Roman numerals, letters and numerals, resetting lower tiers', () => {
    expect(
      computeIeeeNumbers([{ level: 1 }, { level: 2 }, { level: 2 }, { level: 3 }, { level: 1 }, { level: 2 }])
    ).toEqual(['I.', 'A.', 'B.', '1)', 'II.', 'A.'])
  })

  it('strips real number labels but never a word that only looks like one', () => {
    expect(stripIeeeNumber('I. Introduction')).toBe('Introduction')
    expect(stripIeeeNumber('B. Objectives')).toBe('Objectives')
    expect(stripIeeeNumber('1) Background:')).toBe('Background:')
    expect(stripIeeeNumber('1.2 Scope')).toBe('Scope')
    expect(stripIeeeNumber('Mix. Results')).toBe('Mix. Results')
    expect(leadingNumberLength('IV. Results')).toBe(4)
  })

  it('leaves the title, abstract, references and appendices unnumbered', () => {
    expect(isUnnumberedIeeeHeading('References:')).toBe(true)
    expect(isUnnumberedIeeeHeading('Appendix A: Proofs')).toBe(true)
    expect(isUnnumberedIeeeHeading('Bibliography')).toBe(true)
    const texts = applyIeeeNumberingToTexts([
      { level: 1, text: 'My Paper', unnumbered: true },
      { level: 1, text: 'Abstract' },
      { level: 1, text: 'Introduction' },
      { level: 1, text: 'References' },
    ])
    expect(texts).toEqual(['My Paper', 'Abstract', 'I. Introduction', 'References'])
  })

  it('is idempotent', () => {
    const once = applyIeeeNumberingToTexts([{ level: 1, text: 'Introduction' }, { level: 2, text: 'Scope' }])
    const twice = applyIeeeNumberingToTexts(once.map((text, i) => ({ level: (i === 0 ? 1 : 2) as 1 | 2, text })))
    expect(twice).toEqual(once)
  })
})

describe('applyIeeeNumbering in the editor', () => {
  it('numbers every heading correctly even though each label shifts the positions after it', () => {
    const editor = createEditor('<h1>Intro</h1><p>a</p><h1>Method</h1><p>b</p><h1>Results</h1><p>c</p><h1>Conclusion</h1>')
    expect(applyIeeeNumbering(editor)).toBe(true)
    const headings = headingTexts(editor)
    expect(headings).toEqual(['I. Intro', 'II. Method', 'III. Results', 'IV. Conclusion'])
  })

  it('keeps bold text inside a heading and does nothing on a second run', () => {
    const editor = createEditor('<h1><strong>Bold</strong> intro</h1><h1>Next</h1>')
    applyIeeeNumbering(editor)
    expect(editor.getHTML()).toContain('<strong>I. Bold</strong> intro')
    const html = editor.getHTML()
    expect(applyIeeeNumbering(editor)).toBe(false)
    expect(editor.getHTML()).toBe(html)
  })
})

describe('IEEE scaffold rules', () => {
  it('folds common alternative section names into the IEEE slots', () => {
    expect(canonicalSectionName('Methodology')).toBe('proposed method')
    expect(canonicalSectionName('II. Results')).toBe('results and discussion')
    expect(canonicalSectionName('Keywords')).toBe('index terms')
    expect(canonicalSectionName('Introduction')).toBe('introduction')
  })

  it('puts the Abstract label in the first paragraph instead of nesting paragraphs', () => {
    expect(mergeRunIn('<strong><em>Abstract</em></strong>—', '<p>Text one.</p><p>Text two.</p>')).toBe(
      '<p><strong><em>Abstract</em></strong>— Text one.</p><p>Text two.</p>'
    )
    expect(mergeRunIn('L', '<img src="x">')).toBe('<p>L</p><img src="x">')
  })

  it('removes an existing run-in label so it is not doubled', () => {
    expect(removeRunInLabel('<p><strong><em>Abstract</em></strong>— Body.</p>')).toBe('<p>Body.</p>')
    expect(removeRunInLabel('<p>Index Terms: a, b</p>')).toBe('<p>a, b</p>')
    expect(removeRunInLabel('<p>Plain text</p>')).toBe('<p>Plain text</p>')
  })

  it('drops the blank body placeholder after a filled heading and the extra author lines after a filled author block', () => {
    const blueprint = getBlueprint('ieee')
    const result = buildScaffold(
      [
        section(null, '<p>Alice Smith</p>'),
        section('Introduction', '<h1>Introduction</h1><p>Real intro.</p>'),
      ],
      blueprint
    )
    const html = renderScaffoldHtml(result, blueprint, () => '<p data-blank></p>')
    expect(html).toContain('Alice Smith')
    expect(html).toContain('Real intro.')
    expect(html.match(/data-blank/g)?.length ?? 0).toBeLessThan(blueprint.sections.length)
    expect(html).not.toContain('Explain the problem')
  })

  it('keeps unmatched sections under Unmapped Content', () => {
    const blueprint = getBlueprint('ieee')
    const result = buildScaffold([section('Weird Extra', '<h1>Weird Extra</h1><p>Keep me.</p>')], blueprint)
    expect(renderScaffoldHtml(result, blueprint, () => '')).toContain('Unmapped Content')
    expect(result.leftovers).toHaveLength(1)
  })
})

describe('convertToIeee in the editor', () => {
  it('maps a messy document onto the IEEE structure without losing or duplicating content', () => {
    const editor = createEditor(
      '<p>Alice Smith</p><h1>Introduction</h1><p>Intro text.</p><h2>Prior Approaches</h2><p>Sub text.</p>' +
        '<h1>Methodology</h1><p>Method text.</p><h1>Weird Extra</h1><p>Extra text.</p>'
    )
    expect(convertToIeee(editor)).toBe(true)
    const text = editor.getText()
    for (const kept of ['Alice Smith', 'Intro text.', 'Prior Approaches', 'Sub text.', 'Method text.', 'Weird Extra', 'Extra text.']) {
      expect(text).toContain(kept)
      expect(text.split(kept).length - 1).toBe(1)
    }
    expect(text).not.toContain('Explain the problem')
    expect(text).not.toContain('Author Name')
    const headings = headingTexts(editor)
    expect(headings.some((h) => h.startsWith('I. Introduction'))).toBe(true)
    expect(headings.some((h) => h.includes('Methodology'))).toBe(true)
  })

  it('keeps a first heading called Introduction as a section, not the paper title', () => {
    const editor = createEditor('<h1>Introduction</h1><p>Intro text.</p>')
    convertToIeee(editor)
    const headings = headingTexts(editor)
    expect(headings.some((h) => h.startsWith('I. Introduction'))).toBe(true)
  })
})
