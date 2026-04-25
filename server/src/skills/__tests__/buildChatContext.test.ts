import { buildChatContext } from '../buildChatContext'

describe('buildChatContext', () => {
  it('normalizes saved editor HTML into readable document excerpts', () => {
    const context = buildChatContext({
      documentId: 'doc-123',
      documentTitle: 'Research Plan',
      documentContent:
        '<h1>Research Plan</h1><p>This&nbsp;document &amp; outline explains the study.</p><ul><li>Collect feedback</li><li>Measure formatting time</li></ul>',
    })

    expect(context).toContain('Document ID: doc-123')
    expect(context).toContain('Document title: Research Plan')
    expect(context).toContain('Research Plan')
    expect(context).toContain('This document & outline explains the study.')
    expect(context).toContain('- Collect feedback')
    expect(context).toContain('- Measure formatting time')
    expect(context).not.toContain('<h1>')
    expect(context).not.toContain('&nbsp;')
    expect(context).not.toContain('&amp;')
  })

  it('includes document metadata for grounded AI replies', () => {
    const context = buildChatContext({
      documentId: 'doc-456',
      documentTitle: 'Capstone Notes',
      documentContent:
        '<h2>Introduction</h2><p>IntelliDocs studies adaptive formatting suggestions.</p><p>The editor tracks behavior and measures accept reject feedback.</p>',
    })

    expect(context).toContain('Document ID: doc-456')
    expect(context).toContain('Document title: Capstone Notes')
    expect(context).toContain('Word count: 15')
    expect(context).toContain('Paragraph count: 3')
    expect(context).toContain('Heading count: 1')
    expect(context).toContain('Detected headings or section-like lines:')
    expect(context).toContain('- Introduction')
    expect(context).toContain('Opening excerpt:')
  })

  it('handles missing document fields without fabricating context', () => {
    const context = buildChatContext({})

    expect(context).toContain('Document ID: unavailable')
    expect(context).toContain('Document title: unavailable')
    expect(context).toContain('Word count: 0')
    expect(context).toContain('Paragraph count: 0')
    expect(context).toContain('Heading count: 0')
    expect(context).toContain('Detected headings or section-like lines: unavailable')
    expect(context).toContain('Opening excerpt: unavailable')
  })
})