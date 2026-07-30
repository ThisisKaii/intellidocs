import { z } from 'zod'

/** Validate login and register request bodies. */
export const authBodySchema = z.object({
  email: z.string().trim().email('A valid email is required'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters long'),
})

/** Validate the Google OAuth sync request body. */
export const googleAuthSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
})

export type AuthBody = z.infer<typeof authBodySchema>
export type GoogleAuthBody = z.infer<typeof googleAuthSchema>