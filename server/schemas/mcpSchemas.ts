import { z } from 'zod'

export const mcpToolCallSchema = z.object({
  tool: z.enum([
    'getDocumentContent',
    'applyFormatting',
    'applyBulkFormatting',
    'getUserProfile',
    'predictNextFormat',
    'getBehaviorSummary',
    'explainSuggestion',
    'structureUserSection',
    'searchLiteratureAndCite',
    'refineAcademicStyle',
  ]),
  args: z.record(z.unknown()),
})

export const getDocumentContentSchema = z.object({
  documentId: z.string().uuid(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(200).max(20000).optional(),
})

export const applyFormattingSchema = z.object({
  documentId: z.string().uuid(),
  format: z.string().min(1),
  mode: z.enum(['preview', 'commit']),
  selection: z.string().optional(),
  reason: z.string().optional(),
})

export const applyBulkFormattingSchema = z.object({
  documentId: z.string().uuid(),
  format: z.string().min(1),
  mode: z.enum(['preview', 'commit']),
  /** ProseMirror ranges or block ids to target across the document. */
  targets: z.array(z.object({
    from: z.coerce.number().int().min(1),
    to: z.coerce.number().int().min(1),
  })).min(1).max(500),
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

export const structureUserSectionSchema = z.object({
  sectionTitle: z.string().trim().min(1).max(200),
  /** The user's own notes or rough draft; the tool organises them and never writes from a topic. */
  userNotes: z.string().trim().min(1, 'Notes are required').max(12000),
  genre: z.enum(['ieee', 'thesis', 'memo', 'general']).optional(),
})

export const searchLiteratureAndCiteSchema = z.object({
  query: z.string().trim().min(3).max(300),
  claimText: z.string().trim().max(2000).optional(),
  style: z.enum(['ieee', 'apa']),
  limit: z.coerce.number().int().min(1).max(5).optional(),
})

export const refineAcademicStyleSchema = z.object({
  text: z.string().trim().min(1).max(6000),
  focus: z.enum(['clarity', 'hedging', 'vocabulary', 'all']).default('all'),
})

export type MCPToolCallInput = z.infer<typeof mcpToolCallSchema>
