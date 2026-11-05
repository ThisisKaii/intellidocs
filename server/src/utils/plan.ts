import { Plan } from '../types/index'

/** Days a mock Pro billing period lasts. */
export const BILLING_PERIOD_DAYS = 30

/** The plan columns stored on user_profiles (migration 040). */
export interface PlanRow {
  plan?: string | null
  plan_started_at?: string | null
  plan_renews_at?: string | null
  plan_canceled_at?: string | null
}

/**
 * The plan a user effectively has right now. A cancelled Pro subscription stays active until the
 * end of the paid period (`plan_renews_at`); an uncancelled one keeps renewing.
 */
export function effectivePlan(row: PlanRow | null | undefined, now: Date = new Date()): Plan {
  if (!row || row.plan !== 'pro') return 'free'
  if (!row.plan_canceled_at) return 'pro'
  const renewsAt = row.plan_renews_at ? Date.parse(row.plan_renews_at) : NaN
  return Number.isFinite(renewsAt) && renewsAt > now.getTime() ? 'pro' : 'free'
}

/** Milliseconds in one mock billing period. */
const PERIOD_MS = BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000

/**
 * The next billing date of an uncancelled subscription: the stored renewal date rolled forward by
 * whole periods until it is in the future (the mock auto-renews without writing anything).
 */
export function nextRenewal(renewsAt: string | null | undefined, now: Date = new Date()): string | null {
  if (!renewsAt) return null
  let at = Date.parse(renewsAt)
  if (!Number.isFinite(at)) return null
  while (at <= now.getTime()) at += PERIOD_MS
  return new Date(at).toISOString()
}

/** The renewal date one period from `from`. */
export function periodEnd(from: Date): string {
  return new Date(from.getTime() + PERIOD_MS).toISOString()
}
