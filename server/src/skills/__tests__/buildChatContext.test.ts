import { buildChatContext } from '../buildChatContext'

describe('buildChatContext', () => {
  it('normalizes saved editor HTML into readable document excerpts', () => {
    const context = buildChatContext({
      documentTitle: 'Research Plan',
      documentContent:
        '<h1>Research Plan</h1><p>This&nbsp;document &amp; outline explains the study.</p><ul><li>Collect feedback</li><li>Measure formatting time</li></ul>',
    })

    expect(context).toContain('document titled "Research Plan"')
    expect(context).toContain('This document & outline explains the study.')
    expect(context).toContain('- Collect feedback')
    expect(context).toContain('- Measure formatting time')
    expect(context).not.toContain('<h1>')
    expect(context).not.toContain('&nbsp;')
    expect(context).not.toContain('&amp;')
  })

  it('summarizes document metadata in natural language without telemetry', () => {
    const context = buildChatContext({
      documentTitle: 'Capstone Notes',
      documentContent:
        '<h2>Introduction</h2><p>IntelliDocs studies adaptive formatting suggestions.</p><p>The editor tracks behavior and measures accept reject feedback.</p>',
    })

    expect(context).toContain('document titled "Capstone Notes"')
    expect(context).toContain('about 15 words across 3 paragraphs')
    expect(context).toContain('1 section-like heading')
    expect(context).toContain('Likely section headings: "Introduction".')
    expect(context).toContain('Opening excerpt:')
    expect(context).not.toContain('Document ID')
    expect(context).not.toContain('Word count:')
  })

  it('handles missing document fields without fabricating context', () => {
    const context = buildChatContext({})

    expect(context).toContain('untitled document')
    expect(context).toContain('currently empty')
    expect(context).not.toContain('Document ID')
    expect(context).not.toContain('unavailable')
  })
})
