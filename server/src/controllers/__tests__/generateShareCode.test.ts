import type { Request, Response } from 'express'

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({})) }))
jest.mock('../../models/documentModel', () => ({ getDocumentById: jest.fn(), supabase: {} }))
jest.mock('../../models/shareModel', () => {
  const actual = jest.requireActual('../../models/shareModel') as Record<string, unknown>
  return { ...actual, getShareLink: jest.fn(), setShareCode: jest.fn(), upsertShareLink: jest.fn() }
})

import * as documentModel from '../../models/documentModel'
import * as shareModel from '../../models/shareModel'
import { createShareCode } from '../shareController'

const getDocumentById = documentModel.getDocumentById as jest.Mock
const getShareLink = shareModel.getShareLink as jest.Mock
const setShareCode = shareModel.setShareCode as jest.Mock
const upsertShareLink = shareModel.upsertShareLink as jest.Mock

const link = (patch: Record<string, unknown> = {}): shareModel.ShareLink => ({
  share_token: 'tok', share_permission: 'comment', share_expires_at: null, share_code: 'K7M2QX9P', ...patch,
})

/** Run the handler as the given user and capture the answer. */
async function run(body: Record<string, unknown> = {}, userId: string | null = 'owner'): Promise<{ status: number; json: unknown }> {
  const out = { status: 0, json: undefined as unknown }
  const res = {
    status(code: number) { out.status = code; return this },
    json(payload: unknown) { out.json = payload; return this },
  } as unknown as Response
  await createShareCode({ user: userId ? { id: userId } : undefined, params: { id: 'd1' }, body } as unknown as Request, res)
  return out
}

describe('createShareCode', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    getDocumentById.mockResolvedValue({ id: 'd1', user_id: 'owner' })
  })

  it('keeps the existing link and replaces only the code', async () => {
    getShareLink.mockResolvedValue(link({ share_code: null }))
    setShareCode.mockResolvedValue(link({ share_code: 'NEWCODE2' }))
    const out = await run()
    expect(out.status).toBe(201)
    expect((out.json as shareModel.ShareLink).share_code).toBe('NEWCODE2')
    expect(setShareCode).toHaveBeenCalledTimes(1)
    expect(upsertShareLink).not.toHaveBeenCalled()
  })

  it('creates a link with a code when the document has none, using the sent permission', async () => {
    getShareLink.mockResolvedValue(link({ share_token: null, share_code: null }))
    upsertShareLink.mockResolvedValue(link({ share_permission: 'edit' }))
    const out = await run({ permission: 'edit' })
    expect(out.status).toBe(201)
    const [, token, permission, expiry, code] = upsertShareLink.mock.calls[0]
    expect(token).toEqual(expect.any(String))
    expect([permission, expiry]).toEqual(['edit', null])
    expect(code).toMatch(/^[A-Z2-9]{8}$/)
  })

  it('only lets the owner generate a code', async () => {
    getDocumentById.mockResolvedValue({ id: 'd1', user_id: 'someone-else' })
    expect((await run()).status).toBe(403)
    expect(setShareCode).not.toHaveBeenCalled()
    expect((await run({}, null)).status).toBe(401)
  })

  it('rejects an unknown permission', async () => {
    expect((await run({ permission: 'admin' })).status).toBe(400)
  })

  it('retries when the new code clashes with another document\'s', async () => {
    getShareLink.mockResolvedValue(link())
    setShareCode.mockRejectedValueOnce(new Error('Failed to set share code: duplicate key value')).mockResolvedValueOnce(link({ share_code: 'SECOND22' }))
    const out = await run()
    expect(out.status).toBe(201)
    expect(setShareCode).toHaveBeenCalledTimes(2)
  })

  it('says codes are unavailable when migration 035 has not been applied', async () => {
    getShareLink.mockResolvedValue(link())
    setShareCode.mockRejectedValue(new shareModel.ShareCodeError('Share codes are not available yet. Please try again later.', 503))
    const out = await run()
    expect(out.status).toBe(503)
    expect((out.json as { error: string }).error).toMatch(/not available yet/)
  })
})
