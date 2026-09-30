import { z } from 'zod'

/**
 * Terminal and in-flight states for a large-file Drive import. The client uses
 * `done`/`failed` to stop polling, so both must be present in the union.
 */
export const importJobStateSchema = z.enum([
  'queued',
  'downloading',
  'converting',
  'done',
  'failed',
])

/**
 * Validate the job record returned by the import-status endpoint.
 *
 * `html` is intentionally present on the response: the converted document can
 * be several MB, and round-tripping it through a second request would mean
 * storing it twice. The status route is authenticated and user-scoped.
 */
export const importJobSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  fileId: z.string(),
  fileName: z.string(),
  progress: z.number().min(0).max(100),
  state: importJobStateSchema,
  title: z.string(),
  html: z.string(),
  error: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

/** Validate a list of jobs for the reconnecting-client endpoint. */
export const importJobListSchema = z.array(importJobSchema)

export type ImportJobDto = z.infer<typeof importJobSchema>
export type ImportJobStateDto = z.infer<typeof importJobStateSchema>
