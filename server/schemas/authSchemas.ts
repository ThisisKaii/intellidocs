import { z } from 'zod'

/** Validate login and register request bodies. */
export const authBodySchema = z.object({
  email: z.string().trim().email('A valid email is required'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters long'),
})

export type AuthBody = z.infer<typeof authBodySchema>