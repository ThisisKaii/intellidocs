import type { AIResponse, ChatCompleter } from '../../ai/aiClient'
import { orchestrateSectionDraft, splitNotes } from '../orchestrateSectionDraft'
import { checkNovelty } from '../checkNovelty'

const NOTES = [
  '- students rely on mobile phones for coursework',
  '- campus wifi drops during peak hours',
  '- no study has measured the effect on submission deadlines',
  '- this study surveys 40 students about missed deadlines',
].join('\n')

function reply(text: string): AIResponse {
  return { text, provider: 'test', model: 'test' }
}

/** A completer that answers each call from a queue. */
function scripted(...replies: string[]): ChatCompleter & jest.Mock {
  const fn = jest.fn<Promise<AIResponse>, Parameters<ChatCompleter>>()
  replies.forEach((text) => fn.mockResolvedValueOnce(reply(text)))
  return fn
}

const OUTLINE = JSON.stringify({ assignments: [{ note: 1, move: 1 }, { note: 2, move: 2 }, { note: 3, move: 2 }, { note: 4, move: 3 }] })
const GOOD_PARAGRAPHS = JSON.stringify({
  paragraphs: [
    { move: 1, text: 'Students rely on mobile phones for coursework.' },
    { move: 2, text: 'However, campus wifi drops during peak hours, and no study has measured the effect on submission deadlines.' },
    { move: 3, text: 'Consequently, this study surveys 40 students about missed deadlines.' },
  ],
})

describe('orchestrateSectionDraft', () => {
  it('splits bullets into points, and a single block into sentences', () => {
    expect(splitNotes('- one\n* two\n3. three')).toEqual(['one', 'two', 'three'])
    expect(splitNotes('First point here. Second point there.')).toEqual(['First point here.', 'Second point there.'])
  })

  it('declines empty notes and topic-only requests without calling the model', async () => {
    const complete = scripted()
    expect((await orchestrateSectionDraft({ sectionTitle: 'Introduction', userNotes: '' }, complete)).declined).toBeDefined()
    expect((await orchestrateSectionDraft({ sectionTitle: 'Introduction', userNotes: 'write a paper on climate change' }, complete)).declined).toMatch(/can’t write/)
    expect((await orchestrateSectionDraft({ sectionTitle: 'Introduction', userNotes: '- a\n- b' }, complete)).declined).toMatch(/too short/)
    expect(complete).not.toHaveBeenCalled()
  })

  it('groups notes under the section’s moves and joins each group', async () => {
    const result = await orchestrateSectionDraft({ sectionTitle: 'Introduction', userNotes: NOTES }, scripted(OUTLINE, GOOD_PARAGRAPHS))
    if (result.declined !== undefined) throw new Error('declined')
    expect(result.outline.map((move) => move.name)).toEqual(['Establishing the context', 'Identifying the gap', 'Presenting this work'])
    expect(result.outline[1].notes).toEqual(['campus wifi drops during peak hours', 'no study has measured the effect on submission deadlines'])
    expect(result.paragraphs).toHaveLength(3)
    expect(result.warnings).toEqual([])
  })

  it('keeps every note even when the outline skips one', async () => {
    const partial = JSON.stringify({ assignments: [{ note: 1, move: 1 }, { note: 3, move: 2 }] })
    const result = await orchestrateSectionDraft({ sectionTitle: 'Introduction', userNotes: NOTES }, scripted(partial, '{}', '{}'))
    if (result.declined !== undefined) throw new Error('declined')
    expect(result.outline.flatMap((move) => move.notes)).toHaveLength(4)
  })

  it('retries a paragraph that invents a number, then falls back to the notes verbatim', async () => {
    const invented = JSON.stringify({
      paragraphs: [
        { move: 1, text: 'Students rely on mobile phones for coursework.' },
        { move: 2, text: 'Campus wifi drops during peak hours, affecting 85% of users according to Smith.' },
        { move: 3, text: 'This study surveys 40 students about missed deadlines.' },
      ],
    })
    const result = await orchestrateSectionDraft({ sectionTitle: 'Introduction', userNotes: NOTES }, scripted(OUTLINE, invented, invented))
    if (result.declined !== undefined) throw new Error('declined')
    expect(result.paragraphs[1]).toBe('Campus wifi drops during peak hours. No study has measured the effect on submission deadlines.')
    expect(result.paragraphs[0]).toBe('Students rely on mobile phones for coursework.')
    expect(result.warnings).toHaveLength(1)
  })

  it('still returns the notes when the model is down', async () => {
    const complete = jest.fn<Promise<AIResponse>, Parameters<ChatCompleter>>().mockRejectedValue(new Error('offline'))
    const result = await orchestrateSectionDraft({ sectionTitle: 'Methods', userNotes: NOTES }, complete)
    if (result.declined !== undefined) throw new Error('declined')
    expect(result.paragraphs.join(' ')).toContain('Campus wifi drops during peak hours.')
    expect(result.warnings[0]).toMatch(/couldn’t polish/)
  })
})

describe('checkNovelty', () => {
  it('flags new numbers, citations and names but allows connectives', () => {
    expect(checkNovelty('Furthermore, the survey covered 40 students.', 'survey covered 40 students')).toEqual([])
    expect(checkNovelty('The survey covered 45 students [3].', 'survey covered 40 students')).toEqual(['adds the number "45"', 'adds the number "3"', 'adds the citation "[3]"'])
    expect(checkNovelty('The survey, run by Google, covered students.', 'survey covered students')).toEqual(['adds the name "Google"'])
  })
})
