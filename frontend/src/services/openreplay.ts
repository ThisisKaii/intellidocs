// OpenReplay session telemetry, opt-in for research only.
//
// Telemetry is disabled unless the build is launched with research consent:
//   VITE_ENABLE_RESEARCH_TELEMETRY=true VITE_OPENREPLAY_KEY=<key> npm run dev
//
// The tracker is loaded lazily via dynamic import so the @openreplay/tracker
// package (and its network handshake) never run when the flag is off.

type Tracker = {
  start: () => void
}

const enabled = (): boolean =>
  import.meta.env.VITE_ENABLE_RESEARCH_TELEMETRY === 'true' &&
  !!import.meta.env.VITE_OPENREPLAY_KEY

let trackerPromise: Promise<Tracker> | null = null

// Initialise the OpenReplay tracker exactly once. Returns a no-op stub when
// research telemetry is not enabled, so callers never need to branch.
export async function initOpenReplay(): Promise<Tracker> {
  if (!enabled()) {
    return { start: () => {} }
  }
  if (trackerPromise) return trackerPromise

  trackerPromise = (async () => {
    const module = await import('@openreplay/tracker')
    // OpenReplay tracker auto-starts on construction
    const Tracker = module.default as unknown as new (opts: {
      projectKey: string
      ingestPoint: string
      defaultInputMode: 'hidden'
    }) => { start: () => void }
    const tracker = new Tracker({
      projectKey: import.meta.env.VITE_OPENREPLAY_KEY as string,
      ingestPoint: import.meta.env.VITE_OPENREPLAY_INGEST_POINT || 'https://o117198.ingest.openreplay.com',
      defaultInputMode: 'hidden',
    })
    // Auto-started on construction; wrapper kept for interface parity
    return {
      start: () => { tracker.start?.() },
    }
  })()

  return trackerPromise
}
