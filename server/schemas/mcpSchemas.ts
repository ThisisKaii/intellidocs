import { z } from 'zod'

export const mcpToolCallSchema = z.object({
  tool: z.enum([
    'getDocumentContent',
    'applyFormatting',
    'getUserProfile',
    'predictNextFormat',
    'getBehaviorSummary',
    'explainSuggestion',
  ]),
  args: z.record(z.unknown()),
})

export const getDocumentContentSchema = z.object({
  documentId: z.string().uuid(),
})

export const applyFormattingSchema = z.object({
  documentId: z.string().uuid(),
  format: z.string().min(1),
  mode: z.enum(['preview', 'commit']),
  selection: z.string().optional(),
  reason: z.string().optional(),
})

export const getUserProfileSchema = z.object({})

export const predictNextFormatSchema = z.object({
  text: z.string().min(1).max(50000),
})

export const getBehaviorSummarySchema = z.object({
  documentId: z.string().uuid(),
})

export const explainSuggestionSchema = z.object({
  format: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
})

export type MCPToolCallInput = z.infer<typeof mcpToolCallSchema>
