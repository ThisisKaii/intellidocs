import { Response } from 'express'
import { buildReadinessReport } from '../skills/checkReadiness'

/**
 * Liveness probe. Answers as long as the process can serve HTTP and touches no
 * dependency, so a slow Supabase or Redis never triggers a container restart.
 *
 * The payload keeps the original `status: "OK"` and `message` fields: render.yaml
 * and external uptime monitors already depend on them, so readiness is added
 * alongside liveness rather than changing an existing contract.
 */
export function liveness(_req: unknown, res: Response): void {
  res.json({
    status: 'OK',
    message: 'IntelliDocs API is running',
    timestamp: new Date().toISOString(),
  })
}

/**
 * Readiness probe. Verifies the dependencies this replica needs and returns 503
 * when a required one is down, which is what the load balancer uses to stop
 * routing traffic to an unserviceable replica. ML outages report `degraded` with
 * a 200 so the replica stays in rotation for the non-ML routes.
 */
export async function readiness(
  _req: unknown,
  res: Response
): Promise<void> {
  const report = await buildReadinessReport()

  res.status(report.status === 'unavailable' ? 503 : 200).json(report)
}
