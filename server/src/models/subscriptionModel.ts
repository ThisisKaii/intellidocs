import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { SubscriptionStatus } from '../types/index'
import { effectivePlan, nextRenewal, periodEnd, PlanRow } from '../utils/plan'
import { clearStorageCache, ensureUserProfile, getPlanRow } from './userModel'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

/**
 * Mock subscription store (migration 040). No payment provider is involved and no card data is
 * ever received or stored: "checkout" only flips the plan columns on the user's profile.
 */

/** Present a plan row the way the billing page needs it. */
export function toSubscriptionStatus(row: PlanRow | null, now: Date = new Date()): SubscriptionStatus {
  const plan = effectivePlan(row, now)
  if (plan === 'free' || !row) {
    return { plan: 'free', startedAt: null, renewsAt: null, canceledAt: null }
  }
  return {
    plan,
    startedAt: row.plan_started_at ?? null,
    renewsAt: row.plan_canceled_at ? row.plan_renews_at ?? null : nextRenewal(row.plan_renews_at, now),
    canceledAt: row.plan_canceled_at ?? null,
  }
}

/** Write plan columns, then return the fresh status. */
async function writePlan(userId: string, fields: Record<string, string | null>): Promise<SubscriptionStatus> {
  await ensureUserProfile(userId)
  const { error } = await supabase
    .from('user_profiles')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (error) throw new Error(`Failed to update subscription: ${error.message}`)
  // The storage quota depends on the plan.
  clearStorageCache(userId)
  return toSubscriptionStatus(await getPlanRow(userId))
}

/** The user's current subscription. */
export async function getSubscription(userId: string): Promise<SubscriptionStatus> {
  return toSubscriptionStatus(await getPlanRow(userId))
}

/** Start Pro for one billing period. An active, uncancelled Pro subscription is left unchanged. */
export async function startProSubscription(userId: string): Promise<SubscriptionStatus> {
  const current = await getSubscription(userId)
  if (current.plan === 'pro' && !current.canceledAt) return current
  const now = new Date()
  return writePlan(userId, {
    plan: 'pro',
    plan_started_at: now.toISOString(),
    plan_renews_at: periodEnd(now),
    plan_canceled_at: null,
  })
}

/** Cancel at period end: Pro stays active until the next billing date, then lapses to free. */
export async function cancelSubscription(userId: string): Promise<SubscriptionStatus> {
  const current = await getSubscription(userId)
  if (current.plan !== 'pro' || current.canceledAt) return current
  return writePlan(userId, {
    plan_renews_at: current.renewsAt,
    plan_canceled_at: new Date().toISOString(),
  })
}

/** Undo a cancellation while the paid period is still running. */
export async function resumeSubscription(userId: string): Promise<SubscriptionStatus> {
  const current = await getSubscription(userId)
  if (current.plan !== 'pro' || !current.canceledAt) return current
  return writePlan(userId, { plan_canceled_at: null })
}
