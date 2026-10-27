import { Request, Response } from 'express'
import { localOnly } from '../localOnly'

interface FakeResponse {
  status: jest.Mock
  json: jest.Mock
}

/** Run the guard for a request from the given socket address and report whether it let it through. */
function run(address: string | undefined, env: string): { passed: boolean; status: number | null } {
  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = env
  const res: FakeResponse = { status: jest.fn(), json: jest.fn() }
  res.status.mockReturnValue(res)
  const next = jest.fn()
  localOnly({ socket: { remoteAddress: address } } as unknown as Request, res as unknown as Response, next)
  process.env.NODE_ENV = previous
  return { passed: next.mock.calls.length === 1, status: res.status.mock.calls[0]?.[0] ?? null }
}

describe('localOnly', () => {
  it('lets a loopback request through outside production', () => {
    for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
      expect(run(address, 'development')).toEqual({ passed: true, status: null })
    }
  })

  it('answers 404 to a request from another machine', () => {
    expect(run('192.168.1.20', 'development')).toEqual({ passed: false, status: 404 })
  })

  it('answers 404 when the address is unknown', () => {
    expect(run(undefined, 'development')).toEqual({ passed: false, status: 404 })
  })

  it('answers 404 in production even from loopback', () => {
    expect(run('127.0.0.1', 'production')).toEqual({ passed: false, status: 404 })
  })
})
