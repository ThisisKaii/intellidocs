import { describe, it, expect } from 'vitest'
import { buildFormattingAudit } from '../auditController'

describe('buildFormattingAudit', () => {
  it('counts the most frequent formats for a document', async () => {
    const req = {
      user: { id: 'user-1' },
      params: { documentId: 'doc-1' },
      query: {},
      body: {},
    } as never
    const json = vi.fn()
    const status = vi.fn(() => ({ json }))
    const res = { status, json } as never

    await buildFormattingAudit(req, res)

    expect(status).toHaveBeenCalledWith(200)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'doc-1' })
    )
  })

  it('rejects an unauthenticated request with 401', async () => {
    const req = { params: { documentId: 'doc-1' }, query: {}, body: {} } as never
    const json = vi.fn()
    const status = vi.fn(() => ({ json }))
    const res = { status, json } as never

    await buildFormattingAudit(req, res)

    expect(status).toHaveBeenCalledWith(401)
  })
})