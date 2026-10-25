import { changePassword, deleteAccount, getEditorPreferences, setEditorPreferences } from '../accountModel'

/** Controls what the stubbed Supabase returns, and records what was changed. */
const state: {
  providers: string[]
  signInError: boolean
  role: string
  adminCount: number
  settingsValue: unknown
  calls: string[]
} = { providers: ['email'], signInError: false, role: 'student', adminCount: 2, settingsValue: null, calls: [] }

/** A chainable query for one table; deletes and upserts are recorded. */
function makeQuery(table: string): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  const self = (): Record<string, unknown> => query
  for (const name of ['select', 'eq']) query[name] = jest.fn(self)
  query.maybeSingle = jest.fn(async () => ({
    data: table === 'user_profiles' ? { roles: { role_name: state.role } } : { value: state.settingsValue },
    error: null,
  }))
  query.delete = jest.fn(() => {
    state.calls.push(`delete:${table}`)
    return query
  })
  query.upsert = jest.fn(async (row: unknown) => {
    state.calls.push(`upsert:${table}:${JSON.stringify(row)}`)
    return { error: null }
  })
  // Awaiting the chain itself resolves a delete, or the head-count query for admins.
  query.then = (resolve: (value: unknown) => void): void => resolve({ data: null, count: state.adminCount, error: null })
  return query
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: string) => makeQuery(table)),
    storage: { from: jest.fn(() => ({ list: jest.fn(async () => ({ data: [{ name: 'a.png' }] })), remove: jest.fn(async () => { state.calls.push('remove-images'); return {} }) })) },
    auth: {
      signInWithPassword: jest.fn(async () => ({ error: state.signInError ? { message: 'bad' } : null })),
      admin: {
        getUserById: jest.fn(async () => ({ data: { user: { app_metadata: { providers: state.providers }, user_metadata: {} } }, error: null })),
        updateUserById: jest.fn(async () => { state.calls.push('update-password'); return { error: null } }),
        deleteUser: jest.fn(async () => { state.calls.push('delete-user'); return { error: null } }),
      },
    },
  })),
}))

describe('changePassword', () => {
  beforeEach(() => {
    state.providers = ['email']
    state.signInError = false
    state.calls = []
  })

  it('changes the password when the current one is right', async () => {
    await changePassword('u1', 'a@b.c', 'old-password', 'new-password-1')
    expect(state.calls).toContain('update-password')
  })

  it('refuses a wrong current password with a 400 and changes nothing', async () => {
    state.signInError = true
    await expect(changePassword('u1', 'a@b.c', 'wrong', 'new-password-1')).rejects.toMatchObject({ status: 400 })
    expect(state.calls).not.toContain('update-password')
  })

  it('requires the current password for password accounts', async () => {
    await expect(changePassword('u1', 'a@b.c', undefined, 'new-password-1')).rejects.toMatchObject({ status: 400 })
  })

  it('lets a Google-only account set its first password without one', async () => {
    state.providers = ['google']
    await changePassword('u1', 'a@b.c', undefined, 'new-password-1')
    expect(state.calls).toContain('update-password')
  })
})

describe('editor preferences', () => {
  beforeEach(() => {
    state.calls = []
  })

  it('returns null when nothing was saved and the object when it was', async () => {
    state.settingsValue = null
    expect(await getEditorPreferences('u1')).toBeNull()
    state.settingsValue = { sensitivity: 'high' }
    expect(await getEditorPreferences('u1')).toEqual({ sensitivity: 'high' })
    state.settingsValue = ['not', 'an', 'object']
    expect(await getEditorPreferences('u1')).toBeNull()
  })

  it('saves under the editor_preferences key', async () => {
    await setEditorPreferences('u1', { sensitivity: 'low' })
    expect(state.calls[0]).toContain('"key":"editor_preferences"')
  })
})

describe('deleteAccount', () => {
  beforeEach(() => {
    state.role = 'student'
    state.adminCount = 2
    state.calls = []
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('refuses when the typed email does not match', async () => {
    await expect(deleteAccount('u1', 'a@b.c', 'other@b.c')).rejects.toMatchObject({ status: 400 })
    expect(state.calls).toEqual([])
  })

  it('removes images and data, then the sign-in, when the email matches (any case)', async () => {
    await deleteAccount('u1', 'A@B.c', ' a@b.C ')
    expect(state.calls).toEqual([
      'remove-images',
      'delete:documents',
      'delete:folders',
      'delete:personalization_settings',
      'delete:user_profiles',
      'delete-user',
    ])
  })

  it('will not delete the last administrator', async () => {
    state.role = 'admin'
    state.adminCount = 1
    await expect(deleteAccount('u1', 'a@b.c', 'a@b.c')).rejects.toMatchObject({ status: 400 })
    expect(state.calls).not.toContain('delete-user')
  })

  it('lets an administrator delete themselves when another admin exists', async () => {
    state.role = 'admin'
    state.adminCount = 2
    await deleteAccount('u1', 'a@b.c', 'a@b.c')
    expect(state.calls).toContain('delete-user')
  })
})
