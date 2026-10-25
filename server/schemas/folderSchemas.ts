import { z } from 'zod'

/** Course codes are short uppercase labels such as 'CS-201' or 'BIO 340'. */
const classCodeSchema = z
  .string()
  .trim()
  .min(2, 'Class code must be at least 2 characters')
  .max(24, 'Class code must be 24 characters or fewer')
  .regex(/^[A-Za-z]{2,6}[\s-]?\d{2,4}[A-Za-z]?$/, 'Class code must look like CS-201')

/** Term labels such as '2026-T1' or 'Fall 2026'. */
const academicTermSchema = z
  .string()
  .trim()
  .min(2, 'Academic term must be at least 2 characters')
  .max(32, 'Academic term must be 32 characters or fewer')

/** Validate folder creation payloads from HTTP clients. */
export const createFolderSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Folder name is required')
      .max(120, 'Folder name must be 120 characters or fewer'),
    folderType: z.enum(['personal', 'class']).optional().default('personal'),
    classCode: classCodeSchema.optional(),
    academicTerm: academicTermSchema.optional(),
  })
  .refine((value) => value.folderType === 'class' || (!value.classCode && !value.academicTerm), {
    message: 'Class code and academic term are only valid on a class folder',
    path: ['classCode'],
  })

/** Validate folder update payloads from HTTP clients. */
export const updateFolderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Folder name is required')
    .max(120, 'Folder name must be 120 characters or fewer'),
})

/** Validate requests that move a document into a folder. */
export const folderDocumentSchema = z.object({
  documentId: z.string().uuid('Document ID must be a valid UUID'),
})

/** Validate requests that enroll a student into a class folder. */
export const enrollStudentSchema = z.object({
  email: z.string().trim().email('A valid student email is required').max(320),
})

/** Validate the request to join a class with its private code. */
export const joinClassSchema = z.object({
  code: z.string().trim().min(4, 'Enter the class code').max(12, 'That code is too long'),
})

export type CreateFolderInput = z.infer<typeof createFolderSchema>
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>
export type FolderDocumentInput = z.infer<typeof folderDocumentSchema>
export type EnrollStudentInput = z.infer<typeof enrollStudentSchema>
