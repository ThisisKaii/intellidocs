import request from 'supertest'

jest.mock('../../middleware/arcjet', () => ({
  authArcjet: (_req: unknown, _res: unknown, next: () => void) => next(),
  signupArcjet: (_req: unknown, _res: unknown, next: () => void) => next(),
  aiArcjet: (_req: unknown, _res: unknown, next: () => void) => next(),
  adminArcjet: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

jest.mock('../../models/healthModel', () => ({
  probeSupabase: jest.fn(),
  probeRedis: jest.fn(),
}))

jest.mock('../../ai/bridge/pythonBridge', () => ({
  probeMlHealth: jest.fn(),
}))

import app from '../../index'
import { probeRedis, probeSupabase } from '../../models/healthModel'
import { probeMlHealth } from '../../ai/bridge/pythonBridge'

const mockSupabase = probeSupabase as jest.MockedFunction<typeof probeSupabase>
const mockRedis = probeRedis as jest.MockedFunction<typeof probeRedis>
const mockMl = probeMlHealth as jest.MockedFunction<typeof probeMlHealth>

/** Build a dependency probe result with the given verdict. */
function probe(ok: boolean) {
  return { ok, latencyMs: 1, detail: ok ? 'reachable' : 'refused' }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSupabase.mockResolvedValue(probe(true))
  mockRedis.mockResolvedValue(probe(true))
  mockMl.mockResolvedValue({
    reachable: true,
    payload: { status: 'OK' },
    error: null,
    latencyMs: 2,
  })
})

describe('GET /health', () => {
  it('returns 200 with the OK status render.yaml depends on', async () => {
    const response = await request(app).get('/health')
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('OK')
  })

  it('keeps the original message field for uptime monitors', async () => {
    const response = await request(app).get('/health')
    expect(response.body.message).toContain('IntelliDocs API')
  })
})

describe('GET /health/live', () => {
  it('returns 200 without touching any dependency', async () => {
    const response = await request(app).get('/health/live')
    expect(response.status).toBe(200)
    // Liveness must stay dependency-free or a slow database restarts the container.
    expect(mockSupabase).not.toHaveBeenCalled()
    expect(mockRedis).not.toHaveBeenCalled()
    expect(mockMl).not.toHaveBeenCalled()
  })
})

describe('GET /health/ready', () => {
  it('returns 200 ready when every dependency is reachable', async () => {
    const response = await request(app).get('/health/ready')
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('ready')
  })

  it('returns 503 when a required dependency is down', async () => {
    mockRedis.mockResolvedValue(probe(false))
    const response = await request(app).get('/health/ready')
    // 503 is what drains the replica out of the nginx upstream.
    expect(response.status).toBe(503)
    expect(response.body.status).toBe('unavailable')
  })

  it('returns 200 degraded when only the optional ML service is down', async () => {
    mockMl.mockResolvedValue({
      reachable: false,
      payload: null,
      error: 'connect ECONNREFUSED',
      latencyMs: 5,
    })
    const response = await request(app).get('/health/ready')
    // ML is optional: the replica must stay in rotation for non-ML routes.
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('degraded')
  })

  it('requires no authentication', async () => {
    const response = await request(app).get('/health/ready')
    expect(response.status).not.toBe(401)
  })
})
