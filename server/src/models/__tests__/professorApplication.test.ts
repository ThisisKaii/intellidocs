import { createProfessorApplication } from '../../models/userModel'

/** Rows the stubbed database returns, per table, plus every write it received. */
const state: {
  profile: unknown
  admins: Array<{ user_id: string }>
  writes: Array<{ table: string; op: string; payload: unknown }>
} = { profile: null, admins: [], writes: [] }

/** A chainable query that resolves per table and records inserts/updates. */
function makeQuery(table: string): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  const self = (): Record<string, unknown> => query
  for (const name of ['select', 'eq', 'order', 'limit']) query[name] = jest.fn(self)
  query.maybeSingle = jest.fn(async () => ({
    data: table === 'roles' ? { role_id: 1 } : state.profile,
    error: null,
  }))
  const record = (op: string) => jest.fn((payload: unknown) => {
    state.writes.push({ table, op, payload })
    return query
  })
  query.insert = record('insert')
  query.update = record('update')
  query.then = (resolve: (value: unknown) => void): void =>
    resolve({ data: table === 'user_profiles' ? state.admins : null, error: null })
  return query
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: jest.fn((table: string) => makeQuery(table)) })),
}))

const input = {
  email: 'prof@example.com',
  college: 'Engineering',
  department: 'CS',
  institutionalEmail: 'prof@school.edu',
  facultyId: 'F'.repeat(40),
  reason: 'I teach CS 201 this term',
}

describe('createProfessorApplication', () => {
  beforeEach(() => {
    state.profile = null
    state.admins = []
    state.writes = []
  })

  it('keeps the current role and marks the user pending', async () => {
    state.profile = { verification_status: 'approved', roles: { role_name: 'student' } }

    await expect(createProfessorApplication('u1', input)).resolves.toBe('submitted')

    const update = state.writes.find((w) => w.table === 'user_profiles' && w.op === 'update')
    expect(update?.payload).toMatchObject({ verification_status: 'pending', requested_role: 'professor', faculty_id: input.facultyId })
    expect(update?.payload).not.toHaveProperty('role_id')
  })

  it('refuses a second application from an approved professor', async () => {
    state.profile = { verification_status: 'approved', roles: { role_name: 'professor' } }

    await expect(createProfessorApplication('u1', input)).resolves.toBe('already')
    expect(state.writes).toHaveLength(0)
  })

  it('lets a rejected professor apply again', async () => {
    state.profile = { verification_status: 'rejected', roles: { role_name: 'professor' } }

    await expect(createProfessorApplication('u1', input)).resolves.toBe('submitted')
  })

  it('notifies every admin', async () => {
    state.profile = { verification_status: 'approved', roles: { role_name: 'student' } }
    state.admins = [{ user_id: 'a1' }, { user_id: 'a2' }]

    await createProfessorApplication('u1', input)

    const adminNotice = state.writes.find(
      (w) => w.table === 'notifications' && Array.isArray(w.payload),
    )
    expect((adminNotice?.payload as Array<{ user_id: string }>).map((n) => n.user_id)).toEqual(['a1', 'a2'])
  })
})
