import { getClassSimilarity, getProfessorPeerDocuments } from '../plagiarismModel'

/** Rows the stubbed database returns, per table. */
const tables: Record<string, unknown[]> = {}

/** A chainable query that resolves with the configured rows of its table. */
function makeQuery(table: string): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  const self = (): Record<string, unknown> => query
  for (const name of ['select', 'eq', 'in', 'order', 'limit']) query[name] = jest.fn(self)
  query.then = (resolve: (value: unknown) => void): void =>
    resolve({ data: tables[table] ?? [], error: null })
  return query
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: string) => makeQuery(table)),
    auth: { admin: { getUserById: jest.fn(async () => ({ data: { user: { email: 'x@school.edu', user_metadata: {} } }, error: null })) } },
  })),
}))

describe('getProfessorPeerDocuments', () => {
  it('returns submissions from every class the professor owns, tagged with their class', async () => {
    tables.folders = [{ folder_id: 'c1' }, { folder_id: 'c2' }]
    tables.folder_documents = [
      { document_id: 'd1', folder_id: 'c1' },
      { document_id: 'd2', folder_id: 'c2' },
      { document_id: 'self', folder_id: 'c1' },
    ]
    tables.documents = [
      { id: 'd1', user_id: 's1', title: 'A', content: 'a' },
      { id: 'd2', user_id: 's2', title: 'B', content: 'b' },
    ]

    const peers = await getProfessorPeerDocuments('prof', 'self')

    expect(peers.map((p) => [p.id, p.folder_id])).toEqual([['d1', 'c1'], ['d2', 'c2']])
  })

  it('returns nothing when the professor owns no class', async () => {
    tables.folders = []
    await expect(getProfessorPeerDocuments('prof', 'self')).resolves.toEqual([])
  })
})

describe('getClassSimilarity scope', () => {
  beforeEach(() => {
    tables.folder_documents = [{ document_id: 'd1' }]
    tables.documents = [{ id: 'd1', user_id: 's1' }]
    tables.plagiarism_scans = [{ scan_id: 'scan1', document_id: 'd1' }]
    tables.plagiarism_matches = [
      { scan_id: 'scan1', matched_document_id: 'dx', matched_student_id: 's9', matched_folder_id: 'other', similarity_score: 91 },
    ]
    tables.folders = [{ folder_id: 'other', name: 'BIO 340' }]
  })

  it('hides a match from another class in the local view', async () => {
    const matrix = await getClassSimilarity('c1', 'local')
    expect(matrix.pairs).toEqual([])
    expect(matrix.students.map((s) => s.studentId)).toEqual(['s1'])
  })

  it('shows it, labelled with the other class, in the global view', async () => {
    const matrix = await getClassSimilarity('c1', 'global')
    expect(matrix.pairs).toEqual([{ studentAId: 's1', studentBId: 's9', similarity: 91 }])
    expect(matrix.students.find((s) => s.studentId === 's9')?.className).toBe('BIO 340')
  })
})
