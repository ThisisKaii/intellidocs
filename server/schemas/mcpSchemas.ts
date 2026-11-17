import { z } from 'zod'
import { targetCategorySchema } from './aiSchemas'

/** A tool call: the name is checked against the tool registry, the arguments by that tool's own schema. */
export const mcpToolCallSchema = z.object({
  tool: z.string().trim().min(1).max(64),
  args: z.record(z.unknown()).default({}),
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

/** A position as models write it: 2, "2", "first", "last". */
function readPosition(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const word = value.trim().toLowerCase()
  if (word === 'last' || word === 'final') return -1
  if (word === 'first') return 1
  return /^-?\d+$/.test(word) ? Number(word) : value
}

/** A page as models write it: 3, "3", "current", "this". */
function readPage(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const word = value.trim().toLowerCase()
  if (word === 'current' || word === 'this' || word === 'this page') return 'current'
  return /^\d+$/.test(word) ? Number(word) : value
}

/** Formats a formatting change can apply (the parser's FormattingIntent). */
const FORMAT_NAMES = [
  'bold',
  'italic',
  'underline',
  'heading1',
  'heading2',
  'heading3',
  'blockquote',
  'unordered_list',
  'ordered_list',
  'align_left',
  'align_center',
  'align_right',
  'align_justify',
] as const

/**
 * formatBlocks: one formatting change by its parts. Where: a block category ("headings",
 * "except:tables"), a named section or the document title, or the selection. At least one change.
 */
export const formatBlocksSchema = z
  .object({
    formats: z.array(z.enum(FORMAT_NAMES)).max(6).default([]),
    fontSize: z.number().int().min(6).max(96).nullable().default(null),
    fontSizeStep: z.number().int().min(-24).max(24).refine((step) => step !== 0, 'fontSizeStep cannot be 0').nullable().default(null),
    lineSpacing: z.number().min(1).max(3).nullable().default(null),
    firstLineIndentIn: z.number().min(0).max(2).nullable().default(null),
    fontFamily: z.string().trim().min(2).max(60).nullable().default(null),
    textCase: z.enum(['upper', 'title']).nullable().default(null),
    removeFormatting: z.boolean().default(false),
    targetCategory: targetCategorySchema.default('all'),
    target: z.string().trim().min(1).max(200).nullable().default(null),
    targetMode: z.enum(['literal', 'heading', 'section', 'title']).nullable().default(null),
    /** Which one of targetCategory's blocks: 1-based, -1 for the last ("first" / "last" are read too). */
    position: z
      .preprocess(readPosition, z.number().int().min(-1).max(500).refine((value) => value !== 0, 'position starts at 1 (-1 is the last)').nullable())
      .default(null),
    /** Only blocks on this page of the document, or on the page the cursor is on ("this" is read too). */
    page: z.preprocess(readPage, z.union([z.number().int().min(1).max(5000), z.literal('current')]).nullable()).default(null),
    scope: z.enum(['selection', 'all']).optional(),
  })
  .refine(
    (args) =>
      args.formats.length > 0 ||
      args.fontSize !== null ||
      args.fontSizeStep !== null ||
      args.lineSpacing !== null ||
      args.firstLineIndentIn !== null ||
      args.fontFamily !== null ||
      args.textCase !== null ||
      args.removeFormatting,
    'Name at least one change: formats, fontSize, fontSizeStep, lineSpacing, firstLineIndentIn, fontFamily, textCase or removeFormatting'
  )

export const applyPresetSchema = z.object({
  preset: z.enum(['apa_7th', 'ieee', 'uclm_capstone']),
})

export const applyUsualFormattingSchema = z.object({
  documentId: z.string().uuid(),
})

export const autoCaptionSchema = z.object({
  kinds: z.array(z.enum(['figure', 'table'])).min(1).max(2).default(['figure', 'table']),
})

export const renumberCaptionsSchema = z.object({})

export const fixFormattingSuggestionsSchema = z.object({
  only: z.enum(['all', 'figures', 'captions', 'blankLines', 'headings']).default('all'),
})

/** Page setup: at least one of page size, orientation or a margin (inches). */
export const setPageSetupSchema = z
  .object({
    pageSize: z.enum(['short', 'long', 'a4', 'letter', 'legal']).optional(),
    orientation: z.enum(['portrait', 'landscape']).optional(),
    margins: z
      .object({
        top: z.number().min(0.25).max(3).optional(),
        bottom: z.number().min(0.25).max(3).optional(),
        left: z.number().min(0.25).max(3).optional(),
        right: z.number().min(0.25).max(3).optional(),
      })
      .optional(),
  })
  .refine(
    (args) => args.pageSize !== undefined || args.orientation !== undefined || (args.margins !== undefined && Object.keys(args.margins).length > 0),
    'Name a page size, an orientation or at least one margin'
  )

export const insertBibliographySchema = z.object({})
