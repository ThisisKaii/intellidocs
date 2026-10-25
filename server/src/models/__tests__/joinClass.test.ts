import { joinClassByCode } from '../folderModel'

/** What the stubbed database returns for the lookups joinClassByCode makes. */
const state: {
  classFolder: Record<string, unknown> | null
  enrollment: unknown
  workspace: unknown[]
  writes: Array<{ table: string; payload: Record<string, unknown> }>
} = { classFolder: null, enrollment: null, workspace: [], writes: [] }

/** A chainable query that resolves per table and records inserts. */
function makeQuery(table: string): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  const self = (): Record<string, unknown> => query
  for (const name of ['select', 'eq', 'ilike', 'limit', 'in', 'or', 'order', 'is']) query[name] = jest.fn(self)
  query.maybeSingle = jest.fn(async () => ({
    data: table === 'folders' ? state.classFolder : state.enrollment,
    error: null,
  }))
  query.insert = jest.fn((payload: Record<string, unknown>) => {
    state.writes.push({ table, payload })
    return { error: null }
  })
  query.then = (resolve: (value: unknown) => void): void =>
    resolve({ data: table === 'folders' ? state.workspace : null, error: null })
  return query
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: string) => makeQuery(table)),
    auth: {
      admin: {
        getUserById: jest.fn(async () => ({
          data: { user: { email: 'jdoe@school.edu', user_metadata: {} } },
        })),
      },
    },
  })),
}))

const classFolder = { folder_id: 'c1', user_id: 'prof', name: 'CS 201', folder_type: 'class', join_code: 'ABC234' }

describe('joinClassByCode', () => {
  beforeEach(() => {
    state.classFolder = classFolder
    state.enrollment = null
    state.workspace = []
    state.writes = []
  })

  it('enrolls the student and creates a workspace named after their email', async () => {
    const result = await joinClassByCode('student', ' abc234 ')

    expect(result.alreadyEnrolled).toBe(false)
    expect(result.classFolder.join_code).toBeNull()
    expect(state.writes.find((w) => w.table === 'class_enrollments')?.payload).toEqual({ folder_id: 'c1', student_id: 'student' })
    expect(state.writes.find((w) => w.table === 'folders')?.payload).toMatchObject({ name: 'jdoe', user_id: 'student', parent_id: 'c1' })
  })

  it('is idempotent for a student who already joined', async () => {
    state.enrollment = { student_id: 'student' }
    state.workspace = [{ folder_id: 'w1' }]

    const result = await joinClassByCode('student', 'ABC234')

    expect(result.alreadyEnrolled).toBe(true)
    expect(state.writes).toHaveLength(0)
  })

  it('rejects an unknown code', async () => {
    state.classFolder = null
    await expect(joinClassByCode('student', 'NOPE99')).rejects.toMatchObject({ status: 404 })
  })

  it('rejects the professor joining their own class', async () => {
    await expect(joinClassByCode('prof', 'ABC234')).rejects.toMatchObject({ status: 400 })
  })
})
