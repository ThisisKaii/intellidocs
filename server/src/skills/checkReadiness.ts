import { probeMlHealth } from '../ai/bridge/pythonBridge'
import { probeRedis, probeSupabase, type DependencyProbe } from '../models/healthModel'

/** A dependency is required when its absence makes the replica unfit to serve. */
export type DependencyName = 'supabase' | 'redis' | 'ml'

/** Aggregate readiness payload consumed by the controller and the proxy. */
export interface ReadinessReport {
  status: 'ready' | 'degraded' | 'unavailable'
  checks: Record<DependencyName, DependencyProbe & { required: boolean }>
  timestamp: string
}

/**
 * Decide the replica verdict. A failed *required* dependency makes the replica
 * unavailable so the load balancer stops sending it traffic; a failed optional
 * dependency degrades it but keeps it serving the rest of the API.
 */
function verdictFor(
  checks: ReadinessReport['checks']
): ReadinessReport['status'] {
  const values = Object.values(checks)
  if (values.some((check) => check.required && !check.ok)) return 'unavailable'
  if (values.some((check) => !check.ok)) return 'degraded'
  return 'ready'
}

/**
 * Report whether this replica can serve traffic. Supabase is required because
 * every authenticated route reads documents; Redis is required because the
 * behavior and quota pipelines depend on it. ML is optional by design: the
 * grammar, prediction, and compliance paths all degrade explicitly rather than
 * failing the request outright, so a missing ML service must not evict the
 * replica from the pool.
 */
export async function buildReadinessReport(): Promise<ReadinessReport> {
  const [supabase, redis, ml] = await Promise.all([
    probeSupabase(),
    probeRedis(),
    probeMlHealth(),
  ])

  const checks: ReadinessReport['checks'] = {
    supabase: { ...supabase, required: true },
    redis: { ...redis, required: true },
    ml: {
      ok: ml.reachable,
      latencyMs: ml.latencyMs,
      detail: ml.reachable
        ? (ml.payload?.status ?? 'reachable')
        : (ml.error ?? 'unreachable'),
      required: false,
    },
  }

  return {
    status: verdictFor(checks),
    checks,
    timestamp: new Date().toISOString(),
  }
}
