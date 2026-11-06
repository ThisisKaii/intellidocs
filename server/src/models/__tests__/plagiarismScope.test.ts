import { getClassSimilarity, getProfessorClassScope, getProfessorPeerDocuments } from '../plagiarismModel'

/** Rows the stubbed database returns, per table. */
const tables: Record<string, Array<Record<string, unknown>>> = {}

/** A chainable query that applies its eq/in filters to the configured rows of its table. */
function makeQuery(table: string): Record<string, unknown> {
  const filters: Array<(row: Record<string, unknown>) => boolean> = []
  const query: Record<string, unknown> = {}
  const self = (): Record<string, unknown> => query
  for (const name of ['select', 'order', 'limit']) query[name] = jest.fn(self)
  query.eq = jest.fn((column: string, value: unknown) => {
    filters.push((row) => row[column] === value)
    return query
  })
  query.in = jest.fn((column: string, values: unknown[]) => {
    filters.push((row) => values.includes(row[column]))
    return query
  })
  query.then = (resolve: (value: unknown) => void): void =>
    resolve({ data: (tables[table] ?? []).filter((row) => filters.every((keep) => keep(row))), error: null })
  return query
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: string) => makeQuery(table)),
    auth: { admin: { getUserById: jest.fn(async () => ({ data: { user: { email: 'x@school.edu', user_metadata: {} } }, error: null })) } },
  })),
}))

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key]
})

describe('getProfessorPeerDocuments', () => {
  it('returns submissions from the given classes, tagged with their class', async () => {
    tables.folders = [
      { folder_id: 'c1', parent_id: null },
      { folder_id: 'c2', parent_id: null },
    ]
    tables.folder_documents = [
      { document_id: 'd1', folder_id: 'c1' },
      { document_id: 'd2', folder_id: 'c2' },
      { document_id: 'self', folder_id: 'c1' },
    ]
    tables.documents = [
      { id: 'd1', user_id: 's1', title: 'A', content: 'a' },
      { id: 'd2', user_id: 's2', title: 'B', content: 'b' },
    ]

    const peers = await getProfessorPeerDocuments(['c1', 'c2'], 'self')

    expect(peers.map((p) => [p.id, p.folder_id])).toEqual([['d1', 'c1'], ['d2', 'c2']])
  })

  it('counts a document in a submission folder inside a class for that class', async () => {
    tables.folders = [{ folder_id: 'sub1', parent_id: 'c2', user_id: 's2' }]
    tables.folder_documents = [{ document_id: 'd2', folder_id: 'sub1' }]
    tables.documents = [{ id: 'd2', user_id: 's2', title: 'B', content: 'b' }]

    const peers = await getProfessorPeerDocuments(['c1', 'c2'], 'self')

    expect(peers.map((p) => [p.id, p.folder_id])).toEqual([['d2', 'c2']])
  })

  it('returns nothing when no class is in scope', async () => {
    await expect(getProfessorPeerDocuments([], 'self')).resolves.toEqual([])
  })
})

describe('getProfessorClassScope', () => {
  beforeEach(() => {
    tables.folders = [
      { folder_id: 'now', user_id: 'prof', folder_type: 'class', class_code: 'CS-201', academic_term: '2026-T1' },
      { folder_id: 'nowB', user_id: 'prof', folder_type: 'class', class_code: 'CS-305', academic_term: '2026-T1' },
      { folder_id: 'past', user_id: 'prof', folder_type: 'class', class_code: 'CS-201', academic_term: '2025-T2' },
      { folder_id: 'theirs', user_id: 'other', folder_type: 'class', class_code: 'CS-201', academic_term: '2026-T1' },
    ]
  })

  it('covers every class of the professor by default', async () => {
    await expect(getProfessorClassScope('prof', 'now')).resolves.toEqual(['now', 'nowB', 'past'])
  })

  it('narrows to a term and to class codes, always keeping the scanned class', async () => {
    await expect(getProfessorClassScope('prof', 'now', { academicTerms: ['2025-t2'] })).resolves.toEqual(['now', 'past'])
    await expect(getProfessorClassScope('prof', 'nowB', { classCodes: ['cs-201'] })).resolves.toEqual(['now', 'nowB', 'past'])
  })

  it('leaves out past terms when asked', async () => {
    await expect(getProfessorClassScope('prof', 'now', { includePastTerms: false })).resolves.toEqual(['now', 'nowB'])
  })
})

describe('getClassSimilarity scope', () => {
  beforeEach(() => {
    tables.folder_documents = [{ document_id: 'd1', folder_id: 'c1' }]
    tables.documents = [{ id: 'd1', user_id: 's1' }]
    tables.plagiarism_scans = [{ scan_id: 'scan1', document_id: 'd1' }]
    tables.plagiarism_matches = [
      { scan_id: 'scan1', matched_document_id: 'dx', matched_student_id: 's9', matched_folder_id: 'other', similarity_score: 91 },
    ]
    tables.folders = [{ folder_id: 'other', name: 'BIO 340', parent_id: null }]
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

  it('hides it in a global view filtered to other classes', async () => {
    const matrix = await getClassSimilarity('c1', 'global', ['c1', 'c3'])
    expect(matrix.pairs).toEqual([])
  })

  it('includes submissions handed in through a submission folder', async () => {
    tables.folders.push({ folder_id: 'sub', parent_id: 'c1', name: 'Ana - 2021-001 - Essay' })
    tables.folder_documents = [{ document_id: 'd1', folder_id: 'sub' }]
    const matrix = await getClassSimilarity('c1', 'local')
    expect(matrix.students.map((s) => s.documentIds)).toEqual([['d1']])
  })
})
