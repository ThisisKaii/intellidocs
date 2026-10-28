import { AvatarError, removeAvatar, saveAvatar } from '../avatarModel'

/** What the stubbed storage and auth return, and what the model did. */
const state: {
  uploadError: { message: string } | null
  metadataFails: boolean
  existing: string[]
  calls: string[]
} = { uploadError: null, metadataFails: false, existing: [], calls: [] }

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(async (path: string) => {
          state.calls.push(`upload:${path.split('/')[0]}`)
          return { error: state.uploadError }
        }),
        getPublicUrl: jest.fn((path: string) => ({ data: { publicUrl: `https://cdn.test/avatars/${path}` } })),
        list: jest.fn(async () => ({ data: state.existing.map((name) => ({ name })) })),
        remove: jest.fn(async (paths: string[]) => {
          state.calls.push(`remove:${paths.map((p) => p.split('/')[1]).join(',')}`)
          return { error: null }
        }),
      })),
    },
    auth: {
      admin: {
        getUserById: jest.fn(async () => ({ data: { user: { user_metadata: { display_name: 'Ana' } } } })),
        updateUserById: jest.fn(async (_id: string, attrs: { user_metadata: Record<string, unknown> }) => {
          state.calls.push(`metadata:${JSON.stringify(attrs.user_metadata)}`)
          return { error: state.metadataFails ? { message: 'no' } : null }
        }),
      },
    },
  })),
}))

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

describe('saveAvatar', () => {
  beforeEach(() => {
    state.uploadError = null
    state.metadataFails = false
    state.existing = []
    state.calls = []
  })

  it('uploads into the user folder, stores the link and keeps the display name', async () => {
    const url = await saveAvatar('u1', PNG)
    expect(url).toMatch(/^https:\/\/cdn\.test\/avatars\/u1\/.+\.png$/)
    expect(state.calls[0]).toBe('upload:u1')
    expect(state.calls.some((call) => call.startsWith('metadata:') && call.includes('"display_name":"Ana"') && call.includes('"avatar_url"'))).toBe(true)
  })

  it('deletes the user\'s previous photos but not the new one', async () => {
    state.existing = ['old1.png', 'old2.jpg']
    await saveAvatar('u1', PNG)
    const removal = state.calls.find((call) => call.startsWith('remove:')) ?? ''
    expect(removal).toBe('remove:old1.png,old2.jpg')
  })

  it('refuses files that are not PNG, JPG or WebP without uploading', async () => {
    await expect(saveAvatar('u1', Buffer.from('not a picture'))).rejects.toMatchObject({ status: 400 })
    expect(state.calls).toEqual([])
  })

  it('says photos are not set up when the bucket does not exist yet', async () => {
    state.uploadError = { message: 'Bucket not found' }
    await expect(saveAvatar('u1', PNG)).rejects.toMatchObject({ status: 503 })
  })

  it('removes the uploaded file again when the account could not be updated', async () => {
    state.metadataFails = true
    await expect(saveAvatar('u1', PNG)).rejects.toBeInstanceOf(AvatarError)
    expect(state.calls.some((call) => call.startsWith('remove:'))).toBe(true)
  })
})

describe('removeAvatar', () => {
  beforeEach(() => {
    state.metadataFails = false
    state.existing = ['a.png']
    state.calls = []
  })

  it('clears the link and deletes the stored photos', async () => {
    await removeAvatar('u1')
    expect(state.calls.some((call) => call.includes('"avatar_url":null'))).toBe(true)
    expect(state.calls).toContain('remove:a.png')
  })
})
