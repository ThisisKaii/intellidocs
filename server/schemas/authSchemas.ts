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

/** Validate the profile update request body. */
export const updateProfileSchema = z.object({
  display_name: z.string().trim().min(1, 'Display name is required').max(100, 'Display name must be at most 100 characters'),
})

/** Validate a faculty/professor application request body. */
export const applyProfessorSchema = z.object({
  college: z.string().trim().min(1, 'College is required').max(200),
  department: z.string().trim().min(1, 'Department is required').max(200),
  institutionalEmail: z.string().trim().email('A valid institutional email is required'),
  facultyId: z.string().trim().min(1, 'Faculty ID is required').max(50),
  reason: z.string().trim().min(10, 'Please provide a brief reason (min 10 characters)').max(500),
})

export type AuthBody = z.infer<typeof authBodySchema>
export type GoogleAuthBody = z.infer<typeof googleAuthSchema>
export type UpdateProfileBody = z.infer<typeof updateProfileSchema>
export type ApplyProfessorBody = z.infer<typeof applyProfessorSchema>