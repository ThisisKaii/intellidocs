import type { AIResponse, ChatCompleter } from '../../ai/aiClient'
import { refineAcademicTone } from '../refineAcademicTone'

function answering(text: string): ChatCompleter {
  return jest.fn<Promise<AIResponse>, Parameters<ChatCompleter>>().mockResolvedValue({ text, provider: 'test', model: 'test' })
}

const NO_MODEL_EDITS = answering('{"edits":[]}')

describe('refineAcademicTone', () => {
  it('removes filler and replaces conversational openers and contractions', async () => {
    const text = 'It is important to note that the model converges. Plus, the loss doesn\'t spike.'
    const { edits } = await refineAcademicTone({ text, focus: 'all' }, NO_MODEL_EDITS)
    expect(edits).toEqual([
      expect.objectContaining({ original: 'It is important to note that the', refined: 'The', ruleCategory: 'conciseness' }),
      expect.objectContaining({ original: 'Plus, the', refined: 'Moreover, the', ruleCategory: 'cohesion' }),
      expect.objectContaining({ original: "doesn't", refined: 'does not', ruleCategory: 'vocabulary' }),
    ])
    for (const edit of edits) expect(text.split(edit.original)).toHaveLength(2)
  })

  it('hedges overclaims', async () => {
    const { edits } = await refineAcademicTone({ text: 'These results prove that caching helps.', focus: 'hedging' }, NO_MODEL_EDITS)
    expect(edits).toEqual([expect.objectContaining({ original: 'prove that', refined: 'indicate that' })])
  })

  it('keeps a hedging edit next to a filler edit on the same subject', async () => {
    const { edits } = await refineAcademicTone({ text: 'Basically, this proves that the model works.', focus: 'all' }, NO_MODEL_EDITS)
    expect(edits.map((edit) => [edit.original, edit.refined])).toEqual([
      ['Basically, this', 'This'],
      ['proves that', 'indicates that'],
    ])
  })

  it('does not treat "So far" as a conversational opener', async () => {
    const { edits } = await refineAcademicTone({ text: 'So far the method works.', focus: 'clarity' }, NO_MODEL_EDITS)
    expect(edits).toEqual([])
  })

  it('keeps model edits only when they quote the text exactly and add nothing', async () => {
    const model = answering(
      JSON.stringify({
        edits: [
          { original: 'a lot of errors', refined: 'numerous errors', reason: 'informal', category: 'vocabulary' },
          { original: 'text that is not there', refined: 'x', reason: '', category: 'vocabulary' },
          { original: 'the parser', refined: 'the parser from Google in 2019', reason: '', category: 'vocabulary' },
        ],
      })
    )
    const { edits } = await refineAcademicTone({ text: 'We saw a lot of errors in the parser.', focus: 'vocabulary' }, model)
    expect(edits).toEqual([{ original: 'a lot of errors', refined: 'numerous errors', reason: 'informal', ruleCategory: 'vocabulary' }])
  })

  it('reports acronyms used before they are spelled out, unless the document defines them', async () => {
    const text = 'We trained a CNN on the data. A support vector machine (SVM) was the baseline, and the CNN won.'
    const { notices } = await refineAcademicTone({ text, focus: 'all' }, NO_MODEL_EDITS)
    expect(notices.map((notice) => notice.term)).toEqual(['CNN'])
    const defined = await refineAcademicTone({ text, focus: 'all', contextText: 'a convolutional neural network (CNN)' }, NO_MODEL_EDITS)
    expect(defined.notices).toEqual([])
  })

  it('still returns rule edits when the model is down', async () => {
    const down = jest.fn<Promise<AIResponse>, Parameters<ChatCompleter>>().mockRejectedValue(new Error('offline'))
    const { edits } = await refineAcademicTone({ text: 'Basically, it works.', focus: 'all' }, down)
    expect(edits).toEqual([expect.objectContaining({ original: 'Basically, it', refined: 'It' })])
  })
})
