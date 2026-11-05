import {
  cancelSubscription,
  getSubscription,
  resumeSubscription,
  startProSubscription,
  toSubscriptionStatus,
} from '../subscriptionModel'
import { effectivePlan, nextRenewal } from '../../utils/plan'
import { checkoutSchema } from '../../../schemas/billingSchemas'

/** The stubbed user_profiles row, updated in place by `.update()`. */
const state: { row: Record<string, unknown>; updates: Array<Record<string, unknown>> } = { row: {}, updates: [] }

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => {
      const query: Record<string, unknown> = {}
      query.select = jest.fn(() => query)
      query.eq = jest.fn(() => Object.assign(Promise.resolve({ error: null }), query))
      query.maybeSingle = jest.fn(async () => ({ data: { ...state.row, roles: { role_name: 'user' }, role_id: 4 }, error: null }))
      query.upsert = jest.fn(async () => ({ error: null }))
      query.update = jest.fn((fields: Record<string, unknown>) => {
        state.updates.push(fields)
        Object.assign(state.row, fields)
        return query
      })
      return query
    }),
  })),
}))

const DAY = 24 * 60 * 60 * 1000

describe('mock subscription', () => {
  beforeEach(() => {
    state.row = { plan: 'free', plan_started_at: null, plan_renews_at: null, plan_canceled_at: null }
    state.updates = []
  })

  it('starts on the free plan', async () => {
    await expect(getSubscription('u1')).resolves.toEqual({ plan: 'free', startedAt: null, renewsAt: null, canceledAt: null })
  })

  it('checkout starts Pro for 30 days', async () => {
    const before = Date.now()
    const status = await startProSubscription('u1')
    expect(status.plan).toBe('pro')
    const renews = Date.parse(status.renewsAt!)
    expect(renews - before).toBeGreaterThanOrEqual(30 * DAY - 1000)
    expect(renews - before).toBeLessThanOrEqual(30 * DAY + 5000)
  })

  it('a second checkout does not restart an active period', async () => {
    await startProSubscription('u1')
    const writes = state.updates.length
    await startProSubscription('u1')
    expect(state.updates.length).toBe(writes)
  })

  it('cancel keeps Pro until the period ends, and resume undoes it', async () => {
    await startProSubscription('u1')
    const cancelled = await cancelSubscription('u1')
    expect(cancelled.plan).toBe('pro')
    expect(cancelled.canceledAt).not.toBeNull()

    const resumed = await resumeSubscription('u1')
    expect(resumed.canceledAt).toBeNull()
    expect(resumed.plan).toBe('pro')
  })

  it('cancel on a free plan does nothing', async () => {
    await cancelSubscription('u1')
    expect(state.updates).toHaveLength(0)
  })
})

describe('plan helpers', () => {
  const now = new Date('2026-11-05T00:00:00Z')

  it('treats a lapsed cancelled plan as free', () => {
    expect(effectivePlan({ plan: 'pro', plan_canceled_at: '2026-09-01T00:00:00Z', plan_renews_at: '2026-10-01T00:00:00Z' }, now)).toBe('free')
  })

  it('auto-renews an uncancelled plan by whole periods', () => {
    const next = nextRenewal('2026-10-01T00:00:00Z', now)
    expect(next).toBe('2026-11-30T00:00:00.000Z')
  })

  it('reports the end date (not a renewal) for a cancelled plan', () => {
    const status = toSubscriptionStatus(
      { plan: 'pro', plan_started_at: '2026-10-20T00:00:00Z', plan_canceled_at: '2026-11-01T00:00:00Z', plan_renews_at: '2026-11-19T00:00:00Z' },
      now,
    )
    expect(status).toMatchObject({ plan: 'pro', renewsAt: '2026-11-19T00:00:00Z' })
  })
})

describe('checkout schema', () => {
  it('accepts only the plan', () => {
    expect(checkoutSchema.safeParse({ plan: 'pro' }).success).toBe(true)
  })

  it('rejects payment details', () => {
    expect(checkoutSchema.safeParse({ plan: 'pro', cardNumber: '4242424242424242' }).success).toBe(false)
  })
})
