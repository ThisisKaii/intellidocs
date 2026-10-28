import { Request, Response } from 'express'
import { validateParams } from '../validate'
import { documentIdParamSchema } from '../../../schemas/documentSchemas'

/** Run the guard for the given params and report what it did. */
function run(params: Record<string, string>): { passed: boolean; status: number | null; body: unknown } {
  const res = { status: jest.fn(), json: jest.fn() }
  res.status.mockReturnValue(res)
  const next = jest.fn()
  validateParams(documentIdParamSchema)({ params } as unknown as Request, res as unknown as Response, next)
  return { passed: next.mock.calls.length === 1, status: res.status.mock.calls[0]?.[0] ?? null, body: res.json.mock.calls[0]?.[0] ?? null }
}

describe('validateParams', () => {
  it('lets a document id through', () => {
    expect(run({ id: '3f2b8c1e-9d4a-4c55-8a1b-1e2f3a4b5c6d' })).toEqual({ passed: true, status: null, body: null })
  })

  it('answers 400 to an id that is not a uuid', () => {
    const result = run({ id: 'not-a-uuid' })
    expect(result.passed).toBe(false)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: 'Invalid document id' })
  })

  it('answers 400 when the id is missing', () => {
    expect(run({}).status).toBe(400)
  })
})
