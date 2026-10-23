import { buildFormattingReply } from '../buildFormattingReply'

const BASE = { formats: ['bold'], fontSize: null, normalize: false, scope: 'selection' as const, target: null, targetMode: null, targetCategory: null }

describe('buildFormattingReply', () => {
  it('says the words are bold for a literal target and never claims it is applied', () => {
    const reply = buildFormattingReply({ ...BASE, scope: 'all', target: 'approval sheet', targetMode: 'literal' }, 'x')
    expect(reply).toContain('\u201capproval sheet\u201d')
    expect(reply).not.toMatch(/\[|applied\b|\*\*/i)
  })

  it('describes a section target as the whole section', () => {
    const reply = buildFormattingReply({ ...BASE, scope: 'all', target: 'approval sheet', targetMode: 'section' }, 'x')
    expect(reply).toContain('whole Approval Sheet section')
  })

  it('names the chapter and its contents for chapter targets', () => {
    const reply = buildFormattingReply({ ...BASE, formats: ['italic'], scope: 'all', target: 'chapter 2', targetMode: 'section' }, 'x')
    expect(reply).toContain('Chapter 2 and everything in it')
  })

  it('combines several formats and a size naturally', () => {
    const reply = buildFormattingReply({ ...BASE, formats: ['bold', 'align_center'], fontSize: 14, scope: 'all', targetCategory: 'chapters' }, 'x')
    expect(reply).toContain('every chapter heading')
    expect(reply).toContain('bold, centered and 14pt')
  })

  it('describes clearing formatting', () => {
    const reply = buildFormattingReply({ ...BASE, normalize: true, formats: ['italic'], scope: 'all', target: 'acknowledgement', targetMode: 'section' }, 'x')
    expect(reply).toContain('clear')
    expect(reply).toContain('Acknowledgement')
  })

  it('is stable for the same request', () => {
    expect(buildFormattingReply(BASE, 'same')).toBe(buildFormattingReply(BASE, 'same'))
  })
})
