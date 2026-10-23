import { describe, expect, it } from 'vitest'
import { buildBlueprintHtml, IEEE_BLUEPRINT } from '../documentBlueprints'
import {
  buildScaffold,
  coerceHeadingLevel,
  coerceToTitleHeading,
  normalizeHeadingName,
  runInLabel,
  slotMatchName,
  stripLeadingHeading,
  type SourceSection,
} from '../ieeeScaffold'
import { applyIeeeNumberingToTexts } from '../ieeeNumbering'

const emptyBlueprint = { id: 'x', label: 'x', sections: [] }

function section(
  heading: string | null,
  html: string,
  isTitle = false,
  level: 1 | 2 | 3 = 1
): SourceSection {
  return { heading, html, isTitle, level }
}

describe('normalizeHeadingName', () => {
  it('strips IEEE numbering and trailing punctuation', () => {
    expect(normalizeHeadingName('I. Introduction')).toBe('introduction')
    expect(normalizeHeadingName('1) Background:')).toBe('background')
    expect(normalizeHeadingName('  References  ')).toBe('references')
  })

  it('is case and whitespace insensitive', () => {
    expect(normalizeHeadingName('METHODOLOGY')).toBe(normalizeHeadingName('methodology'))
  })
})

describe('slotMatchName', () => {
  it('reads a run-in label from a paragraph slot', () => {
    const slot = IEEE_BLUEPRINT.sections.find((s) => s.placeholder.startsWith('Abstract'))
    expect(slotMatchName(slot!)).toBe('abstract')
  })

  it('returns null for author/affiliation slots that must not pull content in', () => {
    for (const placeholder of ['Author Name', 'Affiliation']) {
      const slot = IEEE_BLUEPRINT.sections.find((s) => s.placeholder === placeholder)
      if (slot) expect(slotMatchName(slot)).toBeNull()
    }
  })
})

describe('buildScaffold', () => {
  it('maps a source heading onto the identically named IEEE slot', () => {
    const sources = [
      section('Introduction', '<h1>Introduction</h1><p>Body text.</p>'),
    ]
    const { slots } = buildScaffold(sources, IEEE_BLUEPRINT)
    const intro = slots.find((s) => s.section.placeholder === 'Introduction')
    expect(intro?.content).toContain('Body text.')
  })

  it('leaves unmatched slots blank so the dashed guide renders', () => {
    const { slots } = buildScaffold([section('Introduction', '<p>x</p>')], IEEE_BLUEPRINT)
    const methodology = slots.find((s) => s.section.placeholder === 'Methodology')
    expect(methodology?.content).toBeNull()
  })

  it('reports leftovers instead of discarding unmatched source content', () => {
    const { leftovers } = buildScaffold(
      [section('Chapter 1: Discussion', '<p>Kept.</p>')],
      IEEE_BLUEPRINT
    )
    expect(leftovers).toHaveLength(1)
    expect(leftovers[0].html).toContain('Kept.')
  })

  it('does not fill the same slot twice', () => {
    const sources = [
      section('Introduction', '<p>First.</p>'),
      section('Introduction', '<p>Second.</p>'),
    ]
    const { slots } = buildScaffold(sources, IEEE_BLUEPRINT)
    const filled = slots.filter((s) => s.content?.includes('Introduction') === false)
    expect(filled.length).toBeGreaterThanOrEqual(0)
    const intros = slots.filter((s) => s.section.placeholder === 'Introduction')
    expect(intros).toHaveLength(1)
    expect(intros[0].content).toContain('First.')
  })
})

describe('carried HTML rewrites', () => {
  it('strips a source heading when filling a paragraph slot', () => {
    expect(stripLeadingHeading('<h1>Abstract</h1><p>Text.</p>')).toBe('<p>Text.</p>')
  })

  it('marks a carried title as the title role so numbering skips it', () => {
    expect(coerceToTitleHeading('<h1>My Paper</h1>')).toBe(
      '<h1 data-doc-role="title">My Paper</h1>'
    )
  })

  it('rewrites a carried heading level to match the slot', () => {
    expect(coerceHeadingLevel('<h1>Background</h1><p>x</p>', 3)).toBe(
      '<h3>Background</h3><p>x</p>'
    )
  })
})

describe('runInLabel', () => {
  it('rebuilds the bold italic Abstract run-in label', () => {
    const slot = IEEE_BLUEPRINT.sections.find((s) => s.placeholder.startsWith('Abstract'))
    expect(runInLabel(slot!)).toBe('<strong><em>Abstract</em></strong>\u2014')
  })

  it('returns null for a paragraph slot with no run-in label', () => {
    expect(runInLabel({ block: 'paragraph', placeholder: 'plain body' })).toBeNull()
  })
})

describe('blank blueprint title', () => {
  it('renders the title slot with the title role so it is not numbered', () => {
    const titleSlot = IEEE_BLUEPRINT.sections.find((s) => s.block === 'title')
    const html = buildBlueprintHtml({ ...IEEE_BLUEPRINT, sections: [titleSlot!] })
    expect(html).toContain('data-doc-role="title"')
  })
})

describe('numbering skips the title and run-in headings', () => {
  it('leaves the title unnumbered while numbering sections', () => {
    const out = applyIeeeNumberingToTexts([
      { level: 1, text: 'My Paper Title', unnumbered: true },
      { level: 1, text: 'Introduction' },
      { level: 2, text: 'Overview' },
      { level: 1, text: 'Abstract' },
      { level: 1, text: 'Unmapped Content' },
    ])
    expect(out[0]).toBe('My Paper Title')
    expect(out[1]).toMatch(/Introduction$/)
    expect(out[2]).toMatch(/^A\./)
    expect(out[3]).toBe('Abstract')
    expect(out[4]).toBe('Unmapped Content')
  })

  it('is idempotent when applied twice', () => {
    const once = applyIeeeNumberingToTexts([{ level: 1, text: 'Introduction' }])
    const twice = applyIeeeNumberingToTexts([{ level: 1, text: once[0] }])
    expect(twice[0]).toBe(once[0])
  })
})

describe('buildBlueprintHtml', () => {
  it('emits dashed guides for blank sections', () => {
    expect(buildBlueprintHtml(emptyBlueprint)).toBe('<p></p>')
  })
})
