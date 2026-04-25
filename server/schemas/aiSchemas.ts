import { z } from 'zod'

/** Validate a single chat history message from HTTP clients. */
const aiChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z
    .string()
    .trim()
    .min(1, 'Chat history content is required')
    .max(4000, 'Chat history content is too long'),
})

/** Validate rejected formatting previews from the current chat session. */
const rejectedFormattingPreviewSchema = z.object({
  format: z
    .string()
    .trim()
    .min(1, 'Rejected format is required')
    .max(80, 'Rejected format is too long'),
  reason: z
    .string()
    .trim()
    .max(500, 'Rejected preview reason is too long')
    .optional(),
  rejectedAt: z.string().datetime('Rejected timestamp must be valid').optional(),
})

/** Validate incoming AI chat requests from HTTP clients. */
export const aiChatRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(4000, 'Message is too long'),
  history: z.array(aiChatMessageSchema).max(12, 'Chat history is too long').optional(),
  rejectedFormattingPreviews: z
    .array(rejectedFormattingPreviewSchema)
    .max(20, 'Too many rejected formatting previews')
    .optional(),
  documentId: z
    .string()
    .trim()
    .min(1, 'Document ID cannot be empty')
    .optional(),
  documentTitle: z
    .string()
    .trim()
    .min(1, 'Document title cannot be empty')
    .max(200, 'Document title is too long')
    .optional(),
  documentContent: z
    .string()
    .max(20000, 'Document content is too large')
    .optional(),
})

export type AIChatRequestInput = z.infer<typeof aiChatRequestSchema>