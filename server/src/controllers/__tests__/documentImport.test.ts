import type { Request, Response } from 'express'

const importLocalFile = jest.fn()
const enqueueLocalImport = jest.fn()

jest.mock('../../skills/importLocalFile', () => ({
  importLocalFile: (...args: unknown[]) => importLocalFile(...args),
}))
jest.mock('../../skills/processLocalImportJob', () => ({
  enqueueLocalImport: (...args: unknown[]) => enqueueLocalImport(...args),
}))
jest.mock('../../models/documentModel', () => ({}))
jest.mock('../../models/shareModel', () => ({ resolvePendingSharesByUser: jest.fn() }))
jest.mock('../../models/importJobModel', () => ({
  getImportJob: jest.fn(),
  listUserImportJobs: jest.fn(),
  settleStaleJob: (job: unknown) => job,
}))

import { importDocument } from '../documentController'

/** Build a fake response that records status and body. */
function fakeRes(): { res: Response; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn()
  const status = jest.fn(() => ({ json }))
  return { res: { status } as unknown as Response, status, json }
}

/** Build a fake import request. */
function fakeReq(name: string, query: Record<string, string> = {}): Request {
  return {
    user: { id: 'u1' },
    query,
    file: { originalname: name, buffer: Buffer.from('plain text') },
  } as unknown as Request
}

describe('importDocument', () => {
  beforeEach(() => {
    importLocalFile.mockReset()
    enqueueLocalImport.mockReset()
  })

  it('answers 202 with a job id and does not convert inline', async () => {
    enqueueLocalImport.mockResolvedValue({ id: 'job-1', state: 'queued', fileName: 'a.txt' })
    const { res, status, json } = fakeRes()
    await importDocument(fakeReq('a.txt'), res)
    expect(status).toHaveBeenCalledWith(202)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1' }))
    expect(importLocalFile).not.toHaveBeenCalled()
  })

  it('rejects an unsupported file type with 400 before queuing', async () => {
    const { res, status } = fakeRes()
    await importDocument(fakeReq('a.exe'), res)
    expect(status).toHaveBeenCalledWith(400)
    expect(enqueueLocalImport).not.toHaveBeenCalled()
  })

  it('returns the document inline with 201 when sync=1', async () => {
    importLocalFile.mockResolvedValue({ id: 'doc-1' })
    const { res, status, json } = fakeRes()
    await importDocument(fakeReq('a.txt', { sync: '1' }), res)
    expect(status).toHaveBeenCalledWith(201)
    expect(json).toHaveBeenCalledWith({ id: 'doc-1' })
    expect(enqueueLocalImport).not.toHaveBeenCalled()
  })

  it('requires a signed-in user', async () => {
    const { res, status } = fakeRes()
    await importDocument({ query: {} } as unknown as Request, res)
    expect(status).toHaveBeenCalledWith(401)
  })
})
