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
