import { z } from 'zod'

/**
 * Validate the FastAPI `/health` payload. Only `status` is contractual; the
 * remaining fields are informational and change between ML releases, so they
 * stay optional to avoid a version bump breaking every health check.
 */
export const pythonHealthSchema = z.object({
  status: z.string().min(1),
  message: z.string().optional(),
  version: z.string().optional(),
  timestamp: z.string().optional(),
})

export type PythonHealthResponse = z.infer<typeof pythonHealthSchema>
