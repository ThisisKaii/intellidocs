import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CitationAssistant, defaultCitationTab } from '../CitationAssistant'
import type { CitationReference } from '@/lib/citationFormats'

/** One saved source, enough for the list views to render. */
const reference: CitationReference = {
  id: 'smith2020',
  type: 'journal',
  authors: ['Ana Smith'],
  title: 'Learning to format documents',
  year: 2020,
}

/** Render the panel to markup with the given references. */
function render(references: CitationReference[]): string {
  return renderToStaticMarkup(
    createElement(CitationAssistant, { editor: null, citationStyle: 'apa', references })
  )
}

describe('defaultCitationTab', () => {
  it('starts on Manage when there is nothing to cite yet', () => {
    expect(defaultCitationTab(0)).toBe('manage')
  })

  it('starts on Insert once there are sources', () => {
    expect(defaultCitationTab(3)).toBe('insert')
  })
})

describe('CitationAssistant guidance', () => {
  it('lists the tabs in the order they are used, with step numbers', () => {
    const html = render([])
    const manage = html.indexOf('>Manage<')
    const insert = html.indexOf('>Insert<')
    const bibliography = html.indexOf('>Bibliography<')
    expect(manage).toBeGreaterThan(-1)
    expect(manage).toBeLessThan(insert)
    expect(insert).toBeLessThan(bibliography)
  })

  it('explains the open tab in one line', () => {
    expect(render([])).toContain('Add the sources you are using')
    expect(render([reference])).toContain('press + next to a source to cite it there')
  })

  it('opens on Manage with no sources and on Insert with sources', () => {
    expect(render([])).toContain('Find by DOI, link or title')
    expect(render([reference])).toContain('Search references...')
  })
})
