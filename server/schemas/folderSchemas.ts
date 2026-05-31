import { z } from 'zod'

/** Validate folder creation payloads from HTTP clients. */
export const createFolderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Folder name is required')
    .max(120, 'Folder name must be 120 characters or fewer'),
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

export type CreateFolderInput = z.infer<typeof createFolderSchema>
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>
export type FolderDocumentInput = z.infer<typeof folderDocumentSchema>
