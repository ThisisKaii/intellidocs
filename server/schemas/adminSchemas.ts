import { z } from 'zod'

/** Validate the admin verification decision request body (Module A). */
export const verifyApplicantSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  role: z.enum(['student', 'professor', 'admin']).optional(),
  notes: z.string().max(2000, 'Notes must be at most 2000 characters').optional(),
})

/** Validate the admin direct role-override request body (Module B). */
export const updateRoleSchema = z.object({
  roleId: z.number().int().positive('roleId must be a positive integer'),
})

export type VerifyApplicantBody = z.infer<typeof verifyApplicantSchema>
export type UpdateRoleBody = z.infer<typeof updateRoleSchema>