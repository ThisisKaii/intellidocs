import { getDocumentReview, professorCanReview, submitGrade } from '../professorModel'

type Row = Record<string, unknown>

/** In-memory tables the model reads and writes; inserts are recorded in order. */
const state: {
  tables: Record<string, Row[]>
  inserts: Row[]
  rubricColumn: boolean
} = { tables: {}, inserts: [], rubricColumn: true }

function makeQuery(table: string): Record<string, unknown> {
  const filters: Array<(row: Row) => boolean> = []
  let order: { column: string; ascending: boolean } | null = null
  let limit: number | null = null
  let inserted: Row | null = null
  const rows = (): Row[] => {
    let result = (state.tables[table] ?? []).filter((row) => filters.every((keep) => keep(row)))
    if (order) {
      const { column, ascending } = order
      result = [...result].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1))
    }
    return limit === null ? result : result.slice(0, limit)
  }
  const query: Record<string, unknown> = {}
  query.select = jest.fn(() => query)
  query.eq = jest.fn((column: string, value: unknown) => {
    filters.push((row) => row[column] === value)
    return query
  })
  query.in = jest.fn((column: string, values: unknown[]) => {
    filters.push((row) => values.includes(row[column]))
    return query
  })
  query.order = jest.fn((column: string, options: { ascending: boolean }) => {
    order = { column, ascending: options.ascending }
    return query
  })
  query.limit = jest.fn((count: number) => {
    limit = count
    return query
  })
  query.insert = jest.fn((payload: Row) => {
    inserted = payload
    return query
  })
  query.single = jest.fn(async () => {
    if (inserted) {
      if ('rubric' in inserted && !state.rubricColumn) {
        return { data: null, error: { code: 'PGRST204', message: "Could not find the 'rubric' column of 'document_reviews'" } }
      }
      state.inserts.push(inserted)
      return { data: { review_id: 'r-new', reviewed_at: '2026-11-10T00:00:00Z', ...inserted }, error: null }
    }
    return { data: rows()[0] ?? null, error: null }
  })
  query.maybeSingle = jest.fn(async () => ({ data: rows()[0] ?? null, error: null }))
  query.then = (resolve: (value: unknown) => void): void => resolve({ data: rows(), error: null })
  return query
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: string) => makeQuery(table)),
    auth: {
      admin: {
        getUserById: jest.fn(async (id: string) => ({
          data: { user: { id, email: `${id}@school.edu`, user_metadata: id === 'prof' ? { first_name: 'Maria', last_name: 'Santos' } : {} } },
        })),
      },
    },
  })),
}))

beforeEach(() => {
  state.inserts = []
  state.rubricColumn = true
  state.tables = {
    folders: [
      { folder_id: 'class-a', user_id: 'prof', folder_type: 'class', parent_id: null },
      { folder_id: 'ws-ana', user_id: 'ana', folder_type: 'personal', parent_id: 'class-a' },
      { folder_id: 'class-b', user_id: 'other-prof', folder_type: 'class', parent_id: null },
    ],
    folder_documents: [
      { folder_id: 'ws-ana', document_id: 'doc-ana' },
      { folder_id: 'class-b', document_id: 'doc-elsewhere' },
    ],
    document_reviews: [
      { review_id: 'r1', document_id: 'doc-ana', reviewer_id: 'prof', grade: 70, reviewed_at: '2026-11-01T00:00:00Z' },
      { review_id: 'r2', document_id: 'doc-ana', reviewer_id: 'prof', grade: 88, reviewed_at: '2026-11-05T00:00:00Z' },
    ],
  }
})

describe('professorCanReview', () => {
  it('allows documents handed in to the professor’s own classes only', async () => {
    expect(await professorCanReview('prof', 'doc-ana')).toBe(true)
    expect(await professorCanReview('prof', 'doc-elsewhere')).toBe(false)
    expect(await professorCanReview('no-classes', 'doc-ana')).toBe(false)
  })
})

describe('getDocumentReview', () => {
  it('returns the newest of several grades, with the grader’s name', async () => {
    const review = await getDocumentReview('doc-ana')
    expect(review?.review_id).toBe('r2')
    expect(review?.grade).toBe(88)
    expect(review?.reviewer_name).toBe('Maria Santos')
  })

  it('is null for an ungraded document', async () => {
    expect(await getDocumentReview('doc-none')).toBeNull()
  })
})

describe('submitGrade', () => {
  const rubric = { content: 22, methodology: 20, formatting: 24, mechanics: 23 }

  it('stores the rubric with the grade', async () => {
    const review = await submitGrade('doc-ana', 'prof', 'ana', 89, 'Strong work', rubric)
    expect(review.rubric).toEqual(rubric)
    expect(state.inserts).toHaveLength(1)
  })

  it('still saves the grade before migration 044 adds the rubric column', async () => {
    state.rubricColumn = false
    const review = await submitGrade('doc-ana', 'prof', 'ana', 89, 'Strong work', rubric)
    expect(review.grade).toBe(89)
    expect(state.inserts).toEqual([expect.not.objectContaining({ rubric })])
  })
})
