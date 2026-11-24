import { createFeedbackRecord, listFeedbackTrainingExamples } from '../feedbackModel'

/** What the stubbed database returns and what the model wrote to it. */
const state: {
  inserts: Array<Record<string, unknown>>
  insertErrors: Array<{ code: string; message: string } | null>
  rows: Array<Record<string, unknown>>
  filters: Array<[string, ...unknown[]]>
} = { inserts: [], insertErrors: [], rows: [], filters: [] }

function makeQuery(): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  const self = (name: string) => (...args: unknown[]): Record<string, unknown> => {
    state.filters.push([name, ...args])
    return query
  }
  for (const name of ['select', 'eq', 'not', 'order', 'limit']) query[name] = jest.fn(self(name))
  query.insert = jest.fn(async (payload: Record<string, unknown>) => {
    state.inserts.push(payload)
    return { error: state.insertErrors.shift() ?? null }
  })
  query.then = (resolve: (value: unknown) => void): void => resolve({ data: state.rows, error: null })
  return query
}

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ from: jest.fn(() => makeQuery()) })) }))

beforeEach(() => {
  state.inserts = []
  state.insertErrors = []
  state.rows = []
  state.filters = []
})

const BASE = { userId: 'u1', documentId: 'd1', predictionType: 'format_prompt' as const, predictedFormat: 'heading1', accepted: false }

describe('feedback that can train the user model', () => {
  it('records the block and the format it kept', async () => {
    await createFeedbackRecord({ ...BASE, blockText: 'Rationale of the Study', keptFormat: 'paragraph' })
    expect(state.inserts).toEqual([
      expect.objectContaining({ predicted_format: 'heading1', accepted: false, block_text: 'Rationale of the Study', kept_format: 'paragraph' }),
    ])
  })

  it('still keeps the feedback on a database without the block columns', async () => {
    state.insertErrors = [{ code: 'PGRST204', message: "Could not find the 'block_text' column" }]
    await createFeedbackRecord({ ...BASE, blockText: 'Rationale of the Study', keptFormat: 'paragraph' })
    expect(state.inserts).toHaveLength(2)
    expect(state.inserts[1]).not.toHaveProperty('block_text')
    expect(state.inserts[1]).toEqual(expect.objectContaining({ predicted_format: 'heading1', accepted: false }))
  })

  it('labels accepted blocks with the suggestion and rejected ones with the format they kept', async () => {
    state.rows = [
      { block_text: 'CHAPTER I', predicted_format: 'heading1', kept_format: null, accepted: true, documents: { genre: 'thesis' } },
      { block_text: 'Rationale of the Study', predicted_format: 'heading1', kept_format: 'heading2', accepted: false, documents: [{ genre: 'thesis' }] },
      { block_text: 'No kept format', predicted_format: 'title', kept_format: null, accepted: false, documents: { genre: 'memo' } },
      { block_text: '   ', predicted_format: 'title', kept_format: null, accepted: true, documents: null },
      { block_text: 'Loose note', predicted_format: 'paragraph', kept_format: null, accepted: true, documents: null },
    ]
    await expect(listFeedbackTrainingExamples('u1')).resolves.toEqual([
      { text: 'CHAPTER I', label: 'heading1', genre: 'thesis' },
      { text: 'Rationale of the Study', label: 'heading2', genre: 'thesis' },
      { text: 'Loose note', label: 'paragraph', genre: 'general' },
    ])
    expect(state.filters).toContainEqual(['eq', 'user_id', 'u1'])
    expect(state.filters).toContainEqual(['not', 'block_text', 'is', null])
  })
})
