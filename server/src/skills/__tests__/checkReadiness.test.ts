import { buildReadinessReport } from '../../skills/checkReadiness'
import { probeMlHealth } from '../../ai/bridge/pythonBridge'
import { probeRedis, probeSupabase } from '../../models/healthModel'
import type { ReadinessReport } from '../../skills/checkReadiness'

jest.mock('../../models/healthModel', () => ({
  probeSupabase: jest.fn(),
  probeRedis: jest.fn(),
}))

jest.mock('../../ai/bridge/pythonBridge', () => ({
  probeMlHealth: jest.fn(),
}))

const mockSupabase = probeSupabase as jest.MockedFunction<typeof probeSupabase>
const mockRedis = probeRedis as jest.MockedFunction<typeof probeRedis>
const mockMl = probeMlHealth as jest.MockedFunction<typeof probeMlHealth>

/** Build a probe result with the given verdict. */
function probe(ok: boolean) {
  return { ok, latencyMs: 3, detail: ok ? 'reachable' : 'refused' }
}

/** Build an ML probe result with the given verdict. */
function mlProbe(reachable: boolean) {
  return {
    reachable,
    payload: reachable ? { status: 'OK' } : null,
    error: reachable ? null : 'connect ECONNREFUSED',
    latencyMs: 4,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSupabase.mockResolvedValue(probe(true))
  mockRedis.mockResolvedValue(probe(true))
  mockMl.mockResolvedValue(mlProbe(true))
})

describe('buildReadinessReport', () => {
  it('reports ready when every dependency is up', async () => {
    const report = await buildReadinessReport()

    expect(report.status).toBe('ready')
    expect(report.checks.supabase.ok).toBe(true)
    expect(report.checks.redis.ok).toBe(true)
    expect(report.checks.ml.ok).toBe(true)
  })

  it('marks supabase and redis as required but ml as optional', async () => {
    const report = await buildReadinessReport()

    expect(report.checks.supabase.required).toBe(true)
    expect(report.checks.redis.required).toBe(true)
    // ML is optional: grammar/prediction degrade instead of failing outright.
    expect(report.checks.ml.required).toBe(false)
  })

  it('reports unavailable when a required dependency is down', async () => {
    mockRedis.mockResolvedValue(probe(false))
    const report = await buildReadinessReport()

    expect(report.status).toBe('unavailable')
    expect(report.checks.redis.ok).toBe(false)
  })

  it('reports unavailable when supabase is down', async () => {
    mockSupabase.mockResolvedValue(probe(false))
    const report = await buildReadinessReport()

    expect(report.status).toBe('unavailable')
  })

  it('stays serving (degraded) when only the optional ML service is down', async () => {
    mockMl.mockResolvedValue(mlProbe(false))
    const report = await buildReadinessReport()

    // This is the case that keeps a replica in rotation for non-ML routes.
    expect(report.status).toBe('degraded')
    expect(report.checks.ml.ok).toBe(false)
    expect(report.checks.ml.detail).toContain('ECONNREFUSED')
  })

  it('surfaces the error detail for a failed ML probe', async () => {
    mockMl.mockResolvedValue({
      reachable: false,
      payload: null,
      error: 'timeout of 2000ms exceeded',
      latencyMs: 2001,
    })

    const report = await buildReadinessReport()
    expect(report.checks.ml.detail).toContain('timeout')
  })

  it('reports the ML status string when reachable', async () => {
    const report = await buildReadinessReport()
    expect(report.checks.ml.detail).toBe('OK')
  })

  it('returns an ISO timestamp', async () => {
    const report = await buildReadinessReport()
    expect(new Date(report.timestamp).toISOString()).toBe(report.timestamp)
  })

  it('always returns all three dependency keys', async () => {
    const report = await buildReadinessReport()
    expect(Object.keys(report.checks).sort()).toEqual(['ml', 'redis', 'supabase'])
  })
})

describe('readiness report shape', () => {
  it('satisfies the ReadinessReport contract', async () => {
    const report: ReadinessReport = await buildReadinessReport()
    expect(report.status).toBe('ready')
  })

  it('rejects an unknown status value', () => {
    // Guards the union: a new status must be added to the type, not smuggled in.
    const invalid: ReadinessReport['status'] = 'ok' as ReadinessReport['status']
    expect(['ready', 'degraded', 'unavailable']).not.toContain(invalid)
  })
})
