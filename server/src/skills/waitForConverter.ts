import { probeMlHealth } from '../ai/bridge/pythonBridge'

/** How long an import waits for a sleeping converter (Render's free plan wakes in about a minute). */
const WAKE_TIMEOUT_MS = 150_000
const WAKE_POLL_MS = 5_000
const PROBE_TIMEOUT_MS = 3_000

type Probe = (timeoutMs: number) => Promise<{ reachable: boolean }>

/**
 * Make sure the ML converter is awake before a document is sent to it. A sleeping service answers
 * the first request slowly or with a gateway error, which used to drop the import to the
 * low-fidelity fallback converter. `onWaking` runs once when the first probe fails, so the job can
 * tell the user what the wait is. Never throws; resolves with how long the wake took.
 */
export async function waitForConverter(
  onWaking: () => Promise<void>,
  options: { timeoutMs?: number; pollMs?: number; probe?: Probe; sleep?: (ms: number) => Promise<void> } = {}
): Promise<{ reachable: boolean; wakeMs: number }> {
  const probe = options.probe ?? probeMlHealth
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const timeoutMs = options.timeoutMs ?? WAKE_TIMEOUT_MS
  const pollMs = options.pollMs ?? WAKE_POLL_MS
  const startedAt = Date.now()

  if ((await probe(PROBE_TIMEOUT_MS)).reachable) return { reachable: true, wakeMs: 0 }
  await onWaking().catch(() => undefined)
  while (Date.now() - startedAt < timeoutMs) {
    await sleep(pollMs)
    if ((await probe(PROBE_TIMEOUT_MS)).reachable) return { reachable: true, wakeMs: Date.now() - startedAt }
  }
  return { reachable: false, wakeMs: Date.now() - startedAt }
}
