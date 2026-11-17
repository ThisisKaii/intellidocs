import { describe, expect, it } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import { buildStructuredSectionContent, headingLevelAt } from './structuredSection'
import { findAcademicPreset } from './academicPresets'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    heading: { group: 'block', content: 'text*', attrs: { level: { default: 1 } } },
    text: {},
  },
})

const SECTION = { sectionTitle: 'Introduction', paragraphs: ['First paragraph.', '  ', 'Second paragraph.'] }

describe('buildStructuredSectionContent', () => {
  it('indents body paragraphs by the IEEE preset', () => {
    const blocks = buildStructuredSectionContent(SECTION, findAcademicPreset('ieee'), 2)
    expect(blocks[0]).toEqual({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Introduction' }] })
    expect(blocks).toHaveLength(3)
    expect(blocks[1].attrs?.style).toBe('text-indent: 0.25in; line-height: 1.15')
  })

  it('indents body paragraphs by the APA preset', () => {
    const blocks = buildStructuredSectionContent(SECTION, findAcademicPreset('apa_7th') ?? findAcademicPreset('apa'), 1)
    expect(blocks[1].attrs?.style).toContain('text-indent: 0.5in')
  })

  it('leaves paragraphs unstyled with no preset, and skips the placeholder title', () => {
    const blocks = buildStructuredSectionContent({ sectionTitle: 'New section', paragraphs: ['Only one.'] }, null, 2)
    expect(blocks).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: 'Only one.' }] }])
  })
})

describe('headingLevelAt', () => {
  it('goes one level below the nearest heading before the position', () => {
    const doc = schema.node('doc', null, [
      schema.node('heading', { level: 1 }, [schema.text('CHAPTER I')]),
      schema.node('paragraph', null, [schema.text('Body')]),
    ])
    expect(headingLevelAt(doc, doc.content.size)).toBe(2)
    expect(headingLevelAt(schema.node('doc', null, [schema.node('paragraph', null, [schema.text('x')])]), 3)).toBe(2)
  })
})
