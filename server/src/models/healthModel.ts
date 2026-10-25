import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { getRedisClient, getRedisStatus } from '../utils/redisClient'

/** Verdict plus timing for a single dependency probe. */
export interface DependencyProbe {
  ok: boolean
  latencyMs: number
  detail: string
}

/** Run a probe, converting a thrown error into a failed result with timing. */
async function timed(fn: () => Promise<string>): Promise<DependencyProbe> {
  const startedAt = Date.now()
  try {
    const detail = await fn()
    return { ok: true, latencyMs: Date.now() - startedAt, detail }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Probe Postgres reachability with a cheap bounded read against the documents
 * table. `head: true` issues no row transfer, so this stays fast even when the
 * documents table is large.
 */
export async function probeSupabase(): Promise<DependencyProbe> {
  return timed(async () => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY not configured')
    }

    // A throwaway client avoids sharing a mutable singleton with request handlers.
    const probe = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false } }
    )

    const { error } = await probe
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .limit(1)

    if (error) throw new Error(error.message)
    return 'reachable'
  })
}

/** Probe Redis with a PING round trip. */
export async function probeRedis(): Promise<DependencyProbe> {
  return timed(async () => {
    const client = await getRedisClient()
    const reply = await client.ping()
    // Name the backend that answered, so a failover is visible on /health/ready.
    return `${reply} (${getRedisStatus().active})`
  })
}
