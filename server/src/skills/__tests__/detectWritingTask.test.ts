import { detectWritingTask } from '../detectWritingTask'

describe('detectWritingTask', () => {
  it('reads the section and notes from an organise request', () => {
    const task = detectWritingTask('Organize my notes for section 1.2 into a formal section:\n- surveyed 40 students\n- most used phones')
    expect(task).toEqual({ kind: 'structure', sectionTitle: 'Section 1.2', notes: '- surveyed 40 students\n- most used phones' })
  })

  it('takes the section name from "my methodology notes"', () => {
    const task = detectWritingTask('Organize my methodology notes into a formal section: we used a survey')
    expect(task).toMatchObject({ kind: 'structure', sectionTitle: 'Methodology' })
  })

  it('finds citation requests with a count and a query', () => {
    expect(detectWritingTask('Find 3 recent papers supporting attention mechanisms in transformers and add citations')).toEqual({
      kind: 'citations',
      query: 'attention mechanisms in transformers',
      limit: 3,
    })
  })

  it('uses the selection when the citation request points at it', () => {
    expect(detectWritingTask('Find citations for this', 'Sleep loss lowers exam scores.')).toEqual({
      kind: 'citations',
      query: 'Sleep loss lowers exam scores.',
      limit: 3,
    })
  })

  it('refines the selection with the requested focus', () => {
    expect(detectWritingTask('Refine the hedging in this paragraph', 'This proves that it works.')).toEqual({
      kind: 'refine',
      text: 'This proves that it works.',
      focus: 'hedging',
    })
    expect(detectWritingTask('Make this more academic')).toEqual({ kind: 'refine', text: null, focus: 'all' })
  })

  it('declines topic-only authoring requests', () => {
    expect(detectWritingTask('Write an essay on climate change')).toEqual({ kind: 'decline' })
    expect(detectWritingTask('Please write the introduction about renewable energy')).toEqual({ kind: 'decline' })
  })

  it('leaves formatting requests and questions alone', () => {
    expect(detectWritingTask('Make the introduction bold')).toBeNull()
    expect(detectWritingTask('Format Statement of the Problem as Heading 2')).toBeNull()
    expect(detectWritingTask('What is chapter 2 about?')).toBeNull()
  })
})
